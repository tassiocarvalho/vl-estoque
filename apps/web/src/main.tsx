import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './features/auth/AuthProvider';
import { PinProvider } from './features/auth/PinProvider';
import { SupervisorAuthProvider } from './features/auth/SupervisorAuthProvider';
import { BrandingProvider, useBranding } from './features/branding/BrandingProvider';
import { OfflineProvider } from './features/offline/OfflineProvider';
import { ApiError } from './lib/api';
import { router } from './router';
import './index.css';

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Não insiste em erros de permissão/validação; só em falhas temporárias.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

function ThemedToaster() {
  const { theme } = useBranding();
  return <Toaster richColors position="top-right" closeButton theme={theme} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <AuthProvider>
          <OfflineProvider>
            <PinProvider>
              <SupervisorAuthProvider>
                <RouterProvider router={router} />
                <ThemedToaster />
              </SupervisorAuthProvider>
            </PinProvider>
          </OfflineProvider>
        </AuthProvider>
      </BrandingProvider>
    </QueryClientProvider>
  </StrictMode>,
);
