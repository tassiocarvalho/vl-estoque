import { ApiError, isCanceled, isNetworkError } from '@/lib/api';
import { belongsTo, type PendingMovement } from './offline-store';

/**
 * Resposta que depende de uma ação da pessoa (entrar de novo, trocar a senha, digitar o PIN...),
 * e não do registro em si: a fila espera, sem marcar o registro como erro.
 */
const WAIT_FOR_USER_CODES = new Set([
  'PIN_REQUIRED',
  'PIN_INVALID',
  'PIN_NOT_SET',
  'PASSWORD_CHANGE_REQUIRED',
  'TERMS_ACCEPTANCE_REQUIRED',
]);

export type SyncFailure =
  /** Problema passageiro ou da sessão: para o envio e tenta de novo depois. Nada é perdido. */
  | { action: 'stop'; code?: string; reason?: string }
  /** Problema do próprio registro (ex.: estoque insuficiente): fica marcado para a pessoa decidir. */
  | { action: 'mark'; message: string };

export function classifySyncError(error: unknown): SyncFailure {
  if (isNetworkError(error)) return { action: 'stop', code: 'NETWORK' };
  if (isCanceled(error)) {
    return { action: 'stop', code: 'CANCELED', reason: 'Toque em "Enviar agora" e confirme seu PIN para enviar.' };
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { action: 'stop', code: 'SESSION', reason: 'Sua sessão expirou. Entre novamente para enviar.' };
    }
    if (error.code && WAIT_FOR_USER_CODES.has(error.code)) {
      const reason =
        error.code === 'PIN_REQUIRED'
          ? 'Toque em "Enviar agora" e confirme seu PIN para enviar.'
          : error.message;
      return { action: 'stop', code: error.code, reason };
    }
    if (error.status === 408 || error.status === 429) {
      return { action: 'stop', code: 'BUSY', reason: 'Servidor ocupado. Nova tentativa em instantes.' };
    }
    if (error.status >= 500 || error.status === 0) {
      return { action: 'stop', code: 'SERVER', reason: 'O servidor não respondeu. Nova tentativa em instantes.' };
    }
    return { action: 'mark', message: error.message };
  }
  // Erro inesperado no navegador: não descarta nada, apenas tenta de novo depois.
  return { action: 'stop', code: 'UNKNOWN', reason: 'Falha ao enviar. Nova tentativa em instantes.' };
}

export interface SyncDeps {
  list: () => Promise<PendingMovement[]>;
  send: (item: PendingMovement) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  markError: (id: string, message: string) => Promise<void>;
}

export interface SyncResult {
  sent: number;
  failed: number;
  /** Preenchido quando o envio parou antes do fim (o restante continua na fila). */
  stop?: Extract<SyncFailure, { action: 'stop' }>;
}

/**
 * Envia, em ordem, os registros offline da pessoa conectada.
 * O servidor é idempotente pelo id: reenviar um registro que já chegou não duplica.
 */
export async function runSync(userId: string, deps: SyncDeps): Promise<SyncResult> {
  let sent = 0;
  let failed = 0;
  for (const item of await deps.list()) {
    if (item.error || !belongsTo(item, userId)) continue;
    try {
      await deps.send(item);
    } catch (error) {
      const outcome = classifySyncError(error);
      if (outcome.action === 'stop') return { sent, failed, stop: outcome };
      await deps.markError(item.id, outcome.message);
      failed++;
      continue;
    }
    await deps.remove(item.id);
    sent++;
  }
  return { sent, failed };
}
