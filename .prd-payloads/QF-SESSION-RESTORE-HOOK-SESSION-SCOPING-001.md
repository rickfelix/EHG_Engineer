# Session-restore hook — session-scoping fix

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #4 candidate 2026-07-17: the session-restore hook is not correctly session-scoped — restore logic keys on something broader (or narrower) than the specific session, so a restore can apply the wrong session's state or leak across concurrent sessions. Belt-fill, foundation reliability.

## Functional Requirements
### FR-1: Ground-truth the scoping bug
Identify the session-restore hook and the key it uses to select what to restore. Confirm the exact mis-scope (global vs per-session, or id-vs-session_id duality — the known claude_sessions id/session_id trap is a candidate) against a reproduction before editing.
### FR-2: Scope restore to the exact session
Key restore on the correct session identifier so a restore applies ONLY the invoking session's saved state; concurrent sessions never cross-restore. Respect the id-vs-session_id distinction where it applies.
### FR-3: Test
Test: two simulated sessions with distinct saved state each restore only their own; no cross-application.

## Success Metrics
- metric: cross-session restore incidents; target: 0
- metric: correct-session restore fidelity; target: 100%

## Smoke Test Steps
1. instruction: Simulate two sessions with different saved state, trigger restore on each; expected_outcome: each restores only its own state.

## Sizing / Notes
Tier 1-2 QF. SOURCE-AND-GO. Coordinator-requested belt-fill (idle workers). Relates the claude_sessions id-vs-session_id duality trap. Verify not-dup at materialization.
