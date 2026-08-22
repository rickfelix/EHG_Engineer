# Fleet-down alert runbook

Category: Deployment
Status: Approved
Version: 1.0.0
Author: SD-LEO-INFRA-FLEET-DOWN-ALERT-001
Last Updated: 2026-08-22
Tags: fleet, alerting, chairman-sms, operations

## Overview

`scripts/fleet-down-alert.mjs` runs on `fleet-down-alert-cron.yml`'s ~15-minute cadence and
evaluates four independent alert arms, isolated from each other by `runAlertArms` (one arm's
failure does not suppress another — QF-20260803-882):

| Arm | Signal | Delivery | Recipient |
|---|---|---|---|
| `dead-coordinator-pager` | No coordinator heartbeat | Chairman SMS | Chairman |
| `fleet-dead-man-pager` | Zero heartbeats fleet-wide AND zero SD/QF completions | Chairman SMS | Chairman |
| `fleet-dead-man-per-host-pager` | A specific host's heartbeat has gone silent (Leg-A-only) | Chairman SMS | Chairman |
| `worker-fleet-email` | Sustained zero active workers with claimable work waiting | Operator email (Resend) | Operator |

The per-host arm (added by SD-LEO-INFRA-FLEET-DOWN-ALERT-001) is a Leg-A-only (heartbeat-only)
companion to `fleet-dead-man-pager`: the global arm requires BOTH zero heartbeats fleet-wide AND
zero completions before it pages, so a single host going fully dark while another host stays
active never trips it. The per-host arm closes that gap.

## Environment variables

All are optional; defaults are chosen for the near-term small-fleet deployment this SD targets
("several concurrent hosts, never thousands" — see code comments for the underlying measurements).

| Variable | Default | Purpose |
|---|---|---|
| `FLEET_FREEZE_CUT_MINUTES` | 60 (floor: 15) | Tool-silence cut point for a single wedged seat (`lib/fleet/genuine-worker.mjs`). Recalibrated from 120 by SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-1 — kept in sync by convention (not a shared import) with `fleet-health.cjs`'s `TOOL_SILENCE_CUT_MINUTES` and `fleet-dashboard.cjs`'s `STUCK_SEAT_CUT_POINT_MINUTES`. Also the fallback default for `classifySessionBucket`'s ZOMBIE-bucket cut point wherever a caller omits `cutMinutes` — verified live call sites: `scripts/adam-coordinator-health.mjs`, `scripts/lib/capacity-inputs.mjs`. |
| `FLEET_DEAD_MAN_WINDOW_MIN` | 120 | Silence window for both the global and per-host dead-man checks. |
| `HOST_ELIGIBILITY_WINDOW_MIN` | 240 (4h) | Recency window for `fetchEligibleHosts`'s `claude_sessions` query. |
| `HOST_QUERY_ROW_LIMIT` | 5000 | Row cap on the eligible-hosts query (PostgREST's own default page cap is ~1000; this is an explicit, loud-on-truncation bound layered on top). |
| `MAX_HOSTS_PAGED_PER_RUN` | 5 | Caps chairman SMS sends from the per-host arm in one run. |
| `MAX_HOSTS_PROCESSED_PER_RUN` | 200 | Caps total hosts (dead + alive) given a fresh `system_events` verdict in one run — bounds DB read/write volume independent of the paging cap. |
| `DEAD_COORDINATOR_STALE_MIN` | 15 | Staleness threshold for the dead-coordinator arm. |
| `FLEET_DOWN_CONSECUTIVE_PULSES` | 3 | Consecutive zero-active pulses required before the worker-fleet-email arm fires. |

## Known, disclosed operational risks

`claude_sessions` carries permissive RLS (`FOR ALL TO anon USING (true) WITH CHECK (true)` —
`database/migrations/20251204_multi_session_coordination.sql:436`). This was treated as a live
threat during this SD's EXEC-TO-PLAN security review, not a theoretical one. Two residual gaps
were disclosed rather than fixed, since closing them fully needs a known-host allowlist or a
tightened RLS policy on `claude_sessions` — both out of scope for an alerting-logic SD and
requiring separate sign-off given that table's fleet-wide blast radius:

1. **Query-level truncation can hide a real dying host.** `fetchEligibleHosts` orders by
   `heartbeat_at DESC` and takes the top `HOST_QUERY_ROW_LIMIT` rows. An adversarial flood of
   freshly-stamped fake "alive" hostnames could, in principle, push a genuinely stale real host's
   row out of the returned page in the same run it would otherwise have been evaluated — the
   silent-blindness failure mode this whole alert system exists to close, reintroduced one layer
   up. See `scripts/fleet-down-alert.mjs`'s comments above `fetchEligibleHosts` and
   `MAX_HOSTS_PROCESSED_PER_RUN`.
2. **Held/blocked sends still latch the dedup state.** `recordFleetDeadManVerdict` records a
   verdict as `dead`/`transitioned` BEFORE the SMS send is attempted. If the send is blocked (e.g.
   chairman quiet hours, 10pm–6am ET) rather than genuinely delivered, the edge-trigger dedup
   still treats the alert as "already fired" and will not retry once the send channel reopens.
   This is inherited from the pre-existing `checkFleetDeadMan` and only widened, not introduced,
   by the per-host arm. See the SD's retrospective (`retrospectives` id
   `55e8ca75-2377-4c64-a5a6-3ea22276f270`) for the full finding.

Neither gap changes today's measured exposure (single real host in the live fleet at the time of
this SD), but both should be re-measured before the fleet scales past a handful of concurrent
hosts, or before relying on this alert's timeliness during a chairman quiet window.

## Related

- Retrospective: `retrospectives` id `55e8ca75-2377-4c64-a5a6-3ea22276f270` (SD_COMPLETION,
  SD-LEO-INFRA-FLEET-DOWN-ALERT-001) — full narrative of the three rounds of premise correction,
  mutation-tested EXEC findings, and the deep-tier `/ship` security findings.
- `docs/protocol/fleet-coordinator-and-worker-behavior.md` — general fleet liveness/coordination
  behavior this alert system consumes.
