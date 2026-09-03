import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));

const maria = {
  id: 1,
  name: 'Maria Alvarez',
  email: 'maria@example.edu',
  role: 'manager',
  managerId: null,
};

const sam = {
  id: 2,
  name: 'Sam Okafor',
  email: 'sam@example.edu',
  role: 'employee',
  managerId: 1,
};

beforeEach(() => {
  query.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/users', () => {
  it('lists the seeded users without an identity header', async () => {
    query.mockResolvedValue({ rows: [maria, sam] });

    const res = await request(createApp()).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([maria, sam]);
  });
});

describe('GET /api/me', () => {
  it('returns the current user with their manager expanded', async () => {
    query
      .mockResolvedValueOnce({ rows: [sam] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Maria Alvarez' }] });

    const res = await request(createApp()).get('/api/me').set('X-User-Id', '2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...sam, manager: { id: 1, name: 'Maria Alvarez' } });
  });

  it('returns a null manager for a user who reports to nobody', async () => {
    query.mockResolvedValueOnce({ rows: [maria] });

    const res = await request(createApp()).get('/api/me').set('X-User-Id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...maria, manager: null });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('looks the user up with a parameterized query', async () => {
    query.mockResolvedValueOnce({ rows: [maria] });

    await request(createApp()).get('/api/me').set('X-User-Id', '1');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [1]);
  });

  it('rejects a request with no identity header', async () => {
    const res = await request(createApp()).get('/api/me');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'MISSING_IDENTITY', message: 'X-User-Id header is required' },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an identity header that is not an integer', async () => {
    const res = await request(createApp()).get('/api/me').set('X-User-Id', 'maria');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });

  it('reports an identity header naming a user that does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/me').set('X-User-Id', '99');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'UNKNOWN_USER', message: 'No user with id 99' },
    });
  });

  it('reports an id too large for the users table as an unknown user', async () => {
    const res = await request(createApp()).get('/api/me').set('X-User-Id', '9999999999');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_USER');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('an unexpected failure', () => {
  it('is reported through the standard error envelope', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const res = await request(createApp()).get('/api/users');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' },
    });
    expect(logged).toHaveBeenCalled();
  });
});

describe('a malformed request body', () => {
  it('is reported as a validation error rather than a server fault', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(createApp())
      .post('/api/users')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
    });
    expect(logged).not.toHaveBeenCalled();
  });
});
