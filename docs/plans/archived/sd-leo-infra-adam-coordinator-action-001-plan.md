<!-- Archived from: scripts/one-off/_plan-comms.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001 -->
<!-- Archived at: 2026-06-07T18:07:19.648Z -->

# Adam->coordinator action-requiring handoffs are read but not actioned in the coordinator's passive/cron-only state (read_at != ack) — extend the DELIVERED two-stage ACK protocol to the Adam->coordinator direction + a wake/SLA path

## Type
infrastructure

## Priority
medium

## Summary
During a chairman-directed Adam<->coordinator<->fleet comms test (2026-06-07), an Adam->coordinator PROGRAM handoff (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001, requesting promote-to-orchestrator + decompose into 3 children) was delivered as a session_coordination row and had read_at set within ~1 min; a follow-up ACK-nudge was read within ~2 min. Yet the coordinator — alive (claude_sessions.heartbeat_at = 0m) — took ZERO action (program still status=draft/type=feature, 0 children) and sent ZERO messages for 20+ min. The same coordinator had responded substantively to Adam ~30-60 min earlier, then dropped into a passive/cron-only monitoring state. ROOT CAUSE (evidence-backed hypothesis): the coordinator's monitoring cron sweeps + marks the inbox read (and heartbeats) but does not cognitively process / action an action-requiring Adam handoff while the coordinator agent is not in an active work cycle. Two seams: (1) read_at is set by automated sweep -> it is NOT a reliable ACK; (2) a passive session_coordination row does not WAKE a parked coordinator into an active cycle to action the handoff.

## Why this is an extension, not a dup
SD-LEO-INFRA-COORDINATOR-WORKER-DELIVERED-001 already shipped a "Hybrid Two-Stage ACK Protocol" — but for the coordinator<->WORKER direction. It does NOT cover Adam->coordinator handoffs, and does not address the parked/cron-only-state "read but not actioned" failure. This SD extends that DELIVERED ACK layer to the Adam->coordinator direction and adds a passive-state action/wake/SLA path.

## Evidence
- SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001: status=draft, sd_type=feature, 0 children, 20+ min after handoff.
- Handoff read ~1 min after send; ACK-nudge read ~2 min after send (both session_coordination).
- Coordinator (is_coordinator=true) heartbeat_at=0m (alive), but 0 messages sent in 15m.
- Contrast: same coordinator actioned Adam's canary corrections / labor-split / stop-the-bleed earlier the same session -> it CAN action Adam messages, only while in an active cycle.

## Impact
Adam (producer/sourcer, non-fleet) cannot reliably hand action-requiring work (orchestrator decomposition, dispatch requests, urgent findings) to a parked coordinator. Handoffs silently stall; chairman/Adam cannot distinguish "delivered+understood+queued" from "swept+ignored" because read_at conflates them. Mitigated only because draft SDs also flow through the normal sd:next queue (a worker/LEAD can pick them up) — but the coordinator-orchestration path is unreliable.

## Proposed approaches (PLAN to choose / combine)
1. Extend the DELIVERED two-stage ACK protocol (SD-LEO-INFRA-COORDINATOR-WORKER-DELIVERED-001) to Adam->coordinator action-requiring messages: a structured ACK (ack + accept/adjust + ETA) distinct from read_at; read_at demoted to "delivered" only.
2. Coordinator monitoring-cron ACTIONS (not just reads) action-requiring Adam handoffs: enqueue as real work / wake an active cycle on a WORK_ASSIGNMENT carrying a decompose/dispatch request.
3. Wake/SLA path: action-requiring Adam handoffs emit a wake signal (relates to FLEET-WAKE-UNDER-001 / coordinator-revive) and an SLA timer; on SLA breach the coordinator (or mechanism) must emit an explicit "deferred, ETA / escalated" instead of silence.

## Acceptance Criteria
- An action-requiring Adam->coordinator handoff receives a structured ACK (or is actioned) within a bounded SLA even when the coordinator is in a monitoring/cron-only state.
- read_at is no longer treated as ACK anywhere in the comms protocol; a distinct ack/accepted signal exists for Adam->coordinator.
- On inability to action within SLA, an explicit "deferred + ETA" or "escalated" is emitted — never silence.
- Reproduce the test scenario (hand a decompose request to a parked coordinator) and confirm it is acknowledged + actioned or explicitly deferred, not silently swept.

## Smoke Test Steps
- Send an action-requiring handoff to a coordinator in monitoring/cron-only state; assert an ACK or action (or explicit deferral) within the SLA, not a silent read.

## Success Metrics
- 0 silently-stalled action-requiring Adam->coordinator handoffs (all acked / actioned / explicitly-deferred).
- ack-signal distinct from read_at in the protocol.

## Linkage
Chairman-directed Adam<->coordinator<->fleet comms test 2026-06-07 (lesson #1); program SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001. Extends SD-LEO-INFRA-COORDINATOR-WORKER-DELIVERED-001 (Hybrid Two-Stage ACK). Related: coordinator session-tick-death (intermittent heartbeat) harness bug; SD-LEO-INFRA-FLEET-WAKE-UNDER-001; SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 (/signal); SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 (worker pull handshake — the worker-side analog).
