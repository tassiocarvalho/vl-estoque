import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  BookOpen,
  ClipboardList,
  CloudOff,
  FolderTree,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  Scale,
  Trash2,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/ui/Display';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOffline } from '@/features/offline/OfflineProvider';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/labels';
import { MANUAL_URL } from '@/lib/manual';
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
      { to: '/entrada', label: 'Registrar entrada', icon: ArrowDownToLine, permission: P.STOCK_IN },
      { to: '/saida', label: 'Registrar saída', icon: ArrowUpFromLine, permission: P.STOCK_OUT },
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
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className="size-9 rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">V&amp;L Estoque</p>
        <p className="text-[11px] text-brand-200/80">Mercadinho e Panificadora</p>
      </div>
    </div>
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
    <div className="flex h-full flex-col bg-brand-900 text-brand-50">
      <div className="px-5 py-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-brand-200/60 uppercase">
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
                            : 'text-brand-100/80 hover:bg-white/6 hover:text-white',
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
        <a
          href={MANUAL_URL}
          target="_blank"
          rel="noopener"
          className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100/80 hover:bg-white/6 hover:text-white"
        >
          <BookOpen className="size-[18px]" />
          Manual de uso
        </a>
        <Link
          to="/termos"
          onClick={onNavigate}
          className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100/80 hover:bg-white/6 hover:text-white"
        >
          <Scale className="size-[18px]" />
          Termos e privacidade
        </Link>
        <NavLink
          to="/perfil"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/6"
        >
          <UserCircle className="size-8 text-brand-200" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-white">{user?.name}</span>
            <span className="block text-xs text-brand-200/70">{user && ROLE_LABELS[user.role]}</span>
          </span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100/80 hover:bg-white/6 hover:text-white"
        >
          <LogOut className="size-[18px]" />
          Sair
        </button>
      </div>
    </div>
  );
}

function ConnectionBar() {
  const { online, pending, syncing, sync } = useOffline();
  const failed = pending.filter((p) => p.error).length;
  if (online && pending.length === 0) return null;

  return (
    <div
      className={cn(
        'no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm',
        online ? 'bg-amber-50 text-amber-900' : 'bg-slate-800 text-white',
      )}
    >
      {!online && (
        <span className="inline-flex items-center gap-2 font-medium">
          <CloudOff className="size-4" /> Sem internet — os registros ficam salvos neste dispositivo
        </span>
      )}
      {pending.length > 0 && (
        <span className="inline-flex items-center gap-2">
          {pending.length} movimentação(ões) aguardando envio
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
              className="absolute top-5 right-3 z-10 rounded-lg p-1 text-brand-100 hover:bg-white/10"
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
        <img src="/icon.svg" alt="" className="size-7 rounded-md" />
        <span className="text-sm font-semibold">V&amp;L Estoque</span>
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
