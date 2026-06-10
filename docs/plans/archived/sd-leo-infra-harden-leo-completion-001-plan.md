<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/fr-delivery-traceability.md -->
<!-- SD Key: SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001 -->
<!-- Archived at: 2026-06-08T14:29:11.705Z -->

# Harden LEO completion gates with FR/deliverable traceability — FR_DELIVERY_TRACEABILITY hard gate + approver-gated descope

## Type
infrastructure

## Priority
high

## Summary
RCA of SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A completing with FR-004/FR-005 silently undelivered (code-grounded by workflow wf_35db530e-488, drafted by Alpha session 61cd0b56). Completion gates verify worker-assertable PROXIES, not per-FR delivery: scope-completion-gate.js:416 passes when missing is at most floor(total*0.5) (up to 50 percent of deliverables absent) and reads the architecture plan via regex, never product_requirements_v2.functional_requirements. The gate is required:true but blocking:false, and blocking is VESTIGIAL (ValidationOrchestrator.validateGates:344 hard-fails only on gate.required not-equal false); its low score merely dilutes the averaged normalizedScore. Sub-agents are invoked with sdId only; phase-subagent-orchestrator never passes the PRD FR list, so they self-scope to discoverable user_stories/files (FR-004 had no user story at all so it was never examined). user_story.status is worker-set and trusted as proof. No normalized per-FR delivery record exists. Orchestrator CHILDREN take a reduced gate set (executors/exec-to-plan/index.js:246-267 = SCOPE_COMPLETION + Implementation Fidelity only, both proxy-based); 001-A is a child so it is the most exposed path. Cannot fold into the systemic cross-repo SD (that shipped) so this is standalone.

## Root Cause
Completion is certified from worker-assertable proxies (architecture-plan regex match, user_story.status, averaged gate scores) with no normalized per-FR delivery record and no hard 100-percent delivered-or-descoped gate; the orchestrator-child reduced gate set omits even the proxy that might have caught it.

## Success Criteria
- fr_delivery_status table (one row per FR per PRD; delivery_status pending/delivered/descoped/blocked; evidence XOR approver-gated descope) + v_fr_completion_summary view.
- FR_DELIVERY_TRACEABILITY hard gate at EXEC-TO-PLAN + LEAD-FINAL, required:true, passes only at 100 percent delivered-or-descoped, and MUST register in BOTH the orchestrator-CHILD reduced set AND the standalone set (else it misses exactly the SD class that failed).
- Approver-gated first-class descope (sd_scope_decisions); escalation forced at more than 2 FRs or more than 20 percent; approver must differ from the requesting session.
- PRD FR list is passed into sub-agent scope; an FR with no user story is still surfaced to TESTING; user_story.status is no longer the sole proof. MUST_HAVE FRs require sub-agent-sourced evidence, not self-asserted locators.
- WARN then enforce rollout behind LEO_FR_DELIVERY_GATE_MODE (default warn); baseline the would-fail rate before enforce.

## Scope
- Migration: fr_delivery_status + v_fr_completion_summary.
- New FR_DELIVERY_TRACEABILITY validator registered in BOTH gate sets.
- Approver-gated descope path (approver not-equal requesting session).
- Thread the PRD functional_requirements list through phase-subagent-orchestrator into sub-agent scope.
- LEO_FR_DELIVERY_GATE_MODE flag (default warn) — enroll it in leo_feature_flags per the flag-governance SD.

## Adversarial Caveats
- Would the gate have caught THIS instance? Only if registered in the CHILD path — single highest-risk implementation miss; verify registration there explicitly.
- Gaming hole: evidence is a LOCATOR not proof of implementation; require sub-agent-sourced evidence for MUST_HAVE FRs; LEAD should make that mandatory.
- Descope-as-bypass: the escalation threshold is evadable by descoping 2 per handoff or self-approval if oversight_approvals is not wired; the only hard control is approver not-equal session (depends on session-identity integrity, a known-fragile area).
