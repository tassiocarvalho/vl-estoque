import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  UserRound,
  CloudOff,
  FileDown,
  Minus,
  Plus,
  Printer,
  ShoppingCart,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/Display';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { ApiError, errorMessage, http, isCanceled, isNetworkError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber, formatQuantity } from '@/lib/format';
import { ROLE_LABELS, UNIT_SHORT } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { formatDocument } from '@/lib/document';
import type { CashSession, Discount, Paginated, PaymentMethod, Sale, StoreCredit } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useSupervisorAuthorization } from '../auth/SupervisorAuthProvider';
import { useBranding } from '../branding/BrandingProvider';
import { customersCache, type CachedCustomer, type CatalogItem, type SalePayload } from '../offline/offline-store';
import { useOffline } from '../offline/OfflineProvider';
import { usePaymentMethods } from '../payment-methods/api';
import { usePrinter } from '../printing/usePrinter';
import { cashKey, invalidateSalesData, readTerminal, saveTerminal, useCurrentCash } from './api';
import { cartReducer, loadCart, saveCart, type CartState } from './cart';
import { CashMovementModal, CloseCashModal, OpenCashScreen } from './components/CashModals';
import { CustomerPickerModal } from './components/CustomerPickerModal';
import { PaymentModal } from './components/PaymentModal';
import { MoreActionsModal, ReceiptModal, VoucherModal } from './components/PostSaleModals';
import { ReturnModal } from './components/ReturnModal';
import { lookupCredit } from './post-sale-api';
import { PosSearch } from './components/PosSearch';
import { SessionSalesModal } from './components/SessionSalesModal';
import { DiscountModal, QuantityModal, SwitchOperatorModal } from './components/SmallModals';
import { calculateSale, fromCents, SaleRuleError, toCents, type PaymentLine } from './sale-math';

type ModalName =
  | 'payment'
  | 'quantity'
  | 'itemDiscount'
  | 'orderDiscount'
  | 'cashMovement'
  | 'closeCash'
  | 'switchOperator'
  | 'sales'
  | 'quote'
  | 'cancelSale'
  | 'complete'
  | 'customer'
  | 'more'
  | 'return'
  | 'receipt'
  | 'voucher';

/** Bipe curto do caixa (item lido) e bipe grave (erro). */
function beep(kind: 'ok' | 'error') {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === 'ok' ? 1250 : 220;
    gain.gain.value = 0.06;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (kind === 'ok' ? 0.07 : 0.3));
    oscillator.onended = () => void context.close();
  } catch {
    /* sem áudio: segue em silêncio */
  }
}

/** Guarda no aparelho os clientes ativos (nome e documento), para identificar o cliente sem internet. */
async function refreshCustomers() {
  const items: CachedCustomer[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await http.get<Paginated<CachedCustomer>>('/customers', { page, pageSize: 100, status: 'active' });
    items.push(...result.items.map(({ id, name, document, phone }) => ({ id, name, document, phone })));
    if (page * result.pageSize >= result.total) break;
  }
  await customersCache.save(items);
}

/** Monta a venda para exibir/imprimir quando ela foi registrada sem internet. */
function offlineSale(
  payload: SalePayload,
  cart: CartState,
  session: CashSession,
  operator: { id: string; name: string },
  methods: PaymentMethod[],
): Sale {
  const totals = calculateSale(cart.items, cart.orderDiscount);
  const paid = payload.payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  return {
    id: payload.id,
    number: 0,
    status: 'COMPLETED',
    session: { id: session.id, terminal: session.terminal, status: 'OPEN' },
    operator,
    customer: cart.customer ? { id: cart.customer.id, name: cart.customer.name } : null,
    customerDocument: cart.customerDocument,
    grossTotal: fromCents(totals.grossCents),
    itemsDiscount: fromCents(totals.itemsDiscountCents),
    orderDiscountType: cart.orderDiscount?.type ?? null,
    orderDiscountValue: cart.orderDiscount?.value ?? null,
    orderDiscount: fromCents(totals.orderDiscountCents),
    total: fromCents(totals.totalCents),
    paidTotal: fromCents(paid),
    change: fromCents(paid - totals.totalCents),
    discountAuthorizedBy: null,
    offline: true,
    occurredAt: payload.occurredAt,
    canceledAt: null,
    canceledBy: null,
    cancelReason: null,
    items: cart.items.map((item, index) => ({
      id: item.key,
      position: index + 1,
      productId: item.productId,
      productName: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountType: item.discount?.type ?? null,
      discountValue: item.discount?.value ?? null,
      discount: fromCents(totals.lines[index].discountCents),
      total: fromCents(totals.lines[index].totalCents),
    })),
    payments: payload.payments.map((p) => {
      const method = methods.find((m) => m.id === p.methodId);
      return { methodId: p.methodId ?? '', name: method?.name ?? 'Pagamento', kind: method?.kind ?? 'OTHER', amount: p.amount };
    }),
  };
}

/**
 * Frente de caixa (PDV não fiscal): tela cheia, operável 100% pelo teclado.
 *   Esquerda: busca + itens do cupom. Direita: item selecionado, total e atalhos. Rodapé: status.
 */
export function PosPage() {
  const queryClient = useQueryClient();
  const { user, can, loginWithPin } = useAuth();
  const { branding, logo } = useBranding();
  const { online, pendingSales, enqueueSale, sync, refreshCatalog } = useOffline();
  const requestAuthorization = useSupervisorAuthorization();
  const printer = usePrinter();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const [terminal, setTerminal] = useState(readTerminal);
  const { data: session, isLoading } = useCurrentCash(terminal);
  const [cart, dispatch] = useReducer(cartReducer, terminal, loadCart);
  const [modal, setModal] = useState<ModalName | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  /** Vale gerado numa troca: entra sozinho como pagamento da próxima venda. */
  const [exchangeCredit, setExchangeCredit] = useState<StoreCredit | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  const posSettings = printer.settings?.pos ?? { maxDiscountPercent: 0, blockSaleWithoutStock: false };
  const canDiscount = can(P.POS_DISCOUNT);

  useEffect(() => saveCart(terminal, cart), [terminal, cart]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // Preços, saldos e clientes frescos no aparelho ao abrir o caixa (base para vender offline).
  const canReadCustomers = can(P.CUSTOMER_READ);
  useEffect(() => {
    if (!online) return;
    void refreshCatalog().catch(() => undefined);
    if (canReadCustomers) void refreshCustomers().catch(() => undefined);
  }, [online, refreshCatalog, canReadCustomers]);

  const totals = useMemo(() => {
    try {
      return { ...calculateSale(cart.items, cart.orderDiscount), error: null as string | null };
    } catch (error) {
      const empty = { lines: [], grossCents: 0, itemsDiscountCents: 0, subtotalCents: 0, orderDiscountCents: 0, totalCents: 0, maxDiscountPercent: 0 };
      return { ...empty, error: error instanceof SaleRuleError ? error.message : 'Erro no cálculo' };
    }
  }, [cart.items, cart.orderDiscount]);

  const selectedIndex = cart.items.findIndex((i) => i.key === cart.selectedKey);
  const selected = selectedIndex >= 0 ? cart.items[selectedIndex] : null;
  const sessionPendingSales = session ? pendingSales.filter((s) => s.payload.sessionId === session.id).length : 0;

  const focusSearch = useCallback(() => requestAnimationFrame(() => searchRef.current?.focus()), []);
  const closeModal = useCallback(() => {
    setModal(null);
    focusSearch();
  }, [focusSearch]);

  // Lista de itens acompanha a seleção (setas ↑ ↓).
  useEffect(() => {
    if (cart.selectedKey) document.getElementById(`pos-item-${cart.selectedKey}`)?.scrollIntoView({ block: 'nearest' });
  }, [cart.selectedKey]);

  // ─── Itens ───────────────────────────────────────────────────────────────────

  const addProduct = (product: CatalogItem, quantity: number) => {
    if (!product.salePrice || product.salePrice <= 0) {
      beep('error');
      toast.error(`"${product.name}" está sem preço de venda`, { description: 'Peça ao administrador para cadastrar o preço.' });
      return;
    }
    if (product.currentStock < quantity) {
      if (posSettings.blockSaleWithoutStock) {
        beep('error');
        toast.error(`Sem estoque de "${product.name}"`, { description: `Saldo registrado: ${formatQuantity(product.currentStock, product.unit)}` });
        return;
      }
      toast.warning(`Estoque de "${product.name}" pode estar desatualizado`, {
        description: `Saldo registrado: ${formatQuantity(product.currentStock, product.unit)}`,
      });
    }
    beep('ok');
    dispatch({
      type: 'add',
      quantity,
      product: { productId: product.id, name: product.name, sku: product.sku, barcode: product.barcode, unit: product.unit, unitPrice: product.salePrice },
    });
  };

  const changeQuantity = (delta: number) => {
    if (!selected) return;
    const next = Math.round((selected.quantity + delta) * 1000) / 1000;
    if (next <= 0) return removeSelected();
    dispatch({ type: 'setQuantity', key: selected.key, quantity: next });
  };

  const removeSelected = () => {
    if (!selected) return;
    dispatch({ type: 'remove', key: selected.key });
    toast(`Item cancelado: ${selected.name}`);
  };

  // ─── Descontos (com autorização do supervisor acima do limite) ──────────────

  const applyDiscount = async (target: 'item' | 'order', discount: Discount | null) => {
    try {
      const items = target === 'item' && selected ? cart.items.map((i) => (i.key === selected.key ? { ...i, discount } : i)) : cart.items;
      const preview = calculateSale(items, target === 'order' ? discount : cart.orderDiscount);
      const needsAuthorization = preview.maxDiscountPercent > posSettings.maxDiscountPercent && !canDiscount && !cart.authorization;
      if (needsAuthorization) {
        const result = await requestAuthorization({
          permission: P.POS_DISCOUNT,
          scope: cart.saleId,
          message: `Desconto de ${formatNumber(preview.maxDiscountPercent)}% (limite do operador: ${formatNumber(posSettings.maxDiscountPercent)}%).`,
        });
        if (!result) return;
        dispatch({ type: 'authorize', token: result.token, supervisor: result.supervisor.name });
        toast.success(`Desconto autorizado por ${result.supervisor.name}`);
      }
      if (target === 'item' && selected) dispatch({ type: 'itemDiscount', key: selected.key, discount });
      else dispatch({ type: 'orderDiscount', discount });
      closeModal();
    } catch (error) {
      toast.error(error instanceof SaleRuleError ? error.message : errorMessage(error));
    }
  };

  // ─── Finalização ─────────────────────────────────────────────────────────────

  const completeSale = (sale: Sale, offline: boolean) => {
    dispatch({ type: 'reset' });
    if (sale.payments.some((p) => p.storeCreditCode)) setExchangeCredit(null);
    setLastSale(sale);
    setModal('complete');
    invalidateSalesData(queryClient);
    if (offline) toast.info('Sem conexão: venda salva neste computador', { description: 'Ela será enviada sozinha quando a internet voltar.' });
    if (printer.autoPrint) void printer.printSale(sale);
  };

  const finalize = async (payments: PaymentLine[]) => {
    if (!session || !user) return;
    const payload: SalePayload = {
      id: cart.saleId,
      sessionId: session.id,
      occurredAt: new Date().toISOString(),
      items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount ?? undefined })),
      orderDiscount: cart.orderDiscount ?? undefined,
      payments: payments.map((p) => ({ methodId: p.methodId, amount: p.amount, storeCreditId: p.storeCreditId, installments: p.installments })),
      customerId: cart.customer?.id,
      customerDocument: cart.customerDocument ?? undefined,
      removedItems: cart.removed.length ? cart.removed : undefined,
    };
    const headers = cart.authorization ? { 'X-Supervisor-Token': cart.authorization.token } : undefined;
    try {
      const result = await http.post<{ sale: Sale }>('/sales', payload, { headers });
      completeSale(result.sale, false);
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueSale({ id: payload.id, payload, authorizationToken: cart.authorization?.token, total: fromCents(totals.totalCents) });
        completeSale(offlineSale(payload, cart, session, { id: user.id, name: user.name }, paymentMethods), true);
      } else if (error instanceof ApiError && error.code === 'CASH_CLOSED') {
        toast.error('Este caixa foi fechado. Abra um novo caixa para continuar.');
        setModal(null);
        void queryClient.invalidateQueries({ queryKey: cashKey(terminal) });
      } else if (!isCanceled(error)) {
        beep('error');
        toast.error(errorMessage(error));
      }
    }
  };

  const abandonSale = () => {
    if (cart.items.length > 0) {
      const items = cart.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, at: new Date().toISOString() }));
      void http.post('/sales/abandon', { saleId: cart.saleId, items, total: fromCents(totals.totalCents) }).catch(() => undefined);
    }
    dispatch({ type: 'reset' });
    toast('Venda cancelada');
    closeModal();
  };

  const quoteData = () => ({
    items: cart.items.map((item, index) => ({
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: fromCents(totals.lines[index]?.discountCents ?? 0),
      total: fromCents(totals.lines[index]?.totalCents ?? 0),
    })),
    gross: fromCents(totals.grossCents),
    discount: fromCents(totals.itemsDiscountCents + totals.orderDiscountCents),
    total: fromCents(totals.totalCents),
    operator: user?.name ?? '',
  });

  // ─── Caixa ───────────────────────────────────────────────────────────────────

  const openCash = async (name: string, openingAmount: number) => {
    const opened = await http.post<CashSession>('/cash/open', { terminal: name, openingAmount });
    saveTerminal(name);
    setTerminal(name);
    queryClient.setQueryData(cashKey(name), opened);
    toast.success(`Caixa aberto: ${name}`);
    focusSearch();
  };

  const switchOperator = async (username: string, pin: string) => {
    const profile = await loginWithPin(username, pin);
    toast.success(`Operador: ${profile.name}`);
    closeModal();
  };

  // ─── Atalhos de teclado ──────────────────────────────────────────────────────

  const hasItems = cart.items.length > 0;
  const actions: Record<string, () => void> = {
    F1: focusSearch,
    F2: () => selected && setModal('quantity'),
    F3: () => selected && setModal('itemDiscount'),
    F4: () => hasItems && setModal('orderDiscount'),
    F5: () => {
      if (!hasItems) return;
      if (totals.error) return void toast.error(totals.error);
      setModal('payment');
    },
    F6: () => setModal('cashMovement'),
    F7: () => setModal('sales'),
    F8: () => hasItems && setModal('quote'),
    F9: () => {
      if (hasItems) return void toast.warning('Finalize ou cancele a venda atual antes de trocar de operador');
      setModal('switchOperator');
    },
    F10: () => {
      if (hasItems) return void toast.warning('Finalize ou cancele a venda atual antes de fechar o caixa');
      setModal('closeCash');
    },
    F11: () => setModal('more'),
    Delete: removeSelected,
    Insert: () => setModal('customer'),
    Escape: () => hasItems && setModal('cancelSale'),
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const modalRef = useRef(modal);
  modalRef.current = modal;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Teclas F nunca podem acionar o navegador no caixa (F5 recarregaria a página!).
      if (/^F\d{1,2}$/.test(event.key)) event.preventDefault();
      if (modalRef.current || !session) return;
      const target = event.target as HTMLElement;
      const typing = target.tagName === 'INPUT' && target !== searchRef.current;
      if (typing) return;
      if (event.key === 'Delete' && searchRef.current?.value) return; // apagando texto na busca
      const action = actionsRef.current[event.key];
      if (action) {
        event.preventDefault();
        action();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (target !== searchRef.current) {
          event.preventDefault();
          dispatch({ type: 'moveSelection', delta: event.key === 'ArrowDown' ? 1 : -1 });
        }
      } else if ((event.key === '+' || event.key === '-') && target !== searchRef.current) {
        changeQuantityRef.current(event.key === '+' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);
  const changeQuantityRef = useRef(changeQuantity);
  changeQuantityRef.current = changeQuantity;

  // ─── Renderização ────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingState label="Abrindo o caixa..." />;

  const header = (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-brand-900 px-4 text-white">
      {can(P.PRODUCT_READ) && user?.role !== 'CASHIER' && (
        <Link to="/" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" title="Voltar ao painel" aria-label="Voltar ao painel">
          <ArrowLeft className="size-[18px]" />
        </Link>
      )}
      <img src={logo} alt="" className="size-7 rounded-md bg-white/10 object-contain" />
      <span className="truncate text-sm font-semibold">{branding.name}</span>
      <span className="hidden text-sm text-white/60 sm:inline">· Frente de caixa</span>
      <span className="ml-auto flex items-center gap-1">
        <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
      </span>
    </header>
  );

  const footer = (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
      <span className="flex items-center gap-1.5 font-medium">
        <span className={cn('size-2 rounded-full', session ? 'bg-emerald-500' : 'bg-slate-400')} />
        {session ? `Caixa aberto · ${session.terminal}` : `Caixa fechado · ${terminal}`}
      </span>
      <span>
        Operador: <strong className="text-slate-800">{user?.name}</strong> {user && `(${ROLE_LABELS[user.role]})`}
      </span>
      <span className="hidden md:inline">{branding.name}</span>
      <span className={cn('flex items-center gap-1', online ? 'text-emerald-700' : 'text-amber-800')}>
        {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
        {online ? 'Online' : 'Offline — vendendo neste computador'}
      </span>
      {pendingSales.length > 0 && (
        <button type="button" onClick={() => void sync()} className="font-medium text-amber-800 underline">
          {pendingSales.length} venda(s) aguardando envio
        </button>
      )}
      <span className="ml-auto tabular-nums">{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </footer>
  );

  if (!session) {
    return (
      <div className="flex h-dvh flex-col bg-slate-50">
        {header}
        <OpenCashScreen terminal={terminal} online={online} onOpen={openCash} />
        {footer}
      </div>
    );
  }

  const discountTotal = fromCents(totals.itemsDiscountCents + totals.orderDiscountCents);

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      {header}

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        {/* Esquerda: busca + itens */}
        <section className="flex min-h-0 flex-col gap-3">
          <PosSearch ref={searchRef} scale={printer.settings?.scale} onAdd={addProduct} onNavigate={(delta) => dispatch({ type: 'moveSelection', delta })} onNotFound={(message) => {
            beep('error');
            toast.error(message);
          }} />
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            {hasItems ? (
              <div className="h-full overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="w-12 px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Produto</th>
                      <th className="px-3 py-2.5 text-right">Qtd</th>
                      <th className="hidden px-3 py-2.5 text-right sm:table-cell">Preço</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.items.map((item, index) => {
                      const line = totals.lines[index];
                      const active = item.key === cart.selectedKey;
                      return (
                        <tr
                          key={item.key}
                          id={`pos-item-${item.key}`}
                          onClick={() => dispatch({ type: 'select', key: item.key })}
                          className={cn(
                            'cursor-pointer border-t border-slate-100 transition-colors',
                            active ? 'bg-brand-50' : 'hover:bg-slate-50',
                          )}
                        >
                          <td className={cn('px-3 py-3 text-slate-400 tabular-nums', active && 'border-l-4 border-brand-600 pl-2')}>{index + 1}</td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {item.sku}
                              {line && line.discountCents > 0 && (
                                <span className="ml-2 font-medium text-emerald-700">desconto −{formatMoney(fromCents(line.discountCents))}</span>
                              )}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">
                            {formatNumber(item.quantity)} <span className="text-xs text-slate-500">{UNIT_SHORT[item.unit]}</span>
                          </td>
                          <td className="hidden px-3 py-3 text-right text-slate-600 tabular-nums sm:table-cell">{formatMoney(item.unitPrice)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900 tabular-nums">{line ? formatMoney(fromCents(line.totalCents)) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
                <ShoppingCart className="size-14" strokeWidth={1.25} />
                <p className="text-lg font-medium text-slate-500">Caixa livre</p>
                <p className="max-w-xs text-sm">
                  Bipe um produto ou pressione <kbd className="kbd">F1</kbd> e digite o nome para começar a venda.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Direita: item selecionado, totais e atalhos */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
            {selected ? (
              <>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item selecionado</p>
                <p className="mt-1 line-clamp-2 text-base font-semibold text-slate-900">{selected.name}</p>
                <p className="text-sm text-slate-500">
                  {formatNumber(selected.quantity)} {UNIT_SHORT[selected.unit]} × {formatMoney(selected.unitPrice)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => changeQuantity(-1)} aria-label="Diminuir quantidade">
                    <Minus className="size-4" />
                  </Button>
                  <span className="min-w-12 text-center font-semibold tabular-nums">{formatNumber(selected.quantity)}</span>
                  <Button variant="outline" size="sm" onClick={() => changeQuantity(1)} aria-label="Aumentar quantidade">
                    <Plus className="size-4" />
                  </Button>
                  <span className="ml-auto text-lg font-semibold tabular-nums">
                    {formatMoney(fromCents(totals.lines[selectedIndex]?.totalCents ?? 0))}
                  </span>
                </div>
              </>
            ) : (
              <p className="py-3 text-center text-sm text-slate-400">Nenhum item selecionado</p>
            )}
          </div>

          <button
            type="button"
            onClick={actions.Insert}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-card transition hover:border-brand-300"
          >
            <UserRound className={cn('size-5 shrink-0', cart.customer || cart.customerDocument ? 'text-brand-700' : 'text-slate-400')} />
            <span className="min-w-0 flex-1 leading-tight">
              {cart.customer || cart.customerDocument ? (
                <>
                  <span className="block truncate text-sm font-semibold text-slate-900">{cart.customer?.name ?? 'Consumidor'}</span>
                  {cart.customerDocument && <span className="block text-xs text-slate-500">CPF/CNPJ {formatDocument(cart.customerDocument)}</span>}
                </>
              ) : (
                <span className="text-sm text-slate-500">Cliente / CPF na nota</span>
              )}
            </span>
            <kbd className="kbd">Ins</kbd>
          </button>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal ({cart.items.length} {cart.items.length === 1 ? 'item' : 'itens'})</dt>
                <dd className="tabular-nums">{formatMoney(fromCents(totals.grossCents))}</dd>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>
                    Descontos
                    {cart.authorization && <span className="ml-1 text-xs text-slate-500">(autorizado: {cart.authorization.supervisor})</span>}
                  </dt>
                  <dd className="tabular-nums">−{formatMoney(discountTotal)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Total</span>
              <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{formatMoney(fromCents(totals.totalCents))}</span>
            </div>
            {totals.error && <p className="mt-2 text-xs font-medium text-red-600">{totals.error}</p>}
            <Button size="lg" className="mt-3 h-13 w-full text-lg" disabled={!hasItems} onClick={actions.F5}>
              Finalizar venda <kbd className="kbd border-white/30 bg-white/15 text-white">F5</kbd>
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <Shortcut keyName="F1" label="Buscar produto" onClick={actions.F1} />
            <Shortcut keyName="F2" label="Quantidade" onClick={actions.F2} disabled={!selected} />
            <Shortcut keyName="F3" label="Desconto no item" onClick={actions.F3} disabled={!selected} />
            <Shortcut keyName="F4" label="Desconto no total" onClick={actions.F4} disabled={!hasItems} />
            <Shortcut keyName="F6" label="Sangria / suprimento" onClick={actions.F6} />
            <Shortcut keyName="F7" label="Vendas do caixa" onClick={actions.F7} />
            <Shortcut keyName="F8" label="Orçamento" onClick={actions.F8} disabled={!hasItems} />
            <Shortcut keyName="F9" label="Trocar operador" onClick={actions.F9} />
            <Shortcut keyName="F10" label="Fechar caixa" onClick={actions.F10} />
            <Shortcut keyName="Del" label="Remover item" onClick={actions.Delete} disabled={!selected} tone="danger" />
            <Shortcut keyName="Esc" label="Cancelar venda" onClick={actions.Escape} disabled={!hasItems} tone="danger" />
            <Shortcut keyName="Ins" label="Cliente / CPF" onClick={actions.Insert} />
            <Shortcut keyName="F11" label="Troca, fiado e vale" onClick={actions.F11} className="col-span-3" />
          </div>
          {exchangeCredit && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span>
                Troca: vale <b>{exchangeCredit.code}</b> de {formatMoney(exchangeCredit.balance)} entra no pagamento
              </span>
              <button type="button" className="text-xs underline" onClick={() => setExchangeCredit(null)}>
                Tirar
              </button>
            </div>
          )}
        </aside>
      </div>

      {footer}

      {/* Diálogos */}
      <PaymentModal
        open={modal === 'payment'}
        totalCents={totals.totalCents}
        methods={paymentMethods}
        customer={cart.customer}
        online={online}
        presetCredit={exchangeCredit}
        onClose={closeModal}
        onConfirm={finalize}
      />
      <MoreActionsModal open={modal === 'more'} online={online} onClose={closeModal} onChoose={(action) => setModal(action)} />
      <ReturnModal
        open={modal === 'return'}
        sessionId={session.id}
        onClose={closeModal}
        onDone={(saleReturn, exchange) => {
          invalidateSalesData(queryClient);
          void queryClient.invalidateQueries({ queryKey: cashKey(terminal) });
          void printer.printReturn(saleReturn);
          toast.success(`Devolução nº ${saleReturn.number}: ${formatMoney(saleReturn.total)}`, {
            description: saleReturn.storeCredit ? `Vale-troca ${saleReturn.storeCredit.code}` : saleReturn.refundMethodName ?? undefined,
          });
          if (exchange && saleReturn.storeCredit) {
            void lookupCredit(saleReturn.storeCredit.code).then((credit) => {
              setExchangeCredit(credit);
              toast.info('Bipe os produtos da troca: o vale entra sozinho no pagamento.');
            });
          }
          closeModal();
        }}
      />
      <ReceiptModal
        open={modal === 'receipt'}
        sessionId={session.id}
        methods={paymentMethods}
        customer={cart.customer}
        onClose={closeModal}
        onDone={(receipt) => {
          void queryClient.invalidateQueries({ queryKey: cashKey(terminal) });
          void queryClient.invalidateQueries({ queryKey: ['customers'] });
          void queryClient.invalidateQueries({ queryKey: ['receivables'] });
          void printer.printReceipt(receipt);
          toast.success(`Recebido ${formatMoney(receipt.amount)} de ${receipt.customer.name}`, {
            description: receipt.change > 0 ? `Troco: ${formatMoney(receipt.change)}` : `Saldo devedor: ${formatMoney(receipt.balanceAfter ?? 0)}`,
          });
          closeModal();
        }}
      />
      <VoucherModal open={modal === 'voucher'} onClose={closeModal} onPrint={(credit) => void printer.printVoucher(credit)} />
      <CustomerPickerModal
        open={modal === 'customer'}
        current={{ customer: cart.customer, document: cart.customerDocument }}
        canCreate={can(P.CUSTOMER_WRITE)}
        onClose={closeModal}
        onSelect={({ customer, document }) => {
          dispatch({ type: 'customer', customer, document });
          if (customer) toast.success(`Cliente: ${customer.name}`);
          else if (document) toast.success(`CPF/CNPJ na nota: ${formatDocument(document)}`);
          closeModal();
        }}
      />
      <QuantityModal
        open={modal === 'quantity'}
        item={selected}
        onClose={closeModal}
        onConfirm={(quantity) => {
          if (selected) dispatch({ type: 'setQuantity', key: selected.key, quantity });
          closeModal();
        }}
      />
      <DiscountModal
        open={modal === 'itemDiscount'}
        title="Desconto no item"
        baseCents={totals.lines[selectedIndex]?.grossCents ?? 0}
        current={selected?.discount ?? null}
        limitPercent={posSettings.maxDiscountPercent}
        canExceedLimit={canDiscount || Boolean(cart.authorization)}
        onClose={closeModal}
        onConfirm={(discount) => void applyDiscount('item', discount)}
      />
      <DiscountModal
        open={modal === 'orderDiscount'}
        title="Desconto no total da venda"
        baseCents={totals.subtotalCents}
        current={cart.orderDiscount}
        limitPercent={posSettings.maxDiscountPercent}
        canExceedLimit={canDiscount || Boolean(cart.authorization)}
        onClose={closeModal}
        onConfirm={(discount) => void applyDiscount('order', discount)}
      />
      <CashMovementModal
        open={modal === 'cashMovement'}
        session={session}
        onClose={closeModal}
        onDone={(movement) => {
          toast.success(`${movement.type === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'} de ${formatMoney(movement.amount)} registrado`);
          void printer.printCashMovement(movement);
          void queryClient.invalidateQueries({ queryKey: cashKey(terminal) });
          closeModal();
        }}
      />
      {modal === 'closeCash' && (
        <CloseCashModal
          open
          sessionId={session.id}
          pendingSales={sessionPendingSales}
          onClose={closeModal}
          onClosed={(closed) => {
            toast.success('Caixa fechado');
            void printer.printCashReport(closed);
            queryClient.setQueryData(cashKey(terminal), null);
            invalidateSalesData(queryClient);
            setModal(null);
          }}
        />
      )}
      <SwitchOperatorModal open={modal === 'switchOperator'} onClose={closeModal} onSwitch={switchOperator} />
      {modal === 'sales' && <SessionSalesModal open sessionId={session.id} onClose={closeModal} />}
      <ConfirmDialog
        open={modal === 'cancelSale'}
        title="Cancelar a venda atual?"
        description={`Todos os ${cart.items.length} item(ns) serão retirados do cupom. A ação fica registrada na auditoria.`}
        confirmLabel="Cancelar venda"
        onConfirm={abandonSale}
        onClose={closeModal}
      />
      <Modal open={modal === 'quote'} onClose={closeModal} title="Orçamento" description="Documento para o cliente — não é venda e não baixa estoque." size="sm">
        <div className="grid gap-2">
          <Button
            size="lg"
            icon={<Printer className="size-5" />}
            onClick={() => {
              void printer.printQuote(quoteData());
              closeModal();
            }}
          >
            Imprimir em A4
          </Button>
          <Button
            size="lg"
            variant="outline"
            icon={<FileDown className="size-5" />}
            onClick={() => {
              void printer.pdf.quote(quoteData());
              closeModal();
            }}
          >
            Baixar PDF
          </Button>
        </div>
      </Modal>
      <SaleCompleteModal
        sale={modal === 'complete' ? lastSale : null}
        onPrint={(sale) => void printer.printSale(sale)}
        onPdf={(sale) => void printer.pdf.sale(sale, printer.paper)}
        onClose={closeModal}
      />
    </div>
  );
}

function Shortcut({
  keyName,
  label,
  onClick,
  disabled,
  tone,
  className,
}: {
  keyName: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[13px] font-medium shadow-sm transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-200 disabled:hover:bg-white',
        tone === 'danger' ? 'text-red-700' : 'text-slate-700',
        className,
      )}
    >
      <kbd className="kbd shrink-0">{keyName}</kbd>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function SaleCompleteModal({
  sale,
  onPrint,
  onPdf,
  onClose,
}: {
  sale: Sale | null;
  onPrint: (sale: Sale) => void;
  onPdf: (sale: Sale) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={Boolean(sale)} onClose={onClose} title="Venda concluída" size="sm">
      {sale && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
          <p className="text-sm text-slate-500">
            {sale.number > 0 ? `Venda nº ${String(sale.number).padStart(6, '0')}` : 'Venda salva offline (o número sai ao sincronizar)'}
          </p>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Troco</p>
            <p className={cn('text-4xl font-bold tabular-nums', sale.change > 0 ? 'text-emerald-700' : 'text-slate-400')}>{formatMoney(sale.change)}</p>
            <p className="mt-1 text-sm text-slate-500">Total {formatMoney(sale.total)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => onPrint(sale)} autoFocus>
              Imprimir
            </Button>
            <Button variant="outline" icon={<FileDown className="size-4" />} onClick={() => onPdf(sale)}>
              PDF
            </Button>
          </div>
          <Button size="lg" className="w-full" onClick={onClose}>
            Nova venda <kbd className="kbd border-white/30 bg-white/15 text-white">Esc</kbd>
          </Button>
        </div>
      )}
    </Modal>
  );
}
