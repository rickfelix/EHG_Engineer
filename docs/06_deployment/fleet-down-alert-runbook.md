# Fleet-down alert runbook

Category: Deployment
Status: Approved
Version: 1.1.0
Author: SD-LEO-INFRA-FLEET-DOWN-ALERT-001, SD-LEO-INFRA-OFF-HOST-FLEET-001
Last Updated: 2026-08-28
Tags: fleet, alerting, chairman-sms, operations

## Overview

`scripts/fleet-down-alert.mjs` runs on `fleet-down-alert-cron.yml`'s ~15-minute cadence and
evaluates five independent alert arms, isolated from each other by `runAlertArms` (one arm's
failure does not suppress another — QF-20260803-882):

| Arm | Signal | Delivery | Recipient |
|---|---|---|---|
| `dead-coordinator-pager` | No coordinator heartbeat | Chairman SMS | Chairman |
| `fleet-dead-man-pager` | Zero heartbeats fleet-wide AND zero SD/QF completions | Chairman SMS | Chairman |
| `fleet-dead-man-per-host-pager` | A specific host's heartbeat has gone silent (Leg-A-only) | Chairman SMS | Chairman |
| `worker-fleet-email` | Sustained zero active workers with claimable work waiting | Operator email (Resend) | Operator |
| `fleet-liveness-pager` | `claude_sessions` heartbeat stale (Leg-A-only) + `sms_outbound_obligations` backlog (diagnostic); flushes the backlog off-host before evaluating | Chairman SMS | Chairman |

The per-host arm (added by SD-LEO-INFRA-FLEET-DOWN-ALERT-001) is a Leg-A-only (heartbeat-only)
companion to `fleet-dead-man-pager`: the global arm requires BOTH zero heartbeats fleet-wide AND
zero completions before it pages, so a single host going fully dark while another host stays
active never trips it. The per-host arm closes that gap.

`fleet-liveness-pager` (added by SD-LEO-INFRA-OFF-HOST-FLEET-001, provenance: the 2026-08-27
outage) closes a DIFFERENT gap — detection succeeding but delivery failing. Two chairman-page
obligations from that outage sat `status='owed'` in `sms_outbound_obligations` and were later
`voided_stale`, never delivered, because delivery depended on a reconciliation tick that only ran
on a local, now-dark machine. This arm calls `reconcileOutboundSms()` off-host, from GHA, before
evaluating its own verdict — a genuine delivery attempt independent of whether any local session
is alive. It suppresses its own chairman page ONLY when `fleet-dead-man-pager` genuinely
*delivered* one for the same outage on the same tick (keyed on `sendChairmanSMS`'s own `sent`
field, not merely "that arm's internal state transitioned" — see Known risks below for why that
distinction matters). It also reports a structurally distinct `watchdog_cannot_measure` condition
on a DB query failure (thrown or resolved-error), never conflating it with a fleet-dark verdict.

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
| `FLEET_LIVENESS_RECONCILE_ENABLED` | enabled (unset) | Rollback lever for `fleet-liveness-pager`'s off-host reconcile flush — set repo/org variable to `0`/`false`/`off`/`no` (case-insensitive) to disable ONLY the flush; measurement and paging continue unaffected. Wired into `fleet-down-alert-cron.yml`'s env block as `${{ vars.FLEET_LIVENESS_RECONCILE_ENABLED }}`. |

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

**SD-LEO-INFRA-OFF-HOST-FLEET-001 findings** (EXEC-phase TESTING/SECURITY review, evidence rows
`49225f26-ada1-43f9-a5c4-ac1eb6803b0e` / `4821d939-116f-4b9a-9f02-2d1ad979c748`):

3. **Cross-arm suppression is delivery-gated (fixed); each arm's OWN dedup is still
   transition-gated (inherited, not fixed).** The first implementation of `fleet-liveness-pager`
   keyed its double-page suppression on `checkFleetDeadMan`'s `transitioned` flag — a page that
   merely transitioned but never delivered (quiet-hours deferral, gate hold, transport failure)
   would have silently disarmed the new arm's own independent attempt for the rest of that outage,
   reproducing this SD's own root-cause class inside its own new code. Fixed:
   `checkFleetDeadMan` now returns `{transitioned, delivered}` (`delivered` from `sendChairmanSMS`'s
   own `sent` field), and `fleet-liveness-pager`'s suppression is keyed on `delivered`. **This fix
   is scoped to the cross-arm signal only** — every arm's own intra-arm edge-trigger (including the
   new one's) still commits its `system_events` dedup state before/regardless of send-success, the
   same pattern as risk #2 above. A rejected send from ANY single arm (including
   `fleet-liveness-pager` itself) still silences that arm's own re-attempt for the rest of the
   outage. Not fixed in this SD — same rationale as #2 (out of scope, needs a delivered-flag
   redesign across all 5 arms' own dedup, not just the cross-arm coupling).
4. **Raw DB-driver error text is sanitized before reaching the chairman or `system_events`, but
   only for `fleet-liveness-pager`'s own cannot-measure path.** The other 4 arms' query-error
   branches (`console.error` + silent return) never reach a chairman-facing message today, so this
   was not a live gap for them — but if any of the other 4 arms are ever changed to page on a
   measurement failure, they will need `sanitizeMeasurementFailureReason`'s treatment (JWT/
   connection-string/`password=` redaction, trailing-`?` strip against
   chairman-sms-gate's decision-classifier upgrade, length bound) applied the same way, not
   independently reinvented.
5. **Lower-severity, explicitly deferred** (SECURITY evidence row `4821d939...`, SEC-L4–L7): a
   future-dated `heartbeat_at` (clock skew) yields `elapsedMin < 0` and reads as always-alive on
   the new arm (no live occurrence measured); the reconcile call doesn't pass its own `burstCap`
   override (inherits `sms-outbound-worker.js`'s default rather than this file's own
   `MAX_HOSTS_PAGED_PER_RUN`-style explicit bound); this doc's own risk-#1 comment about
   `claude_sessions` anon RLS was measured LIVE during this SD and found to be **stale** — anon
   currently has no INSERT policy on that table (service-role-write-only, matching
   `sms_outbound_obligations`) — the caps described in risk #1 remain valid defense-in-depth but
   the threat model text should be corrected in a follow-up; `system_events`/
   `sms_outbound_obligations` carry broad anon/authenticated write GRANTs with RLS as the sole
   barrier (`relforcerowsecurity=false`) — a separate hygiene item, not unique to this SD.

## Related

- Retrospective: `retrospectives` id `55e8ca75-2377-4c64-a5a6-3ea22276f270` (SD_COMPLETION,
  SD-LEO-INFRA-FLEET-DOWN-ALERT-001) — full narrative of the three rounds of premise correction,
  mutation-tested EXEC findings, and the deep-tier `/ship` security findings.
- Retrospective: `retrospectives` id `5ef94237-5108-4306-952e-91b4203e0981` (SD_COMPLETION,
  SD-LEO-INFRA-OFF-HOST-FLEET-001) — the off-host `fleet-liveness-pager` arm, the F1
  delivered-vs-transitioned finding, and the SEC-L1–L7 security findings.
- `docs/protocol/fleet-coordinator-and-worker-behavior.md` — general fleet liveness/coordination
  behavior this alert system consumes.
