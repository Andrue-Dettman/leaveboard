import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/db/pool.js';
import { getHolidays } from '../src/services/holidays.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));
vi.mock('../src/services/holidays.js', () => ({ getHolidays: vi.fn() }));

const sam = {
  id: 2,
  name: 'Sam Okafor',
  email: 'sam@example.edu',
  role: 'employee',
  managerId: 1,
};

const vacation = { id: 1, name: 'Vacation' };
const thanksgiving = { date: '2026-11-26', name: 'Thanksgiving Day' };

const storedRequest = {
  id: 7,
  userId: 2,
  typeId: 1,
  typeName: 'Vacation',
  startDate: '2026-11-23',
  endDate: '2026-11-27',
  businessDays: 4,
  note: 'Thanksgiving week',
  status: 'pending',
  managerNote: null,
  createdAt: '2026-09-03T12:00:00.000Z',
  decidedAt: null,
  decidedBy: null,
};

const newRequest = {
  typeId: 1,
  startDate: '2026-11-23',
  endDate: '2026-11-27',
  note: 'Thanksgiving week',
};

function identityResolves() {
  query.mockResolvedValueOnce({ rows: [sam] });
}

// The four queries a successful create makes: the identity lookup, the leave type check,
// the insert, and the read-back of the row that was written.
function createSucceeds() {
  identityResolves();
  query.mockResolvedValueOnce({ rows: [vacation] });
  query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
  query.mockResolvedValueOnce({ rows: [storedRequest] });
}

beforeEach(() => {
  // Only Date is faked; supertest still needs real timers to drive the request.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
  query.mockReset();
  getHolidays.mockReset();
  getHolidays.mockResolvedValue([thanksgiving]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/leave-requests', () => {
  it("returns the current user's requests newest first", async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: [storedRequest] });

    const res = await request(createApp()).get('/api/leave-requests').set('X-User-Id', '2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([storedRequest]);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('ORDER BY lr.created_at DESC'),
      [2]
    );
  });

  it('filters by status', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .get('/api/leave-requests?status=approved')
      .set('X-User-Id', '2');

    expect(res.status).toBe(200);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('lr.status = $2'), [
      2,
      'approved',
    ]);
  });

  it('rejects a status that is not one of the four', async () => {
    identityResolves();

    const res = await request(createApp())
      .get('/api/leave-requests?status=rejected')
      .set('X-User-Id', '2');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual({
      status: 'must be one of pending, approved, denied, cancelled',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('requires an identity header', async () => {
    const res = await request(createApp()).get('/api/leave-requests');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/leave-requests', () => {
  it('creates a pending request and counts the business days itself', async () => {
    createSucceeds();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send(newRequest);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(storedRequest);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO leave_requests'),
      [2, 1, '2026-11-23', '2026-11-27', 4, 'Thanksgiving week']
    );
  });

  it('ignores a business day count sent by the client', async () => {
    createSucceeds();

    await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, businessDays: 99, status: 'approved' });

    const insertParams = query.mock.calls[2][1];
    expect(insertParams[4]).toBe(4);
  });

  it('stores no note when none is given', async () => {
    createSucceeds();

    await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ typeId: 1, startDate: '2026-11-23', endDate: '2026-11-27' });

    expect(query.mock.calls[2][1][5]).toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-11-27', endDate: '2026-11-23' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ endDate: 'must be on or after startDate' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects a start date in the past', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-09-02', endDate: '2026-09-04' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ startDate: 'must not be in the past' });
  });

  it('accepts a request starting today', async () => {
    createSucceeds();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-09-03', endDate: '2026-09-04' });

    expect(res.status).toBe(201);
  });

  it('rejects a note longer than 500 characters', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, note: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ note: 'must be 500 characters or fewer' });
  });

  it('rejects a date that is not a real calendar date', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-02-30', endDate: '2026-03-02' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ startDate: 'must be a real calendar date' });
  });

  it('rejects a missing leave type', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ startDate: '2026-11-23', endDate: '2026-11-27' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ typeId: 'is required' });
  });

  it('rejects a leave type that does not exist', async () => {
    identityResolves();
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, typeId: 99 });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ typeId: 'must name a leave type that exists' });
    // The identity lookup and the type check, and no insert after them.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects a range longer than a year', async () => {
    identityResolves();

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-10-01', endDate: '2027-11-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({
      endDate: 'must be within 366 days of startDate',
    });
  });

  it('accepts a request that uses more days than the balance has left', async () => {
    createSucceeds();
    getHolidays.mockResolvedValue([]);

    const res = await request(createApp())
      .post('/api/leave-requests')
      .set('X-User-Id', '2')
      .send({ ...newRequest, startDate: '2026-10-01', endDate: '2026-12-01' });

    // Going over the allowance is a warning on the client and a decision for the manager,
    // never a validation failure here.
    expect(res.status).toBe(201);
  });

  it('requires an identity header', async () => {
    const res = await request(createApp()).post('/api/leave-requests').send(newRequest);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });
});
