# Error Code Catalog

Reference for all error codes emitted by the LEO Protocol handoff system, gate validators, database constraints, and runtime infrastructure.

**Source of truth**: `scripts/modules/handoff/rejection-subagent-mapping.js` defines the canonical mapping of rejection codes to remediation actions and sub-agent invocations.

---

## 1. Handoff Rejection Codes

These codes are returned when a phase handoff fails validation. Each rejection is recorded in `leo_handoff_rejections` and includes improvement guidance.

### 1.1 PRD / Quality Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `NO_PRD` | PLAN-TO-EXEC | No PRD exists for the SD | PRD was never created | Run `node scripts/add-prd-to-database.js` to create a PRD. Set status to `approved`. |
| `PRD_NOT_FOUND` | Any | PRD record not found in `product_requirements_v2` | PRD deleted or `directive_id` mismatch | Create PRD or fix `directive_id` to match SD `id` (UUID). See `docs/reference/prd-inline-schema.md`. |
| `PRD_QUALITY` | PLAN-TO-EXEC | PRD quality score below threshold (typically 70%) | Missing or shallow fields: `executive_summary`, `functional_requirements`, `system_architecture`, `acceptance_criteria`, `test_scenarios`, `implementation_approach`, `risks` | Enrich all 7 required PRD sections with SD-specific content. Invoke `subagent_type="general-purpose"`. |
| `PRD_BOILERPLATE` | PLAN-TO-EXEC | PRD contains placeholder/generic content | Auto-generated PRD has "TBD", "To be defined", or generic acceptance criteria | Replace all boilerplate text with specific, measurable requirements unique to this SD. |
| `PLAN_INCOMPLETE` | PLAN-TO-EXEC | PLAN phase activities not finished | PRD status is not `approved` | Complete PLAN phase checklist. Update PRD status to `approved`. |

### 1.2 User Story Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `NO_USER_STORIES` | PLAN-TO-EXEC | No user stories found for the SD | Stories were never generated from the PRD | Generate 5-8 user stories from PRD acceptance criteria. Insert into `user_stories` table with status `ready`. Invoke `subagent_type="general-purpose"`. |
| `USER_STORIES_ERROR` | PLAN-TO-EXEC | Database error querying `user_stories` table | Table missing, RLS policy blocking, or connection issue | Check table existence, RLS policies, and Supabase connectivity. Invoke `subagent_type="rca-agent"`. |
| `USER_STORY_QUALITY` | PLAN-TO-EXEC | User story quality score below threshold | Boilerplate acceptance criteria, generic roles, short descriptions | Rewrite stories: use Given/When/Then format, specific personas, `user_want` >= 20 chars, `user_benefit` >= 15 chars. |
| `USER_STORIES_COMPLETE` | LEAD-FINAL-APPROVAL | Not all user stories have status `completed` | Some stories still in `ready` or `in_progress` | Update all stories to `completed` after implementation and testing. |
| `USER_STORY_EXISTENCE_GATE` | PLAN-TO-LEAD | No user stories exist for this SD type | Stories required for feature/quality SD types but never created | Generate user stories from PRD acceptance criteria. |

### 1.3 Workflow / Process Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `UNSUPPORTED_HANDOFF_TYPE` | Any | Handoff type not recognized by the system | Typo in handoff type or using deprecated type name | Use supported types: `LEAD-TO-PLAN`, `PLAN-TO-EXEC`, `EXEC-TO-PLAN`, `PLAN-TO-LEAD`, `LEAD-FINAL-APPROVAL`. |
| `HANDOFF_INVALID` | Any | Handoff document missing required elements | Missing one or more of the 7 required handoff elements | Review handoff validation errors. Ensure `completeness_report`, `deliverables_manifest`, `key_decisions`, `known_issues`, `resource_utilization`, `action_items` are all present as separate JSONB columns. |
| `PLAN_PRESENTATION_INVALID` | PLAN-TO-EXEC | Missing or incomplete `plan_presentation` in metadata | Handoff metadata lacks `goal_summary`, `file_scope`, `execution_plan`, or `testing_strategy` | Add `plan_presentation` object: `goal_summary` (<=300 chars), `file_scope`, `execution_plan` steps, `testing_strategy` (unit_tests + e2e_tests). |
| `WORKFLOW_REVIEW_FAILED` | PLAN-TO-EXEC | Design sub-agent detected workflow issues | Dead ends, circular flows, missing error recovery in user stories | Fix workflow issues in user story `acceptance_criteria` and `implementation_context`. Target UX score >= 6.0/10. Invoke `subagent_type="design-agent"`. |
| `PREREQUISITE_HANDOFF_CHECK` | Any | Required prior handoff not completed | Attempting EXEC-TO-PLAN without completing PLAN-TO-EXEC first | Complete the prerequisite handoff. Check `sd_phase_handoffs` for the required prior record. Also known as `ERR_CHAIN_INCOMPLETE`. |
| `PLAN_TO_LEAD_HANDOFF_EXISTS` | LEAD-FINAL-APPROVAL | PLAN-TO-LEAD handoff not yet accepted | Trying final approval before verification phase completes | Run: `node scripts/unified-handoff-system.js execute PLAN-TO-LEAD <SD-ID>` |
| `DELIVERABLES_INCOMPLETE` | PLAN-TO-LEAD | Not all SD deliverables marked completed | Some entries in `sd_scope_deliverables` still pending | Query and update: `SELECT * FROM sd_scope_deliverables WHERE sd_id = '<UUID>' AND completion_status != 'completed'` |
| `INVALID_STATUS` | LEAD-FINAL-APPROVAL | SD status is not `pending_approval` | SD is still `in_progress` or already `completed` | Run PLAN-TO-LEAD handoff first to move SD to `pending_approval`. |

### 1.4 Testing / Evidence Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `MANDATORY_TESTING_VALIDATION` | EXEC-TO-PLAN | TESTING sub-agent was not run | Feature/QA SD completed without running test suite | Run `npm test` (unit) and `npx playwright test` (E2E). Exempt types: documentation only. Invoke `subagent_type="testing-agent"`. Also reported as `ERR_TESTING_REQUIRED`. |
| `TEST_EVIDENCE_AUTO_CAPTURE` | EXEC-TO-PLAN | No test evidence found in standard locations | Tests ran but reports not captured | Run tests to generate evidence: `npx playwright test`, `npm test -- --coverage`. Then: `node scripts/test-evidence-ingest.js --sd-id <SD-ID>`. |
| `E2E_COVERAGE_INCOMPLETE` | EXEC-TO-PLAN | Not all user stories have E2E test coverage | Some stories lack corresponding test files | Write E2E tests for uncovered user stories. Each story needs at least one passing test. |
| `BMAD_VALIDATION_FAILED` | Any | BMAD acceptance criteria quality check failed | User stories lack proper Given/When/Then acceptance criteria | Regenerate stories with proper acceptance criteria. Invoke `subagent_type="general-purpose"`. |
| `BMAD_PLAN_TO_EXEC_FAILED` | PLAN-TO-EXEC | BMAD quality check failed for PLAN-TO-EXEC | Story quality insufficient for entering EXEC phase | Improve user story acceptance criteria to meet BMAD standards. |
| `BMAD_EXEC_TO_PLAN_FAILED` | EXEC-TO-PLAN | BMAD quality check failed for EXEC-TO-PLAN | Test plans incomplete or E2E coverage insufficient | Complete test plans. Achieve 100% E2E coverage for all stories. Invoke `subagent_type="testing-agent"`. |
| `HUMAN_VERIFICATION_GATE` | EXEC-TO-PLAN | Feature SD requires human-verifiable outcomes | No UAT evidence or smoke test steps | Generate and execute UAT tests. Add `smoke_test_steps` to SD. Invoke `subagent_type="uat-agent"`. |

### 1.5 RCA / Infrastructure Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `RCA_BLOCKING_ISSUES` | EXEC-TO-PLAN | P0/P1 root cause records without verified CAPAs | Open high-severity defects need corrective actions | Verify all CAPAs: `node scripts/root-cause-agent.js capa verify --capa-id <UUID>`. Invoke `subagent_type="rca-agent"`. |
| `RCA_GATE` | EXEC-TO-PLAN | RCA gate failed: unresolved P0/P1 RCRs | `root_cause_analyses` has entries with `capa_status != 'verified'` | Run CAPA verification for all P0/P1 issues. |
| `SUB_AGENT_ORCHESTRATION` | Any | Required sub-agents did not complete successfully | Sub-agents triggered but failed or returned incomplete results | Review sub-agent failures. Fix root causes and re-run failed sub-agents. |

### 1.6 Git / Branch Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `BRANCH_ENFORCEMENT_FAILED` | PLAN-TO-EXEC | No feature branch exists for this SD | Working on `main` branch directly | Create branch: `git checkout -b feat/<SD-ID>-short-description` |
| `GIT_COMMIT_VERIFICATION_FAILED` | PLAN-TO-LEAD | Uncommitted changes exist | Implementation code not committed | Run `git add`, `git commit`, `git push`. |
| `PR_MERGE_VERIFICATION` | LEAD-FINAL-APPROVAL | Unmerged PRs exist for this SD | Feature branch not merged to `main` | Run `/ship` BEFORE LEAD-FINAL-APPROVAL. For each open PR: `gh pr merge <number> --merge --delete-branch`. |

### 1.7 Retrospective / Learning Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `RETROSPECTIVE_EXISTS` | LEAD-FINAL-APPROVAL | No retrospective found for the SD | Retrospective was never created | Generate retrospective with `quality_score >= 70`. Invoke `subagent_type="retro-agent"`. |
| `RETROSPECTIVE_QUALITY_GATE` | PLAN-TO-LEAD | Retrospective quality insufficient | Auto-generated retrospective contains boilerplate or metric-only learnings | Replace metric-only learnings with SD-specific insights. Include: files changed, implementation challenges, concrete action items. Update `what_needs_improvement` (not `improvement_areas`). Must use `status = 'PUBLISHED'`. |

### 1.8 System / Catch-All Codes

| Code | Handoff | Description | Common Cause | Fix |
|------|---------|-------------|--------------|-----|
| `SYSTEM_ERROR` | Any | Unexpected system error during handoff execution | Database connectivity, module not found, unhandled exception | Check logs. Verify database connectivity and module paths. |
| `SD_NOT_FOUND` | Any | SD not found in `strategic_directives_v2` | Typo in SD ID or SD was deleted | Verify `sd_key` vs `id` (UUID). Create SD: `node scripts/leo-create-sd.js`. |
| `TEMPLATE_NOT_FOUND` | Any | Handoff template not found | Template deleted from `leo_handoff_templates` | Contact administrator. |
| `DATABASE_FIELD_ERROR` | Any | Specific field error in database table | Wrong field name, wrong data type, missing required field | Check exact `table.field` path in error details. See `docs/reference/schema/handoff-field-reference.md`. |
| `FIDELITY_DATA_MISSING` | PLAN-TO-LEAD | Gate 2 fidelity data missing from EXEC-TO-PLAN handoff | EXEC-TO-PLAN handoff metadata lacks `gate2_validation` | Update `sd_phase_handoffs.metadata.gate2_validation` with `{score, passed, gate_scores}`. |

---

## 2. Gate Validation Errors

Gates are validators that run during handoff execution. Each gate produces a result with `passed`, `score`, `issues`, and `warnings`. When a gate fails, it generates a `<GATE_NAME>_FAILED` reason code.

### 2.1 LEAD-TO-PLAN Gates

| Gate Name | Type | Description | Failure Cause | Fix |
|-----------|------|-------------|---------------|-----|
| `GATE_SD_QUALITY` | Blocking | Validates SD field completeness and quality | Missing JSONB fields (`strategic_objectives`, `dependencies`, `success_criteria`, `key_changes`, `risks`), description too short | Enrich SD with populated JSONB fields. Use proper object structures: `{criterion, measure}` for `success_criteria`, `{change, impact}` for `key_changes`. |
| `GATE_VISION_SCORE` | Blocking | Validates EVA vision alignment score | No vision score exists, or score below SD-type threshold | Run `node scripts/eva/vision-scorer.js --sd-id <SD-KEY>`. Corrective SDs are exempt. |
| `GATE_PLACEHOLDER_CONTENT_DETECTION` | Blocking | Detects placeholder content in SD fields | Fields contain "TBD", "placeholder", "lorem ipsum" | Replace all placeholder text with real content. |
| `GATE_LEAD_EVALUATION_CHECK` | Blocking | Verifies LEAD evaluation has been performed | SD has not gone through LEAD evaluation | Complete LEAD phase evaluation. |
| `GATE_SD_TRANSITION_READINESS` | Blocking | Validates SD is ready for phase transition | SD missing required fields or in wrong status | Ensure SD has all required fields populated and correct status. |

### 2.2 PLAN-TO-EXEC Gates

| Gate Name | Type | Description | Failure Cause | Fix |
|-----------|------|-------------|---------------|-----|
| `GATE_PRD_EXISTS` | Blocking | Checks that an approved PRD exists | No PRD in `product_requirements_v2` for this SD | Create PRD via `node scripts/add-prd-to-database.js`. Set status to `approved`. |
| `GATE_ARCHITECTURE_VERIFICATION` | Blocking | Verifies PRD implementation approach matches target app framework | PRD references wrong framework patterns (e.g., API routes for a Vite SPA) | Verify detected framework matches PRD `implementation_approach`. |
| `GATE_CONTRACT_COMPLIANCE` | Blocking | Validates PRD stays within parent SD contract boundaries | PRD references tables/paths outside `allowed_tables` or `component_paths` from parent contract | Review parent SD contract. Cultural design style is inherited. |
| `GATE_EXPLORATION_AUDIT` | Advisory | Checks codebase exploration before implementation | Fewer than 3 files explored, missing `key_findings` | Update `exploration_summary` in PRD: minimum 3 files (5+ recommended). |
| `GATE_DELIVERABLES_PLANNING` | Advisory | Validates deliverables defined in `sd_scope_deliverables` | No deliverables planned before EXEC | Define deliverables in `sd_scope_deliverables` table. |
| `GATE_PLANNING_COMPLETENESS` | Blocking | Validates overall planning completeness | PRD sections incomplete or missing | Complete all required PRD sections. |
| `GATE_INTEGRATION_SECTION_VALIDATION` | Advisory | Validates integration points are documented | PRD missing integration documentation | Document integration points in PRD. |
| `GATE_WIREFRAME_REQUIRED` | Conditional | Requires wireframes for UI-producing SDs | UI feature SD has no wireframe evidence | Create wireframes before proceeding to EXEC. |
| `GATE_ARCHITECTURAL_PATTERN_CHECKLIST` | Advisory | Validates architecture patterns against checklist | Architecture patterns not following established conventions | Review and align with architectural pattern checklist. |
| `GATE_INFRASTRUCTURE_CONSUMER_CHECK` | Blocking | Validates infrastructure SDs have consumer code planned | Schema/API/sub-agent created without consumer | Add consumer user stories. See reason codes: `SCHEMA_WITHOUT_CONSUMER`, `SUBAGENT_WITHOUT_LOGIC`, `API_WITHOUT_CONSUMER`, `MISSING_USAGE_STORIES`. |
| `GATE_MIGRATION_DATA_VERIFICATION` | Conditional | Validates database migration data integrity | Migration scripts have data issues | Verify migration scripts and test with dry run. |

### 2.3 EXEC-TO-PLAN Gates

| Gate Name | Type | Description | Failure Cause | Fix |
|-----------|------|-------------|---------------|-----|
| `RCA_GATE` | Blocking | P0/P1 RCRs must have verified CAPAs | Open P0/P1 defects without corrective actions | Verify all CAPAs: `node scripts/root-cause-agent.js capa verify --capa-id <UUID>` |
| `GATE2_IMPLEMENTATION_FIDELITY` | Blocking | Code matches PRD specifications | Stubbed code, failing tests, incomplete implementation, unresolved FIXME/TODO | Fix: unit tests passing, no stubbed code, correct directory, all FIXME/TODO resolved. |
| `GATE_INTEGRATION_CONTRACT` | Advisory | Integration contracts honored in implementation | Implementation diverges from integration contract | Verify implementation matches integration contract specifications. |
| `GATE_PERFORMANCE_CRITICAL` | Conditional | Performance targets met for performance-sensitive SDs | Performance benchmarks not met | Profile and optimize. Ensure latency/throughput targets are achieved. |
| `GATE_INTEGRATION_TEST_REQUIREMENT` | Advisory | Integration tests exist for cross-system features | No integration tests written | Write integration tests covering cross-system interactions. |
| `GATE_TEST_COVERAGE_QUALITY` | Advisory | Test quality and coverage sufficient | Low test coverage or poor test quality | Improve test coverage and test specificity. |
| `GATE_WIREFRAME_QA_VALIDATION` | Conditional | UI implementation matches wireframes | UI diverges from approved wireframes | Compare implementation against wireframes. Fix deviations. |

### 2.4 PLAN-TO-LEAD Gates

| Gate Name | Type | Description | Failure Cause | Fix |
|-----------|------|-------------|---------------|-----|
| `GATE3_TRACEABILITY` | Blocking | End-to-end traceability from requirements to implementation to tests | Missing PRD-to-code-to-test mappings, no Gate 2 data from EXEC-TO-PLAN | Ensure EXEC-TO-PLAN metadata contains `gate2_validation` data. Verify requirement coverage. |
| `GATE4_WORKFLOW_ROI` | Blocking | Workflow ROI and pattern effectiveness | Deliverables do not justify process overhead | Review workflow ROI. Answer 6 LEAD pre-approval questions. Verify strategic alignment. |
| `GATE_DOCUMENTATION_LINK_VALIDATION` | Advisory | Documentation links are valid and accessible | Broken links in documentation | Fix broken documentation links. |

### 2.5 LEAD-FINAL-APPROVAL Gates

| Gate Name | Type | Description | Failure Cause | Fix |
|-----------|------|-------------|---------------|-----|
| `GATE_PIPELINE_FLOW` | Blocking | All pipeline handoffs completed in sequence | Missing handoff records in `sd_phase_handoffs` | Complete all required handoffs: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD. |

### 2.6 Infrastructure Consumer Check Reason Codes

These sub-codes are emitted by `GATE_INFRASTRUCTURE_CONSUMER_CHECK` to identify specific gaps.

| Reason Code | Description | Fix |
|-------------|-------------|-----|
| `SCHEMA_WITHOUT_CONSUMER` | Database schema created but no application code uses it | Add user stories that consume the new schema in application code. |
| `SUBAGENT_WITHOUT_LOGIC` | Sub-agent registered but no orchestration logic exists | Add user stories for sub-agent integration and orchestration. |
| `API_WITHOUT_CONSUMER` | API endpoint created but no client code calls it | Add user stories for API consumption in the target application. |
| `MISSING_USAGE_STORIES` | Infrastructure deliverables lack usage/consumer stories | Add user stories describing how the infrastructure will be consumed. |
| `PASS_WITH_OVERRIDE` | Gate passed due to override (e.g., follow-up SD planned) | Informational only. Follow-up SD should address the consumer gap. |

---

## 3. Database Constraint Errors

Common PostgreSQL constraint violations encountered when inserting or updating records.

### 3.1 Check Constraints

| Constraint Name | Table | Column(s) | Valid Values | Error Pattern |
|-----------------|-------|-----------|--------------|---------------|
| `valid_story_key` | `user_stories` | `story_key` | Format: `NNN:US-NNN` (e.g., `019:US-001`) | `violates check constraint "valid_story_key"`. Do NOT use `US-LEARN019-001`. |
| `user_stories_priority_check` | `user_stories` | `priority` | `critical`, `high`, `medium`, `low`, `minimal` | `violates check constraint "user_stories_priority_check"`. Do NOT use `must_have`, `should_have`, `P0/P1/P2`. |
| `sd_capabilities` type check | `sd_capabilities` | `capability_type` | `tool`, `agent`, `skill`, `utility`, `service`, `database_function`, `quality_gate`, `validation_rule` | NOT NULL violation on `capability_type`. `delivers_capabilities` must use JSONB objects, not plain strings. |
| `sd_capabilities` category check | `sd_capabilities` | `category` | `ai_automation`, `application`, `governance`, `infrastructure`, `integration` | `violates check constraint` on category. |
| `sd_retrospectives` generated_by | `sd_retrospectives` | `generated_by` | `SUB_AGENT` only | `violates check constraint`. Do NOT use `claude-code` or other values. |
| `sd_retrospectives` status | `sd_retrospectives` | `status` | `PUBLISHED` | Only `PUBLISHED` is valid. Not `completed` or `draft`. |
| `sd_retrospectives` learning_category | `sd_retrospectives` | `learning_category` | `APPLICATION_ISSUE`, `PROCESS_IMPROVEMENT`, `TESTING_STRATEGY`, `DATABASE_SCHEMA`, `DEPLOYMENT_ISSUE`, `PERFORMANCE_OPTIMIZATION`, `USER_EXPERIENCE`, `SECURITY_VULNERABILITY`, `DOCUMENTATION` | Must use exact enum value. |
| `sd_retrospectives` retro_type | `sd_retrospectives` | `retro_type` | `SPRINT`, `SD_COMPLETION`, `INCIDENT`, `MILESTONE`, `WEEKLY`, `MONTHLY`, `ARCHITECTURE_DECISION`, `RELEASE`, `AUDIT` | Must use exact enum value. |
| SD `current_phase` | `strategic_directives_v2` | `current_phase` | `LEAD`, `LEAD_APPROVAL`, `LEAD_COMPLETE`, `LEAD_FINAL`, `LEAD_FINAL_APPROVAL`, `PLAN_PRD`, `PLAN_VERIFICATION`, `EXEC`, `EXEC_COMPLETE`, `COMPLETED`, `CANCELLED` | Use `COMPLETED` not `COMPLETE`. |

### 3.2 Foreign Key Constraints

| Relationship | Parent | Child | Column | Common Error |
|-------------|--------|-------|--------|--------------|
| SD UUID reference | `strategic_directives_v2.id` | `sd_phase_handoffs.sd_id` | UUID | Using `sd_key` instead of UUID `id`. |
| SD UUID reference | `strategic_directives_v2.id` | `sd_retrospectives.sd_id` | UUID | Using `sd_key` instead of UUID `id`. |
| SD UUID reference | `strategic_directives_v2.uuid_id` | `sd_capabilities.sd_uuid` | UUID | Using `.id` instead of `.uuid_id`. |
| PRD directive reference | `strategic_directives_v2.id` | `product_requirements_v2.directive_id` | UUID | PRDs auto-generated store `uuid_id`, not `sd_key`. |
| Parent SD reference | `strategic_directives_v2.id` | `strategic_directives_v2.parent_sd_id` | UUID | `parent_sd_id` references UUID `id`, NOT `sd_key`. |

### 3.3 NOT NULL Violations

| Table | Required Columns | Common Mistake |
|-------|-----------------|----------------|
| `sd_retrospectives` | `sd_id`, `title`, `target_application`, `learning_category`, `retro_type`, `generated_by` | Omitting any of these on INSERT. |
| `sd_phase_handoffs` | `completeness_report`, `deliverables_manifest`, `key_decisions`, `known_issues`, `resource_utilization`, `action_items` | Passing these as metadata keys instead of separate JSONB columns. |
| `sd_capabilities` | `capability_type` | Using plain strings in `delivers_capabilities` array (e.g., `["key"]` instead of `[{"capability_type": "tool", "capability_key": "key", "name": "..."}]`). |

### 3.4 Trigger-Related Errors

| Trigger | Table | Behavior | Gotcha |
|---------|-------|----------|--------|
| `auto_populate_retrospective_fields` | `sd_retrospectives` | Checks `quality_score` on INSERT | Fires alphabetically BEFORE `auto_validate_retrospective_quality`. Always provide `quality_score: 80` on INSERT -- the validate trigger recalculates. |
| `trg_capability_lifecycle` | `strategic_directives_v2` | Inserts from `delivers_capabilities` into `sd_capabilities` when `status='completed'` | `delivers_capabilities` must be JSONB objects with `capability_type`, not plain strings. |
| `created_by` values | `sd_phase_handoffs` | Handoff system sets `created_by` | Must be `'UNIFIED-HANDOFF-SYSTEM'` (hyphens, NOT underscores). |

---

## 4. Common Runtime Errors

### 4.1 Module / Import Errors

| Error | Description | Common Cause | Fix |
|-------|-------------|--------------|-----|
| `MODULE_NOT_FOUND` | Node.js cannot find a required module | Wrong import path, missing `node_modules`, incorrect ESM/CJS | Verify path. Run `npm install`. Check `package.json` `type` field. |
| `ERR_MODULE_NOT_FOUND` | ESM module resolution failed | Missing file extension in import, wrong relative path | Add `.js` extension to import. Use absolute paths. |
| `ERR_REQUIRE_ESM` | Trying to `require()` an ESM module | Mixing CJS `require` with ESM `export` | Use dynamic `import()` or convert to ESM. |
| Windows ESM entry point mismatch | `import.meta.url === \`file://${process.argv[1]}\`` fails | Windows path format uses backslashes | Add fallback: `\|\| import.meta.url === \`file:///${process.argv[1].replace(/\\\\/g, '/')}\`` |

### 4.2 Environment / Configuration Errors

| Error | Description | Common Cause | Fix |
|-------|-------------|--------------|-----|
| Missing `SUPABASE_URL` | Supabase client cannot initialize | `.env` file missing or not loaded | Copy `.env.example` to `.env`. Run `dotenv.config()`. |
| Missing `SUPABASE_SERVICE_ROLE_KEY` | Service-level DB access fails | Key not set in environment | Add key to `.env`. Required for LEO tables with RLS. |
| Missing `SUPABASE_POOLER_URL` | Direct PostgreSQL connection fails | Connection string not configured | Set `SUPABASE_POOLER_URL` in `.env` for DDL operations. |
| `npm run` timeout | Script hangs or times out | Default 30s timeout too short for Supabase queries | Use `timeout: 45000` minimum for any `npm run`. Use `timeout: 120000` for `npm run sd:next`. |

### 4.3 Phase State Enforcement Errors

| Error | Description | Common Cause | Fix |
|-------|-------------|--------------|-----|
| `INVALID_TRANSITION` | Phase transition violates state machine | Attempting a transition not allowed from current phase (e.g., LEAD directly to EXEC) | Check valid transitions. Follow: LEAD -> PLAN -> EXEC -> PLAN (verify) -> LEAD (approve). |
| `PRD_REQUIRED` | PRD required for transition to EXEC | Code-producing SD has no PRD | Create PRD before PLAN-TO-EXEC handoff. |

### 4.4 Worktree / Git Errors

| Error Code | Description | Common Cause | Fix |
|------------|-------------|--------------|-----|
| `INVALID_SD_KEY` | SD key format invalid | Typo or wrong format in SD key | Use format: `SD-XXX-NNN-001` or similar valid pattern. |
| `INVALID_WORKTREE_PATH` | Worktree path rejected or invalid | Path outside repo root, or stale DB record | Re-resolve worktree: `node scripts/resolve-sd-workdir.js <SD-KEY>`. |
| `MISSING_SD_KEY` | No SD key provided to resolver | CLI argument missing | Pass SD key as argument. |
| `INVALID_MODE` | Unknown worktree mode | Using unsupported mode argument | Use valid modes. |
| Worktree CWD deletion | All bash commands fail after worktree removal | Removed worktree while shell CWD was inside it | Always `cd` to main repo BEFORE removing worktree. |

### 4.5 Claim / Session Errors

| Error | Description | Common Cause | Fix |
|-------|-------------|--------------|-----|
| SD appears `CLAIMED` | Another session is working on this SD | Parallel session has claimed the SD in `claude_sessions` | Pick a different SD. If claim is stale, release: `UPDATE claude_sessions SET sd_id=NULL, status='idle', released_at=NOW() WHERE session_id='...'` |
| Stale claim | Dead session still holds a claim | Session crashed without releasing | `sd:next` auto-releases stale dead claims via `release_sd` RPC. |
| Claim conflict | Two sessions try to claim same SD | Race condition | Auto-proceed to next SD (per feedback preference). |

---

## 5. Handoff Exit Codes

The unified handoff system uses process exit codes for automation.

| Exit Code | Meaning |
|-----------|---------|
| `0` | PASS - Handoff succeeded |
| `1` | FAIL / BLOCKED - Handoff rejected or gate failed |
| `2` | CONDITIONAL_PASS - Passed with warnings |
| `3` | ERROR - System error during execution |
| `4` | MANUAL_REQUIRED - Human intervention needed |
| `5` | INVALID_ARGS - Missing or invalid parameters |

---

## 6. Quick Lookup by Symptom

| Symptom | Likely Code | Section |
|---------|-------------|---------|
| "User stories are MANDATORY" | `NO_USER_STORIES` | 1.2 |
| "PRD quality score below threshold" | `PRD_QUALITY` | 1.1 |
| "PRD contains boilerplate" | `PRD_BOILERPLATE` | 1.1 |
| "ERR_TESTING_REQUIRED" | `MANDATORY_TESTING_VALIDATION` | 1.4 |
| "violates check constraint valid_story_key" | DB constraint | 3.1 |
| "SD status must be pending_approval" | `INVALID_STATUS` | 1.3 |
| "Cannot transition from X to Y" | `INVALID_TRANSITION` | 4.3 |
| "P0/P1 RCRs without verified CAPAs" | `RCA_GATE` | 1.5 |
| "Retrospective quality insufficient" | `RETROSPECTIVE_QUALITY_GATE` | 1.7 |
| "All code must be merged to main" | `PR_MERGE_VERIFICATION` | 1.6 |
| "No vision score exists" | `GATE_VISION_SCORE` | 2.1 |
| "Architecture mismatch detected" | `GATE_ARCHITECTURE_VERIFICATION` | 2.2 |
| "Schema without consumer" | `SCHEMA_WITHOUT_CONSUMER` | 2.6 |
| "capability_type NOT NULL violation" | `delivers_capabilities` format | 3.3 |

---

*Generated for LEO Protocol. Source: `scripts/modules/handoff/rejection-subagent-mapping.js`, gate executor files, database constraint definitions.*
