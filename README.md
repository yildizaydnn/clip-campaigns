# Clip Campaigns

A cut-down clipping marketplace: brands post paid campaigns, creators submit
short-form clips, admins review them, and creators earn per 1,000 views up to
the campaign budget.

**[NOTES.md](./NOTES.md)** covers the decisions behind the code — start there if
you want the reasoning rather than the setup.

---

## Setup

### Requirements

- **Node 20+** (developed on 20.19)
- **pnpm** (`corepack enable` if you don't have it)
- **Docker** running — Postgres comes from `docker-compose.yml`

### Steps

```bash
pnpm install
cp .env.example .env          # values work as-is for local development
pnpm db:up                    # starts Postgres, waits until it is healthy
pnpm db:migrate               # applies the committed drizzle migrations
pnpm db:seed                  # demo users, campaigns and submissions
pnpm dev                      # http://localhost:3000
```

That is the whole setup. The database container binds to host port **5433**, not
5432, so a Postgres you already run locally won't conflict.

### Running the tests

```bash
pnpm test
```

Tests need the database up (`pnpm db:up`) and nothing else — they run against a
separate `clip_campaigns_test` database that the container creates on first
boot, apply the migrations themselves, and truncate between cases. They never
touch your development data.

### Other commands

| Command | What it does |
|---|---|
| `pnpm ingest` | Runs the daily metric sync (see below) |
| `pnpm db:studio` | Opens Drizzle Studio to browse the database |
| `pnpm db:reset` | Wipes the container and re-runs migrate + seed |
| `pnpm db:generate` | Regenerates migrations after a schema change |

---

## Signing in

There is no login. A **user switcher** sits at the bottom of the sidebar — pick
who you want to be. It writes a signed cookie; every procedure on the server
still enforces role and ownership against it. This is deliberate: the brief
asks to keep auth cheap, so the effort went into authorization instead.

The seed creates one admin and three creators:

| Email | Role |
|---|---|
| `admin@example.com` | admin |
| `creator1@example.com` … `creator3@example.com` | creator |

---

## A five-minute tour

Sign in as **admin@example.com**.

**1 · The budget ceiling.** Open **Budget Ceiling Demo**. Its review queue holds
one clip worth **$500.00** against a **$1.00** budget. Approve it — the approval
is refused with the exact numbers, the clip stays pending, and nothing is
spent.

**2 · Automatic completion.** Open **Auto-Complete Demo** and approve its clip.
The earnings come to exactly the remaining budget, so the campaign flips itself
to `completed` in the same transaction and stops accepting approvals.

**3 · Rejection.** In any campaign's queue, hit Reject. The dialog won't submit
without a reason — the creator sees that reason on their side.

**4 · The chart.** Open **Retro Launch (completed)**. The daily views chart
spans the entire campaign period; days without a metric sync are explicit
zeros, filled in by the database rather than the client.

Switch to **creator1@example.com** — you land on the creator side automatically,
since the admin pages aren't yours any more.

**5 · Submitting.** Open a campaign and submit a clip:
`https://www.tiktok.com/@you/video/7412345678901234567`. Submit the same URL
again and it's refused; submit `https://example.com/nope` and the URL field
rejects it before the request leaves the browser (and the server checks again
regardless).

**6 · Earnings.** Under **My submissions** the clip shows 0 views. Run
`pnpm ingest`, refresh, and the views — with an **est.** earnings figure — are
there. Run `pnpm ingest` a second time: nothing changes, because a day that has
already been captured is left alone. Approve the clip as admin and the figure
turns **final**: earnings freeze at approval, so later view growth no longer
moves it.

**7 · Two admins at once.** This one can't be clicked. The race is covered by
`tests/integration/concurrent-approval.test.ts`, which fires simultaneous
approvals against a budget that only covers some of them:

```bash
pnpm vitest run tests/integration/concurrent-approval.test.ts
```

---

## Deployment

The app is a standard Next.js deploy; it only needs a Postgres it can reach and
two environment variables.

**Environment variables**

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string from your provider |
| `SESSION_SECRET` | Any random string — it signs the session cookie |

**Migrations** run automatically on deploy: Vercel runs the `vercel-build`
script, which applies the committed migrations before building. The plain
`build` script is left alone so local builds don't touch a database.

**Seeding** is a one-off. Point `.env` at the deployed database and run
`pnpm db:seed` from your machine. Note that the seed *clears* the tables first,
so only run it against a database you're happy to reset.

**Connection pooling.** Approvals run inside an interactive transaction, so the
connection has to support them. Supabase's transaction pooler and any direct
Postgres connection do; Neon's HTTP driver does not. The client already sets
`prepare: false`, which poolers require and which is harmless elsewhere.

---

## How it fits together

```
src/
  app/                    routes — /admin/* and /creator/*, plus the tRPC transport
  components/            screens' building blocks (ui/ is shadcn)
  server/
    routers/             tRPC procedures: input validation and authorization
    services/            the logic worth testing on its own — payout, approval, ingest
    trpc.ts              procedure layers: public / protected / admin / creator
  lib/
    schemas/             Zod schemas imported by BOTH the forms and the procedures
    auth/                HMAC cookie signing, route permissions
  db/                    Drizzle schema and client
drizzle/                 generated migrations (committed)
scripts/                 seed and ingest entry points
tests/                   unit/ is pure logic, integration/ runs against real Postgres
```

Four rules hold throughout:

1. **Money is integer cents everywhere.** No float arithmetic, at any layer.
2. **Ownership is enforced in the `WHERE` clause**, never by fetching a row and
   comparing afterwards — so another creator's row is `NOT_FOUND`, not
   `FORBIDDEN`, and ids can't be probed for existence.
3. **Money logic lives in `services/`**, not in routers, so it can be tested
   without a request.
4. **One route handler exists**, the tRPC transport. Everything else — including
   the user switcher's cookie — goes through a procedure.
