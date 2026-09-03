import { http, HttpResponse } from 'msw';
import { holidays2026, leaveRequests, leaveTypes, users } from './fixtures.js';

// The handlers keep their own copy of the request list so creating, cancelling and
// deciding actually change what later requests return. resetMockData() puts it back,
// and tests should call it between cases.
let requests = [];
let nextId = 0;

export function resetMockData() {
  requests = leaveRequests.map((request) => ({ ...request }));
  nextId = Math.max(...requests.map((request) => request.id)) + 1;
}

resetMockData();

function fail(status, code, message, fields) {
  return HttpResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

function currentUser(request) {
  const header = request.headers.get('X-User-Id');
  if (header === null || !/^\d+$/.test(header)) {
    return { error: fail(400, 'MISSING_IDENTITY', 'X-User-Id header is required') };
  }

  const user = users.find((candidate) => candidate.id === Number(header));
  if (!user) {
    return { error: fail(404, 'UNKNOWN_USER', `No user with id ${header}`) };
  }

  return { user };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const holidayDates = new Set(holidays2026.map((holiday) => holiday.date));

function eachDate(start, end) {
  const dates = [];
  for (let day = new Date(`${start}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    dates.push(iso);
    if (iso >= end) break;
  }
  return dates;
}

function businessDaysBetween(start, end) {
  const excluded = [];
  let count = 0;

  for (const date of eachDate(start, end)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    if (holidayDates.has(date)) {
      excluded.push(holidays2026.find((holiday) => holiday.date === date));
      continue;
    }

    count += 1;
  }

  return { businessDays: count, holidays: excluded };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ ok: true })),

  http.get('*/api/users', () => HttpResponse.json(users)),

  http.get('*/api/me', ({ request }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const manager = users.find((candidate) => candidate.id === user.managerId);
    return HttpResponse.json({
      ...user,
      manager: manager ? { id: manager.id, name: manager.name } : null,
    });
  }),

  http.get('*/api/leave-types', () => HttpResponse.json(leaveTypes)),

  http.get('*/api/holidays', ({ request }) => {
    const year = new URL(request.url).searchParams.get('year') ?? '2026';
    if (!/^\d{4}$/.test(year)) {
      return fail(400, 'VALIDATION_ERROR', 'Query failed validation', {
        year: 'must be a four-digit year',
      });
    }

    // Only 2026 is fixtured; other years come back empty rather than wrong.
    return HttpResponse.json(year === '2026' ? holidays2026 : []);
  }),

  http.get('*/api/business-days', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const start = params.get('start');
    const end = params.get('end');

    const fields = {};
    if (!start || !ISO_DATE.test(start)) fields.start = 'must be a date in YYYY-MM-DD form';
    if (!end || !ISO_DATE.test(end)) fields.end = 'must be a date in YYYY-MM-DD form';
    if (!Object.keys(fields).length && end < start) fields.end = 'must be on or after start';
    if (Object.keys(fields).length) {
      return fail(400, 'VALIDATION_ERROR', 'Query failed validation', fields);
    }

    return HttpResponse.json(businessDaysBetween(start, end));
  }),

  http.get('*/api/balances', ({ request }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const year = new Date().getFullYear().toString();
    const mine = requests.filter(
      (candidate) => candidate.userId === user.id && candidate.startDate.startsWith(year)
    );

    const sum = (status, typeId) =>
      mine
        .filter((candidate) => candidate.typeId === typeId && candidate.status === status)
        .reduce((total, candidate) => total + candidate.businessDays, 0);

    return HttpResponse.json(
      leaveTypes.map((type) => {
        const used = sum('approved', type.id);
        return {
          typeId: type.id,
          typeName: type.name,
          annualAllowance: type.annualAllowance,
          used,
          pending: sum('pending', type.id),
          remaining: type.annualAllowance - used,
        };
      })
    );
  }),

  http.get('*/api/leave-requests', ({ request }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const status = new URL(request.url).searchParams.get('status');
    const allowed = ['pending', 'approved', 'denied', 'cancelled'];
    if (status && !allowed.includes(status)) {
      return fail(400, 'VALIDATION_ERROR', 'Query failed validation', {
        status: `must be one of ${allowed.join(', ')}`,
      });
    }

    return HttpResponse.json(
      requests
        .filter((candidate) => candidate.userId === user.id)
        .filter((candidate) => !status || candidate.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }),

  http.post('*/api/leave-requests', async ({ request }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const body = await request.json();
    const fields = {};

    const type = leaveTypes.find((candidate) => candidate.id === body.typeId);
    if (!type) fields.typeId = 'select a leave type';
    if (!body.startDate || !ISO_DATE.test(body.startDate)) {
      fields.startDate = 'must be a date in YYYY-MM-DD form';
    } else if (body.startDate < today()) {
      fields.startDate = 'must not be in the past';
    }
    if (!body.endDate || !ISO_DATE.test(body.endDate)) {
      fields.endDate = 'must be a date in YYYY-MM-DD form';
    } else if (body.startDate && body.endDate < body.startDate) {
      fields.endDate = 'must be on or after startDate';
    }
    if (body.note && body.note.length > 500) fields.note = 'must be 500 characters or fewer';

    if (Object.keys(fields).length) {
      return fail(400, 'VALIDATION_ERROR', 'Request body failed validation', fields);
    }

    const created = {
      id: nextId++,
      userId: user.id,
      typeId: type.id,
      typeName: type.name,
      startDate: body.startDate,
      endDate: body.endDate,
      businessDays: businessDaysBetween(body.startDate, body.endDate).businessDays,
      note: body.note ?? null,
      status: 'pending',
      managerNote: null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
    };

    requests.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/api/leave-requests/:id/cancel', ({ request, params }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const found = requests.find((candidate) => candidate.id === Number(params.id));
    if (!found) return fail(404, 'NOT_FOUND', `No leave request with id ${params.id}`);
    if (found.userId !== user.id || found.status !== 'pending') {
      return fail(403, 'FORBIDDEN', 'Only the requester can cancel a pending request');
    }

    found.status = 'cancelled';
    return HttpResponse.json(found);
  }),

  http.get('*/api/approvals', ({ request }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    if (user.role !== 'manager') {
      return fail(403, 'FORBIDDEN', 'Only managers can view the approval queue');
    }

    const reportIds = users
      .filter((candidate) => candidate.managerId === user.id)
      .map((candidate) => candidate.id);

    return HttpResponse.json(
      requests
        .filter(
          (candidate) => candidate.status === 'pending' && reportIds.includes(candidate.userId)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((candidate) => {
          const requester = users.find((person) => person.id === candidate.userId);
          return { ...candidate, requester: { id: requester.id, name: requester.name } };
        })
    );
  }),

  http.post('*/api/leave-requests/:id/decision', async ({ request, params }) => {
    const { user, error } = currentUser(request);
    if (error) return error;

    const body = await request.json();
    const fields = {};

    if (body.decision !== 'approved' && body.decision !== 'denied') {
      fields.decision = 'must be approved or denied';
    }
    if (body.decision === 'denied' && !body.managerNote?.trim()) {
      fields.managerNote = 'required when denying a request';
    }
    if (Object.keys(fields).length) {
      return fail(400, 'VALIDATION_ERROR', 'Request body failed validation', fields);
    }

    const found = requests.find((candidate) => candidate.id === Number(params.id));
    if (!found) return fail(404, 'NOT_FOUND', `No leave request with id ${params.id}`);

    const requester = users.find((candidate) => candidate.id === found.userId);
    if (requester.managerId !== user.id || found.status !== 'pending') {
      return fail(403, 'FORBIDDEN', "Only the requester's manager can decide this request");
    }

    found.status = body.decision;
    found.managerNote = body.managerNote ?? null;
    found.decidedAt = new Date().toISOString();
    found.decidedBy = user.id;

    return HttpResponse.json(found);
  }),
];
