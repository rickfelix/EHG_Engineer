# Handoff State Machines (SD + PRD)

**Source**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 6
**Scope**: Canonical state transitions for Strategic Directives and Product Requirements Documents during the LEO handoff pipeline.

This document exists because two classes of handoff failures traced to state machine invariants that were enforced by separate code paths that disagreed with each other:

- **PAT-HF-PLANTOEXEC-eaccd2b3**: `prerequisite-preflight.js` and `PlanToExecVerifier.js` had different allow-lists for PRD status at PLAN-TO-EXEC. Parent orchestrators saw "in_progress" accepted by one and rejected by the other.
- **PAT-HF-LEADFINALAPPROVAL-d94c34d8**: `plan-to-lead/state-transitions.js` updated SD.status to `pending_approval`, but the update was non-blocking. Silent failures left SDs in `draft`, and `lead-final-approval/index.js` reported a misleading "wrong status" error instead of the real cause.

The diagrams below are the **canonical** description of what each state means and which transitions are valid. Any code path that enforces PRD or SD status must be consistent with this document.

## SD status state machine

```
                              ┌────────────────┐
                              │    DRAFT       │  ← initial (LEAD creates SD)
                              └───────┬────────┘
                                      │ LEAD-TO-PLAN
                                      ▼
                              ┌────────────────┐
                              │   IN_PROGRESS  │  ← PLAN + EXEC phases live here
                              └───────┬────────┘
                                      │ PLAN-TO-LEAD
                                      ▼
                              ┌────────────────┐
                              │ PENDING_APPROVAL│  ← awaiting LEAD-FINAL-APPROVAL
                              └───────┬────────┘
                                      │ LEAD-FINAL-APPROVAL
                                      ▼
                              ┌────────────────┐
                              │   COMPLETED    │  ← terminal
                              └────────────────┘

Side transitions:
  * → CANCELLED       (LEAD can cancel at any point; terminal)
  DRAFT → DRAFT       (idempotent re-approval of strategic content)
  COMPLETED → COMPLETED (idempotent re-approval after merge)
```

**Invariants:**
- `pending_approval` is the ONLY status that satisfies LEAD-FINAL-APPROVAL setup (`lead-final-approval/index.js:218-220`)
- The `in_progress → pending_approval` transition happens in `plan-to-lead/state-transitions.js:449-466` and is blocking (throws on DB error or empty-result — see SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 2)
- When LEAD-FINAL-APPROVAL is invoked on a draft SD whose PLAN-TO-LEAD handoff is already recorded, the diagnostic distinguishes "silent pre-fix failure" from "missing handoff" (Phase 2 of the same SD)

## PRD status state machine

```
                              ┌────────────────┐
                              │     DRAFT      │  ← initial (PLAN creates PRD)
                              └───────┬────────┘
                                      │ PLAN approves
                                      ▼
                              ┌────────────────┐
                              │    APPROVED    │  ← ready for PLAN-TO-EXEC
                              └───────┬────────┘
                                      │ PLAN-TO-EXEC begins
                                      ▼
                              ┌────────────────┐
                              │   IN_PROGRESS  │  ← EXEC phase active
                              └───────┬────────┘
                                      │ PLAN-TO-LEAD verification
                                      ▼
                              ┌────────────────┐
                              │   COMPLETED    │  ← terminal
                              └────────────────┘

Optional intermediate status:
  APPROVED → READY_FOR_EXEC → IN_PROGRESS
  (used by a subset of flows; equivalent for gate purposes)
```

**Allow-lists enforced at PLAN-TO-EXEC:**

| Caller | Non-parent allow-list | Parent-orchestrator allow-list |
|---|---|---|
| `prerequisite-preflight.js:268` | `[approved, ready_for_exec, in_progress]` | (same — no parent branch) |
| `PlanToExecVerifier.js:319-321` | `[approved, ready_for_exec, in_progress]` | `[approved, ready_for_exec, planning, draft, in_progress]` |

The parent-orchestrator list is a superset of the non-parent list — parent re-entry scenarios are explicitly allowed. This alignment was established in SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 1.

## Related fixes (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126)

| Phase | Pattern | Change |
|---|---|---|
| 1 | PAT-HF-PLANTOEXEC-eaccd2b3 | Parent-orch allow-list now includes `in_progress` |
| 2 | PAT-HF-LEADFINALAPPROVAL-d94c34d8 | PLAN-TO-LEAD status UPDATE throws on failure; LEAD-FINAL-APPROVAL has silent-failure diagnostic |
| 3 | PAT-HF-PLANTOEXEC-4c03f832 | `buildDefaultImplementationApproach` emits ≥3 phases; `basicPRDValidation` warns on thin content |
| 4 | PAT-RETRO/HF-EXECTOPLAN-0bda95fe | `resolveOwnSession` surfaces demoted terminal_id matches with remediation guidance |
| 5 | PAT-RETRO/HF-EXECTOPLAN-0bda95fe (residual) | `BaseExecutor` retries `assertValidClaim` once after 250ms on `no_deterministic_identity` |

## When to update this document

Update the diagrams if:
- A new PRD status value is introduced (e.g., `pending_exec`, `rejected`)
- A new SD status transition is added (e.g., `in_progress → blocked`)
- A handoff gate changes its allow-list

The allow-list table above should be kept in sync with the constants in the two referenced files. A regression test at `tests/unit/handoff/plan-to-exec-verifier-parent-status.test.js` guards the alignment.
