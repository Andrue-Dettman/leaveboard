import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));

const sam = {
  id: 2,
  name: 'Sam Okafor',
  email: 'sam@example.edu',
  role: 'employee',
  managerId: 1,
};

// What the balances query returns before `remaining` is worked out.
const balanceRows = [
  { typeId: 1, typeName: 'Vacation', annualAllowance: 15, used: 4, pending: 3 },
  { typeId: 2, typeName: 'Sick', annualAllowance: 10, used: 0, pending: 0 },
  { typeId: 3, typeName: 'Personal', annualAllowance: 3, used: 0, pending: 2 },
];

function identityResolves() {
  query.mockResolvedValueOnce({ rows: [sam] });
}

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/balances', () => {
  it('returns allowance, used, pending and remaining for every leave type', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: balanceRows });

    const res = await request(createApp()).get('/api/balances').set('X-User-Id', '2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { typeId: 1, typeName: 'Vacation', annualAllowance: 15, used: 4, pending: 3, remaining: 11 },
      { typeId: 2, typeName: 'Sick', annualAllowance: 10, used: 0, pending: 0, remaining: 10 },
      { typeId: 3, typeName: 'Personal', annualAllowance: 3, used: 0, pending: 2, remaining: 3 },
    ]);
  });

  it('leaves the remainder alone for days that are only pending', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: [balanceRows[2]] });

    const res = await request(createApp()).get('/api/balances').set('X-User-Id', '2');

    expect(res.body[0]).toMatchObject({ pending: 2, remaining: 3 });
  });

  it('reports a leave type with no requests as untouched', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: [balanceRows[1]] });

    const res = await request(createApp()).get('/api/balances').set('X-User-Id', '2');

    expect(res.body[0]).toEqual({
      typeId: 2,
      typeName: 'Sick',
      annualAllowance: 10,
      used: 0,
      pending: 0,
      remaining: 10,
    });
  });

  it('reports a negative remainder when more was approved than the allowance', async () => {
    identityResolves();
    query.mockResolvedValueOnce({
      rows: [{ typeId: 3, typeName: 'Personal', annualAllowance: 3, used: 5, pending: 0 }],
    });

    const res = await request(createApp()).get('/api/balances').set('X-User-Id', '2');

    expect(res.body[0].remaining).toBe(-2);
  });

  it('scopes the balance to the current user and the current calendar year', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: balanceRows });

    await request(createApp()).get('/api/balances').set('X-User-Id', '2');

    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('FROM leave_types'), [
      2,
      new Date().getFullYear(),
    ]);
  });

  it('rejects a request with no identity header', async () => {
    const res = await request(createApp()).get('/api/balances');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });

  it('reports an identity header naming a user that does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/balances').set('X-User-Id', '99');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_USER');
    expect(query).toHaveBeenCalledOnce();
  });
});
