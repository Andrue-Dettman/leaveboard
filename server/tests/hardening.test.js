import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));

const { query } = await import('../src/db/pool.js');

beforeEach(() => {
  query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('security headers', () => {
  it('sets the headers helmet is there for', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('lets another origin read the response', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});

describe('cross-origin access', () => {
  it('allows an origin named in CLIENT_ORIGIN', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://leaveboard.example');

    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://leaveboard.example');

    expect(res.headers['access-control-allow-origin']).toBe('https://leaveboard.example');
  });

  it('allows every origin in a comma-separated list', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://leaveboard.example, https://preview.example');

    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://preview.example');

    expect(res.headers['access-control-allow-origin']).toBe('https://preview.example');
  });

  it('refuses an origin that is not named', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://leaveboard.example');

    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://not-mine.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses to start in production without an allowed origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_ORIGIN', '');

    expect(() => createApp()).toThrow(/CLIENT_ORIGIN/);
  });

  it('starts in production once an allowed origin is named', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_ORIGIN', 'https://leaveboard.example');

    expect(() => createApp()).not.toThrow();
  });
});

describe('rate limiting', () => {
  it('turns away a client that goes over the limit', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '2');
    const app = createApp();

    await request(app).get('/api/leave-types').expect(200);
    await request(app).get('/api/leave-types').expect(200);
    const res = await request(app).get('/api/leave-types');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again in a few minutes.',
      },
    });
  });

  it('says how long to wait', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    const app = createApp();

    await request(app).get('/api/leave-types');
    const res = await request(app).get('/api/leave-types');

    expect(res.headers['retry-after']).toBe('900');
  });

  it('never turns away the liveness probe', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    const app = createApp();

    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health').expect(200);
  });

  it('counts requests per app rather than per route', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '2');
    const app = createApp();

    await request(app).get('/api/leave-types').expect(200);
    await request(app).get('/api/users').expect(200);
    const res = await request(app).get('/api/leave-types');

    expect(res.status).toBe(429);
  });
});
