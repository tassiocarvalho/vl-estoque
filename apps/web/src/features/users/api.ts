import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Role, UserAccount } from '@/lib/types';

export interface UserInput {
  name: string;
  role: Role;
  email?: string;
  username?: string;
  password?: string;
  pin?: string;
  active?: boolean;
}

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => http.get<UserAccount[]>('/users') });

export function useSaveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<UserInput> }) =>
      id ? http.patch<UserAccount>(`/users/${id}`, data) : http.post<UserAccount>('/users', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, value }: { id: string; kind: 'password' | 'pin'; value: string }) =>
      http.post(`/users/${id}/reset-${kind}`, kind === 'password' ? { password: value } : { pin: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** LGPD: apaga os dados pessoais de um usuário desativado, mantendo o histórico sem identificação. */
export function useAnonymizeUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post<UserAccount>(`/users/${id}/anonymize`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
