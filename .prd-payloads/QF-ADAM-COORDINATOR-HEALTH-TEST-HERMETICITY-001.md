# adam-coordinator-health tests — hermeticity fix (no live-state dependence)

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #4 candidate 2026-07-17: the adam-coordinator-health test suite is not hermetic — it depends on live DB/session state, so it passes or fails based on ambient fleet conditions rather than the code under test. Flaky, environment-coupled tests erode trust in the oversight-loop's own gate.

## Functional Requirements
### FR-1: Identify the non-hermetic seams
Find where the adam-coordinator-health tests read live state (real session_coordination rows, live claude_sessions, wall-clock, real gauges) instead of fixtures/mocks. Enumerate each ambient dependency.
### FR-2: Make the suite hermetic
Inject fixtures/mocks for every external dependency (DB rows, session state, time) so the suite asserts on the health-computation logic deterministically, independent of the live fleet. Fixed inputs → fixed verdict.
### FR-3: Guard against regression
Add a marker/pattern (or CI isolation) so a future test in this suite can't silently reintroduce a live-state read.

## Success Metrics
- metric: pass/fail dependence on ambient fleet state; target: 0 (deterministic)
- metric: flaky runs across identical code; target: 0

## Smoke Test Steps
1. instruction: Run the suite twice under different live-fleet conditions; expected_outcome: identical results (hermetic).
2. instruction: Run with the DB unreachable; expected_outcome: suite still runs and asserts on logic (mocked), not an infra error.

## Sizing / Notes
Tier 1-2 QF. SOURCE-AND-GO. Coordinator-requested belt-fill; strengthens the oversight loop's own test integrity (relates the mocked-seam-hides-precondition caution — mock for hermeticity but don't mock away a real precondition the code needs). Verify not-dup at materialization.
