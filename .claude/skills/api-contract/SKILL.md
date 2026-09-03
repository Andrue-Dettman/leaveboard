---
name: api-contract
description: How to implement and propose changes to the LeaveBoard API contract. Load at the start of every backend session, and before touching anything under server/src/routes or server/src/services.
---

# Working against the frozen contract

`docs/openapi.yaml` is the source of truth, tagged `contract-v1`. `docs/API.md` is its
readable companion. Implement what they describe, exactly.

**You do not edit `openapi.yaml`.** If you need a change, run:

```
gh issue create --title "contract: <what needs to change>" \
  --body "<the endpoint, the current shape, the shape you need, and why>"
```

Then stop that task and pick up the next one. T3 makes the contract PR, merges it, and
tells you when to resume. A schema you changed unilaterally breaks the client agent, who
is building against the same file at the same time.

Verify your understanding of a shape before coding it:

```
npx @redocly/cli lint
```

## The error envelope

Every non-2xx response is exactly this shape. No exceptions, no bare strings, no
`{ message }` at the top level:

```js
{ error: { code: 'VALIDATION_ERROR', message: 'Request body failed validation', fields: { endDate: 'must be on or after startDate' } } }
```

`fields` appears only when individual inputs failed. Its keys are the **request body field
names** (`startDate`, not `start_date`) because the client attaches each message to an
input via `aria-describedby`. Getting the casing wrong silently breaks the form's error
announcements.

Codes and their statuses:

| Code | Status |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `MISSING_IDENTITY` | 400 |
| `UNKNOWN_USER` | 404 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `UPSTREAM_ERROR` | 502 |
| `INTERNAL_ERROR` | 500 |

Build the envelope in one place (a helper plus an Express error middleware) and route every
failure through it. Do not hand-write the object at each call site.

## Identity

`X-User-Id` holds a seeded integer. Middleware resolves it to a user row and hangs it on
the request. Missing or non-integer header is `400 MISSING_IDENTITY`; an id with no
matching row is `404 UNKNOWN_USER`.

Endpoints marked `security: []` in the spec (`/api/health`, `/api/users`,
`/api/leave-types`, `/api/holidays`, `/api/business-days`) must work without the header.
`/api/users` in particular is what the client calls *before* it has an identity, so
requiring the header there deadlocks the switcher.

## Validation

Zod, at the edge, before any query touches the database. Parse into a typed value and use
that value; never read `req.body.whatever` after parsing.

Map Zod issues onto `fields` by joining the issue path:

```js
const fields = Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
```

Write Zod messages as the sentence the user should read: `'must be on or after startDate'`,
not `'Invalid'`.

Rules the spec requires:

- `typeId` must exist in `leave_types`. Checking the foreign key by catching a Postgres
  error is not validation; query for it and return a `fields.typeId` message.
- `startDate` must not be in the past. Compare calendar dates as strings, not `Date` objects.
- `endDate >= startDate`.
- `note` at most 500 characters.
- On a decision, `managerNote` is required when `decision === 'denied'` and optional when
  `'approved'`. This is a `superRefine`, not two schemas.

Exceeding a remaining balance and spanning a holiday are **not** validation failures. The
client warns; the manager decides. Do not add a 400 for either.

## Dates

Every date is a calendar date. Store `DATE`, compare and return `YYYY-MM-DD` strings.
`server/src/db/pool.js` already overrides the `pg` DATE parser so columns come back as
strings — do not undo that, and do not wrap a date column in `new Date()` on the way out.

Do not use `new Date('2026-11-23')` for arithmetic; it parses as UTC midnight and shifts a
day in any negative-offset timezone. Work in `Date.UTC(...)` or on the string parts.

## Holidays

Upstream is `https://date.nager.at/api/v3/PublicHolidays/{year}/US`, cached per year in
`holiday_cache` with a 24-hour TTL.

The raw response needs normalizing and this is not optional — the 2026 US set has 17
entries but only 11 distinct national holidays:

1. Keep only entries where `global === true`. The rest are state-specific
   (Lincoln's Birthday in 9 states, Truman Day in Missouri, and so on) and must not reduce
   anyone's leave.
2. Deduplicate by date. The feed repeats dates, for example Good Friday twice with
   different county lists and Columbus Day both globally and per state.
3. Map to `{ date, name }` using `localName`, and sort ascending by date.

Cache behavior:

- Fresh cache row (under 24h): serve it, no network call.
- Stale row: try upstream; on success rewrite the row, on failure serve the stale row
  anyway. Stale holidays beat no holidays.
- No row and upstream fails: `502 UPSTREAM_ERROR`.
- Keep a checked-in 2026 fixture as the last-resort fallback so the demo never depends on
  a third-party service being up.

Test with `fetch` mocked (`vi.stubGlobal('fetch', ...)`). No test may hit the network.

## Authorization

Two rules, both of which need a test asserting the 403:

- Cancel: only the requester, and only while `status = 'pending'`.
- Decide: only the requester's manager (`users.manager_id` of the request's owner equals
  the current user), and only while `status = 'pending'`.

Check ownership in the same query that loads the row, or load then check — either is fine,
but never trust an id from the client to imply permission.

## SQL

Parameterized queries only, always `$1, $2`. Never build SQL by string concatenation or
template interpolation, including for `ORDER BY` and `status` filters — validate those
against an allowlist and branch.

Return camelCase to the client. The database is snake_case; alias in the SELECT
(`business_days AS "businessDays"`) rather than remapping objects in JavaScript.

## Before you open the PR

```
npm run lint
npm test --workspace server
npx @redocly/cli lint
```

Every task's tests must cover the happy path plus every error path named in the task row,
including the 403s. Test names describe behavior: `rejects a denial with no manager note`.
