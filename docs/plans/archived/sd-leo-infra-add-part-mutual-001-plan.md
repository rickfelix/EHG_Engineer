<!-- Archived from: scripts/one-off/_plan-selfid.md -->
<!-- SD Key: SD-LEO-INFRA-ADD-PART-MUTUAL-001 -->
<!-- Archived at: 2026-06-07T20:43:07.175Z -->

# Add a 3-part mutual self-identification handshake to the fleet comms-check — role discovery must not depend solely on the is_coordinator DB flag

## Type
infrastructure

## Priority
medium

## Summary
The fleet comms-check discovers the coordinator via claude_sessions.metadata.is_coordinator. After a session restart (the 2026-06-07 Anthropic API issue cycled the coordinator + all 6 workers into fresh sessions), the NEW coordinator never set the flag, so it was undiscoverable by flag even though it was alive and operating — 0 coordinator-flagged sessions while a coordinator genuinely existed. Adam (the surviving advisory session) could not route to it. This adds a 3-part mutual self-identification handshake so identity is established conversationally, not by a flag a restarted session may never set.

## Evidence
2026-06-07 API restart: claude_sessions had 0 is_coordinator/role=coordinator sessions for an extended window while the chairman confirmed a coordinator existed. Adam recovered by broadcasting a self-ID handshake to active candidate sessions; the coordinator (b8b6fe71) then self-identified AND registered its flag.

## Scope (EHG_Engineer)
- Define a 3-part self-ID handshake over session_coordination: (1) INITIATOR declares identity (session_id + role); (2) RESPONDER self-identifies (role + session_id) and, if coordinator, REGISTERS (sets metadata.is_coordinator=true) — self-healing the discovery gap; (3) MUTUAL CONFIRM (each acknowledges the other verified).
- Wire it into the comms-check / coordinator startup ritual: on startup a coordinator self-registers AND announces; any session can issue a discovery handshake when the flag is empty.
- Demote flag-only discovery: when is_coordinator is empty, fall back to the handshake rather than concluding "no coordinator."

## Acceptance Criteria
- A session can discover + verify the coordinator (and the coordinator can verify a peer) via the handshake even when is_coordinator is unset.
- The handshake causes the coordinator to register its flag (closes the gap permanently for that session).
- Reproduce: clear all is_coordinator flags, run the handshake, confirm the coordinator is discovered + re-registers.

## Smoke Test Steps
- With 0 is_coordinator-flagged sessions but a live coordinator, issue the handshake and assert discovery + re-registration + mutual confirm.

## Success Metrics
- 0 "coordinator undiscoverable despite alive" windows after a restart.

## Linkage
Chairman-directed comms test 2026-06-07 (lesson #2). Sibling to SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001 (read!=ack two-stage ACK). Pairs with the survivor-agnostic recovery SD (lesson #3).
