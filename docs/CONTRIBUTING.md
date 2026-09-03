# Contributing to LeaveBoard

This describes how work actually moves through this repository: how a change goes from an
idea to something merged into `main`. I wrote it down first and then followed it, because
a workflow that only exists in someone's head is not a workflow.

## The short version

1. Branch from an up-to-date `origin/main`.
2. Make one focused change.
3. Run lint, format, and tests locally until they pass.
4. Open a pull request using the template.
5. CI runs. It must be green before review.
6. Review against the checklist. Changes requested, or approved.
7. Squash merge into `main`. Delete the branch.

`main` is protected. It takes a pull request and a passing CI run — there is no path that
skips either, including for me.

## Getting set up

Prerequisites: Node 20 or newer, Docker (for the local database), and the `gh` CLI if you
want to open pull requests from the terminal.

```
git clone https://github.com/Andrue-Dettman/leaveboard.git
cd leaveboard
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
docker compose up -d db
npm run db:migrate && npm run db:seed
```

Then run the two dev servers in separate terminals:

```
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

The client can also run with no API at all. `VITE_USE_MOCKS=true` in `client/.env` serves
every endpoint from the MSW handlers in `client/src/mocks/`, which is how the front end was
built before the API existed.

## Branching

One branch per task, named for the area it touches:

```
backend/holiday-cache
frontend/request-form
docs/adr-no-auth
```

Always branch from a freshly fetched `origin/main`:

```
git fetch origin
git switch -c backend/holiday-cache origin/main
```

Long-lived branches are the main source of merge pain, so branches here live hours, not
days. If a branch cannot be finished in one sitting, the task was too big and should have
been split.

## Commits

Conventional commits, imperative mood, no emoji:

```
feat(server): add business-day calculation
fix(client): return focus to the trigger when the dialog closes
docs: record the decision to skip authentication
test(server): cover the 403 path on cancellation
```

The scope is the workspace or area (`server`, `client`, `docs`, `ci`). The subject says
what the commit does, not what I did. Commit messages end up as the permanent record of
why the code looks the way it does, so they get the same care as the code.

## Pull requests

The template asks for three things: what changed, **why**, and how it was verified. The
"why" is the part that matters. A diff already says what changed; it cannot say what else
was considered and rejected.

Rules for a reviewable pull request:

- **One task per PR.** A PR that also fixes something unrelated nearby gets changes
  requested. Mixing them makes both harder to review and impossible to revert cleanly.
- **Small.** If the diff is hard to hold in your head, split it.
- **Green before review.** Asking for review on a red build wastes the reviewer's time.
- **The contract is not edited in a feature PR.** `docs/openapi.yaml` is frozen at
  `contract-v1`. Changing it takes its own pull request, reviewed and merged first, because
  the client and server are built against it in parallel.

## Review

Every pull request is reviewed against the checklist in the template before it merges.
Reviews name the specific item that failed and say what to do instead — "please fix the
accessibility" is not a review, "the date input has a placeholder but no `<label for>`, so
a screen reader announces it as an unlabelled text field" is.

Two categories of finding block a merge outright:

- **Accessibility.** Section 4 of [`DESIGN.md`](./DESIGN.md) is the definition of done for
  front-end work, not a wish list. A page without a passing `jest-axe` test is not finished.
- **Injection and authorization.** Any SQL built by string concatenation, and any endpoint
  that trusts a client-supplied id to imply permission, is a block regardless of how clean
  the rest of the change is.

Approved pull requests are squash merged, so `main` reads as one commit per task, and the
branch is deleted.

### Review at phase boundaries

Work is grouped into numbered phases, and every pull request is reviewed on its own. But
reviewing one change only ever asks whether that change is correct by itself, so at the end
of each phase the whole phase gets reviewed again as a single diff:

```
git diff phase-1...origin/main
```

That second pass is looking for the things no individual diff can show: two endpoints that
each look fine but validate the same input differently, a helper written in one task and
duplicated in the next instead of imported, error handling that is consistent within each
route and inconsistent across the set, a seam between two changes that neither one's tests
cover.

Findings become their own tasks on their own branches, reviewed like anything else. Fixing
them directly on `main` would defeat the point of protecting it.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Step         | Command                      |
| ------------ | ---------------------------- |
| Lint         | `npm run lint`               |
| Formatting   | `npm run format:check`       |
| API contract | `npx @redocly/cli lint`      |
| Tests        | `npm test` (both workspaces) |

Run all four locally before pushing. CI is there to catch what you forgot, not to be your
first test run.

## Architecture decisions

Decisions with consequences get an ADR in [`docs/adr/`](./adr/) — the context, the decision,
and what it costs. The point is not ceremony; it is that six months later the reasoning is
still there instead of being reconstructed from the code.

Write one when a choice closes off an alternative someone would reasonably expect: skipping
authentication, caching holidays instead of fetching per request, choosing Express over the
framework I already knew.

## Scope

[`DESIGN.md`](./DESIGN.md) section 1.2 lists what this project deliberately does not do.
Anything new goes in `docs/BACKLOG.md`, not into the code. On a project with a deadline,
scope discipline is a feature.
