import type { ApiErrorBody } from '@savoney/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    if (body.details) this.details = body.details;
  }

  /** Field-level messages for a form, flattened to one string per field. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [field, messages] of Object.entries(this.details ?? {})) {
      if (messages[0]) result[field] = messages[0];
    }
    return result;
  }
}

/**
 * The access token lives in a module variable, not `localStorage`.
 *
 * Anything in `localStorage` is readable by any script on the page, so a single
 * XSS bug — in our code or in a dependency — hands over a working session. A
 * variable in module scope is not reachable that way, and because the token is
 * short-lived, the durable half of the session stays in an httpOnly cookie the
 * page cannot read at all.
 *
 * The cost is that a full page reload loses the token; `refresh()` on startup
 * silently restores the session from the cookie.
 */
let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** Notified when the refresh cookie is gone or rejected and the user must sign in. */
export const onSessionExpired = (listener: Listener): (() => void) => {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
};

/**
 * In-flight refresh, shared by every caller.
 *
 * Without this, a dashboard firing five parallel queries on a stale token would
 * trigger five concurrent refreshes. Since refresh tokens rotate and are
 * single-use, four of those would present an already-rotated token — which the
 * server correctly treats as theft and responds to by killing the session.
 * Collapsing them into one promise is what makes rotation and parallel data
 * fetching coexist.
 */
let refreshInFlight: Promise<boolean> | null = null;

const requestRefresh = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return false;

    const data = (await response.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
};

export const refreshSession = (): Promise<boolean> => {
  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send a raw string body (CSV import) instead of JSON. */
  rawBody?: { content: string; contentType: string };
  signal?: AbortSignal;
  /** Internal: prevents a refresh loop by allowing only one retry. */
  isRetry?: boolean;
}

const parseError = async (response: Response): Promise<ApiError> => {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.error);
  } catch {
    return new ApiError(response.status, {
      message: response.statusText || 'Request failed',
      code: 'UNKNOWN',
    });
  }
};

/**
 * Perform an API request, transparently refreshing an expired access token once.
 *
 * A 401 with code `TOKEN_EXPIRED` is recoverable: refresh, then replay the
 * original request. Any other 401 means the session itself is gone, so we
 * notify listeners rather than looping.
 */
export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, rawBody, signal, isRetry = false } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (rawBody) headers['Content-Type'] = rawBody.contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = { method, headers, credentials: 'include' };
  if (signal) init.signal = signal;
  if (rawBody) init.body = rawBody.content;
  else if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(`${BASE_URL}${path}`, init);

  if (response.status === 401 && !isRetry) {
    const error = await parseError(response);

    if (error.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshSession();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, isRetry: true });
      }
    }

    accessToken = null;
    for (const listener of sessionExpiredListeners) listener();
    throw error;
  }

  if (!response.ok) throw await parseError(response);

  // 204 No Content has no body to parse.
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
};

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  postRaw: <T>(path: string, content: string, contentType: string) =>
    apiRequest<T>(path, { method: 'POST', rawBody: { content, contentType } }),
};

/**
 * Build a query string, dropping empty values so the URL — and therefore the
 * React Query cache key — stays stable as filters are cleared.
 */
export const toQueryString = (params: object): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as Array<[string, unknown]>) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};
