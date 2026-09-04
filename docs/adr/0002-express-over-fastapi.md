# 0002. Build the API on Express rather than FastAPI

Status: Accepted
Date: 2026-09-02

## Context

The API needed a framework. Two were genuinely on the table.

FastAPI is the one I already knew. I would have been productive in it on day one, and its
request validation and generated OpenAPI documentation would have covered work I ended up
doing by hand.

Express is the one that matched the job. The posting asks for JavaScript proficiency and a
modern JavaScript framework, and the front end is React. Choosing Express makes the whole
repository one language, so the same person reviewing the client can read the server
without switching context.

The deciding question was not which framework is better. It was which choice produces a
repository that answers the question a reviewer is actually asking, which is whether I can
write JavaScript across a whole application rather than only in a component.

I also weighed the risk. `docs/DESIGN.md` records FastAPI as a pre-approved fallback if
Express turned into a time sink, with the API contract written to be language-agnostic
precisely so that switching would not invalidate the front end's work. That made Express
the cheap experiment rather than the irreversible bet.

## Decision

The API is Express 4 on Node 20, with `pg` for database access and Zod for validation.

Express 4 rather than 5: at the time of writing, 4 is what the ecosystem, the documentation,
and the answers to the problems I would hit are written against.

Zod is doing the job FastAPI would have done for free through Pydantic. Every route parses
its input at the edge through a shared `parseOrThrow` helper that turns Zod issues into the
contract's `fields` map, so a validation message reaches the right form input.

## Consequences

**One language across the repository.** No context switch between client and server, no
second toolchain, no second set of lint and formatting rules. `npm test` at the root runs
both suites. For a solo project on a deadline this compounds more than I expected.

**I wrote validation and documentation by hand.** FastAPI generates its OpenAPI schema from
the code; here `docs/openapi.yaml` is authored separately and can drift from what the server
actually does. I mitigated that by freezing the contract before implementation, validating it
in CI with `@redocly/cli`, and treating any change to it as its own reviewed pull request.
It is a real cost: the drift is prevented by discipline rather than by the compiler.

**Express does not forward a rejected promise to the error handler.** Every asynchronous
route is wrapped in a small `asyncHandler` so rejections reach the error middleware instead
of hanging the request. FastAPI would not have needed it. It is five lines and it is now the
only way routes are written, but it is the sort of framework sharp edge worth knowing about
before choosing.

**Nothing is generated, so nothing is hidden.** Every error response goes through one
`ApiError` class that derives its status from its code. Every query is parameterised by
hand. I can explain any line of the request path, which is worth more in an interview than a
framework doing it correctly on my behalf.

**The fallback was never needed.** Express cost more setup than FastAPI would have, and the
cost stayed in Phase 1 rather than compounding. Recording that here so the pre-approved
escape hatch does not read, later, like a decision that was actually taken.
