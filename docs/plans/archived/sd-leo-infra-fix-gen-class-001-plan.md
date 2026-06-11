<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/vision-gate-gen-class.md -->
<!-- SD Key: SD-LEO-INFRA-FIX-GEN-CLASS-001 -->
<!-- Archived at: 2026-06-08T21:00:31.824Z -->

# Fix GEN-class vision-gate gap — auto-generated SDs get no vision score and hard-block at LEAD-TO-PLAN

## Type
infrastructure

## Priority
high

## Summary
SD-LEO-GEN-* auto-generated SDs (security, governance, infra GEN-class) ship with EMPTY strategic_intent + business_value, so the EVA vision scorer never writes an eva_vision_scores row for them. GATE_VISION_SCORE then hard-blocks LEAD-TO-PLAN at scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js:452 (visionScore===null -> verdict blocked_no_score). Even when a score exists, sd_type=security sits in the top SD_TYPE_THRESHOLDS tier (feature/governance/security=90) and empty content yields ~0 dimensions / no dynamic narrowing -> blocked_below_threshold at L546. So GEN-class SDs are doomed on BOTH paths. This is a GENERATOR-class systemic gap, not a per-SD problem.

## Strategic Intent
Protect the LEO automation contract: a strategic directive the system itself generated (from a security linter finding, a governance gap, or an RCA) must be able to flow through the same LEAD-TO-PLAN pipeline as a hand-authored SD, without a human manually enriching it to satisfy a gate. Every GEN-class SD that stalls at the vision gate is friction that erodes trust in autonomous sourcing and forces a worker to hand-hold machine-generated work. Closing this keeps the source-to-execution path frictionless for the growing share of SDs the harness sources for itself — directly serving the "improve the venture-management process" focus.

## Business Value
Removes a recurring, fleet-wide stall: ~10 of the most recent SD-LEO-GEN-* security SDs hit this wall, each costing multiple LEAD-TO-PLAN rejections + manual worker enrichment before they can advance (SD-LEO-GEN-ENABLE-RLS-SERVICE-001 took 2 rejections this session; DISABLE-PUBLIC-SIGNUP-001 and PIN-SEARCH-PATH-001 are queued to hit the same wall). Fixing it at the generator level reclaims that worker time across every future auto-sourced SD and prevents the silent-stall class entirely, improving sourcing throughput and the reliability of the autonomous belt.

## Root Cause
Writer/consumer asymmetry (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001): the SD generator writes no strategic_intent/business_value, but the vision scorer (writer) only scores SDs with content, and GATE_VISION_SCORE (consumer) hard-fails on a null score. The no-score hard block originated in SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001; the scorer graceful path was fixed by SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 (CAPA-2) but the GATE no-score path was NOT, and the narrow carve-out SD-FDBK-INFRA-GATE-VISION-SCORE-001 only covers feature/governance/enhancement SDs that ALREADY have a score — not the no-score case and not security GEN-class.

## Success Criteria
- A newly auto-generated SD-LEO-GEN-* (security/governance/infra) reaches LEAD-TO-PLAN with a non-null eva_vision_scores row and passes GATE_VISION_SCORE without manual enrichment.
- Zero blocked_no_score verdicts for GEN-class SDs after the fix (measured against the ~10 recent SD-LEO-GEN-* that previously stalled).
- No use of --bypass-validation; the fix addresses the score/gate path, not a bypass.
- A regression test: a GEN-class SD created via the standard generator path is scorable and gate-passing.

## Success Metrics
- GEN-class LEAD-TO-PLAN no-score rejections: from ~2 per security SD to 0 (target 0).
- Manual worker enrichment events for GEN-class SDs: from current (every GEN security SD) to 0.

## Scope
Evaluate and implement ONE of these (rank in the PRD; coordinator lean = Option B):
- (A) sd_type policy exemption for GEN-class standalone security/governance/infra SDs that lack a venture vision — precedent SD-LEO-INFRA-VISION-GATE-BUGFIX-EXEMPTION-001 (disabled the gate for bugfix type).
- (B) SCORE-BOOTSTRAP AT CREATION (recommended, cleanest): call scoreSDAtConception() in scripts/leo-create-sd.js so an eva_vision_scores row ALWAYS exists at creation — precedent SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-F (did exactly this for the /learn path). Fixes the no-score path at the source.
- (C) extend the narrow-feature carve-out SD-FDBK-INFRA-GATE-VISION-SCORE-001 to key on security/governance.
- Explicitly REJECT --bypass-validation band-aids in the rationale.

## Related (deduped — none cover the GEN-class no-score case)
- SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001 (origin of the no-score hard block).
- SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 (fixed the SCORER graceful path, not the GATE no-score path).
- SD-FDBK-INFRA-GATE-VISION-SCORE-001 (narrow carve-out for feature/governance/enhancement WITH a score; not no-score, not security).
- SD-LEO-INFRA-VISION-GATE-BUGFIX-EXEMPTION-001 (bugfix-type exemption precedent for Option A).
- SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-F (score-bootstrap-at-creation precedent for Option B).

## Notes
- Source: coordinator authoring task (operator-greenlit), workflow wf_41d2f710 + RCA. Adam-sourced 2026-06-08.
- This SD eats its own dogfood: it carries strategic_intent + business_value + success_metrics so it is itself scorable and will not stall at the gate it fixes.
