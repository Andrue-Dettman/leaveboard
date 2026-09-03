import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));

const leaveTypes = [
  { id: 1, name: 'Vacation', annualAllowance: 15 },
  { id: 2, name: 'Sick', annualAllowance: 10 },
  { id: 3, name: 'Personal', annualAllowance: 3 },
];

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/leave-types', () => {
  it('lists every leave type with its annual allowance', async () => {
    query.mockResolvedValue({ rows: leaveTypes });

    const res = await request(createApp()).get('/api/leave-types');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(leaveTypes);
  });

  it('does not require an identity header', async () => {
    query.mockResolvedValue({ rows: leaveTypes });

    const res = await request(createApp()).get('/api/leave-types');

    expect(res.status).toBe(200);
  });
});
