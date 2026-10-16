import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ApiError, http, registerSessionExpiredHandler } from '@/lib/api';
import type { Permission } from '@/lib/permissions';
import type { Profile } from '@/lib/types';
import { BRANDING_QUERY_KEY } from '../branding/BrandingProvider';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  login: (username: string, password: string) => Promise<Profile>;
  /** Troca rápida de operador no caixa (usuário + PIN). */
  loginWithPin: (username: string, pin: string) => Promise<Profile>;
  logout: () => Promise<void>;
  setUser: (user: Profile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['auth', 'me'];

/** Limpa as respostas da API guardadas para uso offline (computador compartilhado). */
async function clearOfflineCache() {
  if ('caches' in window) await caches.delete('api').catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await http.get<Profile>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const setUser = useCallback((user: Profile | null) => queryClient.setQueryData(ME_KEY, user), [queryClient]);

  /**
   * Troca de usuário: apaga os dados do usuário anterior (sem destruir a consulta da sessão,
   * que precisa continuar observada para a tela reagir ao login/logout).
   */
  const resetSession = useCallback(
    (user: Profile | null) => {
      // A marca da loja é pública (não é dado do usuário): continua no cache.
      const keep = new Set([ME_KEY[0], BRANDING_QUERY_KEY[0]]);
      queryClient.removeQueries({ predicate: (query) => !keep.has(query.queryKey[0] as string) });
      setUser(user);
    },
    [queryClient, setUser],
  );

  useEffect(() => {
    registerSessionExpiredHandler(() => resetSession(null));
    return () => registerSessionExpiredHandler(null);
  }, [resetSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const profile = await http.post<Profile>('/auth/login', { username, password });
      await clearOfflineCache();
      resetSession(profile);
      return profile;
    },
    [resetSession],
  );

  const loginWithPin = useCallback(
    async (username: string, pin: string) => {
      const profile = await http.post<Profile>('/auth/pin-login', { username, pin });
      resetSession(profile);
      return profile;
    },
    [resetSession],
  );

  const logout = useCallback(async () => {
    await http.post('/auth/logout').catch(() => undefined);
    await clearOfflineCache();
    resetSession(null);
  }, [resetSession]);

  const value = useMemo<AuthContextValue>(() => {
    const user = data ?? null;
    return {
      user,
      loading: isLoading,
      can: (permission) => user?.permissions.includes(permission) ?? false,
      login,
      loginWithPin,
      logout,
      setUser,
    };
  }, [data, isLoading, login, loginWithPin, logout, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return context;
}
