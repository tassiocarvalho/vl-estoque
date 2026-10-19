import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  ClipboardList,
  FileInput,
  HandCoins,
  LineChart,
  NotebookPen,
  Contact,
  FolderTree,
  History,
  LayoutDashboard,
  Monitor,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import { P, type Permission } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Outros termos que encontram a tela na busca rápida. */
  keywords?: string;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operação',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, permission: P.PRODUCT_READ, keywords: 'inicio dashboard resumo' },
      { to: '/caixa', label: 'Frente de caixa', icon: Monitor, permission: P.POS_SELL, keywords: 'pdv vender venda cupom' },
      { to: '/entrada', label: 'Registrar entrada', icon: ArrowDownToLine, permission: P.STOCK_IN, keywords: 'recebimento compra bipar' },
      { to: '/saida', label: 'Registrar saída', icon: ArrowUpFromLine, permission: P.STOCK_OUT, keywords: 'perda quebra vencimento ajuste' },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { to: '/vendas', label: 'Vendas', icon: Receipt, permission: P.SALES_READ, keywords: 'relatorio faturamento cancelar reimprimir' },
      { to: '/caixas', label: 'Caixas', icon: Vault, permission: P.SALES_READ, keywords: 'fechamento turno sangria diferenca' },
      { to: '/clientes', label: 'Clientes', icon: Contact, permission: P.CUSTOMER_READ, keywords: 'cpf cnpj lgpd' },
    ],
  },
  {
    title: 'Estoque',
    items: [
      { to: '/produtos', label: 'Produtos', icon: Package, permission: P.PRODUCT_READ, keywords: 'preco cadastro estoque' },
      { to: '/categorias', label: 'Categorias', icon: FolderTree, permission: P.CATEGORY_MANAGE },
      { to: '/movimentacoes', label: 'Movimentações', icon: History, permission: P.MOVEMENT_READ, keywords: 'historico' },
      { to: '/pedidos', label: 'Solicitações de pedido', icon: ClipboardList, permission: P.PURCHASE_READ, keywords: 'reposicao fornecedor compra' },
      { to: '/notas-entrada', label: 'Notas de entrada', icon: FileInput, permission: P.PURCHASE_READ, keywords: 'nfe xml compra custo medio mercadoria' },
      { to: '/fornecedores', label: 'Fornecedores', icon: Truck, permission: P.PURCHASE_READ, keywords: 'cnpj distribuidora compra' },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, permission: P.REPORT_READ, keywords: 'ruptura parado excel csv' },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { to: '/financeiro', label: 'Fluxo de caixa e resultado', icon: LineChart, permission: P.FINANCE_READ, keywords: 'dre lucro prejuizo saldo entradas saidas' },
      { to: '/fiado', label: 'Fiado (a receber)', icon: NotebookPen, permission: P.FINANCE_READ, keywords: 'crediario contas a receber inadimplencia devedor' },
      { to: '/contas-a-pagar', label: 'Contas a pagar', icon: HandCoins, permission: P.FINANCE_READ, keywords: 'despesa boleto vencimento aluguel' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { to: '/usuarios', label: 'Usuários', icon: Users, permission: P.USER_MANAGE, keywords: 'funcionarios senha pin operador' },
      { to: '/lixeira', label: 'Lixeira', icon: Trash2, permission: P.TRASH_MANAGE, keywords: 'excluidos restaurar' },
      { to: '/auditoria', label: 'Auditoria', icon: ShieldCheck, permission: P.AUDIT_READ, keywords: 'log registro' },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, permission: P.SETTINGS_MANAGE, keywords: 'impressora logo marca pagamento email empresa' },
    ],
  },
];

/** Minúsculas e sem acento, para a busca casar "configuracoes" com "Configurações". */
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
