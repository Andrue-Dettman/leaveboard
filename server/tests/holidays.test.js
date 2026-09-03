import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { fallbackHolidays } from '../src/services/holidayFallback.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));

// Shaped like the Nager.Date feed: state-level entries alongside nationwide ones, a date
// repeated with a different county list, and no useful ordering.
const upstreamPayload = [
  { date: '2026-11-26', localName: 'Thanksgiving Day', name: 'Thanksgiving Day', global: true },
  { date: '2026-01-01', localName: "New Year's Day", name: "New Year's Day", global: true },
  {
    date: '2026-02-12',
    localName: "Lincoln's Birthday",
    name: "Lincoln's Birthday",
    global: false,
  },
  { date: '2026-11-26', localName: 'Thanksgiving Day', name: 'Thanksgiving Day', global: true },
  { date: '2026-07-03', localName: 'Independence Day', name: 'Independence Day', global: true },
];

const normalized = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-07-03', name: 'Independence Day' },
  { date: '2026-11-26', name: 'Thanksgiving Day' },
];

function upstreamReturns(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}

function upstreamFails() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));
}

// The socket opens and nothing ever comes back, which is how a struggling free service
// fails far more often than by refusing the connection outright.
function upstreamStalls() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url, options) =>
        new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(options.signal.reason ?? new Error('aborted'))
          );
        })
    )
  );
}

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/holidays', () => {
  it('keeps only nationwide holidays, drops repeated dates, and sorts by date', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    upstreamReturns(upstreamPayload);

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(normalized);
  });

  it('caches what it fetched so the next request can skip the network', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    upstreamReturns(upstreamPayload);

    await request(createApp()).get('/api/holidays?year=2026');

    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO holiday_cache'), [
      2026,
      'US',
      JSON.stringify(normalized),
    ]);
  });

  it('serves a cache entry under a day old without calling upstream', async () => {
    query.mockResolvedValueOnce({
      rows: [{ payload: normalized, fetchedAt: new Date(Date.now() - 60 * 60 * 1000) }],
    });
    upstreamReturns(upstreamPayload);

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(normalized);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes a cache entry older than a day', async () => {
    const stale = [{ date: '2026-01-01', name: 'Stale copy' }];
    query
      .mockResolvedValueOnce({
        rows: [{ payload: stale, fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
      })
      .mockResolvedValueOnce({ rows: [] });
    upstreamReturns(upstreamPayload);

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(normalized);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('serves a stale cache entry when upstream is unreachable', async () => {
    const stale = [{ date: '2026-01-01', name: 'Stale copy' }];
    query.mockResolvedValueOnce({
      rows: [{ payload: stale, fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
    });
    upstreamFails();

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(stale);
  });

  it('falls back to the checked-in set when nothing is cached and upstream is unreachable', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    upstreamFails();

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fallbackHolidays[2026]);
  });

  it('does not cache the fallback set, so the next request retries upstream', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    upstreamFails();

    await request(createApp()).get('/api/holidays?year=2026');

    expect(query).toHaveBeenCalledOnce();
  });

  it('reports an upstream failure for a year it cannot fall back on', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    upstreamFails();

    const res = await request(createApp()).get('/api/holidays?year=2030');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: 'Could not load holidays for 2030' },
    });
  });

  it('treats a non-200 from upstream as a failure', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await request(createApp()).get('/api/holidays?year=2030');

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('defaults to the current year when none is given', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    upstreamReturns([]);

    await request(createApp()).get('/api/holidays');

    const currentYear = new Date().getFullYear();
    expect(fetch).toHaveBeenCalledWith(
      `https://date.nager.at/api/v3/PublicHolidays/${currentYear}/US`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('rejects a year that is not four digits', async () => {
    const res = await request(createApp()).get('/api/holidays?year=last');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request query failed validation',
        fields: { year: 'must be a four-digit year' },
      },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a year outside the range the contract allows', async () => {
    const res = await request(createApp()).get('/api/holidays?year=1999');

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ year: 'must be between 2000 and 2100' });
    expect(query).not.toHaveBeenCalled();
  });

  it('gives up on a provider that stalls instead of holding the request open', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    upstreamStalls();

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fallbackHolidays[2026]);
  }, 15000);

  it('still serves holidays it fetched when writing them to the cache fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('permission denied for table holiday_cache'));
    upstreamReturns(upstreamPayload);

    const res = await request(createApp()).get('/api/holidays?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(normalized);
  });

  it('reads the cache with a parameterized query', async () => {
    query.mockResolvedValueOnce({
      rows: [{ payload: normalized, fetchedAt: new Date() }],
    });

    await request(createApp()).get('/api/holidays?year=2026');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE year = $1 AND country = $2'),
      [2026, 'US']
    );
  });
});
