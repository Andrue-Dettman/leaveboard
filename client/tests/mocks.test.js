import { describe, expect, it } from 'vitest';

const base = 'http://localhost:3001';

const asSam = { 'X-User-Id': '2' };
const asMaria = { 'X-User-Id': '1' };

describe('identity handling', () => {
  it('rejects a request with no X-User-Id header', async () => {
    const res = await fetch(`${base}/api/me`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('MISSING_IDENTITY');
  });

  it('rejects an id that is not seeded', async () => {
    const res = await fetch(`${base}/api/me`, { headers: { 'X-User-Id': '99' } });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('UNKNOWN_USER');
  });

  it('returns the current user with their manager expanded', async () => {
    const res = await fetch(`${base}/api/me`, { headers: asSam });
    const body = await res.json();

    expect(body.name).toBe('Sam Okafor');
    expect(body.manager).toEqual({ id: 1, name: 'Maria Alvarez' });
  });

  it('lists users without requiring an identity', async () => {
    const res = await fetch(`${base}/api/users`);

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(3);
  });
});

describe('business day counting', () => {
  it('counts a plain work week as five days', async () => {
    const res = await fetch(`${base}/api/business-days?start=2026-03-16&end=2026-03-20`);

    expect(await res.json()).toEqual({ businessDays: 5, holidays: [] });
  });

  it('excludes weekends', async () => {
    const res = await fetch(`${base}/api/business-days?start=2026-03-14&end=2026-03-15`);

    expect((await res.json()).businessDays).toBe(0);
  });

  it('excludes a public holiday and reports which one', async () => {
    const res = await fetch(`${base}/api/business-days?start=2026-11-23&end=2026-11-27`);
    const body = await res.json();

    expect(body.businessDays).toBe(4);
    expect(body.holidays).toEqual([{ date: '2026-11-26', name: 'Thanksgiving Day' }]);
  });

  it('counts a single weekday as one day', async () => {
    const res = await fetch(`${base}/api/business-days?start=2026-05-11&end=2026-05-11`);

    expect((await res.json()).businessDays).toBe(1);
  });

  it('rejects an end date before the start date', async () => {
    const res = await fetch(`${base}/api/business-days?start=2026-05-11&end=2026-05-01`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fields.end).toBe('must be on or after start');
  });
});

describe('balances', () => {
  it('counts approved days as used and reports pending separately', async () => {
    const res = await fetch(`${base}/api/balances`, { headers: asSam });
    const vacation = (await res.json()).find((balance) => balance.typeName === 'Vacation');

    expect(vacation).toEqual({
      typeId: 1,
      typeName: 'Vacation',
      annualAllowance: 15,
      used: 5,
      pending: 4,
      remaining: 10,
    });
  });
});

describe('leave requests', () => {
  it('returns only the current user requests, newest first', async () => {
    const res = await fetch(`${base}/api/leave-requests`, { headers: asSam });
    const body = await res.json();

    expect(body.every((request) => request.userId === 2)).toBe(true);
    expect(body[0].createdAt >= body[1].createdAt).toBe(true);
  });

  it('filters by status', async () => {
    const res = await fetch(`${base}/api/leave-requests?status=pending`, { headers: asSam });
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('pending');
  });

  it('creates a request as pending with a server-computed day count', async () => {
    const res = await fetch(`${base}/api/leave-requests`, {
      method: 'POST',
      headers: { ...asSam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId: 1, startDate: '2026-12-21', endDate: '2026-12-25' }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.status).toBe('pending');
    expect(body.businessDays).toBe(4);
    expect(body.typeName).toBe('Vacation');
  });

  it('rejects an end date before the start date', async () => {
    const res = await fetch(`${base}/api/leave-requests`, {
      method: 'POST',
      headers: { ...asSam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId: 1, startDate: '2026-12-21', endDate: '2026-12-01' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fields.endDate).toBe('must be on or after startDate');
  });

  it('rejects a start date in the past', async () => {
    const res = await fetch(`${base}/api/leave-requests`, {
      method: 'POST',
      headers: { ...asSam, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId: 1, startDate: '2020-01-06', endDate: '2020-01-10' }),
    });

    expect((await res.json()).error.fields.startDate).toBe('must not be in the past');
  });

  it('lets the requester cancel their own pending request', async () => {
    const res = await fetch(`${base}/api/leave-requests/3/cancel`, {
      method: 'POST',
      headers: asSam,
    });

    expect((await res.json()).status).toBe('cancelled');
  });

  it('refuses a cancellation from someone who is not the requester', async () => {
    const res = await fetch(`${base}/api/leave-requests/3/cancel`, {
      method: 'POST',
      headers: { 'X-User-Id': '3' },
    });

    expect(res.status).toBe(403);
  });

  it('refuses to cancel a request that is already decided', async () => {
    const res = await fetch(`${base}/api/leave-requests/1/cancel`, {
      method: 'POST',
      headers: asSam,
    });

    expect(res.status).toBe(403);
  });
});

describe('approvals', () => {
  it('gives a manager the pending queue oldest first', async () => {
    const res = await fetch(`${base}/api/approvals`, { headers: asMaria });
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].createdAt <= body[1].createdAt).toBe(true);
    expect(body[0].requester.name).toBeTruthy();
  });

  it('refuses the queue to an employee', async () => {
    const res = await fetch(`${base}/api/approvals`, { headers: asSam });

    expect(res.status).toBe(403);
  });

  it('records an approval', async () => {
    const res = await fetch(`${base}/api/leave-requests/3/decision`, {
      method: 'POST',
      headers: { ...asMaria, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    });
    const body = await res.json();

    expect(body.status).toBe('approved');
    expect(body.decidedBy).toBe(1);
    expect(body.decidedAt).not.toBeNull();
  });

  it('rejects a denial with no manager note', async () => {
    const res = await fetch(`${base}/api/leave-requests/3/decision`, {
      method: 'POST',
      headers: { ...asMaria, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'denied' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fields.managerNote).toBe('required when denying a request');
  });

  it('refuses a decision from someone who is not the requester manager', async () => {
    const res = await fetch(`${base}/api/leave-requests/3/decision`, {
      method: 'POST',
      headers: { 'X-User-Id': '3', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    });

    expect(res.status).toBe(403);
  });
});

describe('holidays', () => {
  it('returns the normalized 2026 set with one entry per date', async () => {
    const res = await fetch(`${base}/api/holidays?year=2026`);
    const body = await res.json();

    expect(body).toHaveLength(11);
    expect(new Set(body.map((holiday) => holiday.date)).size).toBe(body.length);
    expect(body).toEqual([...body].sort((a, b) => a.date.localeCompare(b.date)));
  });
});
