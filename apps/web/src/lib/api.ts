/**
 * Cliente HTTP da aplicação.
 *  - envia o cookie de sessão (httpOnly) automaticamente;
 *  - adiciona o cabeçalho anti-CSRF exigido pela API;
 *  - quando a API pede PIN, abre o diálogo de PIN e repete a requisição;
 *  - quando a ação exige um supervisor (caixa), abre o diálogo de autorização e repete com o token.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    /** Corpo completo da resposta de erro (campos extras, ex.: id do registro em conflito). */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Falha de rede: sem internet ou servidor fora do ar. */
export class NetworkError extends Error {
  constructor() {
    super('Sem conexão com o servidor');
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (error: unknown): error is NetworkError => error instanceof NetworkError;
export const isCanceled = (error: unknown) => error instanceof ApiError && error.code === 'CANCELED';

type PinRequester = (reason?: string) => Promise<string | null>;
let requestPin: PinRequester | null = null;
let onSessionExpired: (() => void) | null = null;

export interface AuthorizationNeeded {
  permission: string;
  scope: string | null;
  message: string;
}
type AuthorizationRequester = (needed: AuthorizationNeeded) => Promise<string | null>;
let requestAuthorization: AuthorizationRequester | null = null;

export const registerPinRequester = (fn: PinRequester | null) => {
  requestPin = fn;
};
export const registerAuthorizationRequester = (fn: AuthorizationRequester | null) => {
  requestAuthorization = fn;
};
export const registerSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn;
};

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  pin?: string;
  headers?: Record<string, string>;
  /** Envio em segundo plano (sincronização): nunca abre diálogos de PIN ou de autorização. */
  silent?: boolean;
}

export interface PostOptions {
  headers?: Record<string, string>;
  silent?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `/api${path}${search ? `?${search}` : ''}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...options.headers,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.pin) headers['X-Operation-Pin'] = options.pin;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (response.ok) return data as T;

  // Servidor inacessível através do service worker/proxy.
  if (response.status === 502 || response.status === 503 || response.status === 504) throw new NetworkError();

  const message: string = Array.isArray(data?.message) ? data.message[0] : (data?.message ?? 'Erro inesperado');
  const code: string | undefined = data?.code;

  const pinProblem = code === 'PIN_REQUIRED' || (code === 'PIN_INVALID' && response.status === 403);
  if (pinProblem && requestPin && !options.silent) {
    const pin = await requestPin(code === 'PIN_INVALID' ? 'PIN incorreto. Tente novamente.' : undefined);
    if (!pin) throw new ApiError(0, 'Operação cancelada', 'CANCELED');
    return request<T>(path, { ...options, pin });
  }

  const canAskAuthorization = requestAuthorization && !options.silent && !options.headers?.['X-Supervisor-Token'];
  if (code === 'AUTHORIZATION_REQUIRED' && canAskAuthorization) {
    const token = await requestAuthorization!({ permission: data?.permission, scope: data?.scope ?? null, message });
    if (!token) throw new ApiError(0, 'Operação cancelada', 'CANCELED');
    return request<T>(path, { ...options, headers: { ...options.headers, 'X-Supervisor-Token': token } });
  }

  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/pin-login')) {
    onSessionExpired?.();
  }
  throw new ApiError(response.status, message, code, data && typeof data === 'object' ? data : {});
}

export const http = {
  get: <T>(path: string, query?: Record<string, QueryValue>) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, options?: PostOptions) =>
    request<T>(path, { method: 'POST', body: body ?? {}, ...options }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Ocorreu um erro inesperado';
}
