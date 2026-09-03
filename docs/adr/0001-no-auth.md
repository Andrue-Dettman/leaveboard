# 0001. Ship without authentication, using a seeded user switcher

Status: Accepted
Date: 2026-09-02

## Context

LeaveBoard is a portfolio project with a hard deadline and about two weeks of evenings to
build it in. It has to demonstrate a real workflow: an employee submits leave, a manager
approves or denies it, and the two see different things.

That requires knowing who is asking. The obvious answer is authentication, and the obvious
implementation is a login form, a session or token, password hashing, and a route guard.

Two things argued against it. The first is time. Authentication done properly is not a
morning's work — it is password storage, session lifetime, logout, the reset flow nobody
budgets for, and a set of security decisions I would not want to defend casually in an
interview. Every hour spent there is an hour not spent on the leave workflow, the
accessibility work, or the tests, which are the things this project is meant to show.

The second is honesty. Any authentication I wrote here would be a toy: no real user
directory, no password policy, no MFA, no account recovery. A toy login screen looks like a
feature but proves nothing, and it invites the reviewer to evaluate it as though it were
real.

The alternatives I considered:

- **A real login with hashed passwords and sessions.** Most realistic, most time, and the
  part a reviewer would scrutinise hardest is the part I would have done most cheaply.
- **A third-party identity provider.** Removes the security burden but adds configuration,
  a dependency, and a signup step between the reviewer and the running app. On free
  hosting with cold starts, anything between the link and the working demo is a cost.
- **No authentication, with an explicit identity switcher.** Keeps the whole leave workflow,
  including the parts that depend on role, and is transparently not a security feature.

## Decision

There is no authentication. Identity is a seeded user id sent in an `X-User-Id` header on
every request, and the header is what the API resolves to a user row.

The client provides an "Acting as" control in the header that switches between the three
seeded people: Maria, who manages Sam and Priya. Switching identity is one interaction, so
anyone reviewing the project can see the manager view and the employee view without an
account.

The scope cut is stated in the README, in `docs/API.md`, and in the OpenAPI description,
so nobody has to infer it from the absence of a login screen.

## Consequences

**The whole authorisation layer still exists and is still tested.** Only the requester can
cancel their own pending request; only the requester's manager can decide it; only a
manager can load the approvals queue. Those rules are enforced server-side and each has a
test asserting the 403. Authentication is missing; authorisation is not. That distinction
is the thing worth being able to explain.

**Anyone can act as anyone.** Sending `X-User-Id: 1` makes you Maria. This is trivially
forgeable, and it must never be presented as a security boundary. The application is a
demonstration with seeded sample data and no real personal information, which is what makes
that acceptable here and nowhere else.

**Adding real authentication later is a contained change.** Every route already reads the
current user from one piece of middleware rather than from the request directly. Replacing
that middleware with one that validates a session or a token would leave the route handlers
and the authorisation checks untouched. That was a deliberate shape, not luck.

**The demo is faster to evaluate.** No signup, no credentials to share in a README, no
seeded password to rotate. Someone opening the live link is looking at the dashboard
immediately, which matters when the reviewer has a stack of portfolios to get through.

**I lose the chance to demonstrate authentication.** That is a real cost and I would rather
name it than pretend the tradeoff was free. If asked, the honest answer is that I chose
depth on the workflow and accessibility over breadth, and that I would want to write
authentication against a real requirement rather than as a portfolio gesture.
