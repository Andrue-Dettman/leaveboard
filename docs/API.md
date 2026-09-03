# LeaveBoard API reference

Version 1.0.0. The machine-readable source of truth is [`openapi.yaml`](./openapi.yaml);
this page is the readable companion. If the two ever disagree, the YAML wins and this file
is the bug.

Base URL in development: `http://localhost:3001`

## Conventions

**Identity.** Every request that depends on who is asking carries an `X-User-Id` header
holding a seeded user id. There are no passwords and no sessions. I documented that scope
cut in [`adr/0001-no-auth.md`](./adr/0001-no-auth.md) — it keeps a two-week project focused
on the leave workflow instead of on authentication I would not have written myself anyway.

```
X-User-Id: 2
```

**Dates.** Every date is a calendar date, `YYYY-MM-DD`, with no time and no timezone. They
are stored as PostgreSQL `DATE`. A leave request that starts on the 23rd starts on the 23rd
no matter where the browser is.

**Errors.** Every non-2xx response uses one envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "fields": {
      "endDate": "must be on or after startDate"
    }
  }
}
```

`fields` is present only when individual inputs failed, and its keys are the request field
names so the form can attach each message to the right input via `aria-describedby`.

| Code               | Status | Meaning                                            |
| ------------------ | ------ | -------------------------------------------------- |
| `VALIDATION_ERROR` | 400    | Body or query failed validation                    |
| `MISSING_IDENTITY` | 400    | `X-User-Id` absent or not an integer               |
| `UNKNOWN_USER`     | 404    | `X-User-Id` names a user that does not exist       |
| `FORBIDDEN`        | 403    | Authenticated but not allowed to do this           |
| `NOT_FOUND`        | 404    | No such resource                                   |
| `UPSTREAM_ERROR`   | 502    | The holiday provider failed and nothing was cached |
| `INTERNAL_ERROR`   | 500    | Unhandled server fault                             |

---

## System

### `GET /api/health`

Liveness probe. No identity required.

```json
{ "ok": true }
```

---

## Users

### `GET /api/users`

Lists the seeded users so the header switcher can render its menu. No identity required —
this is the endpoint you call _before_ you have an identity.

```json
[
  {
    "id": 1,
    "name": "Maria Alvarez",
    "email": "maria@example.edu",
    "role": "manager",
    "managerId": null
  },
  { "id": 2, "name": "Sam Okafor", "email": "sam@example.edu", "role": "employee", "managerId": 1 },
  {
    "id": 3,
    "name": "Priya Raman",
    "email": "priya@example.edu",
    "role": "employee",
    "managerId": 1
  }
]
```

### `GET /api/me`

The current user with their manager expanded, so the client can render "reports to Maria"
without a second round trip.

```
GET /api/me
X-User-Id: 2
```

```json
{
  "id": 2,
  "name": "Sam Okafor",
  "email": "sam@example.edu",
  "role": "employee",
  "managerId": 1,
  "manager": { "id": 1, "name": "Maria Alvarez" }
}
```

`manager` is `null` for a user with no manager. Returns `400 MISSING_IDENTITY` without the
header, `404 UNKNOWN_USER` if the id is not seeded.

---

## Reference data

### `GET /api/leave-types`

```json
[
  { "id": 1, "name": "Vacation", "annualAllowance": 15 },
  { "id": 2, "name": "Sick", "annualAllowance": 10 },
  { "id": 3, "name": "Personal", "annualAllowance": 3 }
]
```

### `GET /api/holidays?year=2026`

US public holidays, ascending by date. `year` defaults to the current year.

The server fetches from `https://date.nager.at/api/v3/PublicHolidays/{year}/US` and caches
the response per year in `holiday_cache` with a 24-hour TTL, giving up on the upstream call
after five seconds so a stalled provider cannot hold the request open.

Degradation is layered, because a free third-party service will eventually be unavailable:

1. A cache row under 24 hours old is served without touching the network.
2. A stale row is refreshed from upstream, but still served if that refresh fails. Stale
   holidays beat no holidays.
3. With nothing cached and upstream unreachable, a checked-in set is served for any year
   the project ships one for. 2026 is checked in. This copy is deliberately not written to
   the cache, so the next request retries upstream rather than treating the fallback as a
   fresh answer for 24 hours.
4. Only a year with no cache row, no reachable upstream, and no checked-in set returns
   `502 UPSTREAM_ERROR`.

Reasoning in [`adr/0003-holiday-caching.md`](./adr/0003-holiday-caching.md).

```json
[
  { "date": "2026-01-01", "name": "New Year's Day" },
  { "date": "2026-07-03", "name": "Independence Day" },
  { "date": "2026-11-26", "name": "Thanksgiving Day" }
]
```

### `GET /api/business-days?start=2026-11-23&end=2026-11-27`

Counts weekdays in the inclusive range `[start, end]`, minus US public holidays. Pure
calculation — it writes nothing — which is what makes it safe for the request form to call
on every keystroke (debounced).

It returns the holidays it excluded as well as the count, so the form can say _why_ five
calendar days came out as four business days instead of leaving the user to guess.

```json
{
  "businessDays": 4,
  "holidays": [{ "date": "2026-11-26", "name": "Thanksgiving Day" }]
}
```

`400 VALIDATION_ERROR` if either date is missing or malformed, or if `end` is before `start`.

---

## Requests

### `GET /api/balances`

One entry per leave type for the current user, scoped to the current calendar year.

```
GET /api/balances
X-User-Id: 2
```

```json
[
  {
    "typeId": 1,
    "typeName": "Vacation",
    "annualAllowance": 15,
    "used": 4,
    "pending": 3,
    "remaining": 11
  },
  {
    "typeId": 2,
    "typeName": "Sick",
    "annualAllowance": 10,
    "used": 0,
    "pending": 0,
    "remaining": 10
  }
]
```

`used` sums the stored `businessDays` of **approved** requests this year. `remaining` is
`annualAllowance - used`. `pending` is reported separately and is deliberately _not_
subtracted from `remaining`: a pending request has not been granted, so treating it as spent
would misstate the balance. The UI shows it as a secondary line ("3 days pending").

### `GET /api/leave-requests?status=pending`

The current user's own requests, newest first. `status` is optional and must be one of
`pending`, `approved`, `denied`, `cancelled`.

```json
[
  {
    "id": 7,
    "userId": 2,
    "typeId": 1,
    "typeName": "Vacation",
    "startDate": "2026-11-23",
    "endDate": "2026-11-27",
    "businessDays": 4,
    "note": "Visiting family for the holiday",
    "status": "pending",
    "managerNote": null,
    "createdAt": "2026-09-02T14:31:00.000Z",
    "decidedAt": null,
    "decidedBy": null
  }
]
```

### `POST /api/leave-requests`

```
POST /api/leave-requests
X-User-Id: 2
Content-Type: application/json

{
  "typeId": 1,
  "startDate": "2026-11-23",
  "endDate": "2026-11-27",
  "note": "Visiting family for the holiday"
}
```

Responds `201` with the created request. Status is always `pending` on creation — the client
cannot set it.

`businessDays` is computed on the server at creation time and stored on the row. It is not
recomputed on read. That is deliberate: if Nager.Date revises a holiday, or the cache
refreshes with different data, a request approved last month must not silently change how
many days it cost.

Validation (`400 VALIDATION_ERROR`, with `fields`):

| Field       | Rule                                            |
| ----------- | ----------------------------------------------- |
| `typeId`    | required, must be an existing leave type        |
| `startDate` | required, `YYYY-MM-DD`, not in the past         |
| `endDate`   | required, `YYYY-MM-DD`, on or after `startDate` |
| `note`      | optional, at most 500 characters                |

Exceeding your remaining balance is **not** an error. The form warns about it and the
manager decides. Same for a range that spans a holiday. Blocking either would make the tool
argue with the person using it over things a manager should judge.

### `POST /api/leave-requests/{id}/cancel`

Cancels one of your own pending requests. Responds `200` with the updated request.

Returns `403 FORBIDDEN` if you are not the requester, or if the request is not `pending` —
an already-decided request is history and does not get rewritten. `404 NOT_FOUND` if no such
request exists.

---

## Approvals

### `GET /api/approvals`

The pending queue for a manager: pending requests belonging to their direct reports, oldest
first, each carrying the requester so the page needs one call. `403 FORBIDDEN` for anyone
whose role is not `manager`.

```
GET /api/approvals
X-User-Id: 1
```

```json
[
  {
    "id": 7,
    "userId": 2,
    "typeId": 1,
    "typeName": "Vacation",
    "startDate": "2026-11-23",
    "endDate": "2026-11-27",
    "businessDays": 4,
    "note": "Visiting family for the holiday",
    "status": "pending",
    "managerNote": null,
    "createdAt": "2026-09-02T14:31:00.000Z",
    "decidedAt": null,
    "decidedBy": null,
    "requester": { "id": 2, "name": "Sam Okafor" }
  }
]
```

Oldest first is intentional: a queue that surfaces the longest-waiting request first is the
one that does not leave someone hanging.

### `POST /api/leave-requests/{id}/decision`

```
POST /api/leave-requests/7/decision
X-User-Id: 1
Content-Type: application/json

{
  "decision": "denied",
  "managerNote": "We need coverage that week; try the following Monday."
}
```

`decision` is `approved` or `denied`. `managerNote` is optional on an approval and
**required on a denial** — a denial without a reason is the thing employees actually
complain about, so the API refuses it:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "fields": { "managerNote": "required when denying a request" }
  }
}
```

Responds `200` with the decided request, its `status`, `managerNote`, `decidedAt` and
`decidedBy` filled in.

`403 FORBIDDEN` if the current user is not the requester's manager, or if the request is no
longer pending. `404 NOT_FOUND` if no such request exists.

---

## Changing this contract

The contract was frozen at the end of Phase 0 and tagged `contract-v1`. Changing it takes a
separate pull request that edits `openapi.yaml` and this file together, reviewed and merged
before any implementation depends on the change. That rule exists because the client and the
server are built in parallel against this document, and a contract that drifts mid-build
costs more than it saves.
