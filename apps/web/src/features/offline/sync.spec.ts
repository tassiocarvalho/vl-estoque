import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api';
import type { PendingMovement } from './offline-store';
import { classifySyncError, runSync, type SyncDeps } from './sync';

const ME = 'user-me';

let seq = 0;
function movement(overrides: Partial<PendingMovement> = {}): PendingMovement {
  seq++;
  return {
    id: `mov-${seq}`,
    kind: 'exits',
    payload: {
      id: `mov-${seq}`,
      productId: 'prod-1',
      type: 'OUT_SALE',
      quantity: 1,
      occurredAt: new Date(2026, 10, 23, 10, seq).toISOString(),
    },
    productName: 'Pão de forma',
    unit: 'UN',
    userId: ME,
    ...overrides,
  };
}

/** Fila em memória com o mesmo contrato do IndexedDB. */
function fakeOutbox(items: PendingMovement[], send: (item: PendingMovement) => Promise<unknown>) {
  const store = new Map(items.map((item) => [item.id, item]));
  const deps: SyncDeps = {
    list: async () => [...store.values()],
    send: vi.fn(send),
    remove: async (id) => void store.delete(id),
    markError: async (id, error) => {
      const current = store.get(id);
      if (current) store.set(id, { ...current, error });
    },
  };
  return { deps, store };
}

const ok = async () => ({});

describe('runSync — envio da fila offline', () => {
  it('envia tudo, na ordem, e limpa a fila', async () => {
    const items = [movement(), movement(), movement()];
    const { deps, store } = fakeOutbox(items, ok);

    const result = await runSync(ME, deps);

    expect(result).toEqual({ sent: 3, failed: 0 });
    expect(store.size).toBe(0);
    expect(vi.mocked(deps.send).mock.calls.map(([item]) => item.id)).toEqual(items.map((i) => i.id));
  });

  it('sessão expirada (401) para o envio sem marcar nenhum registro como erro', async () => {
    const items = [movement(), movement(), movement()];
    const { deps, store } = fakeOutbox(items, async () => {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    });

    const result = await runSync(ME, deps);

    expect(result.sent).toBe(0);
    expect(result.stop?.code).toBe('SESSION');
    expect(deps.send).toHaveBeenCalledTimes(1); // não insiste nos outros
    expect([...store.values()].every((item) => !item.error)).toBe(true);
    expect(store.size).toBe(3); // nada perdido: será enviado depois do novo login
  });

  it('limite de requisições (429) no meio da fila: o que faltou continua aguardando, sem erro', async () => {
    const items = [movement(), movement(), movement()];
    let calls = 0;
    const { deps, store } = fakeOutbox(items, async () => {
      if (++calls === 2) throw new ApiError(429, 'ThrottlerException: Too Many Requests');
      return {};
    });

    const result = await runSync(ME, deps);

    expect(result.sent).toBe(1);
    expect(result.stop?.code).toBe('BUSY');
    expect(store.size).toBe(2);
    expect([...store.values()].every((item) => !item.error)).toBe(true);
  });

  it('erro do servidor (500) não descarta o registro', async () => {
    const { deps, store } = fakeOutbox([movement()], async () => {
      throw new ApiError(500, 'Erro interno. Tente novamente.');
    });

    const result = await runSync(ME, deps);

    expect(result.stop?.code).toBe('SERVER');
    expect([...store.values()][0].error).toBeUndefined();
  });

  it('PIN cancelado ou não informado para o envio sem marcar erro', async () => {
    for (const error of [new ApiError(0, 'Operação cancelada', 'CANCELED'), new ApiError(428, 'Informe seu PIN', 'PIN_REQUIRED')]) {
      const { deps, store } = fakeOutbox([movement(), movement()], async () => {
        throw error;
      });
      const result = await runSync(ME, deps);
      expect(result.stop).toBeDefined();
      expect([...store.values()].every((item) => !item.error)).toBe(true);
    }
  });

  it('pessoa sem PIN cadastrado ou com troca de senha pendente: espera, sem marcar erro', async () => {
    for (const code of ['PIN_NOT_SET', 'PASSWORD_CHANGE_REQUIRED', 'TERMS_ACCEPTANCE_REQUIRED']) {
      const { deps, store } = fakeOutbox([movement()], async () => {
        throw new ApiError(403, 'mensagem do servidor', code);
      });
      const result = await runSync(ME, deps);
      expect(result.stop?.reason).toBe('mensagem do servidor');
      expect([...store.values()][0].error).toBeUndefined();
    }
  });

  it('sem conexão no meio do envio: para e mantém o restante', async () => {
    const items = [movement(), movement()];
    let calls = 0;
    const { deps, store } = fakeOutbox(items, async () => {
      if (++calls === 2) throw new NetworkError();
      return {};
    });

    const result = await runSync(ME, deps);

    expect(result).toMatchObject({ sent: 1, stop: { code: 'NETWORK' } });
    expect(store.size).toBe(1);
  });

  it('estoque insuficiente marca só aquele registro e continua com os próximos', async () => {
    const bad = movement();
    const good = movement();
    const { deps, store } = fakeOutbox([bad, good], async (item) => {
      if (item.id === bad.id) throw new ApiError(409, 'Estoque insuficiente: saldo atual de "Pão de forma" é 0', 'INSUFFICIENT_STOCK');
      return {};
    });

    const result = await runSync(ME, deps);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(store.get(bad.id)?.error).toContain('Estoque insuficiente');
    expect(store.has(good.id)).toBe(false);
  });

  it('não reenvia registros já marcados com erro', async () => {
    const errored = movement({ error: 'Estoque insuficiente' });
    const { deps } = fakeOutbox([errored, movement()], ok);

    const result = await runSync(ME, deps);

    expect(result.sent).toBe(1);
    expect(vi.mocked(deps.send).mock.calls.some(([item]) => item.id === errored.id)).toBe(false);
  });

  it('não envia registros de outra pessoa (computador compartilhado)', async () => {
    const mine = movement();
    const other = movement({ userId: 'user-other', userName: 'Maria' });
    const legacy = movement({ userId: undefined }); // feito antes desta versão
    const { deps, store } = fakeOutbox([mine, other, legacy], ok);

    const result = await runSync(ME, deps);

    expect(result.sent).toBe(2);
    expect([...store.keys()]).toEqual([other.id]);
  });
});

describe('classifySyncError', () => {
  it('erros de validação do registro ficam marcados para a pessoa decidir', () => {
    expect(classifySyncError(new ApiError(400, 'Quantidade inválida'))).toEqual({ action: 'mark', message: 'Quantidade inválida' });
    expect(classifySyncError(new ApiError(404, 'Produto não encontrado'))).toMatchObject({ action: 'mark' });
  });

  it('falhas desconhecidas nunca descartam o registro', () => {
    expect(classifySyncError(new Error('IndexedDB fechou'))).toMatchObject({ action: 'stop' });
  });
});
