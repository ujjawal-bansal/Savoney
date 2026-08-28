import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiRequest, getAccessToken, refreshSession, setAccessToken } from './api';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const errorResponse = (message: string, code: string, status: number) =>
  jsonResponse({ error: { message, code } }, status);

describe('apiRequest', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('attaches the access token as a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('token-abc');

    await api.get('/transactions');

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
  });

  it('sends credentials so the refresh cookie travels with requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/transactions');

    expect(fetchMock.mock.calls[0]![1].credentials).toBe('include');
  });

  it('returns undefined for a 204 rather than trying to parse a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.delete('/transactions/1')).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the code and field details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              message: 'The submitted data failed validation',
              code: 'VALIDATION_FAILED',
              details: { amountMinor: ['Amount must be a whole number of minor units (cents)'] },
            },
          },
          422,
        ),
      ),
    );

    const error = await api.post('/transactions', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');
    expect((error as ApiError).fieldErrors.amountMinor).toContain('whole number');
  });
});

describe('transparent token refresh', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('refreshes once and replays the original request', async () => {
    setAccessToken('expired-token');

    const fetchMock = vi
      .fn()
      // 1. Original request rejected as expired.
      .mockResolvedValueOnce(errorResponse('Access token expired', 'TOKEN_EXPIRED', 401))
      // 2. Refresh succeeds with a new token.
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token' }))
      // 3. Replay succeeds.
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/transactions')).resolves.toEqual({ items: [] });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('fresh-token');
    // The replay must carry the *new* token, not the stale one.
    const replayHeaders = fetchMock.mock.calls[2]![1].headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('retries only once, so a persistently failing token cannot loop', async () => {
    setAccessToken('expired-token');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse('Access token expired', 'TOKEN_EXPIRED', 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token' }))
      .mockResolvedValueOnce(errorResponse('Access token expired', 'TOKEN_EXPIRED', 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/transactions')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not attempt a refresh for a non-expiry 401', async () => {
    setAccessToken('some-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errorResponse('Authentication required', 'UNAUTHORIZED', 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    // One call only: no refresh, no replay.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('collapses concurrent refreshes into a single request', async () => {
    // Refresh tokens are single-use and rotate. Two parallel refreshes would
    // make the second present an already-rotated token, which the server
    // correctly treats as theft and punishes by killing the whole session.
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(jsonResponse({ accessToken: 'fresh-token' })), 10);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('toQueryString', () => {
  it('omits empty values so cache keys stay stable as filters clear', async () => {
    const { toQueryString } = await import('./api');
    expect(toQueryString({ page: 1, search: '', type: undefined, categoryId: null })).toBe(
      '?page=1',
    );
  });

  it('returns an empty string when nothing is set', async () => {
    const { toQueryString } = await import('./api');
    expect(toQueryString({ search: '', type: undefined })).toBe('');
  });

  it('serialises dates as ISO strings', async () => {
    const { toQueryString } = await import('./api');
    const query = toQueryString({ from: new Date(Date.UTC(2026, 0, 15)) });
    expect(query).toBe('?from=2026-01-15T00%3A00%3A00.000Z');
  });
});

describe('apiRequest raw bodies', () => {
  it('sends a CSV import with the right content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imported: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/transactions/import', {
      method: 'POST',
      rawBody: { content: 'date,title\n2026-01-01,Coffee', contentType: 'text/csv' },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/csv');
    expect(init.body).toContain('Coffee');
  });
});
