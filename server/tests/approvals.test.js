import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const pendingRequest = {
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

const queueEntry = { ...pendingRequest, requester: { id: 2, name: 'Sam Okafor' } };

const approved = {
  ...pendingRequest,
  status: 'approved',
  decidedAt: '2026-09-03T13:00:00.000Z',
  decidedBy: 1,
};

function actingAs(user) {
  query.mockResolvedValueOnce({ rows: [user] });
}

// The three queries a decision makes: the identity lookup, the read that proves the request
// exists, the guarded update, and the read-back of the row that was written.
function decisionSucceeds(result = approved) {
  actingAs(maria);
  query.mockResolvedValueOnce({ rows: [pendingRequest] });
  query.mockResolvedValueOnce({ rowCount: 1 });
  query.mockResolvedValueOnce({ rows: [result] });
}

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/approvals', () => {
  it("returns the manager's pending queue with each requester attached", async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [queueEntry] });

    const res = await request(createApp()).get('/api/approvals').set('X-User-Id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([queueEntry]);
  });

  it('asks for the oldest request first', async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get('/api/approvals').set('X-User-Id', '1');

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('ORDER BY lr.created_at, lr.id'),
      [1]
    );
  });

  it('scopes the queue to the direct reports of the manager asking', async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get('/api/approvals').set('X-User-Id', '1');

    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('u.manager_id = $1'), [1]);
  });

  it('refuses an employee', async () => {
    actingAs(sam);

    const res = await request(createApp()).get('/api/approvals').set('X-User-Id', '2');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Only managers can view the approval queue' },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('requires an identity header', async () => {
    const res = await request(createApp()).get('/api/approvals');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/leave-requests/:id/decision', () => {
  it('approves a pending request from a direct report', async () => {
    decisionSucceeds();

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(approved);
  });

  it('denies with a note', async () => {
    const denied = {
      ...approved,
      status: 'denied',
      managerNote: 'We need coverage that week.',
    };
    decisionSucceeds(denied);

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'denied', managerNote: 'We need coverage that week.' });

    expect(res.status).toBe(200);
    expect(res.body.managerNote).toBe('We need coverage that week.');
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE leave_requests'), [
      7,
      1,
      'denied',
      'We need coverage that week.',
    ]);
  });

  it('guards the reporting line and the pending status in the update itself', async () => {
    decisionSucceeds();

    await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    const sql = query.mock.calls[2][0];
    expect(sql).toContain('u.manager_id = $2');
    expect(sql).toContain("lr.status = 'pending'");
  });

  it('records who decided and when', async () => {
    decisionSucceeds();

    await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    const sql = query.mock.calls[2][0];
    expect(sql).toContain('decided_at = now()');
    expect(sql).toContain('decided_by = $2');
  });

  it('stores no note when a request is approved without one', async () => {
    decisionSucceeds();

    await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(query.mock.calls[2][1][3]).toBeNull();
  });

  it('requires a note when denying', async () => {
    actingAs(maria);

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'denied' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({
      managerNote: 'required when denying a request',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('does not accept whitespace as a denial note', async () => {
    actingAs(maria);

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'denied', managerNote: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({
      managerNote: 'required when denying a request',
    });
  });

  it('rejects a decision that is not approved or denied', async () => {
    actingAs(maria);

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'cancelled' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ decision: 'must be approved or denied' });
  });

  it('rejects a manager note longer than 500 characters', async () => {
    actingAs(maria);

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'denied', managerNote: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ managerNote: 'must be 500 characters or fewer' });
  });

  it('refuses to decide a request from someone who is not a direct report', async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [{ ...pendingRequest, userId: 9 }] });
    query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: "Only the requester's manager can decide this request",
      },
    });
  });

  it('refuses an employee deciding their own request', async () => {
    actingAs(sam);
    query.mockResolvedValueOnce({ rows: [pendingRequest] });
    query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '2')
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses to decide a request that is no longer pending', async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [{ ...pendingRequest, status: 'cancelled' }] });
    query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('reports a request that does not exist', async () => {
    actingAs(maria);
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .post('/api/leave-requests/404/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No leave request with id 404' },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an id that is not a positive integer', async () => {
    actingAs(maria);

    const res = await request(createApp())
      .post('/api/leave-requests/abc/decision')
      .set('X-User-Id', '1')
      .send({ decision: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ id: 'must be a positive integer' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('requires an identity header', async () => {
    const res = await request(createApp())
      .post('/api/leave-requests/7/decision')
      .send({ decision: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDENTITY');
    expect(query).not.toHaveBeenCalled();
  });
});
