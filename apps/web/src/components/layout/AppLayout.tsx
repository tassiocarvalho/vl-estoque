import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  ClipboardList,
  CloudOff,
  FolderTree,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UserCircle,
  Users,
  Vault,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/ui/Display';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBranding } from '@/features/branding/BrandingProvider';
import { useOffline } from '@/features/offline/OfflineProvider';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/labels';
import { P, type Permission } from '@/lib/permissions';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operação',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, permission: P.PRODUCT_READ },
      { to: '/caixa', label: 'Frente de caixa', icon: Monitor, permission: P.POS_SELL },
      { to: '/entrada', label: 'Registrar entrada', icon: ArrowDownToLine, permission: P.STOCK_IN },
      { to: '/saida', label: 'Registrar saída', icon: ArrowUpFromLine, permission: P.STOCK_OUT },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { to: '/vendas', label: 'Vendas', icon: Receipt, permission: P.SALES_READ },
      { to: '/caixas', label: 'Caixas', icon: Vault, permission: P.SALES_READ },
    ],
  },
  {
    title: 'Estoque',
    items: [
      { to: '/produtos', label: 'Produtos', icon: Package, permission: P.PRODUCT_READ },
      { to: '/categorias', label: 'Categorias', icon: FolderTree, permission: P.CATEGORY_MANAGE },
      { to: '/movimentacoes', label: 'Movimentações', icon: History, permission: P.MOVEMENT_READ },
      { to: '/pedidos', label: 'Solicitações de pedido', icon: ClipboardList, permission: P.PURCHASE_READ },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, permission: P.REPORT_READ },
    ],
  },
  {
    title: 'Administração',
    items: [
      { to: '/usuarios', label: 'Usuários', icon: Users, permission: P.USER_MANAGE },
      { to: '/lixeira', label: 'Lixeira', icon: Trash2, permission: P.TRASH_MANAGE },
      { to: '/auditoria', label: 'Auditoria', icon: ShieldCheck, permission: P.AUDIT_READ },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, permission: P.SETTINGS_MANAGE },
    ],
  },
];

function Brand() {
  const { branding, logo } = useBranding();
  return (
    <div className="flex items-center gap-2.5">
      <img src={logo} alt="" className="size-9 rounded-lg bg-white/10 object-contain" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">{branding.name}</p>
        {branding.tagline && <p className="truncate text-[11px] text-white/60">{branding.tagline}</p>}
      </div>
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useBranding();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={dark ? 'Usar tema claro' : 'Usar tema escuro'}
      aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
      className={cn('rounded-lg p-1.5 transition-colors', className)}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <Brand />
        {/* No celular o botão de tema fica no cabeçalho (aqui fica o "fechar menu"). */}
        {!onNavigate && <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />}
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/45 uppercase">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-white/12 text-white'
                            : 'text-white/75 hover:bg-white/6 hover:text-white',
                        )
                      }
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <NavLink
          to="/perfil"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/6"
        >
          <UserCircle className="size-8 text-white/70" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-white">{user?.name}</span>
            <span className="block text-xs text-white/55">{user && ROLE_LABELS[user.role]}</span>
          </span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/6 hover:text-white"
        >
          <LogOut className="size-[18px]" />
          Sair
        </button>
      </div>
    </div>
  );
}

export function ConnectionBar() {
  const { online, pending, pendingSales, syncing, sync } = useOffline();
  const failed = pending.filter((p) => p.error).length + pendingSales.filter((s) => s.error).length;
  const waiting = pending.length + pendingSales.length;
  if (online && waiting === 0) return null;

  return (
    <div
      className={cn(
        'no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm',
        online ? 'bg-amber-50 text-amber-900' : 'bg-[#1e293b] text-white',
      )}
    >
      {!online && (
        <span className="inline-flex items-center gap-2 font-medium">
          <CloudOff className="size-4" /> Sem internet — os registros ficam salvos neste dispositivo
        </span>
      )}
      {waiting > 0 && (
        <span className="inline-flex items-center gap-2">
          {[
            pendingSales.length > 0 && `${pendingSales.length} venda(s)`,
            pending.length > 0 && `${pending.length} movimentação(ões)`,
          ]
            .filter(Boolean)
            .join(' e ')}{' '}
          aguardando envio
          {failed > 0 && <strong className="text-red-600">({failed} com erro)</strong>}
          {online && (
            <button onClick={() => void sync()} className="inline-flex items-center gap-1 font-medium underline">
              <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} /> Enviar agora
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function MobileBrand() {
  const { branding, logo } = useBranding();
  return (
    <>
      <img src={logo} alt="" className="size-7 rounded-md object-contain" />
      <span className="flex-1 truncate text-sm font-semibold">{branding.name}</span>
      <ThemeToggle className="text-slate-500 hover:bg-slate-100" />
    </>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Menu lateral fixo (computador) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {/* Menu deslizante (celular/tablet) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-3 z-10 rounded-lg p-1 text-white/80 hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
        <MobileBrand />
      </header>

      <ConnectionBar />

      <main key={location.pathname} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
