import { lazy, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth, RequirePermission } from './features/auth/guards';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ProductsPage } from './features/products/ProductsPage';
import { StockOperationPage } from './features/stock/StockOperationPage';
import { NotFoundPage } from './NotFoundPage';
import { P } from './lib/permissions';

/** Telas menos usadas são carregadas sob demanda (o sistema abre mais rápido). */
const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));

const AuditPage = page(() => import('./features/audit/AuditPage'), 'AuditPage');
const CategoriesPage = page(() => import('./features/categories/CategoriesPage'), 'CategoriesPage');
const ProductDetailPage = page(() => import('./features/products/ProductDetailPage'), 'ProductDetailPage');
const ProfilePage = page(() => import('./features/profile/ProfilePage'), 'ProfilePage');
const PurchaseRequestsPage = page(() => import('./features/purchases/PurchaseRequestsPage'), 'PurchaseRequestsPage');
const ReportsPage = page(() => import('./features/reports/ReportsPage'), 'ReportsPage');
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage');
const MovementsPage = page(() => import('./features/stock/MovementsPage'), 'MovementsPage');
const TrashPage = page(() => import('./features/trash/TrashPage'), 'TrashPage');
const UsersPage = page(() => import('./features/users/UsersPage'), 'UsersPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/trocar-senha', element: <ChangePasswordPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <RequirePermission permission={P.PRODUCT_READ}><DashboardPage /></RequirePermission> },
          { path: 'entrada', element: <RequirePermission permission={P.STOCK_IN}><StockOperationPage mode="entry" /></RequirePermission> },
          { path: 'saida', element: <RequirePermission permission={P.STOCK_OUT}><StockOperationPage mode="exit" /></RequirePermission> },
          { path: 'produtos', element: <RequirePermission permission={P.PRODUCT_READ}><ProductsPage /></RequirePermission> },
          { path: 'produtos/:id', element: <RequirePermission permission={P.PRODUCT_READ}><ProductDetailPage /></RequirePermission> },
          { path: 'categorias', element: <RequirePermission permission={P.CATEGORY_MANAGE}><CategoriesPage /></RequirePermission> },
          { path: 'movimentacoes', element: <RequirePermission permission={P.MOVEMENT_READ}><MovementsPage /></RequirePermission> },
          { path: 'pedidos', element: <RequirePermission permission={P.PURCHASE_READ}><PurchaseRequestsPage /></RequirePermission> },
          { path: 'relatorios', element: <RequirePermission permission={P.REPORT_READ}><ReportsPage /></RequirePermission> },
          { path: 'usuarios', element: <RequirePermission permission={P.USER_MANAGE}><UsersPage /></RequirePermission> },
          { path: 'lixeira', element: <RequirePermission permission={P.TRASH_MANAGE}><TrashPage /></RequirePermission> },
          { path: 'auditoria', element: <RequirePermission permission={P.AUDIT_READ}><AuditPage /></RequirePermission> },
          { path: 'configuracoes', element: <RequirePermission permission={P.SETTINGS_MANAGE}><SettingsPage /></RequirePermission> },
          { path: 'perfil', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
