# Bake the chairman-SMS staging watch into adam-quiet-tick core (code, not prompt)

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Resilience layer 2 for the chairman SMS channel (chairman-directed 2026-07-17: "How can we make it resilient?"). Today the inbound watch (checking `sms_relay_staging` for undrained chairman texts) lives only in Adam's session wakeup-prompt chain — instructions, not code — so a prompt drift or session succession can silently drop the duty even though the contract now mandates it. Bake it into `scripts/adam-quiet-tick.mjs` as a CORE (like inbox-monitor): every tick, any Adam session, no prompt dependence.

## Functional Requirements
### FR-1: chairman-sms core in the tick
Add a tick core that queries `sms_relay_staging` for rows where `from_phone` = the chairman's configured number (env/config, not hardcoded) AND `drained_at IS NULL`. On hit, emit a flagged line `QUIET_TICK_CHAIRMAN_SMS=<id> body_preview=<first 40 chars>` so the session driving the tick acts on it (compose + send the reply per the contract duty). Include the core in the tick's `cores=[...]` health summary (fail = loud, never a false zero — the inbox-monitor false-zero lesson).
### FR-2: Optional auto-drain nudge
When undrained chairman rows exist and are older than ~2 min, the core triggers the drain workflow (`gh workflow run sms-relay-drain-cron.yml`) fail-soft, so decision-replies also resolve without waiting for GHA cron lag.
### FR-3: Test
Unit: seeded undrained chairman row → flagged line emitted + core=ok; no rows → silent; query failure → core=fail (loud), never inbox=0-style false zero.

## Success Metrics
- metric: chairman texts surfaced by ANY Adam session running the tick; target: 100% (no prompt dependence)
- metric: watch failure reading as "no messages"; target: 0 (loud core fail)

## Smoke Test Steps
1. instruction: Seed an undrained staging row from the chairman number and run the tick; expected_outcome: QUIET_TICK_CHAIRMAN_SMS line + cores healthy.
2. instruction: Run with staging unreachable; expected_outcome: cores=[chairman-sms:fail], not a silent zero.

## Sizing / Notes
Tier 1-2 QF (~40 LOC in the tick + test). Pairs with the contract duty (leo_protocol_sections id=601, landed 2026-07-17) and the durable routing QF-WIRE-SMS-QUESTION-INTO-NOTIFICATION-PATH-001 (layer 3 — removes Adam's session from the critical path entirely). SOURCE-AND-GO.
