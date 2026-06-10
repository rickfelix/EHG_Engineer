<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_adam4_enable.md -->
<!-- SD Key: SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001 -->
<!-- Archived at: 2026-06-09T19:42:47.965Z -->

# Enable the Adam governance heartbeat (flip the flag on Adam's existing tick)

## Type
infrastructure

## Priority
medium

## Objective
Turn the read-only, fully-built proactive loop live — flip `ADAM_GOVERNANCE_HEARTBEAT_V1=on` so the scan runs automatically on Adam's EXISTING inbox-monitor cron / parked-tick (no new scheduler).

## Scope
- Add the `adam-opportunity-scan --scan` call as the body of Adam's existing recurring tick when `ADAM_GOVERNANCE_HEARTBEAT_V1=on`. Default cadence: a DAILY deep strategy scan, with lighter board/SD-stall checks per tick. One scope per tick (weighted round-robin), global <=1-advisory cap.
- Verify live: surfaced->actioned ratio, <=1-advisory cap adherence, no flood of the advisory lane or chairman email; if noise rises the preference model + materiality bar self-correct, and the flag flips OFF to disable instantly.
- Do NOT add a new scheduler — ride Adam's existing tick.

## Acceptance Criteria
- The governance heartbeat runs on Adam's existing tick with the flag ON; one scope per tick; global cap adhered.
- Flag OFF fully disables the loop (inert).

## Success Metrics
- Adam proactively surfaces rationale-bearing advisories on a daily cadence within the cap, with most ticks silent.
- The chairman/coordinator can disable instantly via the flag.

## Rationale
Enablement is last and reversible — the whole loop ships dark behind the flag so a bad cycle is inert until enabled, and OFF disables instantly. Depends on scan-core + EVA-seam + learn-surface. EHG_Engineer. See the proactive-Adam design.
