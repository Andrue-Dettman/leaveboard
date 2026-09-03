# LeaveBoard — Design Document & Multi-Agent Build Plan

**Owner:** Andrue "Jimmy" Dettman
**Target:** Portfolio project for UW–Madison OHR Student Web Developer (Job No. 512036), application due **Sept 18, 2026**
**Status:** Draft v1 — Sept 2, 2026

This document is written to be read by both a human (you) and by Claude Code agents. Section 6 is the operating manual for the agents; everything before it is the spec they build against. Commit this file to the repo at `docs/DESIGN.md` so every agent can read it.

---

## 1. Purpose

LeaveBoard is a small, production-quality web application for submitting, tracking, and approving employee leave (PTO) requests. It exists to demonstrate — with real, deployed, reviewable code — every skill the OHR posting asks for.

### 1.1 Job-requirement mapping

| OHR posting asks for | Where LeaveBoard proves it |
|---|---|
| HTML, CSS, JavaScript proficiency | Entire front end; hand-written semantic HTML and CSS (no UI kit), plain JS logic |
| Git / version control | Branch-per-feature, PR review workflow, protected `main`, documented in `CONTRIBUTING.md` |
| Work independently | Solo project with self-authored docs and CI |
| Accessibility & responsive design | WCAG 2.1 AA definition of done, axe-core tests, keyboard nav, mobile-first layout |
| Modern JS framework (React) | React 18 front end |
| PHP / MySQL | Not used; PostgreSQL + SQL is the nearest honest equivalent. Do **not** claim PHP. |
| JSON / consuming an API | Consumes the Nager.Date public-holiday API; exposes and consumes its own JSON REST API |
| Writing/reading technical docs | README, `docs/API.md`, ADRs, `CONTRIBUTING.md` |
| Workflow design & documentation (20% of the job) | `CONTRIBUTING.md` documents the branching/PR/review workflow used to build the project |

### 1.2 Non-goals (say no to these)
- Real authentication / SSO. Use a seeded "act as user" switcher. Document this as a deliberate scope cut in an ADR.
- Email notifications, calendar sync, multi-tenant orgs, admin CRUD for leave types.
- Anything not in Section 2. Scope creep kills a two-week project.

---

## 2. Product Specification

### 2.1 Users and roles
- **Employee** — submits and cancels their own requests, views balances.
- **Manager** — everything an employee can do, plus approve/deny requests from their direct reports.
- Seeded data: 1 manager (Maria), 2 employees (Sam, Priya) reporting to Maria. A header "Acting as: [user ▾]" switches identity (sends `X-User-Id` header). No passwords.

### 2.2 Features (all in scope, all required for "done")

**F1 — Dashboard** (`/`)
- Balance cards per leave type: accrued, used, remaining.
- "Upcoming" list: next 5 approved/pending requests.
- Manager sees a "Pending approvals: N" callout linking to `/approvals`.

**F2 — Request list** (`/requests`)
- Table of the current user's requests: type, dates, business days, status, submitted date.
- Filter by status; sort by start date.
- On viewports < 640px the table becomes a stacked card list (no horizontal scroll).
- Cancel button on pending requests (with confirm dialog).

**F3 — New request form** (`/requests/new`)
- Fields: leave type (select), start date, end date, note (optional, ≤ 500 chars).
- Live "This request uses **N business days**" readout that updates as dates change, excluding weekends and public holidays (holidays fetched from the API).
- Warnings (not blockers): request spans a holiday; request exceeds remaining balance.
- Errors: end before start, past start date, missing type. Errors are announced via `aria-live`, focus moves to first invalid field on submit.

**F4 — Manager approvals** (`/approvals`, managers only)
- Queue of pending requests from direct reports, oldest first.
- Approve / Deny with optional manager note. Deny requires a note.
- Decision confirmed via accessible dialog; list updates without full reload; success announced via live region.

**F5 — Holiday awareness**
- Server fetches US public holidays from `https://date.nager.at/api/v3/PublicHolidays/{year}/US`, caches per year in the DB (24h TTL), and exposes them at `GET /api/holidays`.
- Front end shows an "Upcoming holidays" panel on the dashboard.

### 2.3 Business rules
- Business days = weekdays in [start, end] inclusive, minus dates in the holiday set.
- Balances: each leave type has an annual allowance (Vacation 15, Sick 10, Personal 3). `used` = sum of business days of **approved** requests in the current calendar year. `remaining = allowance − used`. Pending requests are shown separately as "pending: N days".
- Only the requester can cancel; only while pending. Only the requester's manager can decide.
- All dates are calendar dates (no times, no timezones). Store as `DATE`.

---

## 3. Architecture

### 3.1 Stack (decisions are final — do not relitigate in PRs)
| Layer | Choice | Why |
|---|---|---|
| Front end | React 18 + Vite, plain CSS (CSS modules OK), React Router | Job lists React; hand-written CSS proves CSS skill better than Tailwind would |
| Back end | Node 20 + Express 4, `pg` driver, Zod for validation | Full-JS stack reinforces the posting's core JS requirement |
| Database | PostgreSQL 16 | Already known from NVI; SQL skill is on the resume |
| Testing | Vitest + Supertest (server); Vitest + React Testing Library + `jest-axe` (client) | Automated a11y tests are a resume bullet |
| CI | GitHub Actions: lint, test, a11y tests on every PR | Reviewer agent relies on green CI |
| Hosting | Front end → Vercel; API → Render (free web service); DB → Neon (free Postgres) | All free, all deploy from `main` |
| Formatting | ESLint + Prettier, enforced in CI | Reviewer doesn't waste tokens on style |

Fallback if Express becomes a time sink: swap the server to FastAPI (already familiar). The API contract (3.4) does not change.

### 3.2 Repository layout (monorepo)
```
leaveboard/
├── client/                 # Vite + React app
│   ├── src/
│   │   ├── api/            # fetch wrappers, typed against docs/openapi.yaml
│   │   ├── components/     # reusable a11y-first components (Dialog, LiveRegion, DataTable, Field)
│   │   ├── pages/          # Dashboard, Requests, NewRequest, Approvals
│   │   ├── hooks/
│   │   └── styles/         # tokens.css, base.css, utilities.css
│   └── tests/
├── server/                 # Express API
│   ├── src/
│   │   ├── routes/
│   │   ├── services/       # businessDays.js, holidays.js, balances.js
│   │   ├── db/             # pool.js, migrations/, seed.js
│   │   └── app.js, index.js
│   └── tests/
├── docs/
│   ├── DESIGN.md           # this file
│   ├── API.md              # human-readable API reference (generated from openapi.yaml)
│   ├── openapi.yaml        # THE CONTRACT — see 3.4
│   ├── ACCESSIBILITY.md    # a11y checklist + how to run axe / screen reader
│   ├── CONTRIBUTING.md     # branching, PR, review workflow (Section 6, cleaned up for humans)
│   └── adr/                # 0001-no-auth.md, 0002-express-over-fastapi.md, 0003-holiday-caching.md ...
├── .claude/
│   ├── skills/             # project skills loaded by agents (see 6.3)
│   └── agents/             # optional custom subagent definitions
├── .github/workflows/ci.yml
├── .worktreeinclude        # copies .env into every worktree
├── .gitignore              # includes .claude/worktrees/
├── CLAUDE.md               # root instructions every agent reads automatically
└── README.md
```

### 3.3 Data model
```sql
users            (id PK, name, email, role CHECK (role IN ('employee','manager')), manager_id FK users NULL)
leave_types      (id PK, name UNIQUE, annual_allowance INT)
leave_requests   (id PK, user_id FK, type_id FK, start_date DATE, end_date DATE,
                  business_days INT, note TEXT, status CHECK (status IN ('pending','approved','denied','cancelled')),
                  manager_note TEXT, created_at TIMESTAMPTZ, decided_at TIMESTAMPTZ, decided_by FK users NULL)
holiday_cache    (year INT, country TEXT, payload JSONB, fetched_at TIMESTAMPTZ, PRIMARY KEY (year, country))
```
`business_days` is computed server-side at creation and stored, so history doesn't shift if holiday data changes.

### 3.4 API contract (v1) — `docs/openapi.yaml` is the source of truth
All responses JSON. Identity via `X-User-Id` header (seeded integer). Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "endDate": "must be on or after startDate" } } }`.

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | liveness | `{ ok: true }` |
| `GET /api/users` | list seeded users for the switcher | public |
| `GET /api/me` | current user + role + manager | needs header |
| `GET /api/leave-types` | allowances | |
| `GET /api/holidays?year=2026` | cached Nager.Date holidays | `[{ date, name }]` |
| `GET /api/business-days?start=&end=` | preview count for the form | pure calc, no write |
| `GET /api/balances` | per-type accrued/used/pending/remaining for current user | |
| `GET /api/leave-requests?status=` | current user's requests | |
| `POST /api/leave-requests` | create (status=pending) | body: `{ typeId, startDate, endDate, note }` |
| `POST /api/leave-requests/:id/cancel` | requester cancels a pending request | 403 otherwise |
| `GET /api/approvals` | manager's pending queue | 403 for employees |
| `POST /api/leave-requests/:id/decision` | `{ decision: 'approved'\|'denied', managerNote }` | deny requires note |

**Rule:** the contract is frozen at the end of Phase 0. Any change requires a PR that edits `openapi.yaml` first, is reviewed, and is merged before either side implements it.

---

## 4. Accessibility & Responsive Requirements (Definition of Done)

Every front-end PR must satisfy this list; the Reviewer agent checks it explicitly.

- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`; one `<h1>` per page; logical heading order.
- Every interactive element reachable and operable by keyboard; visible focus ring (never `outline: none` without a replacement).
- Skip link to `<main>` as the first focusable element.
- Forms: every input has a `<label for>`; errors linked via `aria-describedby`; `aria-invalid` on invalid fields; first invalid field receives focus on submit.
- Dynamic updates (business-day count, submit success, approval decisions) announced via a shared `<LiveRegion>` component (`aria-live="polite"`).
- Dialogs: focus trapped, `Esc` closes, focus returns to trigger, `role="dialog"` + `aria-labelledby`.
- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for UI components; status never conveyed by color alone (icon + text).
- Responsive: mobile-first; breakpoints 640 / 1024; no horizontal scroll at 320px; tables collapse to cards; tap targets ≥ 44px.
- `prefers-reduced-motion` respected.
- `jest-axe` test per page with zero violations; manual pass with NVDA (Windows) documented in `docs/ACCESSIBILITY.md`.

---

## 5. Documentation Deliverables
- `README.md` — what it is, screenshots (mobile + desktop), live URL, local setup in ≤ 6 commands, tech stack, link to docs.
- `docs/API.md` — every endpoint with example request/response.
- `docs/ACCESSIBILITY.md` — checklist above + how it was verified.
- `docs/CONTRIBUTING.md` — branching model, PR template, review checklist, how CI works. (This is the "workflow documentation" artifact the job explicitly values.)
- `docs/adr/` — at least three ADRs: no-auth decision, Express choice, holiday caching strategy.

---

## 6. Multi-Agent Build Plan (Claude Code)

### 6.1 Terminals: run exactly **3**

| Terminal | Agent | Working directory | Branch | Owns |
|---|---|---|---|---|
| **T1** | **Backend Agent** | `.claude/worktrees/backend/` (via `claude --worktree backend`) | `worktree-backend` → feature branches `backend/*` | `server/`, `docs/openapi.yaml` edits (proposals only), `docs/API.md`, server ADRs |
| **T2** | **Frontend Agent** | `.claude/worktrees/frontend/` (via `claude --worktree frontend`) | `worktree-frontend` → feature branches `frontend/*` | `client/`, `docs/ACCESSIBILITY.md`, front-end ADRs |
| **T3** | **Reviewer / Integrator Agent** | Main checkout (`leaveboard/`, plain `claude`) | `main` | Phase 0 scaffold, PR review, merging, CI, `README.md`, `CONTRIBUTING.md`, deployment |

Why three: two builders that can't collide (different directories, different worktrees) and one reviewer that owns `main` so nothing lands unreviewed. A fourth terminal adds coordination cost faster than it adds throughput at this project size. Do not open more.

**Hard rules for all agents**
1. Never edit `main` directly. Only T3 merges, and only via `gh pr merge` after review.
2. T1 never touches `client/`; T2 never touches `server/`. If you need something from the other side, open an issue (`gh issue create`) describing the contract change and stop.
3. One PR per task in the phase tables below. Small PRs, descriptive titles, a filled-in PR template.
4. Every PR must pass CI before review is requested.
5. Read `docs/DESIGN.md` and `CLAUDE.md` at the start of every session.
6. **No AI attribution anywhere.** No `Co-Authored-By: Claude`, no "Generated with Claude Code", no `Claude-Session:` trailers or session URLs in commits or PRs, and no code that reads as machine-generated. Full rules in 6.9. This is a merge blocker.

### 6.2 One-time setup (you, before opening the agents)
```bash
# 1. Create repo
mkdir leaveboard && cd leaveboard && git init -b main
gh repo create Andrue-Dettman/leaveboard --public --source=. --remote=origin
# 2. Copy this file in
mkdir -p docs && cp <path-to>/leaveboard_design_doc.md docs/DESIGN.md
# 3. Ignore worktrees; carry .env into worktrees
printf ".claude/worktrees/\nnode_modules/\n.env\n" > .gitignore
printf ".env\n" > .worktreeinclude
git add -A && git commit -m "docs: add design document" && git push -u origin main
# 4. Turn off Claude Code commit/PR attribution (project-level, committed so it applies in every worktree)
mkdir -p .claude
cat > .claude/settings.json <<'EOF'
{
  "attribution": { "commit": "", "pr": "" },
  "includeCoAuthoredBy": false
}
EOF
# 5. Belt-and-suspenders: a commit-msg hook that strips any attribution the agent adds anyway
mkdir -p .githooks
cat > .githooks/commit-msg <<'EOF'
#!/usr/bin/env bash
# Strip AI attribution trailers from commit messages.
sed -i -e '/^Co-Authored-By: Claude/Id' \
       -e '/Generated with \[Claude Code\]/d' \
       -e '/^Claude-Session:/d' \
       -e '/claude\.ai\/code\/session_/d' "$1"
EOF
chmod +x .githooks/commit-msg
git config core.hooksPath .githooks
# 6. Accept workspace trust once
claude   # then /exit
```
The `attribution` setting is the current one; `includeCoAuthoredBy` is the legacy name — set both. Users have reported the setting being bypassed in some versions, which is why the hook exists. `git config core.hooksPath` is per-clone and is shared by all worktrees of this repo.
Prereqs: Node 20+, `gh` CLI logged in, local Postgres (or a Neon connection string in `.env` as `DATABASE_URL`). Turn on branch protection for `main` (require PR + passing checks) in GitHub settings.

### 6.3 Skills: what each agent must load at session start

Skills live in `.claude/skills/<name>/SKILL.md` and are shared automatically across all worktrees of the repo. T3 creates the three project skills in Phase 0. At the start of **every** session, each agent runs the following check before touching code:

> "List the skills available in `.claude/skills/` and `~/.claude/skills/`. Load the ones assigned to your role below. If a global skill for frontend design, accessibility, React, Express, API design, or code review exists, load it too. If an assigned skill does not exist, say so and proceed with the guidance in `docs/DESIGN.md`."

| Agent | Required project skills (created in Phase 0) | Also load if present (global) |
|---|---|---|
| T1 Backend | `api-contract` (how to read/propose changes to `openapi.yaml`; error envelope; validation rules) | any `express`, `node-testing`, `postgres`, `openapi` skill |
| T2 Frontend | `a11y-first-react` (Section 4 as executable rules; how to run `jest-axe`; component conventions) | any `frontend-design`, `react`, `accessibility`, `css` skill |
| T3 Reviewer | `pr-review` (review checklist from 6.6; how to run CI locally; merge policy) | any `code-review`, `github`, `security-review` skill |

Each project skill is ~40–80 lines: the relevant rules from this document, plus the exact commands to run. Keep them short so they don't eat context.

### 6.4 Kickoff prompts (paste one per terminal)

**T3 — Reviewer / Integrator** (start this one first)
```
You are the Reviewer/Integrator agent for LeaveBoard. Read docs/DESIGN.md fully.
Load skills per DESIGN.md §6.3 (your role: T3). Your job in Phase 0 is to
scaffold the repo so two other agents can work in parallel without conflict.
Complete every Phase 0 task in DESIGN.md §6.5, commit directly to main (this is
the only phase where that is allowed), push, and then tell me the API contract
is frozen. After Phase 0 you never commit to main again: you review PRs with
`gh pr view / gh pr diff / gh pr checks`, leave comments with `gh pr review`,
request changes or approve using the checklist in §6.6, and merge approved PRs
with `gh pr merge --squash`. Poll for open PRs when I say "review". Enforce
the authorship rules in §6.9 on every PR and grep main for attribution
trailers at the end of every phase.
```

**T1 — Backend Agent** (start after T3 says the contract is frozen)
```
You are the Backend agent for LeaveBoard, running in an isolated worktree.
Read docs/DESIGN.md fully and CLAUDE.md. Load skills per DESIGN.md §6.3 (your
role: T1). You own server/ only. docs/openapi.yaml is the frozen contract —
implement it exactly; propose changes only via a separate contract PR. Work
through your Phase 1–3 tasks in §6.5 one PR at a time: create a branch
backend/<task>, implement with tests, run `npm test` and `npm run lint` in
server/, push, open a PR with `gh pr create` using the template, then start the
next task on a fresh branch off origin/main. Never touch client/. Follow
the authorship rules in §6.9: no AI attribution in commits, PRs, or code.
```

**T2 — Frontend Agent** (start alongside T1)
```
You are the Frontend agent for LeaveBoard, running in an isolated worktree.
Read docs/DESIGN.md fully and CLAUDE.md. Load skills per DESIGN.md §6.3 (your
role: T2). You own client/ only. Build against docs/openapi.yaml; until the
real API is merged, use the MSW mock handlers created in Phase 0. Section 4 is
your definition of done for every PR — a page is not finished until its
jest-axe test passes and keyboard navigation works. Work through Phase 1–3
tasks in §6.5 one PR at a time on branches frontend/<task>, run `npm test` and
`npm run lint` in client/, push, open a PR with `gh pr create`, then start the
next task on a fresh branch off origin/main. Never touch server/. Follow
the authorship rules in §6.9: no AI attribution in commits, PRs, or code.
```

### 6.5 Phases and task assignment

Each row is one PR. Tasks in the same phase run in parallel across T1 and T2; T3 reviews continuously. Do not start Phase N+1 tasks until all Phase N PRs are merged (T3 announces "Phase N closed").

#### Phase 0 — Scaffold & contract (T3 only, on `main`) — target: Sept 2–3
| # | Task | Deliverable |
|---|---|---|
| 0.1 | Monorepo skeleton | `client/` (Vite React), `server/` (Express hello world), root `package.json` workspaces, ESLint/Prettier, `.editorconfig` |
| 0.2 | Write `CLAUDE.md` | Hard rules from 6.1, commands to run tests/lint, "read DESIGN.md first", and the full authorship rules from 6.9 verbatim |
| 0.3 | Write `docs/openapi.yaml` + `docs/API.md` | Full contract from 3.4 with request/response schemas and examples |
| 0.4 | Create `.claude/skills/{api-contract,a11y-first-react,pr-review}/SKILL.md` | Per 6.3 |
| 0.5 | DB migrations + seed | SQL migrations from 3.3, `npm run db:migrate`, `npm run db:seed` (Maria/Sam/Priya, leave types) |
| 0.6 | MSW mock handlers in `client/src/mocks/` | One handler per endpoint returning contract-shaped fixtures so T2 is unblocked |
| 0.7 | CI workflow | Lint + test for both packages on every PR; required check on `main` |
| 0.8 | PR template + `CONTRIBUTING.md` v0 | `.github/pull_request_template.md` with checklist from 6.6 |
| 0.9 | Freeze | Tag `contract-v1`, announce to user |

#### Phase 1 — Core read paths — target: Sept 4–6
| # | Agent | Task (one PR each) |
|---|---|---|
| 1.1 | T1 | `GET /health`, `/users`, `/me`, `/leave-types` + `X-User-Id` middleware + error envelope + tests |
| 1.2 | T1 | `services/holidays.js`: fetch Nager.Date, cache in `holiday_cache`, `GET /api/holidays`; unit tests with mocked fetch |
| 1.3 | T1 | `services/businessDays.js` + `GET /api/business-days`; exhaustive unit tests (weekend edges, holiday inside range, single day) |
| 1.4 | T2 | Design tokens + base styles (`tokens.css`, `base.css`), app shell with landmarks, skip link, responsive nav, user switcher; axe test |
| 1.5 | T2 | Shared components: `Field`, `LiveRegion`, `Dialog` (focus trap), `DataTable` with card fallback < 640px; RTL + axe tests for each |
| 1.6 | T2 | Dashboard page against mocks: balance cards, upcoming list, holidays panel |

#### Phase 2 — Write paths & forms — target: Sept 7–9
| # | Agent | Task |
|---|---|---|
| 2.1 | T1 | `GET /balances` (allowance − approved, plus pending) + tests |
| 2.2 | T1 | `GET/POST /leave-requests` with Zod validation, business-day computation on create, 400/403 paths, tests |
| 2.3 | T1 | `POST /leave-requests/:id/cancel` + `docs/adr/0001-no-auth.md`, `0003-holiday-caching.md` |
| 2.4 | T2 | New request form: live business-day readout (debounced call to `/business-days`), warnings, error handling per Section 4, focus management; axe test |
| 2.5 | T2 | Requests list page: filter, sort, cancel with `Dialog`; live-region confirmations |
| 2.6 | T2 | Switch `client/src/api/` from MSW to real API behind `VITE_API_URL`; keep MSW for tests only |

#### Phase 3 — Manager flow & hardening — target: Sept 10–12
| # | Agent | Task |
|---|---|---|
| 3.1 | T1 | `GET /approvals`, `POST /:id/decision` with manager-of-requester check, deny-requires-note; tests |
| 3.2 | T1 | Rate-limit + Helmet + CORS config for production; `docs/adr/0002-express-over-fastapi.md`; finalize `docs/API.md` |
| 3.3 | T2 | Approvals page: queue, approve/deny dialog, optimistic update, live-region announcements; role-gated route |
| 3.4 | T2 | Manual NVDA pass on every page; fix findings; write `docs/ACCESSIBILITY.md`; `prefers-reduced-motion` |
| 3.5 | T2 | Responsive QA at 320/640/1024/1440; screenshots for README |

#### Phase 4 — Ship (T3, with you) — target: Sept 13–14
| # | Task |
|---|---|
| 4.1 | Deploy DB to Neon, API to Render, client to Vercel; set env vars; smoke-test live URL |
| 4.2 | Finalize `README.md` (live link, screenshots, setup) and `CONTRIBUTING.md` (clean human version of this section) |
| 4.3 | Tag `v1.0.0`; T3 produces a "what would I explain in an interview" summary of the architecture for you to study |

Buffer: Sept 15–17. Submit application no later than Sept 16.

### 6.6 PR review checklist (T3 applies to every PR)

**All PRs**
- [ ] CI green; no skipped tests
- [ ] Scope matches exactly one task from 6.5; nothing outside the owning directory
- [ ] Contract respected: request/response shapes match `openapi.yaml` (diff the schema if in doubt)
- [ ] Tests cover the happy path and at least the error paths named in the task
- [ ] No secrets, no `console.log` left behind, no TODOs without an issue link
- [ ] PR description explains *why*, not just what
- [ ] **Authorship (6.9):** run `gh pr view --json commits` and `git log --format=%B origin/main..HEAD` — zero `Co-Authored-By`, "Generated with", `Claude-Session`, or session-URL lines. PR title/body contain no AI mention. Code passes the "reads human-written" checks in 6.9. If any fail, request changes; if a trailer slipped into history, the owning agent rewrites the branch (`git rebase -i`, or `git commit --amend`) and force-pushes before re-review.

**Server PRs (T1)**
- [ ] Input validated with Zod before touching the DB; error envelope format correct
- [ ] Parameterized queries only
- [ ] Authorization checks (requester-only cancel, manager-only decision) tested for the 403 case

**Client PRs (T2)** — Section 4 in full, plus:
- [ ] `jest-axe` test exists for any new page and passes
- [ ] Reviewer tabs through the feature mentally from the DOM: is focus order sensible? Is focus managed after async actions?
- [ ] Layout verified conceptually at 320px (no fixed widths, tables collapse)
- [ ] No inline styles for layout; tokens used for color/spacing

**Verdicts:** `approve` → merge with `gh pr merge --squash --delete-branch`. `request changes` → comment with the specific checklist items failed and the fix; the owning agent addresses on the same branch.

### 6.7 Coordination protocol (how you run the day)
1. Morning: T3 "review any open PRs, then report phase status." Merge what's ready.
2. Tell T1 and T2 "sync with origin/main and start your next task." (Each new branch starts from fresh `origin/main` so they pick up the other side's merged work.)
3. If T1 or T2 opens a contract-change issue, you decide; if approved, T3 makes the `openapi.yaml` PR and merges it before the dependent work continues.
4. Evening: T3 "close Phase N if all tasks merged; list what's left."
5. When a worktree session ends and Claude asks whether to keep the worktree: **keep** (you'll reopen it by name with `claude --worktree backend` next session).

### 6.8 Your job (the human) — do not skip
Agents write the code; the interview will test whether *you* understand it. Budget ~1 hour/day for this:
- Read every merged PR diff. If you can't explain a file, ask T3 "explain `server/src/services/businessDays.js` line by line."
- Run the app locally yourself at the end of each phase and use it with keyboard only.
- Run NVDA once yourself (Phase 3.4) — this is a thing you can talk about in an interview.
- Write the ADRs' "Consequences" sections in your own words after the agents draft them.
- Be able to answer: Why Express over FastAPI? Why no auth? How are business days computed? What does `aria-live` do and where do you use it? How does the PR workflow protect `main`?

### 6.9 Authorship & attribution rules (all agents, every commit, every PR)

This repository is a portfolio piece that will be read by a hiring team. Everything in it must read as the work of one human developer. These rules are non-negotiable and are copied verbatim into `CLAUDE.md`.

**Commits and PRs**
- Never add `Co-Authored-By: Claude …`, `🤖 Generated with [Claude Code]`, `Claude-Session: …`, or any `claude.ai/code/session_…` URL to a commit message, PR title, or PR body. If you notice your tooling is about to append one, write the commit message explicitly with `git commit -m "<message>"` and nothing else.
- Commit messages: conventional-commit style, imperative mood, first person implied, no emoji. `feat(server): add business-day calculation` — not `✨ Add business day calc 🤖`.
- PR bodies are written in the developer's voice ("I chose X because…"), never "Claude implemented…" or "This AI-generated PR…".
- Do not add yourself as a GitHub reviewer, assignee, or contributor by any name.

**Code and comments**
- No banner comments like `// Generated by …`, `// AI-assisted`, `// TODO: human review`, or references to prompts, agents, models, or sessions anywhere in source, tests, configs, or docs.
- Comment only what a careful human would comment: non-obvious decisions and tricky logic. Do not narrate obvious code (`// increment counter`), do not add a docblock to every trivial function, do not restate the type signature in prose.
- No emoji in code, comments, logs, README headings, or test names.
- Match the file's existing style exactly; don't introduce a second convention. Prefer plain, idiomatic code over clever abstractions a student would not write.
- Test names describe behavior (`rejects end date before start date`), not implementation, and never mention what "the model" or "the agent" did.
- Documentation (README, ADRs, API docs) is written in first person singular where a voice is needed and never mentions AI tooling, agents, or how the code was produced.

**Reviewer enforcement (T3)**
- Any violation is a "request changes" with the offending line quoted.
- Before merging, T3 runs `git log --format=%B origin/main..HEAD` on the PR branch and greps for `Co-Authored-By`, `Generated with`, `Claude`, `session_`. Any hit blocks the merge until the branch is rewritten.
- After each phase closes, T3 runs the same grep against all of `main` (`git log --format=%B | grep -iE "co-authored-by: claude|generated with|claude-session|session_"`) and reports the result to the user. It must be empty.

---

## 7. Risks & fallbacks
| Risk | Mitigation |
|---|---|
| Express learning curve eats time | Fallback to FastAPI is pre-approved (3.1); contract is language-agnostic |
| Free hosting cold starts make demo look slow | Note it in README; ping the API from the client on load |
| Nager.Date down | Server caches; seed a 2026 holiday fixture as last-resort fallback |
| Merge conflicts | Directory ownership + fresh-from-main branches make them rare; T3 resolves, never T1/T2 |
| Scope creep | Section 1.2. Anything new goes in `docs/BACKLOG.md`, not the code |
| Running out of time | Phase 3.5 and ADR polish are the first to cut; Phase 4 deploy is not cuttable — a live URL is the whole point |
