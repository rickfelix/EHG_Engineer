# Solomon multi-part reply dedup — collapse split oracle replies into one logical answer

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #3 remainder 2026-07-17: when Solomon (the oracle) returns a reply split across multiple coordination rows (multi-part / continued answer), the consumer treats each part as a distinct reply — causing duplicate surfacing, partial-answer action, or an ack against one part while another goes unread. This degrades the Adam↔Solomon consult channel that the pre-send rubric and escalation path depend on.

## Functional Requirements
### FR-1: Ground-truth the split shape
Identify how a multi-part Solomon reply is represented (same correlation_id across rows? a part_index / continuation marker? sequential rows within a short window?). Confirm from live coordination rows before designing dedup — the join key must be the actual one, not assumed.
### FR-2: Reassemble by correlation, then dedup
On read, group oracle replies by correlation_id (and ordering key if present), concatenate parts in order into one logical reply, and surface/act on it once. A single-part reply is the trivial one-group case. Never ack part N while part N+1 is unread — ack the reassembled whole (guards the known premature-ack-hides-oracle-reply blindspot).
### FR-3: Test multi-part + single-part
Test: two rows sharing a correlation reassemble into one ordered reply surfaced once; a lone reply still surfaces once; out-of-order parts reorder correctly.

## Success Metrics
- metric: duplicate surfacing of one logical oracle reply; target: 0
- metric: partial-answer actions taken on an incomplete reply; target: 0

## Smoke Test Steps
1. instruction: Emit a 2-part Solomon reply (shared correlation) and run the consumer; expected_outcome: one reassembled reply surfaced once, acked as a whole.
2. instruction: Emit a single-part reply; expected_outcome: surfaced once, unchanged behavior.

## Sizing / Notes
Tier 2. SOURCE-AND-GO. Comms-integrity on the oracle lane (relates the never-courtesy-ACK-on-correlation_id constraint + solomon-consult dedup-hazard). Wave-1 foundation. No security/schema keywords.
