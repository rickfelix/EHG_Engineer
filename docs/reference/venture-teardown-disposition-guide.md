# Venture Teardown Disposition — Kill/Cancel Deployment Cleanup Tracking

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-VENTURE-KILL-CANCEL-001
**Last Updated**: 2026-08-23
**Tags**: venture-lifecycle, governance, deployment-cleanup, chairman-gated

## What this is

A chairman-commissioned architecture evaluation (Solomon eval S5-1/R4) found that when a venture
transitions to a terminal status (`cancelled`/`killed`) its Cloud Run deployment is neither torn
down nor explicitly retained — it keeps serving traffic silently. This SD closes the **visibility**
half of that gap: an explicit, chairman-reviewable disposition record on every terminal-status
venture that had a live deployment. Actual teardown *execution* (running `gcloud` against the
Cloud Run service) is deferred to a credentialed follow-up SD — no GCP admin credentials exist in
this repo/session, and the deploy-CREATE pipeline that would provision them has never run in
production.

## The disposition columns

`database/migrations/20260823145041_ventures_teardown_disposition.sql` adds four columns to
`ventures`:

| Column | Type | Meaning |
|---|---|---|
| `teardown_disposition` | `TEXT`, `CHECK IN ('pending_teardown','retained','torn_down')` | The chairman-facing decision. `NULL` = not applicable (no deployment, or not yet terminal) |
| `teardown_disposition_reason` | `TEXT` | Free-text justification |
| `teardown_disposition_by` | `TEXT` | Who/what set it (an SD key for automated defaults, a chairman identity for manual overrides) |
| `teardown_disposition_at` | `TIMESTAMPTZ` | When |

TEXT + CHECK, not a native `ENUM` — this migration family already documents an `ALTER TYPE`
ordering hazard for enum types (see `20260505224113_ventures_kill_log_and_rpc.sql`'s header).

## Who writes it

Three live RPCs terminalize a venture, and all three carry the identical default-if-NULL clause
in their terminal-status `UPDATE`:

```sql
teardown_disposition = COALESCE(
  teardown_disposition,
  CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
)
```

| RPC | Path |
|---|---|
| `kill_venture(p_venture_id, p_rationale)` | Direct chairman kill action |
| `reject_chairman_decision(...)`'s kill-gate branch | Rejecting a decision at a kill-gate lifecycle stage (3, 5, 13, 23) |
| `fn_chairman_decide(...)`'s kill-gate branch | **The primary programmatic chairman-decision path** — found missing from the original two-RPC scope during PLAN_VERIFICATION (VALIDATION finding V1); without it, most real chairman decisions would have silently bypassed the disposition mechanism |

`COALESCE` means a disposition set earlier by a separate action (e.g. a pre-emptive `'retained'`)
is never overwritten by a later kill.

**A genuine mid-flight correction, worth knowing if you touch these RPCs again**: the first draft
of this migration copied `kill_venture()`/`reject_chairman_decision()` from the *original*
`20260505224113_ventures_kill_log_and_rpc.sql` migration file, which had drifted from the live
database via two unrelated, later-shipped SDs — `reject_chairman_decision` gained a 4th parameter
and an authorization guard; `kill_venture` gained an SD cascade-cancel step and a guarded
`eva_events` insert. A `CREATE OR REPLACE` against the stale signature would have created an
**unguarded duplicate overload** in production. Caught by SECURITY sub-agent review measuring live
`pg_get_functiondef(oid)` output directly. **Never trust a migration file as the source of current
truth for an existing RPC's body — always pull live before writing a `CREATE OR REPLACE`.**

## The sweep reports

`scripts/cron/venture-ops-actuals-sweep.mjs` (the existing 6h cron, already probing every
`deployment_url IS NOT NULL` venture) gained two new read-only jobs:

- **`venture-zombie-report`** (Job 6) — terminal-status (`cancelled`/`killed`), `is_demo=false`
  ventures whose deployment is *still reachable* per the existing uptime-probe job's fresh result.
  Reports id, name, `deployment_url`, `killed_at`, `days_since_kill`, `teardown_disposition`.
  `teardown_disposition` reads tolerate the column not existing yet (see "Deployment sequencing").
- **`venture-divergence-report`** (Job 7) — duplicate venture names sharing ≥2 terminal-status
  `is_demo=false` rows; `applications/registry.json` divergence in both directions (dead-but-
  registered, live-but-unregistered via two separate checks — a whole-portfolio status/is_demo scan
  that catches a `deployment_url=NULL` specimen a URL-join never could, and a narrower
  deployment-url-based scan over the same set jobs 1-3 already read). Registry entries matching
  `test-*`/`e2e-*` names, or the platform's own `ehg` self-registration, are filtered as noise.

Both jobs were live-verified read-only against production during this SD's EXEC phase and matched
every specimen the PRD named exactly (both known zombies, the duplicate-name pair, the
dead-but-registered and both live-unregistered registry specimens).

```bash
# Run the whole sweep cycle (includes the pre-existing jobs 1-5, unaffected)
node scripts/cron/venture-ops-actuals-sweep.mjs --once
```

## Deployment sequencing

`database/migrations/20260823145041_ventures_teardown_disposition.sql` (the columns + RPC wiring)
and `database/migrations/20260823145530_marketlens_teardown_disposition_CHAIRMAN_GATED.sql` (the
explicit disposition record for the one real, currently-live Cloud Run zombie, MarketLens,
`id=ecbba50e-3c98-4493-9e77-1719cf6b6f00`) are both **chairman-gated** — `CREATE OR REPLACE
FUNCTION` on a SECURITY DEFINER RPC and a live-data `UPDATE` are both unconditionally TIER-2 per
`scripts/lib/migration-tier-classifier.mjs`'s fail-closed design, regardless of body content or
how narrowly the `WHERE` clause is scoped. Neither has been applied as of this SD's completion —
both are awaiting a chairman `@approved-by` header and `node scripts/apply-migration.js <file>
--prod-deploy`.

Until the first migration is applied, `ventures.teardown_disposition` does not exist on the live
schema — the sweep's Job 6 tolerates this (`isMissingColumnError()`, warns and reports `null`
rather than erroring), and `tests/integration/kill-venture-rpc.test.js`'s new coverage for
`reject_chairman_decision`'s disposition default is deliberately `.skip()`'d until then. The SQL
logic itself is proven today by `tests/ddl/venture-teardown-disposition-ddl.db.test.js` against an
ephemeral Postgres where the migration *is* applied.

## Known, deliberately-deferred gaps

- Actual `gcloud` Cloud Run teardown execution — no GCP admin credentials in this repo/session.
- `ventures_teardown_disposition_check` is the one non-idempotent statement in an otherwise fully
  `IF NOT EXISTS`-guarded migration (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`) — intended as
  a one-shot apply, matching this migration family's general convention.
- A venture with `deployment_url=''` (empty string, not `NULL`) gets a `pending_teardown` default
  from the RPCs' `CASE WHEN deployment_url IS NOT NULL` clause, but the sweep's own
  `.neq('deployment_url', '')` filter excludes it from ever being fetched/reported — it would stay
  `pending_teardown` without ever surfacing in the zombie report. No live occurrence measured.
