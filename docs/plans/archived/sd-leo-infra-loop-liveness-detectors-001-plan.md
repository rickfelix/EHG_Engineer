<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_sd_loop_detectors.md -->
<!-- SD Key: SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001 -->
<!-- Archived at: 2026-06-09T12:33:03.052Z -->

# Loop-liveness detectors: LOOP_EXPIRY_WARNING + STALLED_LOOP

## Type
infrastructure

## Priority
high

## Objective
Give the LEO Harness programmatic, read-only warning before two silent-failure modes take the supervisory layer dark: (a) a /loop session (worker or coordinator cron) hard-expires 7 days after creation, fires once more, then self-deletes with no warning; (b) a worker looks alive (fresh heartbeat) but is parked at a decision point with claimable work waiting, which the sweep never reaps.

## Scope
- Add a pure `detectLoopExpiry(data, opts)` to `lib/coordinator/detectors.cjs`, modeled on `detectDeployGap` (detectors.cjs:216-244, which already reads `claude_sessions.created_at`). Flag sessions whose `(now - created_at)` exceeds an env-tunable warn threshold (~6 days) AND `loop_state IN (active, awaiting_tick)`. Register in `runDetectors()` (detectors.cjs:252-268) at severity 'warning'. Surface as a new SRE gauge line in `coordinator-audit.mjs` near the LIVENESS block (:132-141; SRE gauge print :165-172). Evidence payload action: re-launch the session before expiry.
- Add a pure `detectStalledLoop(data)` to `detectors.cjs`: flag live sessions where `loop_state === 'active'` AND `sd_key` is null AND heartbeat is fresh AND `data.unclaimedItems > 0` (alive-but-parked-with-work). Return per-session evidence (session_id, loop_state, heartbeat_age) so the coordinator can re-paste the wake prompt into the exact window. Complements (does NOT duplicate) `detectStuckWorker` (claim-bound, skips no-claim sessions at detectors.cjs:132).
- Pure / read-only / fail-open. Do NOT overlap the in-flight SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001 (that BLOCKS a stall CAUSE — AskUserQuestion; this is detection/observability).

## Acceptance Criteria
- Both detectors registered in `runDetectors` and covered by unit tests (pure functions, no live DB).
- The coordinator audit prints both new gauges.
- Fail-open on any DB/parse error (never throws).
- No false-positive on parked `awaiting_tick` workers that carry a future-dated `expected_silence_until`.

## Success Metrics
- A session within ~24h of its 7-day expiry is flagged in the next audit cycle.
- A stalled (active + no-claim + claimable-work-present) session is named in the audit so the coordinator can re-paste.

## Rationale
Grep across the codebase for `7-day|expir|self-delet|604800|loop-expir` found ZERO /loop-lifetime handling (only branch-freshness, cache TTLs, audit windows). The 7-day hard-expiry is a verified Claude Code fact. The heartbeat-masks-a-stalled-loop failure is documented at `docs/protocol/fleet-coordinator-and-worker-behavior.md:128-130`. This directly addresses the chairman-flagged "whole supervisory layer can silently go dark" gap and is structurally un-addressed today. No overlap with the pending SDs.
