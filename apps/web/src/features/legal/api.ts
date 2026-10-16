import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import type { LegalInfo } from '@/lib/types';

/** Versão do termo e dados da empresa (público: pode ser lido antes do login). */
export const useLegal = () =>
  useQuery({ queryKey: ['legal'], queryFn: () => http.get<LegalInfo>('/legal'), staleTime: 5 * 60_000 });
