<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_adam0_contract.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-GOVERNANCE-HEARTBEAT-001 -->
<!-- Archived at: 2026-06-09T19:42:43.757Z -->

# Adam governance-heartbeat contract: reconcile rubric + author the proactive multi-scope clause

## Type
infrastructure

## Priority
high

## Objective
Reconcile Adam's self-assessment rubric drift and author the proactive "governance heartbeat" multi-scope clause into the DB-sourced Adam contract, so the proactive loop is canonically defined BEFORE any code runs. No runtime behavior in this SD.

## Scope
- Reconcile `leo_protocol_sections` id=601 (section_type=adam_role_contract): the contract text says FIVE self-assessment dimensions but live `feedback` rows score EIGHT (D1_proactive_sourcing..D8_interface_clarity). Fix id=601 to the real 8-dim rubric and add a "surfaced->accepted/graduated ratio" signal under the proactive-sourcing dimension.
- Author a "Governance heartbeat (proactive multi-scope scan loop)" subsection into id=601: the SCOPE ROTATION (harness=EHG_Engineer / platform=EHG / per-venture, enumerated from applications+ventures); the fixed per-scope task block; the ADAM_OK silence-by-default branch; the per-idea rationale structure (opportunity / objective+KR advanced with delta / evidence row / rationale / risk+counterfactual / confidence); the dedup + CONST-002/CONST-010 self-check gate; the per-scope rationale anchoring INCLUDING the honest no-per-venture-OKR fallback (anchor to the venture's chairman-approved L2 vision + a live metric, flag the gap, never fabricate a KR); the GLOBAL <=1-advisory-per-tick cap; and the compounding/promotion rule (a pattern seen across >=2 ventures is promoted to ONE systemic platform/harness fix). The PROPOSE-not-execute envelope is unchanged.
- Regenerate `CLAUDE_ADAM.md` + `CLAUDE_ADAM_DIGEST.md` via `scripts/generate-claude-md-from-db.js` (never hand-edit generated files; CONST-005).

## Acceptance Criteria
- id=601 rubric matches the live 8-dimension rows.
- The governance-heartbeat multi-scope subsection is authored into id=601 and the generated CLAUDE_ADAM.md/_DIGEST reflect it.
- No runtime behavior change (contract-only).

## Success Metrics
- Self-assessment self-scores are consistent (no 5-vs-8 mismatch).
- The proactive loop is fully specified in the canonical DB contract before code lands.

## Rationale
Adam's contract is DB-generated (leo_protocol_sections id=601); the proactive multi-scope behavior must be canonically defined there first (CONST-005 database-first). The 5-vs-8 rubric drift must be fixed before the self-improvement grading is built on top of it. No dependencies. See docs/protocol/README.md (LEO Harness) and the proactive-Adam design.
