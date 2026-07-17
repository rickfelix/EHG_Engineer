# Wire drainSmsRelayStaging() to a scheduled production runner — the missing cutover wire

## Type
feature

## Target Repos
EHG_Engineer

## Summary
Adam ground-truth 2026-07-17 (chairman "address the Twilio configuration"): the SMS two-way bridge has an **orphaned integration wire** between two SDs. The completed relay SD (SD-LEO-FEAT-SMS-INBOUND-RELAY-001) built the untrusted relay that writes candidate replies into `sms_relay_staging`. The resolver SD (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001, pending_approval) delivered the drain FUNCTION `drainSmsRelayStaging()` in `lib/chairman/sms-bridge.js` — but **nothing in production ever calls it**. Verified via `git grep 'drainSmsRelayStaging('` against origin/main: the ONLY call sites are `tests/unit/chairman/sms-bridge.test.js` (2) and a migration comment. There is no cron, no server interval, no loop.

Consequence: after the Twilio webhook is cut over to `hooks.execholdings.ai` (runbook step 9), inbound chairman SMS replies land in `sms_relay_staging` and are **never drained into `chairman_decisions`** — the bridge silently stops resolving replies. Every component is built and unit-tested in isolation; the production invocation edge is missing from BOTH SDs' scope AND from `docs/runbooks/sms-bridge-chairman-checklist.md` (steps 6-9 never schedule the drain). This is a reachability gap, not a logic bug — the classic "registered verifier never dispatched" family.

This QF adds the one missing wire so cutover produces a working bridge.

## Functional Requirements
### FR-1: Scheduled drain runner
Add a durable, service-role-authenticated runner that calls `drainSmsRelayStaging(supabase, { limit })` on a fixed interval (default 30s; env-tunable `SMS_RELAY_DRAIN_INTERVAL_MS`). Home it where the existing EHG_Engineer server-side background work lives (a server interval in `server/index.js` alongside other loops, OR a `scripts/` runner armed by the same scheduler that runs sibling drains — match the existing pattern, do NOT invent a new scheduler). The runner uses a service-role client (drain reads `sms_relay_staging` and writes `chairman_decisions` — it is the TRUSTED side, unlike the relay).
### FR-2: Gated on cutover flag, fail-soft
The runner is a no-op until inbound relay traffic is expected — gate it on the same `SMS_RELAY_CUTOVER_COMPLETE` signal (or a dedicated `SMS_RELAY_DRAIN_ENABLED`) so it stays inert pre-cutover. Fail-soft by construction (the function already degrades to "nothing to drain" on a missing table per the schema-allowlist note); a drain error logs and retries next tick, never crashes the host process.
### FR-3: Observability
One structured log line per non-empty drain pass (count drained + per-row outcome tally: answered / no_match / ambiguous / suspended). No SMS body text in logs (mirror the relay's logging discipline). Surface a simple "staged rows undrained > N for > M minutes" condition for the coordinator/Adam health path (backlog signal that the drain has stalled).
### FR-4: Runbook + test
Add the drain-enable step to `docs/runbooks/sms-bridge-chairman-checklist.md` between steps 8 and 9 (drain must be live BEFORE the webhook flip). Add a test asserting the runner invokes `drainSmsRelayStaging` on tick and honors the enable gate.

## Success Metrics
- metric: staged rows resolved after cutover; target: 100% drained within one interval
- metric: undrained-staging backlog under steady state; target: ~0
- metric: host-process crashes from a drain error; target: 0 (fail-soft)

## Smoke Test Steps
1. instruction: With the drain enabled, insert a staging row via the RPC path and wait one interval; expected_outcome: the row's `drained_at` is set and a `chairman_decisions` resolution (or a logged no_match) is produced.
2. instruction: With the enable gate OFF, insert a staging row and wait two intervals; expected_outcome: row remains undrained (runner inert pre-cutover).

## Sizing / Notes
Tier 2 QF (~30-60 LOC + test + runbook line). NO security keywords in the fix itself (the trusted resolver + RLS already shipped and were security-reviewed); this only SCHEDULES an existing, tested function. SEQUENCING: this MUST land and be enabled before the Twilio webhook cutover (runbook step 9) — flag to the coordinator so it is not sequenced after cutover. Blocks the live activation of SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 (the chairman decision bridge). Not a dispatch-mechanism SD; SOURCE-AND-GO with a coordinator sequencing note.
