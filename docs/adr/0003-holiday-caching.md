# 0003. Cache public holidays per year in the database, and degrade in stages

Status: Accepted
Date: 2026-09-03

## Context

Business days are weekdays minus public holidays, so almost every interesting number in the
product depends on a holiday list: the live count on the request form, the days stored
against a request, and the balance that follows from them. The list comes from Nager.Date,
a free public API with no uptime commitment and no support contract.

Three properties made the naive approach unattractive. The data barely changes — a year's
holidays are fixed well in advance. The form calls the count endpoint on every keystroke in
a date field, so an uncached implementation would issue an upstream request per keystroke.
And the deployment is on a free tier that sleeps, so the first request after a cold start
would pay the upstream latency in front of the user.

The alternatives:

- **Call upstream every time.** Simplest, and wrong on all three counts above.
- **Cache in memory.** Fast and easy, but lost on every restart, and a free-tier service
  restarts constantly. It also would not be shared if the API ever ran more than one
  instance.
- **Check the holiday list into the repository and never call the API at all.** Reliable
  and completely offline, but the design brief asks for the project to consume a third-party
  JSON API, and hard-coding the answer would dodge that.

## Decision

Holidays are fetched from Nager.Date and cached per year in the `holiday_cache` table, keyed
by `(year, country)`, with a 24-hour freshness window.

A read degrades in stages rather than succeeding or failing outright:

1. A cached row less than 24 hours old is served with no network call.
2. An older row triggers a refresh. On success the row is rewritten and the fresh list
   returned.
3. If that refresh fails, the stale row is served anyway.
4. If there is no row at all and upstream is unreachable, a checked-in list for 2026 is
   served.
5. Only if none of the above apply does the request fail, as `502 UPSTREAM_ERROR`.

The fetch carries a five-second timeout, because a provider that accepts the connection and
then stalls would otherwise hold the request open far longer than any of this is worth.

The raw feed is normalised before it is stored: only nationwide entries are kept, repeated
dates are collapsed, and the result is sorted. The 2026 US response has 17 entries for 11
actual holidays, and the extras are state-level observances. Keeping one would take a day of
leave from someone whose office does not close.

The checked-in fallback is deliberately not written to the cache. Storing it would mark it
fresh for a day and hide the outage that produced it.

## Consequences

The demo cannot be broken by a third party being down, which is the property I actually
wanted. It also cannot be broken by being offline, which makes the project runnable on a
plane or behind a corporate proxy.

Stale data can be served, and the API does not say when that is happening. For public
holidays a day-old answer is indistinguishable from a fresh one, so this costs nothing in
practice — but the same pattern applied to data that moves would be a bug rather than a
feature, and the reason it is safe here is that the underlying data is effectively static.

The fallback covers 2026 only. A request for 2027 with a cold cache and a dead upstream
returns 502 rather than a wrong answer, which I prefer to inventing holidays. It does mean
the safety net has an expiry date, and a second year will need adding if this outlives 2026.

Storing the count on each leave request compounds the benefit: even if the holiday data
changes later, requests already submitted keep the number they were created with, so history
does not shift under a manager who already approved something.

The cost is a table, an upsert, and a branch of logic per read that has to be tested with a
mocked `fetch` — five of the holiday tests exist only to cover the degradation stages. That
is more code than calling the API directly, and it is the right trade for something every
other calculation depends on.
