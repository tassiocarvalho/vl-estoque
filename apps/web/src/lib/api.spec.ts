import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http, registerPinRequester, type PinSession } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Servidor falso: exige o PIN 1234 em cada requisição, como a API de estoque. */
function stubServer() {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const pin = (init.headers as Record<string, string>)['X-Operation-Pin'];
    if (!pin) return json(428, { message: 'Informe seu PIN', code: 'PIN_REQUIRED' });
    if (pin !== '1234') return json(403, { message: 'PIN incorreto', code: 'PIN_INVALID' });
    return json(201, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  registerPinRequester(null);
});

describe('PIN no envio da fila offline', () => {
  it('pede o PIN uma única vez para vários registros do mesmo envio', async () => {
    stubServer();
    const askPin = vi.fn(async () => '1234');
    registerPinRequester(askPin);
    const pinSession: PinSession = { reason: 'Confirme para enviar' };

    for (let i = 0; i < 5; i++) await http.post('/stock/exits', { i }, { pinSession });

    expect(askPin).toHaveBeenCalledTimes(1);
    expect(askPin).toHaveBeenCalledWith('Confirme para enviar');
    expect(pinSession.pin).toBe('1234');
  });

  it('PIN errado pede de novo e guarda o correto', async () => {
    stubServer();
    const askPin = vi.fn().mockResolvedValueOnce('9999').mockResolvedValueOnce('1234');
    registerPinRequester(askPin);
    const pinSession: PinSession = {};

    await http.post('/stock/exits', {}, { pinSession });
    await http.post('/stock/exits', {}, { pinSession });

    expect(askPin).toHaveBeenCalledTimes(2);
    expect(askPin).toHaveBeenLastCalledWith('PIN incorreto. Tente novamente.');
    expect(pinSession.pin).toBe('1234');
  });

  it('envio automático sem permissão para abrir o diálogo falha com PIN_REQUIRED', async () => {
    stubServer();
    const askPin = vi.fn(async () => '1234');
    registerPinRequester(askPin);

    const attempt = http.post('/stock/exits', {}, { pinSession: { prompt: false } });

    await expect(attempt).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    expect(askPin).not.toHaveBeenCalled();
  });

  it('sem sessão de PIN, cada operação continua pedindo o PIN (comportamento normal das telas)', async () => {
    stubServer();
    const askPin = vi.fn(async () => '1234');
    registerPinRequester(askPin);

    await http.post('/stock/exits', {});
    await http.post('/stock/exits', {});

    expect(askPin).toHaveBeenCalledTimes(2);
  });
});
