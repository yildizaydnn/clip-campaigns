# Notes

## Setup

The steps are in [README.md](./README.md#setup). I tested them on a clean copy
of the project — no `node_modules`, no `.env` file, and a fresh empty database
container. I ran the steps exactly as written: install, copy `.env.example`,
`db:up`, `db:migrate`, `db:seed`. Then `pnpm test` (43 tests, all passing) and
`pnpm build`.

Doing this found two problems I could not have seen from my own working
directory:

- The database container uses host port **5433**, not 5432. Most machines
  already run Postgres on 5432, so the app would have connected to the wrong
  database without any clear error.
- `docker-compose.yml` had a fixed `container_name`. If a container with that
  name already exists, `db:up` fails. I removed it so Docker Compose names the
  container after the project folder instead.

---

## Concurrent approvals

This was the hardest part of the task. Two admins approve at the same moment,
the budget only covers one of them, and only one should go through.

The whole approval happens in one transaction. The important part is how the
budget is checked and updated — both happen in a single SQL statement:

```sql
UPDATE campaigns
   SET spent_cents = spent_cents + $earnings
 WHERE id = $id
   AND status = 'active'
   AND spent_cents + $earnings <= total_budget_cents;
```

If this updates zero rows, it means the budget cannot cover the approval, so I
throw an error and the transaction rolls back.

### Why this solves the race

Both requests try to update the same campaign row. Postgres locks that row, so
the second request has to wait until the first one commits.

When the second one finally runs, Postgres checks the `WHERE` condition again —
this time against the updated row. It now sees the new, higher `spent_cents`,
the condition is false, and it updates zero rows. So the second approval is
refused.

The key point is that the check and the write happen in the same statement.
There is no gap between reading the budget and updating it, so there is nothing
for the second request to slip into.

### Two conditional updates, two different jobs

The approval has a second conditional update, on the submission:

```sql
UPDATE submissions SET status = 'approved', ...
 WHERE id = $id AND status = 'pending';
```

This one stops the *same* submission being approved twice (which would take
money from the budget twice). The campaign update handles *different*
submissions competing for the same remaining budget. Both are needed.

### Other approaches I looked at

- **Read first, then write.** Run `SELECT SUM(...)`, check in JavaScript if
  there is enough budget, then write. This is the bug the task is looking for:
  both requests read "there is enough" before either writes, so both write and
  the budget is exceeded. I wrote the concurrency test specifically to catch
  this.
- **`SELECT ... FOR UPDATE`.** This works. It locks the campaign row first, so
  the second request waits and then reads the correct value. I did not use it
  because it needs an extra query, and the conditional `UPDATE` already takes
  the same lock while doing the actual work.
- **`SERIALIZABLE` transactions with retries.** Also works, but Postgres then
  aborts one of the transactions with an error, and my code has to catch that
  error and retry the whole thing. That is a lot of extra handling for a
  single-row update.
- **Advisory locks.** These work too, but the lock is not part of the schema.
  Someone writing new code later has no way to know they need to take it.

### Extra safety in the database

The `campaigns` table also has a check constraint:

```sql
CHECK (spent_cents >= 0 AND spent_cents <= total_budget_cents)
```

Even if my application code had a bug, the database itself would refuse to save
a campaign that spent more than its budget. It was one line to add and it makes
the rule impossible to break by accident.

### About `spent_cents`

`spent_cents` is a stored column, but it is really just the sum of
`locked_earnings_cents` for all approved submissions. Storing it is a
duplication, and normally I would avoid that — but the whole solution above
depends on being able to check and update the budget in one statement, which
needs a real column.

Because it is duplicated, it could get out of sync. So I wrote a test
(`tests/integration/invariant.test.ts`) that runs a mix of concurrent
approvals, rejections and refused approvals, then checks that `spent_cents`
still equals the sum of the approved submissions' earnings.

---

## Decisions I had to make

The brief does not answer these, so I picked an option and wrote down why.

### Earnings are frozen when a submission is approved

Views keep growing after approval. If earnings were always recalculated from
the latest view count, an approved submission would keep getting more expensive
and could push the campaign over its budget days later.

So I calculate the earnings at approval time and store them in
`locked_earnings_cents`. The budget is reduced once and never changes again for
that submission.

The other option is to always recalculate from the newest views and cap the
campaign total at the budget. That is probably closer to what a real product
would do, since the creator really did earn those views. I did not do it
because the budget would then never be final — every ingest run could change
who fits inside it, and "first come, first served" stops meaning anything if
approval order does not decide who gets paid.

Since this can look confusing in the UI, I made it visible instead of hiding
it. The campaign overview shows "approved views" (which keeps growing) next to
"locked at approval" (which does not), with a line explaining why. Creators see
their earnings marked **est.** before approval and **final** after.

### Ingest also tracks pending submissions

Section 4.5 says one metric row per approved submission per day. But section
4.3 says creators should see their current views and estimated earnings — and
if only approved submissions get view counts, that estimate is always zero.

There is also a worse problem: if a submission has no metrics at all and gets
approved, its earnings are locked at $0 forever.

So I read 4.5 as a minimum, not a limit, and sync every submission except
rejected ones.

### A submission with no metrics can still be approved

Its earnings are 0 and nothing is taken from the budget. This is a real
situation — a clip submitted before the first sync runs. Blocking the approval
would mean admins have to wait for a background job before they can review
anything.

### `paid` exists in the schema but nothing sets it

The data model asks for the status, but the brief never says what triggers it.
In a real product it would be a payment provider, which is out of scope here. I
left the enum value unused rather than adding a button the brief did not ask
for.

### Amounts are in US dollars

The brief says integer cents but does not say which currency, so I used USD.
The forms take cents directly instead of dollars, so there is no conversion or
rounding anywhere. To make that less confusing, each money field shows what you
typed in a readable form ("= $1.50 per 1,000 views") while you type.

### Campaign dates are enforced when submitting, not when approving

Submitting outside the campaign's start and end dates is refused on the server.
Approving does not check the dates, because reviewing a queue after a campaign
has ended is normal — and the campaign's `status` already decides whether money
can move.

### The user switcher works in production too

It is not a development-only tool. It is how this demo signs you in, and the
deployed version needs it so you can see both roles.

---

## What I left out on purpose

- **Real authentication.** The brief said a signed cookie with a userId is
  enough, so that is what I built. I spent the time on the server side instead:
  role checks in the tRPC procedures, ownership checks inside every query, and
  tests that try to reach another creator's data by sending someone else's ID
  directly.
- **Custom design.** I used shadcn/ui defaults with one accent colour. The
  brief says design work does not earn points, so I focused on loading, empty
  and error states, form labels and keyboard/screen reader basics.
- **Payment integration**, as explained above.
- **Full-text search.** Title search uses `ILIKE '%...%'`, which cannot use an
  index. With a lot of data this would need the `pg_trgm` extension, but with a
  few campaigns it would be unnecessary work.
- **CI.** I checked by hand that `pnpm test` passes on a clean checkout. A CI
  workflow would be a single file, but it is not part of what is being
  assessed.
- **Browser tests.** The logic that can actually break is on the server, and
  that is covered by integration tests against a real database. Playwright
  tests would mostly be testing React.

---

## Tests

`pnpm test` runs 43 tests against a real Postgres database. I did not mock the
database, because the most important test is about two transactions competing
for the same row — and a mock cannot reproduce that.

The five areas the brief asks for:

| Area | File |
|---|---|
| Payout math | `tests/unit/payout.test.ts` — 999 views → 0, 1000 → 1 payout, big numbers, invalid input |
| Budget ceiling | `tests/integration/budget-ceiling.test.ts` — refusal with a typed error, everything rolled back, double approval blocked, auto-completion |
| Concurrent approvals | `tests/integration/concurrent-approval.test.ts` — 2 requests with budget for 1, and 5 requests with budget for 3 |
| Access control | `tests/integration/access-control.test.ts` — role checks, plus a creator trying another creator's submission ID |
| Repeated ingest | `tests/integration/ingest.test.ts` — running twice changes nothing, views never drop, one failure does not stop the rest |

I also wrote two tests the brief does not ask for:

- The **invariant test** described earlier, because `spent_cents` is duplicated
  data and I wanted proof it stays correct.
- A test for the **daily views chart**, where a campaign has metrics on only 2
  days out of a 10-day period and the result still has 10 points. The brief
  points out that the period will contain days with no metrics, and it would be
  easy to get this wrong.

For the ingest tests, the function that fetches view counts is passed in as a
parameter. That let me write tests where the source returns fewer views than
yesterday, or throws an error for one specific submission, and then check what
actually ended up in the database.

---

## What I would fix with another day

- **The two numbers on the campaign overview.** "Approved views" is live and
  "locked at approval" is frozen, and the card explains why they are different.
  It is honest but it makes the reader do the maths. I would show the
  difference directly — something like "$40.00 of views since approval, not
  payable" — so the confusing part becomes the useful part.
- **Optimistic updates in the review queue.** Right now every approve waits for
  the server. Since a budget refusal is a normal outcome and not a crash, I
  could update the UI immediately and undo it if the server refuses. That would
  make going through a long queue much faster.
- **A limit on submissions per creator per campaign.** Nothing stops one
  creator submitting fifty clips to the same campaign. The brief only forbids
  the same URL twice so I did not invent a rule, but a real marketplace would
  probably want one.
- **Timestamps coming back as strings.** A few queries use raw SQL because
  Drizzle's query builder does not cover them well (`generate_series`,
  `DISTINCT ON`). Those return timestamps as strings, while normal Drizzle
  queries return `Date` objects. Nothing depends on it right now and the types
  are correct, but it is inconsistent and could confuse someone later.

---

## Where I used AI and what I had to fix

I used Claude Code throughout. I planned first and wrote the plan down —
the schema, the approach to concurrency, the error codes and the list of
screens were decided before any code was written, and then I built it step by
step and committed as I went.

It was genuinely useful for setting up tRPC and Drizzle, writing a first
version of a screen from a description, and applying a decision I had already
made across several files consistently.

Things I had to correct:

- **The first ingest design was wrong.** The suggestion was
  `ON CONFLICT DO UPDATE SET views = GREATEST(...)`, which looks correct and
  would be correct with a real API. But my ingest *generates* the view numbers,
  so running it twice on the same day would generate a different number,
  `GREATEST` would keep the bigger one, and the data would change — breaking
  the exact rule it was supposed to protect. I split it into
  `ON CONFLICT DO NOTHING` for the "running twice changes nothing" rule, and a
  `max()` when generating the number for the "views never go down" rule.
- **The concurrency approach changed after I questioned it.** The first
  suggestion was `SELECT ... FOR UPDATE`. It works, but the conditional
  `UPDATE` takes the same lock while doing the actual work, so the extra query
  is not needed. The list of rejected approaches above came out of that
  discussion.
- **Extra features crept in twice.** A `markAsPaid` action and some UI extras
  got into the plan before I removed them. The brief says clearly that extra
  features do not earn points.
- **Two bugs that only appeared when I used the app myself.** Campaigns are
  created as `draft`, but the form had no status field — so a campaign could
  never be made active from the UI, and every test still passed. And ingest
  only synced approved submissions, which kept estimated earnings at zero.
  Neither of these looked wrong in the code.
- **Libraries had changed.** The generated components used the Radix API
  (`asChild`) but the current shadcn version uses Base UI (`render`). And a
  generated CSS line, `--font-sans: var(--font-sans)`, pointed at itself, so
  the font silently fell back to a serif across the whole app. Neither caused a
  TypeScript error — I only found them by looking at the page.
- **A postgres.js detail**, found by a failing test: `Date` objects cannot be
  used as parameters where the SQL casts to `::date`. The query needs an ISO
  date string instead.

What I take from this: AI is fastest in the places where I can check the result
quickly, and least reliable exactly where checking is hardest — concurrency,
data correctness, and anything that depends on how a library behaves today
rather than a year ago. That is where I put the tests.
