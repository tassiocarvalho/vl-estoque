import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { Role, UserAccount } from '@/lib/types';

export interface UserInput {
  name: string;
  role: Role;
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
