# Chairman Hourly-Heartbeat Backstop — Operational Runbook

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001
- **Last Updated**: 2026-08-15
- **Tags**: chairman, heartbeat, sms, cron, cadence, deployment

## Overview

The live hourly chairman heartbeat (chairman contract c3) fires only via a session-scoped
harness `CronCreate` job (`scripts/adam-startup-check.mjs` ADAM_LOOPS entry `heartbeat-sms`,
cron `14 * * * *`), re-armed only when an `/adam` session starts. When the host machine loses
power — confirmed root cause: a hotel room cutting power on no-motion, 2026-08-09 onward, not a
software timer bug — every local session/cron dies with it and the hourly SLA breaks silently.
Two slips were witnessed 2026-08-12/13 (2h14m, ~4.5h), driving Adam self-score D8
(`interface_clarity`) to a 3-consecutive-cycle escalation.

This adds a **cloud-side, GHA-cron backstop** — `scripts/cron/chairman-hourly-heartbeat-backstop-
sweep.mjs`, dispatched by `.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml` — that
fills a missed hour, independent of any local Adam process or machine state.

## Architecture

| | |
|---|---|
| Script | `scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs` |
| Workflow | `.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml` |
| Schedule | `*/15` UTC, both DST offsets always registered — self-healing window, ~05:00-22:59 chairman-zone approximated for the cron trigger; the sweep itself resolves the actual chairman zone for its own coarse pre-filter and the real quiet-hours gate |
| Activation gate | **none — ships live on merge.** Unlike some sibling GHA-cron sweeps (e.g. the hourly drive-report leg), there is no enable/disable repo variable. Disabling means editing/removing the `schedule:` trigger in the workflow file, or `gh workflow disable`. |
| Migration | none — reuses the existing `sms_outbound_obligations` table and `enqueueChairmanSms()` |
| `kind` (own) | `heartbeat_status_backstop` — distinct from the live path's `heartbeat_status`; never collides with legitimate live-heartbeat/chairman-reply traffic |
| Dispatch | **enqueue-only**, via `lib/chairman/sms-bridge.js::enqueueChairmanSms()` — deliberately NOT `sendChairmanSMS`'s inline dispatch (see Design decisions below) |

Both the live path and this backstop write into the same `sms_outbound_obligations` ledger; the
pre-existing SMS-outbound worker (or any live `sendChairmanSMS` caller) owns actual provider
dispatch for rows this sweep enqueues.

## Design decisions

- **Read-based status-decision table, not a write-time UPSERT dedupe key.** The morning-brief
  sweep's precedent (write-time UPSERT dedupe) has a measured live double-send defect and no
  always-on dispatcher for owed rows. This sweep instead reads the most recent row per kind
  within a trailing lookback window (`LOOKBACK_MS = SLA_WINDOW_MS + STALENESS_GRACE_MS`, **not**
  a fixed calendar-hour bucket — a calendar bucket is empty by construction at the top of every
  hour and would spuriously fire every awake hour) and classifies coverage via
  `classifyRowCoverage()` over all 8 `sms_outbound_obligations` statuses. A stuck `owed` row is
  never treated as "filled."
- **`ownKind` grace exemption** (`classifyRowCoverage(row, now, {ownKind: true})`): the
  backstop's own prior `owed`/`sending` row never expires into `unfilled` on staleness grace —
  enqueueing is this sweep's entire deliverable, so during a sustained outage a stuck own-kind
  row must stay `in_flight` forever, not get re-enqueued every 15-minute tick (that would pile up
  duplicate obligations that all deliver as a burst once dispatch resumes).
- **Enqueue-only, never `sendChairmanSMS`** (SEC-H1, EXEC-phase SECURITY sub-agent
  finding, merge-blocking): the GHA workflow's env block carries no Twilio credentials by
  design. Calling `sendChairmanSMS` anyway would reach its inline `reconcileOutboundSms`
  fallback with no way to actually dispatch — and that reconciler's unfiltered `status='owed'`
  claim (no `kind` scoping) would burn retry attempts and permanently dead-letter unrelated owed
  rows (e.g. a legitimate `morning_brief` obligation) during exactly the machine-off outage this
  SD exists to cover. Quiet-hours gating (`isSmsQuietHour`, chairman-zone-aware) is therefore
  done explicitly in this sweep rather than inherited from `sendChairmanSMS`'s rubric.
- **Millisecond-timestamped `dedupeKey`** (`heartbeat_status_backstop:<hourKey>:<epochMs>`),
  never a plain per-hour key — avoids a same-key UPSERT collision between two near-simultaneous
  ticks surfacing as a false transport-failure alert.
- **Fail-closed on a read error**: an unreadable ledger never licenses a send, since the ledger
  read is the only signal preventing a double-send.

## Verification

Confirm a backstop fill actually happened (and was not merely enqueued-and-lost):

```sql
SELECT id, kind, status, dedupe_key, created_at
FROM sms_outbound_obligations
WHERE kind = 'heartbeat_status_backstop'
ORDER BY created_at DESC
LIMIT 10;
```

Confirm the GHA schedule is ticking:

```bash
gh run list --workflow "chairman-hourly-heartbeat-backstop-cron.yml" --repo rickfelix/EHG_Engineer --limit 10
```

Manual dry-run (no writes, no dispatch):

```bash
node scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs --once --dry-run
```

There is no `periodic_process_registry` liveness-watcher entry for this sweep (unlike some
sibling cron families) — the GHA run history above and the `sms_outbound_obligations` query are
the verification surface.

## Troubleshooting

### No backstop row ever appears during a known outage window

Check, in order: (1) is the tick landing inside the coarse pre-filter window (`WINDOW_START_
ZONE_HOUR=5` / `WINDOW_END_ZONE_HOUR=23` chairman-zone)? (2) is `isSmsQuietHour` correctly
resolving the chairman zone — a wrong zone silently drops sends outside 22:00-06:00 real intent;
(3) `CHAIRMAN_PHONE` unset makes the whole sweep inert by design (`action: 'inert', reason:
'chairman_phone_unset'`) — check the GHA workflow's `secrets.CHAIRMAN_PHONE` is populated; (4) a
`read_error` (Supabase read failure) fails closed with no send — check workflow logs for
`action: 'inert', reason: 'read_error'`.

### Duplicate backstop sends piling up during a sustained outage

This should be structurally prevented by the `ownKind` grace exemption (Design decisions above).
If it recurs, check `classifyRowCoverage`'s own-kind branch first — this is the exact regression
class EXEC-phase TESTING sub-agent finding F6 fixed pre-merge.

### Backstop fires even though the live heartbeat is healthy

Check `LOOKBACK_MS`/`STALENESS_GRACE_MS` — the coverage read window must cover the live path's
actual send-time spread (measured minute-of-hour spread is wide, not clustered near `:00`); a
too-narrow lookback window reintroduces the exact "empty calendar bucket" bug (F1) this sweep's
trailing-window design fixed.

## Unrelated fix riding this SD's PR (context for git blame)

While unblocking this SD's merge, PR #7031 also carries a fix for a pre-existing, unrelated
fleet-wide defect in `lib/loop-governance/` (a split-clock test time bomb in the L30
retention-reaper evidence collector, blocking the required "Run Unit Tier" CI check on every
open PR). See commits `25b3fb19f21` and `3ede10f8544`, pattern record `PAT-AUTO-114c1f4a`
(`issue_patterns` table), and `/signal` history for SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001
for full detail — it has no functional relationship to the heartbeat backstop itself.

## Related Documentation

- SD: `SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001` (`strategic_directives_v2`, `product_requirements_v2`)
- Retrospective: `retrospectives` table, id `0e554e0e-...`
- Sibling cron precedent (write-time UPSERT dedupe, NOT mirrored by this SD):
  `scripts/cron/chairman-morning-brief-sweep.mjs`, `.github/workflows/chairman-morning-brief-cron.yml`
- `docs/06_deployment/drive-report-hourly-cadence-runbook.md` — analogous hourly-cron-sibling
  shape (activation-gated, unlike this SD)
