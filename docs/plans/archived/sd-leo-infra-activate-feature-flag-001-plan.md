<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/flag-governance-activation.md -->
<!-- SD Key: SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 -->
<!-- Archived at: 2026-06-08T14:28:29.325Z -->

# Activate feature-flag governance automation — scheduled graduate-or-kill review + enroll unmanaged env-var flags

## Type
infrastructure

## Priority
high

## Summary
The leo_feature_flags governance registry exists (built by SD-LEO-SELF-IMPROVE-001D Feature Flag Foundation + SD-LEO-SELF-IMPROVE-001K Feature Flag Governance) with lifecycle_state, expiry_at, last_reviewed_at, owner_type/owner_id, enablement_criteria, rolled_out_at, and a /flags CLI — purpose-built so feature flags cannot be silently forgotten. But the governance is INERT: nothing runs the periodic review. Live state 2026-06-08: all 12 registered flags have last_reviewed_at = NULL, 0 have expiry_at set, and 6 sit disabled with no review pressure. Worse, env-var feature flags read directly via process.env BYPASS the registry entirely — COORD_ADAM_REVIEW_V1 and COORD_REVIEW_EVERY (the switches for the tri-party coordinator review) were never enrolled, never reviewed, and as a direct result the Adam bidirectional review lane has never run (coordinator_adam_review has 0 rows ever). This SD makes the governance ACTIVE so a forgotten flag surfaces within one review cycle instead of indefinitely.

## Root Cause
Governance schema and CLI shipped, but the active automation that populates last_reviewed_at and forces a graduate-or-kill decision was never wired to a schedule. Separately, there is no enrollment gate forcing new process.env feature flags into leo_feature_flags, so flags born outside the registry are ungoverned and get forgotten (the COORD_ADAM_REVIEW_V1 case). Same defect class as the metadata.is_* orphan-flag work (SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001 and SD-LEO-INFRA-LINT-METADATA-ORPHAN-001), applied to runtime feature flags.

## Success Criteria
- A scheduled flag-governance review job runs on a cadence (cheap no-op when nothing is due) and on each run sets last_reviewed_at for reviewed flags.
- The review emits a STALE-FLAG digest to the coordinator/operator: flags never-reviewed, past expiry_at, disabled-but-aging, or enabled-but-never-rolled-out, each with a graduate / kill / extend recommendation.
- COORD_ADAM_REVIEW_V1 and COORD_REVIEW_EVERY are enrolled in leo_feature_flags with owner, enablement_criteria, and where temporary an expiry_at.
- A repo lint/CI check flags any new process.env feature-flag read not registered in leo_feature_flags (mirrors the metadata.is_* orphan detector), WARN first.
- Regression proof: a flag in the COORD_ADAM_REVIEW_V1 situation (registered, disabled, never reviewed) appears in the stale digest within one review cycle.

## Scope
- New scheduled governance-review script (reuse the work-triggered cheap-poller pattern of coordinator-self-review.mjs; tear down on idle) that scans leo_feature_flags, stamps last_reviewed_at, and produces the stale-flag digest.
- Enroll the orphan env-var feature flags (COORD_ADAM_REVIEW_V1, COORD_REVIEW_EVERY) and audit the codebase for other ungoverned process.env feature flags and enroll or justify each.
- CI lint: detect process.env feature-flag reads absent from the registry (WARN then enforce; baseline first).
- Wire /flags (or /flags stale) to surface the stale-flag report for humans.
- Update the feature-flag section of CLAUDE.md / governance doc to state env-var feature flags MUST be registered (close the bypass).

## Notes
- Default the new review job behind its OWN registered flag (the governance job is itself governed) but give that flag an expiry so it cannot become the next forgotten switch.
- This SD is the force-multiplier the sibling review-cron SD depends on: enrolling and enabling COORD_ADAM_REVIEW_V1 belongs HERE (registry-managed), not as a raw .env edit.
- Keep the review cadence work/volume-aware, not pure wall-clock, consistent with the coordinator-review cadence decision (operator 2026-06-06).
