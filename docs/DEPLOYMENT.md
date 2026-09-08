# Deploying LeaveBoard

Three free tiers: the database on [Neon](https://neon.tech), the API on
[Render](https://render.com), the client on [Vercel](https://vercel.com). Both services
deploy from `main`, so a merge is a release.

The configuration is in the repository — `render.yaml` for the API, `vercel.json` for the
client — so what is left is creating the three accounts and pasting four values between
them. This file is the order to do that in, and the reasoning where the order matters.

## Decide the two URLs first

The API and the client each need to know the other's origin, which looks circular until you
notice both URLs are decided by names you choose rather than assigned at random:

- Render serves a web service named `leaveboard-api` at `https://leaveboard-api.onrender.com`.
- Vercel serves a project named `leaveboard` at `https://leaveboard.vercel.app`.

Pick both names before deploying either side and every value below is already known. If a
name is taken, adjust and use the real URL everywhere it appears here.

## 1. Database

Create a Neon project and copy the pooled connection string. Then apply the schema and the
seed from your own machine — the API image has no migration step, deliberately, so that a
restart can never rewrite the database.

```
DATABASE_URL='postgres://...neon.tech/leaveboard?sslmode=require' DATABASE_SSL=true npm run db:migrate
DATABASE_URL='postgres://...neon.tech/leaveboard?sslmode=require' DATABASE_SSL=true npm run db:seed
```

In PowerShell, set the two variables first (`$env:DATABASE_URL = '...'`) and then run the
scripts, since it has no inline environment prefix.

**`db:seed` truncates `leave_requests`, `users` and `leave_types` before inserting.** It is
meant to be repeatable, which is the same thing as saying it will throw away anything anyone
has entered through the deployed app. Run it once at setup, and after that only when you
actually want the demo data back.

## 2. API

Render will find `render.yaml` and offer the blueprint. Everything is set there except two
values it deliberately does not carry, because one is a secret and the other is a URL:

| Variable        | Value                                  |
| --------------- | -------------------------------------- |
| `DATABASE_URL`  | the Neon connection string from step 1 |
| `CLIENT_ORIGIN` | `https://leaveboard.vercel.app`        |

`CLIENT_ORIGIN` is required. In production the server refuses to start without it rather
than falling back to answering every origin, so a missing value shows up as a service that
will not boot instead of an API anyone can drive.

Check it came up:

```
curl https://leaveboard-api.onrender.com/api/health
```

## 3. Client

Import the repository into Vercel as a project named `leaveboard`, leave the root directory
as the repository root, and set one environment variable:

| Variable       | Value                                 |
| -------------- | ------------------------------------- |
| `VITE_API_URL` | `https://leaveboard-api.onrender.com` |

Vite inlines that at build time, not at runtime, so changing it later needs a redeploy, not
a restart.

`vercel.json` rewrites every path to `index.html`. Without it, React Router's routes work
when you navigate to them and 404 when someone reloads on `/requests` or opens a link to it,
which is the failure people only find after shipping.

## 4. Connect the two

Add the Vercel URL to `CLIENT_ORIGIN` on Render if you have not already, and redeploy the
service so it picks the value up.

`CLIENT_ORIGIN` takes a comma-separated list, which matters if you want Vercel's preview
deployments to work: each preview gets its own generated hostname, and a hostname that is not
on the list is refused by CORS. Either add the ones you care about or accept that previews
talk to nothing.

## 5. Smoke test the deployment

Against the live URLs, not localhost:

```
curl https://leaveboard-api.onrender.com/api/health
curl https://leaveboard-api.onrender.com/api/users
curl -H 'X-User-Id: 2' https://leaveboard-api.onrender.com/api/balances
curl 'https://leaveboard-api.onrender.com/api/business-days?start=2026-11-23&end=2026-11-27'
```

The last one should answer 4 business days and name Thanksgiving, which means the holiday
service reached Nager.Date and cached the year in Postgres.

Then in the browser: load the dashboard, switch identity to Sam, submit a request, switch to
Maria, approve it, and confirm Sam's balance moved. That exercises both roles, both write
paths and the live regions in one pass.

## The free tier

Render idles a free service after fifteen minutes without traffic, and the next request pays
about thirty seconds of cold start while the process boots and reconnects to Postgres. The
first page load after a quiet period looks broken but is not. It is the honest cost of not
paying for a demo, and it is worth saying out loud in an interview rather than hoping nobody
clicks at the wrong moment.
