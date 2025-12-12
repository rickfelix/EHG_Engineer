# AntiGravity Phase 1 Audit Prompt

## Mission
You are auditing the SD-VISION-TRANSITION-001 migration (40-stage to 25-stage lifecycle system) for EHG. This is a **LIMITED SCOPE** audit focusing on database state verification only.

## Context
- **Migration Goal**: Replace legacy 40-stage venture lifecycle with new 25-stage system
- **Database Snapshot**: `docs/audit/phase1-db-snapshot.json` (generated 2025-12-11)
- **EHG App Codebase**: `/mnt/c/_EHG/ehg` (has ~20 files with 40-stage references - known, will be addressed in E)

## Audit Scope (Phase 1 - Limited)

### IN SCOPE
1. Verify database state matches expected migration outcomes
2. Validate lifecycle_stage_config has exactly 25 stages
3. Confirm SD hierarchy completions are accurate
4. Check handoff acceptance patterns

### OUT OF SCOPE (Phase 2 - After F)
- CrewAI contract wiring verification (F not started)
- End-to-end integration testing
- Performance benchmarking
- 40-stage reference cleanup (governed by E's PRD FR-2a/FR-2b/FR-2c)

---

## Audit Questions

### Section 1: Lifecycle Stage Config
Using the snapshot data in `lifecycle_stages`:
1. Confirm count is exactly 25 (expected: 25)
2. List the 6 phases and their stage ranges
3. Identify which stages have `advisory_enabled: true`
4. Identify which stages have `sd_required: true`

### Section 2: SD Hierarchy Status
Using the snapshot data in `sd_hierarchy`:
1. Count completed vs active vs draft SDs
2. Verify parent-child relationships:
   - SD-VISION-TRANSITION-001 (orchestrator) → A, B, C, D, E, F
   - SD-VISION-TRANSITION-001D → D1, D2, D3, D4, D5, D6
3. Flag any status anomalies (e.g., parent active but all children completed)

### Section 3: PRD Alignment
Using the snapshot data in `prd_status`:
1. Match PRDs to their SDs
2. Flag any mismatches (e.g., SD completed but PRD not completed)
3. Note: PRD status being `approved` or `in_progress` for completed SDs is acceptable legacy state

### Section 4: User Stories Completion
Using the snapshot data in `user_stories_summary`:
1. Calculate overall completion rate
2. Flag any SDs with status=completed but stories not completed
3. Note validation gaps (completed but not validated)

### Section 5: Handoff Flow Analysis
Using the snapshot data in `handoffs_summary`:
1. Identify the typical happy-path handoff flow
2. Flag any SDs missing expected handoffs
3. Note rejection patterns (high rejection counts indicate iteration)

### Section 6: CrewAI Contracts (Informational Only)
Using the snapshot data in `crewai_contracts`:
1. List the 4 existing contracts
2. Note: Full wiring verification is deferred to Phase 2 (after F)

---

## Expected Audit Output Format

```markdown
# SD-VISION-TRANSITION-001 Phase 1 Audit Report

**Auditor**: AntiGravity
**Date**: [TODAY]
**Scope**: Limited (Database State Only)

## Executive Summary
[1-2 sentences: PASS/FAIL with key findings]

## Section 1: Lifecycle Stages
- Count: X/25 [PASS/FAIL]
- Phases: [list]
- Advisory stages: [list]
- SD-required stages: [list]

## Section 2: SD Hierarchy
- Total SDs: X
- Completed: X
- Active: X
- Draft: X
- Anomalies: [list or "None"]

## Section 3: PRD Alignment
- Aligned: X/Y
- Mismatches: [list or "None"]

## Section 4: User Stories
- Total: X
- Completed: X (Y%)
- Validated: X (Y%)
- Gaps: [list or "None"]

## Section 5: Handoff Flows
- Happy path: LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD
- Missing handoffs: [list or "None"]
- High-iteration SDs: [list SDs with >10 rejections]

## Section 6: CrewAI Contracts
- Count: X
- Status: [Informational - full audit in Phase 2]

## Recommendations
1. [If any]

## Phase 2 Scope (After F)
- [ ] CrewAI contract wiring verification
- [ ] End-to-end integration testing
- [ ] 40-stage cleanup verification (E deliverable)
```

---

## Data File Location
The database snapshot is at: `docs/audit/phase1-db-snapshot.json`

Please read that file and perform the audit according to the questions above.
