# Publish Outcome Observer — Operational Runbook

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001
- **Last Updated**: 2026-09-13
- **Tags**: publisher, autonomy-gate, graduation, cron, outcome-observer, marketing

## Overview

Feeds the previously-dead-by-construction autonomy graduation ladder shipped by
`SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C`: `recordPublishOutcome()` /
`evaluateGraduation()` (`lib/marketing/autonomy-gate.js`) had **zero production callers**
before this SD, so no venture/channel could ever graduate to `autonomous` or demote back to
`propose_and_approve`, regardless of what actually happened to a published post. See
`docs/design/venture-demand-distribution-engine.md` §5 Child C for the full architecture and
the FR-1 root-cause fix this SD depended on (`publisher/index.js`'s `dispatchKey`).

This runbook covers only the new scheduled step and its immediate operational surface — not
the autonomy-gate mechanism itself, which is documented at the design-doc reference above.

## Architecture

| | |
|---|---|
| Script | `scripts/cron/publish-outcome-observer.mjs` |
| Workflow | `.github/workflows/publish-outcome-observer-cron.yml` |
| Schedule | `*/30 * * * *` (every 30 minutes) + `workflow_dispatch` |
| Classifier | `lib/marketing/observer/observe-outcome.js` (`observeOutcome()`) |
| Scope | `{x, bluesky}` only (FR-9) — the other channel families in
  `ventures.metadata.thesis.reached_how` have no adapter and are explicitly out of scope |
| Registry identity | `SD_KEY` = `SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001`, `expectedIntervalSeconds=1800` |

Each sweep (`sweepOnce`):
1. Selects up to `DEFAULT_ROW_LIMIT` (200) `venture_channel_publish_ledger` rows with
   `outcome='unknown' AND decision='accepted'`, oldest-first (so a backlog never starves the
   longest-waiting rows). The DB-level read is bounded by a literal `.limit(999)`
   (count-truncation-diff-lint requires a literal on the chain itself); the 200-row
   read-budget throttle is enforced afterward in JS via `slice()`, with a defensive clamp
   against an unsafe caller override (NaN/negative/zero/non-numeric falls back to 200).
2. Joins each row to `campaign_content` via `correlation_id = idempotency_key` and calls the
   real X (`GET /2/tweets/:id`) or Bluesky (`com.atproto.repo.getRecord`) API to determine
   whether the post is confirmed present, confirmed absent, or the lookup was transient —
   **never self-reported by `publish()`**, per the ledger's own anti-self-report invariant.
3. Records the outcome (`shipped_clean` / `reverted` / `unmeasurable`) via
   `recordPublishOutcome()`, which re-evaluates graduation scoped to the row's own
   `execution_mode` — a mock-mode outcome can never touch the real `venture_channel_autonomy`
   row for that venture/channel.
4. A join-miss (no `campaign_content` row yet) stays `'unknown'` (retried next run) while the
   ledger row is within `OBSERVATION_WINDOW_MS` (24h) of its own `created_at` — the
   human-paced, out-of-band chairman-approval-to-`publish()`-retry gap on the approval-gated
   path. Only past the window does the same join-miss become the terminal `'unmeasurable'`.

## Required credentials

`.github/workflows/publish-outcome-observer-cron.yml` sets only:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `X_ACCESS_TOKEN`

Bluesky needs no read-side credential (`getPostRecord` is an unauthenticated `xrpc` read), so
`BLUESKY_HANDLE`/`BLUESKY_APP_PASSWORD` are deliberately **not** in this workflow's env — the
observer never calls `authenticate()` (that path needs the posting credential, only reachable
from `publish()`, never from here). Per-venture credentials for the actual platform lookup are
resolved through `lib/marketing/channel-secrets.js` (`resolveChannelCredentials`) — the same
mechanism `publish()` uses — never a shared/environment-wide fallback.

## Manual invocation

```bash
node scripts/cron/publish-outcome-observer.mjs --once
node scripts/cron/publish-outcome-observer.mjs --once --dry-run   # skip registration/sweep/liveness stamp
```

Or trigger the workflow directly: `gh workflow run publish-outcome-observer-cron.yml`.

## Monitoring

Each sweep logs one JSON summary line:
`rows_selected, rows_joined, rows_left_unknown, rows_unmeasurable, rows_written,
rows_write_failed, rows_write_failed_expected_pre_migration`.

- `rows_write_failed_expected_pre_migration` counts up whenever the SQL migration widening
  `venture_channel_publish_ledger`'s `outcome` CHECK to admit `'unmeasurable'`
  (`database/migrations/20260912_venture_channel_publish_ledger_outcome_unmeasurable.sql`,
  chairman-gated) has not yet been applied — expected and non-alarming pre-apply, should drop
  to zero once the chairman applies it.
- `rows_left_unknown` rising steadily with `rows_joined` staying low across many sweeps means
  most lookups are transient or credential-unresolvable — worth checking adapter health
  (`scripts/canary/run-adapter-liveness-probe.mjs`) before assuming a backlog problem.

## Known limitation (deferred, tracked)

No read-budget batching/backoff exists yet: a large backlog of permanently-transient rows
could be re-polled every 30 minutes indefinitely, and at `DEFAULT_ROW_LIMIT=200` this could
approach X's Basic-tier ~15K-reads/month budget within days if such a backlog were large.
Oldest-first ordering at least prevents starvation of long-waiting rows in the meantime.
Tracked as a follow-up SD/QF, not blocking for this increment.
