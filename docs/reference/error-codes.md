# Error Code Catalog

Comprehensive reference for all error codes, rejection reasons, and gate failures in the LEO Protocol system.

Source of truth: `scripts/modules/handoff/rejection-subagent-mapping.js` (36+ codes mapped to sub-agent remediations).

---

## Handoff System — LEAD-TO-PLAN Rejections

Emitted by `scripts/verify-l2p/index.js` when a Strategic Directive fails LEAD-to-PLAN verification.

| Code | Description | Severity | Resolution |
|------|-------------|----------|------------|
| `SD_INCOMPLETE` | SD completeness score below threshold (default 70%) | Blocking | Add business objectives (>=2), success metrics (>=3), constraints, and risk analysis. |
| `SD_STATUS` | SD status not in allowed list (`draft`, `lead_review`, `active`, `approved`) | Blocking | Finalize strategic direction and update SD status to `active`. |
| `FEASIBILITY` | Business impact or feasibility concerns detected | Blocking | Review timeline, add risk mitigation strategies, validate priority alignment. |
| `HANDOFF_INVALID` | Handoff document missing required LEO Protocol elements | Blocking | Include all 7 required elements per LEO Protocol v4.3.3. |
| `ENV_NOT_READY` | Development environment not ready for planning phase | Blocking | Check database connectivity, filesystem access, required directories. |
| `SYSTEM_ERROR` | Unexpected system error during verification | Blocking | Check logs, verify database connectivity, retry. |

---

## Handoff System — PLAN-TO-EXEC Rejections

Emitted by `scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js` and stored in `leo_handoff_rejections`.

| Code | Description | Severity | Resolution |
|------|-------------|----------|------------|
| `NO_PRD` | No PRD found for the SD in `product_requirements_v2` | Blocking | Create PRD using `node scripts/add-prd-to-database.js`. Set status to `approved`. |
| `PRD_QUALITY` | PRD quality score below minimum threshold | Blocking | Address validation errors: functional requirements, architecture, acceptance criteria, test scenarios. Run sub-agent: `general-purpose`. |
| `PRD_BOILERPLATE` | PRD contains placeholder or boilerplate content ("TBD", "To be defined") | Blocking | Replace all generic text with SD-specific requirements. Every requirement must be specific and measurable. |
| `PLAN_INCOMPLETE` | PRD status not in expected list (`approved`, `ready_for_exec`, `in_progress`) | Blocking | Complete PLAN phase activities and update PRD status to `approved`. |
| `NO_USER_STORIES` | No user stories found in `user_stories` table for this SD | Blocking | Generate user stories from PRD acceptance criteria. Run stories sub-agent. Minimum 1 story required. |
| `USER_STORIES_ERROR` | Database error querying `user_stories` table | Blocking | Check database connectivity, verify table existence and RLS policies. Run sub-agent: `rca-agent`. |
| `USER_STORY_QUALITY` | User story quality score below threshold | Blocking | Fix boilerplate acceptance criteria, use Given/When/Then format, replace generic roles with specific personas. |
| `HANDOFF_INVALID` | Handoff document does not meet LEO Protocol requirements | Blocking | Ensure all 7 elements present in handoff document. |
| `PLAN_PRESENTATION_INVALID` | `plan_presentation` missing or incomplete in handoff metadata | Blocking | Add `goal_summary` (<=300 chars), `file_scope`, `execution_plan`, and `testing_strategy`. |
| `WORKFLOW_REVIEW_FAILED` | Workflow validation detected dead ends, circular flows, or UX issues | Blocking | Run `node scripts/review-workflow.js <SD-ID>`. Fix dead ends, circular flows, error recovery gaps. Target UX score >= 6.0/10. Run sub-agent: `design-agent`. |
| `SYSTEM_ERROR` | Unexpected system error during verification | Blocking | Check logs and retry handoff verification. |

---

## Handoff System — EXEC-TO-PLAN Rejections

Emitted during EXEC completion verification. Codes from `scripts/_deprecated/unified-handoff-system.js` and the current executor pipeline.

| Code | Description | Severity | Resolution |
|------|-------------|----------|------------|
| `SUB_AGENT_VERIFICATION_FAILED` | Required sub-agents did not complete successfully | Blocking | Re-run failed sub-agents. Check sub-agent results in handoff metadata. |
| `EXEC_INCOMPLETE` | Implementation work not finished | Blocking | Complete all deliverables. Query: `SELECT * FROM sd_scope_deliverables WHERE completion_status != 'completed'`. |
| `DOCUMENTATION_MISSING` | Required documentation not generated | Blocking | Generate documentation for new features/APIs/architecture changes. |
| `E2E_COVERAGE_INSUFFICIENT` | E2E test coverage below threshold | Blocking | Write E2E tests for all user stories. Each story needs at least one passing test. Run sub-agent: `testing-agent`. |
| `RCA_GATE_BLOCKED` | Unresolved P0/P1 root cause records with unverified CAPAs | Blocking | Verify CAPAs: `node scripts/root-cause-agent.js capa verify --capa-id <UUID>`. Run sub-agent: `rca-agent`. |
| `RETROSPECTIVE_QUALITY_GATE_FAILED` | Retrospective quality score below threshold (>=70) | Blocking | Replace metric-only learnings with SD-specific insights. Include file changes, challenges, concrete action items. Run sub-agent: `retro-agent`. |
| `GIT_COMMIT_ENFORCEMENT_FAILED` | Uncommitted or unpushed changes | Blocking | Run: `git add`, `git commit`, `git push`. |

---

## Handoff System — PLAN-TO-LEAD (Final Approval) Rejections

Emitted during LEAD final approval verification.

| Code | Description | Severity | Resolution |
|------|-------------|----------|------------|
| `PLAN_TO_LEAD_HANDOFF_EXISTS` | PLAN-TO-LEAD handoff not accepted | Blocking | Run: `node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>`. |
| `USER_STORIES_COMPLETE` | Not all user stories have status `completed` | Blocking | Update remaining user stories to `completed` status. |
| `RETROSPECTIVE_EXISTS` | No quality retrospective found for completed SD | Blocking | Generate retrospective with quality score >= 60%. Include SD-specific learnings. Run sub-agent: `retro-agent`. |
| `RETROSPECTIVE_QUALITY_GATE` | Retrospective contains boilerplate or insufficient quality | Blocking | Replace metric-only learnings with SD-specific insights referencing actual files and implementation decisions. |
| `PR_MERGE_VERIFICATION` | Unmerged code on feature branches | Blocking | Run `/ship` before LEAD-FINAL-APPROVAL. All PRs must be merged to main. `gh pr merge <number> --merge --delete-branch`. |
| `DELIVERABLES_INCOMPLETE` | Not all deliverables completed | Blocking | Complete all entries in `sd_scope_deliverables`. |

---

## Gate Validation Codes

Gate codes used in the handoff executor pipeline. Stored in `sd_phase_handoffs.metadata.gate_results`.

### Numbered Gates (Handoff Pipeline)

| Code | Gate | Phase | Description | Resolution |
|------|------|-------|-------------|------------|
| `GATE1_VALIDATION_FAILED` | Design/Database | PLAN-TO-EXEC | Design and database sub-agent validation failed | Run DESIGN and DATABASE sub-agents before EXEC. |
| `GATE1_DESIGN_DATABASE` | Design/Database | PLAN-TO-EXEC | Design and database analysis not performed | Execute design analysis: component architecture, data flow, integration points. |
| `GATE2_VALIDATION_FAILED` | Implementation Fidelity | EXEC-TO-PLAN | Code does not match PRD requirements | Validate implementation against PRD. Fix stubbed code, resolve all FIXME/TODO. |
| `GATE2_IMPLEMENTATION_FIDELITY` | Implementation Fidelity | EXEC-TO-PLAN | Fidelity score below threshold | Verify: unit tests passing, server restarted, no stubbed code, correct directory. |
| `GATE3_VALIDATION_FAILED` | Traceability | EXEC-TO-PLAN | Requirements-to-implementation traceability broken | Verify traceability from requirements to implementation to tests. |
| `GATE3_TRACEABILITY` | Traceability | EXEC-TO-PLAN | EXEC did not follow DESIGN/DATABASE recommendations | Check implementation quality score, test coverage, PRD-to-code mapping. |
| `GATE4_VALIDATION_FAILED` | Workflow ROI | PLAN-TO-LEAD | Deliverables do not justify process overhead | Answer 6 LEAD pre-approval questions. Verify strategic alignment. |
| `GATE4_WORKFLOW_ROI` | Workflow ROI | PLAN-TO-LEAD | Process adherence or business value insufficient | Verify process adherence, business value, strategic alignment. |
| `GATE5_VALIDATION_FAILED` | Git Commit | EXEC-TO-PLAN | Git commit verification failed | Commit and push all changes. SLA: 2 hours. |
| `GATE5_GIT_COMMIT_ENFORCEMENT` | Git Commit | EXEC-TO-PLAN | Implementation not committed/pushed | Run: `git add`, `git commit`, `git push`. |
| `GATE6_VALIDATION_FAILED` | Branch Enforcement | EXEC | No feature branch for EXEC work | Create feature branch: `git checkout -b feat/<SD-ID>-description`. |
| `GATE6_BRANCH_ENFORCEMENT` | Branch Enforcement | EXEC | Branch enforcement failed | Create or switch to feature branch before EXEC. |

### Named Gates (Specialized Validation)

| Code | Description | Phase | Resolution |
|------|-------------|-------|------------|
| `GATE_ARCHITECTURE_VERIFICATION` | PRD implementation approach conflicts with application framework | PLAN-TO-EXEC | Verify framework matches PRD. Common fix: Vite SPA uses Supabase client (not API routes). |
| `GATE_CONTRACT_COMPLIANCE` | PRD violates parent SD contract boundaries | PLAN-TO-EXEC | Review `allowed_tables` and `component_paths` in parent contract. |
| `GATE_PRD_EXISTS` | No approved PRD found | PLAN-TO-EXEC | Create or update PRD. Set status to `approved`. |
| `GATE_EXPLORATION_AUDIT` | Insufficient codebase exploration documented | PLAN-TO-EXEC | Update `exploration_summary` in PRD: minimum 3 files (5+ recommended). |
| `GATE_DELIVERABLES_PLANNING` | No deliverables defined before EXEC | PLAN-TO-EXEC | Define deliverables in `sd_scope_deliverables` table. |
| `GATE_TDD_PRE_IMPLEMENTATION` | TDD tests not written before implementation | EXEC | Enable via `TDD_PRE_IMPL_GATE_ENABLED=true`. Write tests first. |
| `GATE_TOO_STRICT` | Gate threshold too aggressive for SD type (bypass rubric) | Any | Review bypass rubric in `scripts/modules/handoff/bypass-rubric.js`. |

### Venture Stage Gates

Gate types used by the venture state machine (`lib/agents/modules/venture-state-machine/stage-gates.js`).

| Gate Type | Stages | Behavior on Failure |
|-----------|--------|---------------------|
| `KILL` | 3, 5, 13, 23 | Routes to Chairman for termination decision. `REQUIRES_CHAIRMAN_DECISION`. |
| `PROMOTION` | 16, 17, 22 | Requires Chairman approval to advance. `REQUIRES_CHAIRMAN_APPROVAL`. |
| `ADVISORY` | 5, 13 | Non-blocking value multiplier assessment. Advisory only. |

Gate status values: `PASS`, `FAIL`, `REQUIRES_CHAIRMAN_DECISION`, `REQUIRES_CHAIRMAN_APPROVAL`, `ERROR`.

Named venture gates:
- `KILL_GATE_STAGE_{N}` — Kill gate at stage N
- `PROMOTION_GATE_STAGE_{N}` — Promotion gate at stage N
- `ADVISORY_VALUE_MULTIPLIER_STAGE_{N}` — Advisory value assessment
- `FINANCIAL_VIABILITY` — Financial viability check
- `UAT_SIGNOFF` — User acceptance testing signoff
- `DEPLOYMENT_HEALTH` — Deployment health verification

---

## Gate SLA Configuration

SLA hours for gate failure escalation (from `lib/eva/dfe-gate-escalation-router.js`):

| Gate Type | SLA (hours) |
|-----------|-------------|
| `PRD_QUALITY` | 4 |
| `RETROSPECTIVE_QUALITY_GATE` | 8 |
| `USER_STORY_EXISTENCE_GATE` | 4 |
| `GATE5_GIT_COMMIT_ENFORCEMENT` | 2 |
| `GATE_SD_START_PROTOCOL` | 8 |
| `GATE_PROTOCOL_FILE_READ` | 8 |
| Default (all others) | 12 |

Escalation levels: `L1` (INFO), `L2` (WARN), `L3` (CRITICAL).

---

## BMAD Validation Codes

Story quality validation codes from the BMAD (Business Model Acceptance Definition) system.

| Code | Description | Resolution |
|------|-------------|------------|
| `BMAD_VALIDATION_FAILED` | User stories lack proper acceptance criteria | Regenerate stories with Given/When/Then criteria, specific personas. Run sub-agent: `general-purpose`. |
| `BMAD_PLAN_TO_EXEC_FAILED` | BMAD validation failed during PLAN-TO-EXEC | Improve story quality. Each story needs Given/When/Then format. |
| `BMAD_EXEC_TO_PLAN_FAILED` | Test plans incomplete or E2E coverage insufficient | Complete test plans. Achieve 100% E2E coverage. Run sub-agent: `testing-agent`. |

---

## Testing and Evidence Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `MANDATORY_TESTING_VALIDATION` | TESTING sub-agent required but not run | Run test suite: `npm test` (unit) and `npx playwright test` (E2E). Exempt types: documentation, infrastructure, orchestrator, database. |
| `TEST_EVIDENCE_AUTO_CAPTURE` | Test evidence not found in standard locations | Run tests to generate evidence. Then: `node scripts/test-evidence-ingest.js --sd-id <SD-ID>`. |
| `E2E_COVERAGE_INCOMPLETE` | Not all user stories have corresponding E2E tests | Write E2E tests for uncovered stories. Each story needs at least one passing test. |
| `HUMAN_VERIFICATION_GATE` | Feature SDs need verifiable outcomes via UAT | Generate and execute UAT tests. Add `smoke_test_steps` to SD. Run sub-agent: `uat-agent`. |
| `ERR_UAT_EXEMPT_NO_EVIDENCE` | UAT-exempt SD has no automated test evidence | Run E2E or integration tests and ensure they pass. |
| `ERR_UAT_EXEMPT_TESTS_FAILED` | Automated test evidence exists but tests failed | Fix failing tests and re-run. |
| `ERR_INFRA_TESTS_FAILED` | Infrastructure test suite failed | Fix infrastructure tests before handoff. |

---

## PRD Integration Validation Codes

Emitted when PRD integration section is missing or incomplete. See `docs/guides/prd-integration-section-guide.md`.

| Code | Description | Resolution |
|------|-------------|------------|
| `ERR_INTEGRATION_SECTION_MISSING` | Integration section not found in PRD | Add complete integration section to PRD. |
| `ERR_INTEGRATION_CONSUMERS_MISSING` | Consumers subsection missing | Define which systems consume this SD's outputs. |
| `ERR_INTEGRATION_DEPENDENCIES_MISSING` | Dependencies subsection missing | List upstream dependencies and their contracts. |
| `ERR_INTEGRATION_CONTRACTS_MISSING` | Data contracts subsection missing | Define input/output data contracts. |
| `ERR_INTEGRATION_CONFIG_MISSING` | Runtime config subsection missing | Specify runtime configuration requirements. |
| `ERR_INTEGRATION_OBSERVABILITY_MISSING` | Observability subsection missing | Define logging, metrics, and alerting requirements. |
| `ERR_INFRASTRUCTURE_NO_CONSUMER_JUSTIFICATION` | Infrastructure SD with no consumers lacks justification | Justify why infrastructure with no consumers should proceed. |

---

## Audit Detection Rules

Self-audit rules from `scripts/modules/audit/audit-runner.js`. Read-only, no mutations.

| Rule ID | Name | Severity | Trigger Condition |
|---------|------|----------|-------------------|
| `STALE_SD` | Stale Strategic Directive | Medium | No update for N days (default: 14), status not `completed`. |
| `DRAFT_TOO_LONG` | Draft Status Exceeded | Low | In `draft` status longer than warn threshold (default: 7 days). |
| `MISSING_PRD` | Missing Product Requirements Document | High | Non-infrastructure/documentation SD lacks PRD. |
| `MISSING_RETROSPECTIVE` | Missing Retrospective | Medium | Completed SD without retrospective in `retrospectives` table. |
| `INVALID_STATUS` | Invalid Status Transition | High | SD status not in valid list. |
| `PROGRESS_MISMATCH` | Progress Status Mismatch | Medium | Status `completed` but progress < 100%, or progress 100% but not completed. |
| `INCOMPLETE_HANDOFF_CHAIN` | Incomplete Handoff Chain | Medium | Active SD missing expected LEAD-TO-PLAN handoff. |

---

## Infrastructure and System Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `SD_NOT_FOUND` | SD not found in `strategic_directives_v2` | Create using: `node scripts/leo-create-sd.js`. |
| `PRD_NOT_FOUND` | PRD not found in `product_requirements_v2` | Create PRD. See `docs/reference/prd-inline-schema.md`. |
| `TEMPLATE_NOT_FOUND` | Handoff template not found in `leo_handoff_templates` | Contact administrator. |
| `FIDELITY_DATA_MISSING` | Gate 2 fidelity data missing from handoff metadata | Update `sd_phase_handoffs.metadata.gate2_validation` with `{score, passed, gate_scores}`. |
| `BRANCH_ENFORCEMENT_FAILED` | Not on a feature branch | Create: `git checkout -b feat/<SD-ID>-short-description`. |
| `GIT_COMMIT_VERIFICATION_FAILED` | Uncommitted changes detected | Commit all changes with proper messages before handoff. |
| `USER_STORY_EXISTENCE_GATE` | No user stories exist for SD type that requires them | Generate stories from PRD. Insert into `user_stories` with status `ready`. |
| `PREREQUISITE_HANDOFF_CHECK` | `ERR_CHAIN_INCOMPLETE` — missing prerequisite handoff | Complete the required prior handoff. Check `sd_phase_handoffs`. |
| `SUB_AGENT_ORCHESTRATION` | Sub-agent orchestration failed | Review sub-agent failures, fix root causes, re-run failed agents. |

---

## API Error Responses

Standard HTTP error responses from `pages/api/` routes.

### Authentication and Authorization

| HTTP Status | Error | Endpoint(s) | Description |
|-------------|-------|-------------|-------------|
| 403 | `PERMISSION_DENIED` | `/api/ventures`, `/api/compliance/events`, `/api/aegis/violations` | User lacks required permissions. |
| 401 | Unauthorized | All authenticated endpoints | Missing or invalid JWT token. |
| 429 | Rate limit exceeded | `/api/leo/gate-scores` (100/min), `/api/leo/sub-agent-reports` (50/min) | Too many requests. Retry after 60 seconds. |

### Validation and Not Found

| HTTP Status | Error | Endpoint(s) | Description |
|-------------|-------|-------------|-------------|
| 400 | Validation failed | `/api/leo/gate-scores`, `/api/leo/sub-agent-reports`, `/api/compliance/*` | Request body or query parameters failed schema validation. |
| 404 | Not found | `/api/leo/gate-scores`, `/api/leo/sub-agent-reports`, `/api/ventures/[id]/calibration` | Requested resource (PRD, SD, sub-agent report) does not exist. |
| 405 | Method not allowed | All API routes | HTTP method not supported. Check `allowed` array in response. |
| 500 | Internal server error | All API routes | Unexpected server error. Check server logs. |

---

## CLAUDE_CORE.md Quick Reference

Legacy error codes documented in protocol files:

| Code | Meaning | Resolution |
|------|---------|------------|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run before handoff | Run TESTING sub-agent first. |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff in chain | Complete the missing handoff. |
| `ERR_NO_PRD` | No PRD exists for PLAN-TO-EXEC | Create PRD using `node scripts/add-prd-to-database.js`. |

---

*Generated for SD-LEO-DOC-ERROR-CODE-CATALOG-001 | Source: codebase scan of scripts/, lib/, pages/api/*
