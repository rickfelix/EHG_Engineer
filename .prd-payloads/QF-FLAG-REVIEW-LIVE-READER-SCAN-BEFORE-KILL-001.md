# Flag-governance review — require a live-reader scan before any KILL recommendation

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator-witnessed 2026-07-17 (cross-party ping, verify-before-kill catch): the flag-governance-review digest recommends `disabled-aging → KILL` WITHOUT a live-reader grep, so it flagged LOAD-BEARING off-flags as dead — COORD_DETECTORS_V2 and SURFACE_INERT_WORKER_V1 both had live readers gating reachable behavior in the running sweep (Charlie live-grepped; the kill QF was cancelled on the verify gate). Root rule: **an OFF flag with a live reader is LOAD-BEARING, not dead** — off may be the deliberate mode (controlled-mode-durable-signal class).

## Functional Requirements
### FR-1: Live-reader scan in the digest
Before the flag-governance review emits a KILL recommendation for any flag, it runs a repo-wide reader/consumer scan (grep for the flag name across lib/scripts/server/.github); a flag with >=1 live read site is classified LOAD-BEARING (recommendation: keep, or 'retire-with-code-change' listing the read sites) — never bare KILL.
### FR-2: Evidence in the recommendation
Each KILL recommendation carries its scan evidence (0 read sites found + the scan scope) so a reviewer can verify; each LOAD-BEARING verdict lists the read sites.
### FR-3: Test
Fixture flag with a live reader → LOAD-BEARING (no KILL); fixture flag with zero readers → KILL eligible with evidence attached.

## Success Metrics
- metric: KILL recommendations for flags with live readers; target: 0
- metric: KILL recommendations carrying scan evidence; target: 100%

## Smoke Test Steps
1. instruction: Run the review against COORD_DETECTORS_V2 (live readers exist); expected_outcome: LOAD-BEARING with read-site list, not KILL.
2. instruction: Run against a genuinely reader-less fixture flag; expected_outcome: KILL eligible, evidence attached.

## Sizing / Notes
Tier 1-2 QF. Coordinator-recommended (its verify-before-kill judgment-gate caught the false positive live; this pushes the check upstream into the digest so bad recommendations aren't emitted at all). Relates the never-assert-absence-from-partial-search + controlled-mode-durable-signal doctrines. SOURCE-AND-GO.
