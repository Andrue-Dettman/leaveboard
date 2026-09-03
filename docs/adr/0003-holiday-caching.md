# 0003. Cache public holidays per year in the database, and degrade in layers

Status: Accepted
Date: 2026-09-02

## Context

Business days are weekdays minus public holidays, so almost every meaningful operation in
this application needs the holiday list: the live counter on the request form, the stored
day count when a request is created, and the dashboard panel.

The holidays come from Nager.Date, a free public API with no uptime commitment and no
support contract. Two problems follow from that.

The first is volume. The request form recalculates as the user picks dates. Calling a
third-party service on every keystroke is rude to them and slow for the user, and it makes
the form's responsiveness depend on somebody else's server.

The second is availability. A free service will eventually be slow, rate-limited, or down.
When that happens the dashboard must still render and the form must still count days,
because a leave tracker that breaks when an unrelated holiday API has a bad afternoon is not
a working leave tracker.

Options I considered:

- **Fetch on every request.** Simplest, and wrong on both counts.
- **In-memory cache.** Fixes volume, not availability, and evaporates on every restart —
  which on free hosting with cold starts means most requests.
- **Hard-code the holidays.** Always available, but wrong the moment the year changes, and
  it throws away the "consumes a public JSON API" requirement the project exists to show.
- **Cache in the database, with fallbacks.** More moving parts, but survives restarts and
  outages.

## Decision

Holidays are cached per year in a `holiday_cache` table keyed on `(year, country)`, holding
the normalized list as `jsonb` with a `fetched_at` timestamp and a 24-hour TTL.

The upstream call is given a five-second timeout. Failure is layered:

1. A cache row under 24 hours old is served without touching the network.
2. A stale row is refreshed from upstream, but served anyway if the refresh fails.
3. With nothing cached and upstream unreachable, a checked-in set is served for any year
   the project ships one for. 2026 is checked in.
4. Only a year with no cache row, no reachable upstream, and no checked-in set returns
   `502 UPSTREAM_ERROR`.

The feed is normalized before it is stored: entries are kept only where `global` is true,
deduplicated by date, mapped to `{ date, name }`, and sorted. The 2026 US response has 17
entries but only 11 nationwide holidays; the rest are state-level observances, and some
dates repeat with different county lists.

`business_days` is computed once when a request is created and stored on the row.

## Consequences

**The form is fast and the provider is left alone.** After the first request of the day, the
holiday lookup is a single indexed read. The live counter responds at local-database speed
rather than at the speed of a free third-party service.

**A holiday nobody observes cannot take a day of somebody's leave.** The normalization is
the part that actually protects the user. Without the `global` filter, an employee in a
state that does not observe Lincoln's Birthday would silently lose a day; without the
deduplication, a repeated date would be excluded twice. This is the least visible code in
the project and the most consequential to get right.

**Stale holidays beat no holidays.** Serving a cache entry past its TTL during an outage
means the count can, in principle, be computed from data that has since changed upstream.
Public holidays for the current year effectively do not change, so the risk is close to
theoretical, and it is plainly better than a dashboard that will not render.

**The fallback is deliberately not written to the cache.** Caching it would mark it fresh for
24 hours and hide the outage, so the next request would not retry. Serving it without storing
it means the system recovers on its own the moment upstream returns.

**Stored day counts do not move.** Because `business_days` is written at creation, a request
approved in March still says what it cost in March, even if the holiday data is later
corrected. The alternative — recomputing on read — would quietly rewrite history and make
balances disagree with what people were told when they asked.

**There is a real cost: two sources of truth for the same list.** The client's MSW fixtures
carry a copy of the 2026 holidays so the front end can run with no API at all, and the server
carries the fallback copy. They agree today and I have verified that they do, but nothing
enforces it. A drift between them would show up as the mocked app and the real app
disagreeing about a day count, which is exactly the kind of bug that survives a green test
suite.
