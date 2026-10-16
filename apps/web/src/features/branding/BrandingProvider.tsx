import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { http } from '@/lib/api';
import { applyBranding, DEFAULT_BRANDING, DEFAULT_LOGO, readDeviceTheme, resolveTheme, saveDeviceTheme } from '@/lib/brand';
import type { StoreBranding, Theme } from '@/lib/types';

interface BrandingContextValue {
  branding: StoreBranding;
  logo: string;
  /** Tema efetivo neste aparelho. */
  theme: 'light' | 'dark';
  /** Alterna claro/escuro só neste aparelho. */
  toggleTheme: () => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);
const BRANDING_CACHE_KEY = 'pdv:branding';

/** Última marca conhecida: a tela abre já com a cara do cliente, mesmo offline. */
function cachedBranding(): StoreBranding {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    return raw ? { ...DEFAULT_BRANDING, ...JSON.parse(raw) } : DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
}

export const BRANDING_QUERY_KEY = ['branding'];

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => http.get<StoreBranding>('/settings/branding'),
    initialData: cachedBranding,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });
  const branding = data ?? DEFAULT_BRANDING;
  const [deviceTheme, setDeviceTheme] = useState<Theme | null>(readDeviceTheme);
  const [systemDark, setSystemDark] = useState(() => resolveTheme('system') === 'dark');
  const preference = deviceTheme ?? branding.theme;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media?.addEventListener('change', onChange);
    return () => media?.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyBranding(branding, preference);
    try {
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
    } catch {
      /* sem armazenamento local: a marca é buscada a cada abertura */
    }
  }, [branding, preference, systemDark]);

  const theme = resolveTheme(preference);
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveDeviceTheme(next);
    setDeviceTheme(next);
  }, [theme]);

  const value = useMemo(
    () => ({ branding, logo: branding.logo ?? DEFAULT_LOGO, theme, toggleTheme }),
    [branding, theme, toggleTheme],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) throw new Error('useBranding deve ser usado dentro de <BrandingProvider>');
  return context;
}
