# Notes

## Setup

Steps are in [README.md](./README.md#setup). I ran them on a clean copy — no
`node_modules`, no `.env`, its own empty container — then `pnpm test` (45
passing) and `pnpm build`. That exercise caught two things I could not see from
my own working directory: the container has to bind to host port 5433 because
5432 is usually taken, and a pinned `container_name` in `docker-compose.yml`
broke setup when a container by that name already existed.

## Concurrent approvals

The approval runs in one transaction, and the budget check and the write are a
single statement:

```sql
UPDATE campaigns
   SET spent_cents = spent_cents + $earnings
 WHERE id = $id
   AND status = 'active'
   AND spent_cents + $earnings <= total_budget_cents;
```

Zero rows updated means the budget cannot cover it, so the approval is refused
and the transaction rolls back.

**Why it works.** Both requests target the same campaign row, so Postgres makes
the second wait on the row lock. When it resumes, it re-checks the `WHERE`
against the updated row, sees the higher `spent_cents`, updates nothing, and is
refused. There is no gap between reading the budget and writing it for the
other request to slip into.

A second conditional update on the submission (`WHERE status = 'pending'`)
stops the *same* submission being approved twice. The campaign update handles
*different* submissions competing for the same budget. Both are needed.

**Ruled out:**

- **Read, check in JS, then write.** The bug this task is looking for: both
  requests read "there's enough" before either writes.
- **`SELECT ... FOR UPDATE`.** Works, but needs an extra query — the
  conditional `UPDATE` already takes the same lock while doing the work.
- **`SERIALIZABLE` + retries.** Works, but every mutation has to become
  retry-safe. Heavy for a single-row update.
- **Advisory locks.** Work, but the lock lives outside the schema, so nobody
  writing new code knows to take it.

**I made this mistake once.** Lowering a campaign's budget must not land below
what approvals locked in, and my first version read `spent_cents`, compared it
in JS, then wrote — the exact pattern above. I had assumed it was safe because
no money moves on an edit. It isn't: a concurrent approval can raise spend in
that gap. It now uses the same conditional `UPDATE`, and a test races a budget
cut against an approval.

**Also in the database.** `CHECK (spent_cents >= 0 AND spent_cents <=
total_budget_cents)`. If application logic is ever wrong, the database still
refuses to record an over-budget campaign.

**On `spent_cents`.** It duplicates the sum of `locked_earnings_cents` over
approved submissions. Storing it is what makes the single-statement check
possible. Because it is duplicated it could drift, so a test runs a mix of
concurrent approvals, rejections and refusals and asserts the two still match.

## Decisions the brief left open

- **Earnings freeze at approval.** Views keep growing afterwards, so
  recalculating would let an approved submission drift past the budget days
  later. Earnings are computed once and stored in `locked_earnings_cents`.
  Recalculating live and capping at the budget is arguably closer to what a
  real product wants, but then the budget never settles and "first come, first
  served" stops meaning anything. The UI shows both numbers side by side and
  says why they differ; creators see **est.** before approval and **final**
  after.
- **Ingest tracks pending submissions too.** 4.5 asks for one row per approved
  submission per day, but 4.3 wants creators to see current views and estimated
  earnings — which is always zero if only approved clips sync, and locks $0
  forever if a clip is approved before its first sync. I read 4.5's scope as a
  minimum. Rejected clips stop being tracked.
- **A submission with no metrics approves at zero.** A real state for a clip
  submitted before the first sync. Nothing is debited.
- **`paid` is in the schema but nothing sets it.** What triggers it is a
  payment provider — out of scope. Better an unused enum value than a button
  the brief did not ask for.
- **Amounts are USD.** The brief says integer cents but not which currency.
  Forms take cents directly, so there is no conversion, and echo the formatted
  value while you type.
- **Campaign dates are enforced on submission, not approval.** Reviewing a
  queue after a campaign ends is normal; `status` already governs whether money
  can move.
- **Campaign status has no state machine.** An admin can set any status,
  including pulling `completed` back to `active`. Deliberate — the money rules
  depend on the current status, not the transition — but a real product would
  want rules.
- **The user switcher works in production.** "Dev-only switcher" and "a live
  URL we can open" pull in opposite directions: disabled, there is no way to
  sign in at all. It stays on, and is one guard away from dev-only
  (`NODE_ENV === "production"` in `session.switchUser`). Worth stating plainly:
  anyone who opens the deployed URL can act as an admin. Fine for a review
  deployment with seed data, not for anything else.

## Left out on purpose

Real auth (a signed cookie, as the brief allows — the effort went into
authorization instead: role-gated procedures, ownership inside every query, and
tests that try another creator's ID directly). Custom design (shadcn defaults,
one accent colour; effort went to states, labels and keyboard basics). Payment
integration. `pg_trgm` for title search — `ILIKE '%…%'` cannot use an index, but
the extension is unnecessary at this size. CI — I verified a clean checkout by
hand. Browser tests — the logic that can break is server-side.

## Tests

`pnpm test` runs 45 tests against real Postgres. Mocking was never an option for
the important one: a mock cannot reproduce a row lock.

| Area | File |
|---|---|
| Payout math | `unit/payout.test.ts` — floor boundaries, large values, invalid input |
| Budget ceiling | `integration/budget-ceiling.test.ts` — typed refusal, full rollback, double approval, auto-completion |
| Concurrent approvals | `integration/concurrent-approval.test.ts` — 2 requests with budget for 1, 5 with budget for 3 |
| Access control | `integration/access-control.test.ts` — role gates, plus another creator's ID |
| Repeated ingest | `integration/ingest.test.ts` — rerun changes nothing, views never drop, one failure doesn't stop the rest |

Three tests the brief does not ask for: the `spent_cents` invariant (duplicated
data needs proof), the daily chart over a period where most days have no metrics
(the brief warns about this and it is easy to get wrong), and the budget-cut
race described above. Ingest takes its fetcher as a parameter, so tests can hand
it a source that shrinks or throws.

## With another day

- **The two numbers on the overview.** "Approved views" is live, "locked at
  approval" is frozen, and the card explains why. Honest, but it makes the
  reader do the arithmetic. I would show the difference directly.
- **The payout rate can change between submitting and approving.** Earnings use
  the campaign's rate at approval time, so an admin can lower it on a campaign
  with pending submissions. This follows the brief's formula, but a creator who
  submitted at $4.00 per 1,000 views and got $2.00 would disagree. The fix is
  to copy the rate onto the submission at creation — I did not, because it means
  adding a second column to the submission table the brief specified.
- **Two places where end-to-end typing stops.** Raw SQL results (`generate_series`,
  `DISTINCT ON`) are cast to a hand-written shape, and `AppError.payload` is
  cast on the client. Both are money-facing. A thin Zod parse and a union keyed
  on `appCode` would close them.
- **Ingest is an N+1.** Per-submission failure isolation means a query and an
  insert each, in sequence. Fine here, wrong against a real API — that wants
  batched fetches and a single `INSERT ... SELECT ... ON CONFLICT DO NOTHING`.
- **The daily chart sums cumulative counts**, so a missing day dips the line
  even though views never drop. The label says what it is; a true delta needs
  `LAG(views) OVER (PARTITION BY submission_id ORDER BY captured_at)`.

## Where I used AI and what I corrected

I used Claude Code throughout. I planned first — schema, concurrency approach,
error codes, screens — then built to that plan and committed as I went. It was
good at scaffolding tRPC and Drizzle, drafting a screen from a description, and
applying a decision consistently across files.

What I had to correct:

- **The first ingest design was wrong.** `ON CONFLICT DO UPDATE SET views =
  GREATEST(...)` looks right and would be right against a real API — but this
  ingest *generates* the numbers, so a rerun produces a different value,
  `GREATEST` keeps it, and the data changes: breaking the exact rule it was
  meant to protect. Split into `DO NOTHING` for reruns and a clamp at
  generation time for monotonicity.
- **The concurrency approach changed after I pushed back.** The first
  suggestion was `SELECT ... FOR UPDATE`; the conditional `UPDATE` takes the
  same lock while doing the work. The ruled-out list came out of that argument.
- **Extra features crept in twice** — a `markAsPaid` action and UI extras — and
  I cut both. The brief is explicit that extra features earn nothing.
- **Two bugs only using the app found.** Campaigns are created as `draft` but
  the form had no status field, so a campaign could never go active from the UI
  and every test still passed. And ingest synced only approved clips, keeping
  estimated earnings at zero. Neither looked wrong in the code.
- **Libraries had moved.** Generated components used Radix's `asChild` while
  the current shadcn emits Base UI's `render`, and a generated
  `--font-sans: var(--font-sans)` pointed at itself, dropping the whole app to a
  serif fallback. Neither was a type error.
- **A postgres.js detail**, found by a failing test: `Date` objects don't
  serialize as parameters in a `::date` context.
- **A test that passed until midnight.** The ingest suite pinned a fixed capture
  day while fixtures seeded relative to today; they collided when the date
  rolled over.

The pattern: AI is fastest where I can check the result quickly, and least
reliable where checking is hardest — concurrency, data correctness, and library
behaviour that changed recently. That is where the tests are.
