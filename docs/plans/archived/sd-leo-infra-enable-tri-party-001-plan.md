<!-- Archived from: .worktrees/SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001/.followups/enable-tri-party-cadence-live.md -->
<!-- SD Key: SD-LEO-INFRA-ENABLE-TRI-PARTY-001 -->
<!-- Archived at: 2026-06-09T23:01:10.061Z -->

# Enable the tri-party review cadence live (flip the flags ON) — sequenced LAST

## Type
infrastructure

## Priority
medium

## Summary
Flip the tri-party review cadence flags ON and turn on the verify-step enforcement, AFTER the enforcement primitive (shipped: SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001) and the Adam writer child land. This is the only true LIVE multi-session behavior change (review noise + feedback-table write saturation against ~5 parallel worker sessions + coordinator + Adam), so it is isolated to a small, reversible, observable change.

## Scope
- Enable ADAM_SELF_SCORE_CADENCE, COORD_REVIEW_EVERY, and TRI_PARTY_VERIFY_V1 with CONSERVATIVELY tuned N, via the leo_feature_flags governance lifecycle (transition to enabled) so they cannot be silently turned off.
- If runtime must read the registry (not just process.env), add the registry-read shim; decide process.env vs registry semantics (cross-session consistency).
- Observe one baseline cycle with the verify enforcement printing before relying on it.

## Success Metrics
- The cadence reviews fire automatically on schedule with the verify-step enforcement active and conservatively tuned N.
- The flags are enrolled/enabled through the governance lifecycle, not a raw env toggle.

## Risks
- Review noise if N too low; feedback-table write saturation. Mitigation: conservative N, silence-by-default on no-change cycles, stagger crons. Reversible (flag flip).
