# Chairman-email channel liveness — health, dead-channel alarm, daily canary

**SD**: SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001
**Status**: Approved
**Category**: Protocol
**Version**: 1.0.0
**Last Updated**: 2026-07-04

## What this is

Solomon's referent-audit (chairman-commissioned, verified first-hand by two
witnesses) found the chairman-escalation email channel
(`lib/notifications/resend-adapter.js`, Resend) died silently for ~5.5 hours
on 2026-07-03 (quota exhaustion, 20:20Z-02:00Z) with zero detection — no
delivery-failure watchdog, no dead-channel alarm, no canary. It surfaced
incidentally in an unrelated ledger check. The channel that carries
chairman-only escalations and blocking decisions previously failed silent.

This SD closes that gap with three pieces, all additive to the existing
adapter:

- **Channel-health recorder** (`lib/notifications/channel-health-recorder.js`)
  — a fail-safe, non-blocking hook wired at `sendEmail()`'s single choke
  point, so every current and future caller (`adam-heartbeat-email.mjs`,
  `adam-decision-email.mjs`, `coordinator-*`, `fleet-down-alert.mjs`, ...)
  inherits health tracking for free.
- **Hysteresis alarm state machine** — raises on ≥2 consecutive failures or
  an explicit quota-block, clears only on a verified success, with a
  per-outage cooldown so a recovery-then-refail doesn't storm the alarm
  without masking a still-broken channel.
- **Daily delivery-verified canary** (`scripts/chairman-email-canary.mjs`) —
  an independent GitHub Actions cron (`.github/workflows/chairman-email-canary-cron.yml`),
  plus a 6-hourly freshness/absence check that catches a *missed* cron run
  through the same alarm path as a real failure.

## The confirmed landmine: quiet-window suppression looks like success

Live Baseline Observation (this SD's own PRD) confirmed, by calling the real
`sendEmail()` unmocked: during the chairman quiet window (23:00-05:00
America/New_York), it returns

```json
{"success": true, "suppressed": true, "errorCode": "SUPPRESSED_QUIET_WINDOW"}
```

A naive health-tracker keying off `.success` alone would treat this as a
real send and mask up to 6 hours per night of a genuine outage overlapping
the window. `computeHealthUpdate()` in `channel-health-recorder.js` treats
`suppressed:true` as **no-signal** — it never advances `last_success_at` and
never resets `consecutive_failures`. This is locked in by a dedicated unit
test (TS-1).

## Data model

`chairman_email_channel_health` (singleton row, `id='singleton'`) — modeled
on the sibling `llm_cloud_health` table:

| Column | Purpose |
|---|---|
| `last_success_at` | Last REAL verified success (send or canary) — never a suppressed one |
| `consecutive_failures` | Reset to 0 only on a real success |
| `last_error_class` | Last observed error code (`HTTP_429`, `TIMEOUT`, `CANARY_STALE`, ...) |
| `last_canary_verified_at` | Last time the daily canary confirmed delivery via a provider-accepted id |
| `alarm_state` | `clear` \| `raised` \| `cooldown` |
| `alarm_raised_at` / `alarm_cleared_at` | Transition timestamps |
| `last_alarm_notify_error` | Set if the Todoist phone-push itself failed (never blocks the health write) |

**This migration ships staged, chairman-gated**
(`strategic_directives_v2.metadata.requires_chairman_apply=true`) — it was
not applied to production by EXEC. Code is written to fail open if the table
doesn't exist yet (the recorder's fail-safe catch, the dashboard's "migration
may be unapplied" fallback).

## Alarm surfaces (2, not the originally-scoped 3 — documented deviation)

The PRD originally named three surfaces: a dashboard banner, a separate
ambient statusline/terminal marker, and a Todoist phone-push. Implementation
collapsed the first two into one (`scripts/fleet-dashboard.cjs`'s
`printChairmanEmailChannelHealth()`, pull-based, mirrors
`printUndeliveredOutbound()`'s shape) because:

1. No pluggable ambient-statusline mechanism exists anywhere in this
   codebase to extend safely without inventing new infrastructure.
2. The LEAD-phase risk register already concluded the active Todoist PUSH
   is the primary detection guarantee — a passive/pull surface is
   confirmatory, not load-bearing (a dashboard nobody watches isn't
   detection either way).

Caught by the PLAN_VERIFICATION VALIDATION sub-agent pass and fixed by
documenting the decision here and in the PRD, rather than leaving it silent.
A true ambient statusline remains a candidate follow-up if requested.

## Reused, not reinvented

- Phone-push: `lib/integrations/todoist/chairman-notify.js`'s
  `notifyChairman()` — called as-is, wrapped in its own try/catch so a
  Todoist failure never blocks the health/alarm write.
- Cron cadence: the GitHub Actions cron family
  (`fleet-down-alert-cron.yml`'s template) — deliberately **not**
  `scripts/gauge-runner.mjs`, which has no independent schedule and dies
  with the coordinator process (defeating the point of an independent
  watchdog for the channel that carries chairman escalations).
- Schema shape: `llm_cloud_health` (singleton health row, RLS
  service_role-only).

## Testing approach

FAIL/RECOVERY/PASS directions and a 2026-07-03 outage replay (real
`HTTP_429`, exhausting the real retry/backoff loop) all run against the
**real** `sendEmail()` path — only `global.fetch` and Todoist's
`notifyChairman` are faked. See
`tests/unit/notifications/chairman-email-channel-liveness.test.js`.
