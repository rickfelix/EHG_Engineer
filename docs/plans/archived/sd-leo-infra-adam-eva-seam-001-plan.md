<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_adam2_evaseam.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-EVA-SEAM-001 -->
<!-- Archived at: 2026-06-09T19:42:45.405Z -->

# Adam<->EVA seam: drain the 516 pending recommendations + patch EVA's OKR-drift blind spot

## Type
infrastructure

## Priority
high

## Objective
Make Adam the missing human-in-the-loop CRITIC of EVA's existing opportunity engine — triage the 516 stuck `eva_consultant_recommendations` and patch EVA's stubbed OKR-drift detection — read+score+advise only, NEVER acceptance.

## Scope
- Read `eva_consultant_recommendations` (517 rows, 516 stuck pending because no reviewer drives them to a decision), domain-filtered to the current scope via `application_domain` (ehg_engineer/gate_calibration/retrospective_mining -> harness; ehg_app -> platform; new_venture -> venture). Triage via the existing `recommendation-feedback.mjs` list path; rank via `lib/eva/okr-priority-integrator.js`; DOWN-RANK retrospective_mining/PAT-* process noise unless it ties to an active objective.
- Patch EVA's OKR-drift blind spot: `analyzeOKRDrift()` (scripts/eva/consultant-analysis-round.mjs:~314) queries a non-existent `okr_key_results` table and returns [] — Adam runs OKR-drift over the real `key_results` + `sd_key_result_alignment` instead.
- Optionally CO-RUN `consultantAnalysisHandler` to supply EVA's missing pulse (EVA's scheduler is stale — the SAME daemon `SD-LEO-INFRA-REVIVE-EVA-MASTER-001` revives; Adam co-runs as INTERIM and flags the staleness; once that SD lands EVA self-drives).
- HARD BOUNDARY (live AEGIS rule): Adam NEVER sets `eva_consultant_recommendations.status=accepted`, NEVER runs `auto-sd-generator` (CONST-002 proposer != approver). Surfaced recs become advisory PROPOSALS (graduate-this-rec, or a DRAFT-SD candidate); the coordinator/chairman decides.

## Acceptance Criteria
- Adam triages the 516 pending recs into a high-signal, scope-filtered shortlist.
- OKR-drift detection runs over real `key_results`/`sd_key_result_alignment` (EVA's stub bypassed).
- Adam never flips status=accepted and never invokes auto-sd-generator.

## Success Metrics
- The 516-pending queue is actively triaged (no longer ignored).
- OKR-drift findings cite live KR rows.

## Rationale
EVA already GENERATES opportunities (517 recs) but has no reviewer; Adam becomes the critic/consumer — pure reuse, no new tables, no new idea-generator. Depends on the scan-core SD. EHG_Engineer. See the proactive-Adam design.
