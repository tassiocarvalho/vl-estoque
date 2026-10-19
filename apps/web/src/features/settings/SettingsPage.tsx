import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Printer, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import { DEFAULT_LOGO } from '@/lib/brand';
import { NON_FISCAL_NOTICE } from '@/lib/labels';
import type { SystemSettings } from '@/lib/types';
import { BRANDING_QUERY_KEY } from '../branding/BrandingProvider';
import { PaymentMethodsCard } from '../payment-methods/PaymentMethodsCard';
import type { PrintDocument } from '../printing/document';
import { printHtml, renderHtml } from '../printing/render-html';
import { SETTINGS_QUERY_KEY, useSystemSettings } from '../printing/usePrinter';
import { CompanySettingsCard } from './CompanySettingsCard';
import { MailSettingsCard } from './MailSettingsCard';

const PIN_OPTIONS: { key: keyof SystemSettings['pinRequired']; label: string; description: string }[] = [
  { key: 'stockOut', label: 'Registrar saída', description: 'Perdas e ajustes de saída (as vendas do caixa não pedem PIN)' },
  { key: 'stockIn', label: 'Registrar entrada', description: 'Recebimento de mercadoria e retornos' },
  { key: 'productWrite', label: 'Cadastrar ou editar produto', description: 'Inclui o estoque inicial e os preços' },
  { key: 'productDelete', label: 'Excluir produto', description: 'Enviar para a lixeira e excluir definitivamente' },
];

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 150 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useSystemSettings();
  const [form, setForm] = useState<SystemSettings | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (settings: SystemSettings) => http.patch<SystemSettings>('/settings', settings),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
      queryClient.setQueryData(BRANDING_QUERY_KEY, updated.store);
      toast.success('Configurações salvas');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const testPrint = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (form.printer.connection === 'network') return http.post('/printing/test');
      const doc: PrintDocument = {
        title: 'Teste de impressão',
        blocks: [
          ...(form.store.logo ? [{ kind: 'logo' as const, src: form.store.logo }] : []),
          { kind: 'title', text: form.store.name },
          { kind: 'separator' },
          { kind: 'text', text: NON_FISCAL_NOTICE.toUpperCase(), align: 'center', bold: true },
          { kind: 'text', text: 'TESTE DE IMPRESSÃO', align: 'center' },
          { kind: 'separator' },
          { kind: 'text', text: 'Acentuação: ação, pão, café, açúcar' },
          { kind: 'pair', left: 'Item de teste', right: 'R$ 1.234,50' },
          { kind: 'pair', left: 'TOTAL', right: 'R$ 1.234,50', bold: true, large: true },
          { kind: 'separator' },
          { kind: 'text', text: form.store.receiptFooter, align: 'center' },
        ],
      };
      await printHtml(renderHtml(doc, form.printer.paper));
    },
    onSuccess: () => form?.printer.connection === 'network' && toast.success('Página de teste enviada para a impressora'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading || (!form && !isError)) return <LoadingState />;
  if (isError || !form) return <ErrorState message="Não foi possível carregar as configurações" onRetry={refetch} />;

  const update = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => setForm({ ...form, [key]: value });
  const store = <K extends keyof SystemSettings['store']>(key: K, value: SystemSettings['store'][K]) =>
    setForm({ ...form, store: { ...form.store, [key]: value } });
  const printer = <K extends keyof SystemSettings['printer']>(key: K, value: SystemSettings['printer'][K]) =>
    setForm({ ...form, printer: { ...form.printer, [key]: value } });
  const pos = <K extends keyof SystemSettings['pos']>(key: K, value: SystemSettings['pos'][K]) =>
    setForm({ ...form, pos: { ...form.pos, [key]: value } });
  const credit = <K extends keyof SystemSettings['credit']>(key: K, value: SystemSettings['credit'][K]) =>
    setForm({ ...form, credit: { ...form.credit, [key]: value } });
  const days = (value: string) => Math.max(0, Math.round(Number(value) || 0));
  const changed = JSON.stringify(form) !== JSON.stringify(data);

  const onLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return void toast.error('Use uma imagem PNG, JPEG, WebP ou SVG');
    if (file.size > MAX_LOGO_BYTES) return void toast.error('Imagem muito grande: use um arquivo de até 150 KB');
    store('logo', await readAsDataUrl(file));
  };

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Identidade da loja, impressão, caixa e regras do sistema — tudo ajustável sem reprogramação."
        actions={
          <Button icon={<Save className="size-4" />} disabled={!changed} loading={save.isPending} onClick={() => save.mutate(form)}>
            Salvar alterações
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Identidade da loja (white-label)" description="Nome, logotipo, cores e textos que aparecem nas telas e nos comprovantes" />
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_16rem]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da loja">{(id) => <Input id={id} maxLength={60} value={form.store.name} onChange={(e) => store('name', e.target.value)} />}</Field>
              <Field label="Slogan / subtítulo">{(id) => <Input id={id} maxLength={80} value={form.store.tagline} onChange={(e) => store('tagline', e.target.value)} />}</Field>
              <Field label="CNPJ / CPF" hint="Impresso no cabeçalho do comprovante">
                {(id) => <Input id={id} maxLength={40} value={form.store.document} onChange={(e) => store('document', e.target.value)} />}
              </Field>
              <Field label="Telefone">{(id) => <Input id={id} maxLength={40} value={form.store.phone} onChange={(e) => store('phone', e.target.value)} />}</Field>
              <Field label="Endereço" className="sm:col-span-2">
                {(id) => <Input id={id} maxLength={160} value={form.store.address} onChange={(e) => store('address', e.target.value)} />}
              </Field>
              <Field label="Cabeçalho extra do comprovante" hint="Opcional. Ex.: Instagram, horário de funcionamento">
                {(id) => <Textarea id={id} maxLength={300} value={form.store.receiptHeader} onChange={(e) => store('receiptHeader', e.target.value)} />}
              </Field>
              <Field label="Mensagem no rodapé do comprovante">
                {(id) => <Textarea id={id} maxLength={300} value={form.store.receiptFooter} onChange={(e) => store('receiptFooter', e.target.value)} />}
              </Field>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Logotipo</p>
                <div className="flex items-center gap-3">
                  <img src={form.store.logo ?? DEFAULT_LOGO} alt="" className="size-16 rounded-xl border border-slate-200 bg-white object-contain p-1" />
                  <div className="flex flex-col gap-1.5">
                    <Button variant="outline" size="sm" icon={<ImagePlus className="size-4" />} onClick={() => logoInput.current?.click()}>
                      Escolher imagem
                    </Button>
                    {form.store.logo && (
                      <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => store('logo', null)}>
                        Usar ícone padrão
                      </Button>
                    )}
                  </div>
                  <input ref={logoInput} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={(e) => void onLogo(e)} />
                </div>
                <p className="mt-1 text-xs text-slate-500">PNG, JPEG, WebP ou SVG até 150 KB.</p>
              </div>
              <Field label="Cor principal">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="color"
                      value={form.store.primaryColor}
                      onChange={(e) => store('primaryColor', e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                    />
                    <Input
                      value={form.store.primaryColor}
                      maxLength={7}
                      onChange={(e) => store('primaryColor', e.target.value)}
                      className="w-28 font-mono uppercase"
                      aria-label="Cor em hexadecimal"
                    />
                  </div>
                )}
              </Field>
              <Field label="Tema padrão" hint="Cada computador pode trocar pelo botão de sol/lua.">
                {(id) => (
                  <Select id={id} value={form.store.theme} onChange={(e) => store('theme', e.target.value as SystemSettings['store']['theme'])}>
                    <option value="system">Seguir o sistema operacional</option>
                    <option value="light">Claro</option>
                    <option value="dark">Escuro</option>
                  </Select>
                )}
              </Field>
              <div className="rounded-xl p-3 text-white" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(form.store.primaryColor) ? form.store.primaryColor : undefined }}>
                <p className="text-xs opacity-75">Prévia</p>
                <p className="font-semibold">{form.store.name || 'Nome da loja'}</p>
              </div>
            </div>
          </div>
        </Card>

        <PaymentMethodsCard />

        <Card>
          <CardHeader title="Impressão" description="Comprovante não fiscal da venda, sangria e fechamento de caixa" />
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Papel">
                {(id) => (
                  <Select id={id} value={form.printer.paper} onChange={(e) => printer('paper', e.target.value as SystemSettings['printer']['paper'])}>
                    <option value="80mm">Bobina térmica 80 mm</option>
                    <option value="58mm">Bobina térmica 58 mm</option>
                    <option value="A4">Folha A4 / Carta</option>
                  </Select>
                )}
              </Field>
              <Field label="Conexão">
                {(id) => (
                  <Select id={id} value={form.printer.connection} onChange={(e) => printer('connection', e.target.value as SystemSettings['printer']['connection'])}>
                    <option value="browser">Impressora do Windows (USB, serial ou rede)</option>
                    <option value="network">Térmica de rede direta (ESC/POS, TCP)</option>
                  </Select>
                )}
              </Field>
            </div>
            {form.printer.connection === 'network' ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label="Endereço IP da impressora" hint="Epson, Elgin, Bematech, Daruma e outras em modo ESC/POS">
                  {(id) => <Input id={id} placeholder="192.168.0.50" value={form.printer.host} onChange={(e) => printer('host', e.target.value)} />}
                </Field>
                <Field label="Porta">
                  {(id) => <Input id={id} type="number" min={1} max={65535} value={form.printer.port} onChange={(e) => printer('port', Number(e.target.value))} />}
                </Field>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Usa a impressora instalada no Windows com o driver do fabricante. Para imprimir sem a janela de confirmação, abra o navegador com a opção
                <code className="mx-1 rounded bg-slate-200 px-1">--kiosk-printing</code>.
              </p>
            )}
            <Switch
              label="Imprimir automaticamente ao finalizar a venda"
              description="Desligado: o caixa mostra o botão Imprimir após cada venda."
              checked={form.printer.autoPrint}
              onChange={(checked) => printer('autoPrint', checked)}
            />
            <Switch
              label="Abrir a gaveta nas vendas em dinheiro"
              description="Só com impressora de rede (na USB, configure no driver da impressora)."
              checked={form.printer.openDrawerOnCash}
              disabled={form.printer.connection !== 'network'}
              onChange={(checked) => printer('openDrawerOnCash', checked)}
            />
            <Button variant="outline" icon={<Printer className="size-4" />} loading={testPrint.isPending} onClick={() => testPrint.mutate()} disabled={changed}>
              {changed ? 'Salve para testar a impressão' : 'Imprimir página de teste'}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Frente de caixa" />
            <div className="space-y-5 p-5">
              <Field
                label="Desconto máximo do operador sem autorização (%)"
                hint="Acima disso, um gerente precisa autorizar com o próprio PIN. Use 0 para exigir autorização em qualquer desconto."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.pos.maxDiscountPercent}
                    onChange={(e) => pos('maxDiscountPercent', Number(e.target.value))}
                    className="w-32"
                  />
                )}
              </Field>
              <Switch
                label="Bloquear venda de item sem estoque"
                description="Desligado: o caixa vende e o saldo fica negativo (o produto está na mão do cliente)."
                checked={form.pos.blockSaleWithoutStock}
                onChange={(checked) => pos('blockSaleWithoutStock', checked)}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Trocas, vales e fiado" description="Regras da devolução, do vale-troca e do crediário" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Prazo para troca (dias)" hint="Depois disso, só com o gerente. 0 = sem prazo.">
                {(id) => <Input id={id} type="number" min={0} max={365} value={form.pos.returnDays} onChange={(e) => pos('returnDays', days(e.target.value))} />}
              </Field>
              <Field label="Validade do vale-troca (dias)" hint="0 = o vale não vence.">
                {(id) => <Input id={id} type="number" min={0} max={3650} value={form.pos.voucherValidityDays} onChange={(e) => pos('voucherValidityDays', days(e.target.value))} />}
              </Field>
              <Field label="1º vencimento do fiado (dias)" hint="Contados a partir da compra.">
                {(id) => <Input id={id} type="number" min={0} max={365} value={form.credit.firstDueDays} onChange={(e) => credit('firstDueDays', days(e.target.value))} />}
              </Field>
              <Field label="Dias entre as parcelas">
                {(id) => <Input id={id} type="number" min={1} max={365} value={form.credit.intervalDays} onChange={(e) => credit('intervalDays', Math.max(1, days(e.target.value)))} />}
              </Field>
              <Field label="Limite de fiado para clientes novos (R$)" hint="0 = o gerente libera cliente por cliente." className="sm:col-span-2">
                {(id) => (
                  <Input id={id} type="number" min={0} step="10" value={form.credit.defaultLimit} onChange={(e) => credit('defaultLimit', Math.max(0, Number(e.target.value) || 0))} className="w-40" />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Switch
                  label="Bloquear fiado de cliente com parcela vencida"
                  description="O gerente pode liberar a venda com o próprio PIN."
                  checked={form.credit.blockOverdue}
                  onChange={(checked) => credit('blockOverdue', checked)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Segurança: PIN" description="Quais operações de estoque exigem que o funcionário confirme com o próprio PIN" />
            <div className="space-y-5 p-5">
              {PIN_OPTIONS.map((option) => (
                <Switch
                  key={option.key}
                  label={option.label}
                  description={option.description}
                  checked={form.pinRequired[option.key]}
                  onChange={(checked) => update('pinRequired', { ...form.pinRequired, [option.key]: checked })}
                />
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Reposição" />
          <div className="space-y-5 p-5">
            <Field
              label="Dias de cobertura do pedido sugerido"
              hint="Quantidade sugerida = estoque de segurança + consumo médio × (prazo de entrega + estes dias) − saldo atual."
            >
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={180}
                  value={form.orderCoverageDays}
                  onChange={(e) => update('orderCoverageDays', Number(e.target.value))}
                  className="w-32"
                />
              )}
            </Field>
            <Switch
              label="Permitir estoque negativo nas saídas manuais"
              description="Se desligado, o sistema bloqueia saídas maiores que o saldo registrado (não vale para o caixa)."
              checked={form.allowNegativeStock}
              onChange={(checked) => update('allowNegativeStock', checked)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Lixeira" />
          <div className="p-5">
            <Field label="Dias até a exclusão definitiva" hint="Produtos excluídos podem ser recuperados durante este prazo. Produtos com vendas nunca são apagados.">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={365}
                  value={form.trashRetentionDays}
                  onChange={(e) => update('trashRetentionDays', Number(e.target.value))}
                  className="w-32"
                />
              )}
            </Field>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MailSettingsCard />
        <CompanySettingsCard />
      </div>
    </>
  );
}
