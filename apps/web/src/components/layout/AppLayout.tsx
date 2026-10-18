import {
  BookOpen,
  CloudOff,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Scale,
  Search,
  Sun,
  UserCircle,
  X,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/ui/Display';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBranding } from '@/features/branding/BrandingProvider';
import { useOffline } from '@/features/offline/OfflineProvider';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/labels';
import { MANUAL_URL } from '@/lib/manual';
import { CommandPalette } from './CommandPalette';
import { NAV_GROUPS } from './nav';

const COLLAPSED_KEY = 'sidebar-collapsed';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SEARCH_SHORTCUT = isMac ? '⌘K' : 'Ctrl+K';

/** Preferência de cada computador; o armazenamento pode estar bloqueado (aba anônima). */
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { branding, logo } = useBranding();
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={collapsed ? branding.name : undefined}>
      <img src={logo} alt="" className="size-9 shrink-0 rounded-lg bg-white/10 object-contain" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-white">{branding.name}</p>
          {branding.tagline && <p className="truncate text-[11px] text-white/60">{branding.tagline}</p>}
        </div>
      )}
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

interface SidebarProps {
  /** Só no celular: fecha o menu deslizante ao navegar. */
  onNavigate?: () => void;
  onSearch: () => void;
  /** Só no computador: menu recolhido mostra apenas os ícones. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

function Sidebar({ onNavigate, onSearch, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Recolhido: só o ícone, centralizado, com o nome no "title" (dica ao passar o mouse).
  const itemClass = cn(
    'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
  );
  const footerClass = cn(itemClass, 'text-white/75 hover:bg-white/6 hover:text-white');

  return (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className={cn('flex items-center gap-2 py-5', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        <Brand collapsed={collapsed} />
        {/* No celular o botão de tema fica no cabeçalho (aqui fica o "fechar menu"). */}
        {!onNavigate && !collapsed && <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />}
      </div>

      <div className={cn('pb-2', collapsed ? 'px-2' : 'px-3')}>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onSearch();
          }}
          title={collapsed ? `Busca rápida (${SEARCH_SHORTCUT})` : undefined}
          aria-label="Busca rápida"
          className={cn(
            'flex w-full items-center rounded-lg bg-white/8 py-2 text-sm text-white/65 ring-1 ring-white/10 transition-colors hover:bg-white/12 hover:text-white',
            collapsed ? 'justify-center' : 'gap-2.5 px-3',
          )}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-white/20 px-1.5 text-[10px] font-semibold text-white/60">
                {SEARCH_SHORTCUT}
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn('sidebar-scroll flex-1 overflow-y-auto py-2', collapsed ? 'space-y-3 px-2' : 'space-y-6 px-3')}>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-white/10" aria-hidden />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/45 uppercase">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                      aria-label={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        cn(
                          itemClass,
                          isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/6 hover:text-white',
                        )
                      }
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {!collapsed && label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn('border-t border-white/10', collapsed ? 'space-y-0.5 p-2' : 'p-3')}>
        <a
          href={MANUAL_URL}
          target="_blank"
          rel="noopener"
          title={collapsed ? 'Manual de uso' : undefined}
          className={cn(footerClass, 'mb-1 text-brand-100/80')}
        >
          <BookOpen className="size-[18px] shrink-0" />
          {!collapsed && 'Manual de uso'}
        </a>
        <Link
          to="/termos"
          onClick={onNavigate}
          title={collapsed ? 'Termos e privacidade' : undefined}
          className={cn(footerClass, 'mb-1 text-brand-100/80')}
        >
          <Scale className="size-[18px] shrink-0" />
          {!collapsed && 'Termos e privacidade'}
        </Link>
        {collapsed && (
          <div className="flex justify-center">
            <ThemeToggle className="p-2 text-white/75 hover:bg-white/6 hover:text-white" />
          </div>
        )}
        <NavLink
          to="/perfil"
          onClick={onNavigate}
          title={collapsed ? `${user?.name ?? ''} — Meu perfil` : undefined}
          className={cn('flex items-center rounded-lg py-2 hover:bg-white/6', collapsed ? 'justify-center' : 'gap-3 px-3')}
        >
          <UserCircle className={cn('shrink-0 text-white/70', collapsed ? 'size-7' : 'size-8')} />
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-white">{user?.name}</span>
              <span className="block text-xs text-white/55">{user && ROLE_LABELS[user.role]}</span>
            </span>
          )}
        </NavLink>
        <button onClick={handleLogout} title={collapsed ? 'Sair' : undefined} className={cn(footerClass, 'mt-1 w-full')}>
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && 'Sair'}
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expandir menu' : undefined}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
            className={cn(footerClass, 'mt-1 w-full text-white/55')}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px] shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="size-[18px] shrink-0" />
                Recolher menu
              </>
            )}
          </button>
        )}
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

function MobileBrand({ onSearch }: { onSearch: () => void }) {
  const { branding, logo } = useBranding();
  return (
    <>
      <img src={logo} alt="" className="size-7 rounded-md object-contain" />
      <span className="flex-1 truncate text-sm font-semibold">{branding.name}</span>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Busca rápida"
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
      >
        <Search className="size-[18px]" />
      </button>
      <ThemeToggle className="text-slate-500 hover:bg-slate-100" />
    </>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // sem armazenamento: vale só nesta aba
      }
      return !value;
    });
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Ctrl+K (⌘K no Mac) abre a busca rápida de qualquer tela.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={cn('min-h-screen transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
      {/* Menu lateral fixo (computador), recolhível */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onSearch={openSearch} />
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
            <Sidebar onNavigate={() => setMobileOpen(false)} onSearch={openSearch} />
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
        <MobileBrand onSearch={openSearch} />
      </header>

      <ConnectionBar />

      <main key={location.pathname} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>

      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
