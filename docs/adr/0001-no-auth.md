# 0001. Ship no authentication; switch identity with a seeded user picker

Status: Accepted
Date: 2026-09-02

## Context

LeaveBoard needs to know who is asking. Every interesting rule in the product depends on
it: only the person who made a request may cancel it, only their manager may decide it, and
the balance you see is your own.

The obvious way to get that is real authentication. Even the cheap version is not cheap:
password storage and reset, session or token handling, a login screen with its own
accessibility work, CSRF protection on every write, and a seeded-account story for anyone
who wants to try the deployed app without registering. That is several days of work.

I have two weeks and a fixed deadline, and the job posting I am building this against asks
for HTML, CSS, JavaScript, React, SQL, accessibility, and documented workflow. It does not
ask for authentication. Days spent on a login form are days not spent on the leave workflow,
the keyboard and screen reader work, or the API design — the parts anyone reading this
repository is actually going to look at.

I also would not have written the interesting part myself. In a real job I would reach for
an identity provider rather than hand-roll password hashing, so a hand-rolled version here
would demonstrate something I would not do in production anyway.

The alternatives I considered:

- **A real login.** Correct, and the reason to reject it is scope, not principle.
- **An identity provider such as Auth0 or Clerk.** Removes the security risk but adds a
  signup wall in front of a portfolio demo, plus configuration that stops working the moment
  a free tier changes.
- **HTTP basic auth in front of everything.** Cheap, but it gives one shared identity, which
  is exactly the thing the product needs to distinguish.

## Decision

There is no authentication. The client sends `X-User-Id` with a seeded integer, and a header
switcher lets you become Maria, Sam, or Priya at will. Middleware resolves the header to a
user row and every authorisation rule is enforced against that row, server-side.

The rules themselves are real. Cancelling someone else's request is a 403, and the check is
in the SQL `UPDATE`, not only in a prior read. What is missing is proof that you are who the
header says — not the enforcement that follows from it.

## Consequences

The application is completely open. Anyone who can reach the API can act as any seeded user
by changing one header. This is safe only because the data is fictional and the deployment
is a demo; it would be a critical vulnerability in anything real.

Because the authorisation logic is separate from the authentication that is missing, adding
real auth later is a contained change: replace the middleware that populates `req.user` and
every existing rule keeps working unmodified. Nothing downstream reads the header directly.

The demo is better for it. A reviewer can switch from employee to manager in one click and
see both sides of the approval flow without registering two accounts or knowing a password.
Being able to show that in an interview is worth more than a login form would be.

The honesty cost is that I cannot claim authentication experience from this project, and I
should not try to. This file exists partly so that the omission reads as a decision rather
than something I did not know I needed.
