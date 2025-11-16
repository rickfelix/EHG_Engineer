# Stage 5 Review - Universal Lessons Map

**Stage Name**: Stage 5 - Profitability Forecasting
**Review Date**: 2025-11-07
**Framework Version**: v1.0
**Reviewer**: Chairman
**Source**: `/docs/workflow/stage_review_lessons.md`

---

## Purpose

This lesson map applies the Universal Stage Review Lessons Framework to Stage 5's specific context: **Profitability Forecasting with intelligent recursion triggers**. Each lesson is evaluated for relevance and assigned a priority for this stage's review.

---

## Applicable Universal Lessons for Stage 5

| Lesson ID | Lesson Name | Category | Framework Priority | Stage 5 Priority | Rationale |
|-----------|-------------|----------|-------------------|------------------|-----------|
| **L1** | Functional ≠ Compliant | Governance | HIGH | **CRITICAL** | ROI calculation may work but must match dossier's recursion logic (FIN-001 trigger at <15%). "It calculates ROI" ≠ "It triggers recursion correctly per dossier prescription." |
| **L2** | CrewAI is Mandatory | Architectural | CRITICAL | **CRITICAL** | Stage 5 dossier implies financial analyst agent should automate ROI calculation and recursion detection. Missing CrewAI invocation = non-compliance. |
| **L3** | Cross-Stage Reuse | Process | HIGH | **HIGH** | Recursion engine (`recursionEngine.ts`) likely shares logic with Stage 3/4 validation patterns. Margin calculation may reuse Stage 4 competitive analysis data. |
| **L4** | Evidence-Based Governance | Governance | CRITICAL | **CRITICAL** | Every recursion trigger claim (e.g., "FIN-001 fired when ROI=12%") requires database record in `recursion_events` table, not just UI logs. |
| **L5** | Integration Debt Tracking | Process | HIGH | **MEDIUM** | If ROI calculation automation is incomplete, must create SD explicitly rather than "we'll automate later." |
| **L6** | Clarity of Intent | Governance | HIGH | **HIGH** | Dossier specifies 3 recursion triggers (FIN-001 to Stage 3/4/2) with precise thresholds. Ambiguity in which trigger fires when = governance dispute. |
| **L7** | Reuse Over Rebuild | Architectural | HIGH | **HIGH** | Validation threshold logic exists in `validationFramework.ts` + `evaValidation.ts`. Rebuilding separate financial threshold system = over-engineering. |
| **L8** | UI–Backend Coupling Awareness | Technical | CRITICAL | **CRITICAL** | Atomic unit: **ROI Calculator UI + recursionEngine.ts API + E2E test verifying FIN-001 trigger**. Frontend-only calculator without backend recursion = incomplete. |
| **L9** | Governance Continuity | Governance | HIGH | **HIGH** | Each FIN-001 recursion must reference upstream Stage 3/4 assumptions being invalidated. Metadata chain: Stage 3 willingness-to-pay → Stage 5 ROI calculation → recursion back to Stage 3. |
| **L10** | Policy Communication | Cultural | MEDIUM | **LOW** | If ROI threshold changes from 15% to 12%, update recursion policy in templates and notify team. Not critical for this review. |
| **L11** | Verification-First Pattern | Technical | HIGH | **CRITICAL** | Before implementing ROI calculator, verify: (1) Does `recursionEngine.ts` exist? (2) Do `recursion_events` table and `recursion_triggers` table exist? Test existence, don't assume. |
| **L12** | Pass Rate Thresholds Matter | Process | HIGH | **HIGH** | Dossier specifies ROI < 15% = CRITICAL auto-recursion, 15-20% = HIGH approval-required. Document these thresholds in code comments and tests. |
| **L13** | Administrative Bypass Documentation | Governance | MEDIUM | **MEDIUM** | Chairman can override FIN-001 trigger for "strategic reasons." Document bypasses in `administrative_notes` field of recursion_events table. |
| **L14** | Retrospective Quality Gates | Process | CRITICAL | **CRITICAL** | Stage 5 completion requires retrospective with ≥70 quality score BEFORE marking status='complete'. No exceptions. |
| **L15** | Database-First Completion | Technical | CRITICAL | **CRITICAL** | Update `recursion_events` table FIRST when FIN-001 fires, THEN update UI. Markdown documentation generated AFTER database state change. |

---

## Priority Summary

**CRITICAL (7 lessons)**: L1, L2, L4, L8, L11, L14, L15
**HIGH (5 lessons)**: L3, L6, L7, L9, L12
**MEDIUM (2 lessons)**: L5, L13
**LOW (1 lesson)**: L10

---

## CrewAI Compliance Checklist (L2 - Mandatory)

Per `/docs/workflow/crewai_compliance_policy.md`, verify the following for Stage 5:

- [ ] **Prescribed Agent Identified**: Dossier implies `FinancialAnalystAgent` for ROI calculation and recursion detection
- [ ] **Agent Registered in Database**: Query `crewai_agents` table for `FinancialAnalystAgent` or equivalent
- [ ] **Agent Invoked in Code**: Search codebase for agent invocation in profitability forecasting workflow
- [ ] **Crew Defined (if multi-agent)**: If financial validation requires multiple agents (e.g., `FinancialAnalystAgent` + `RecursionDetectorAgent`), verify crew exists
- [ ] **Integration Points Documented**: Document how CrewAI agent integrates with `recursionEngine.ts` and UI

**Compliance Status**: TBD (pending as-built inventory)

---

## Adaptive Framework Application (3-Step Process)

### Step 1: Review Mapping

**Stage 5 Deliverables** (from dossier):
1. ROI calculation logic (`calculatedROI` function)
2. Recursion trigger detection (`onStage5Complete` function)
3. Recursion event logging to database (`recursion_events` table)
4. UI pre-emptive warnings (green/yellow/red ROI indicators)
5. Financial model comparison UI (side-by-side before/after recursion)

**Lesson Mapping**:
- **L1 applies**: Verify `onStage5Complete` matches dossier's JavaScript pseudocode exactly
- **L2 applies**: Verify CrewAI agent handles ROI calculation per automation requirement
- **L4 applies**: Verify every FIN-001 trigger logged to database with full financial snapshot
- **L8 applies**: Verify ROI Calculator UI + backend API + E2E test all exist
- **L11 applies**: Test if `recursionEngine.ts` and `recursion_events` table exist BEFORE analyzing integration

### Step 2: Prioritize Relevance

**For Stage 5 Review**:
1. **CRITICAL lessons (must enforce)**: L1, L2, L4, L8, L11, L14, L15
2. **HIGH lessons (strongly recommended)**: L3, L6, L7, L9, L12
3. **MEDIUM/LOW lessons (reference only)**: L5, L10, L13

**Focus Areas**:
- **CrewAI compliance** (L2): Most likely gap based on Stage 4 findings
- **Evidence-based recursion** (L4): Verify `recursion_events` table populated
- **Verification-first** (L11): Test recursion engine existence before assuming integration complete
- **UI-backend coupling** (L8): Financial calculator must integrate with recursion API

### Step 3: Customize Actions

**Verification Actions for Stage 5**:

1. **L1 (Functional ≠ Compliant)**:
   - Action: Compare implemented `onStage5Complete` code to dossier pseudocode line-by-line
   - Evidence: File path to implementation + line numbers where logic differs (if any)

2. **L2 (CrewAI Mandatory)**:
   - Action: Query `SELECT * FROM crewai_agents WHERE name LIKE '%Financial%' OR name LIKE '%Profitability%'`
   - Evidence: Database query result (0 rows = non-compliant)

3. **L4 (Evidence-Based Governance)**:
   - Action: Query `SELECT * FROM recursion_events WHERE trigger_type = 'FIN-001' LIMIT 5`
   - Evidence: Database records or "0 rows returned" (if stage not yet implemented)

4. **L8 (UI-Backend Coupling)**:
   - Action: Glob search for ROI UI component: `src/components/**/*ROI*.tsx`
   - Action: Grep search for API endpoint: `pattern:"recursionEngine" output_mode:"files_with_matches"`
   - Action: Glob search for E2E test: `tests/e2e/**/*recursion*.spec.ts`
   - Evidence: File paths for all 3 components or "not found"

5. **L11 (Verification-First)**:
   - Action: Read `/mnt/c/_EHG/ehg/src/services/recursionEngine.ts` (test existence)
   - Action: Query `SELECT * FROM information_schema.tables WHERE table_name = 'recursion_events'`
   - Evidence: File exists/not found + table schema or null

6. **L14 (Retrospective Quality Gates)**:
   - Action: Query `SELECT * FROM retrospectives WHERE sd_id = 'SD-STAGE-5-PROFITABILITY' AND quality_score >= 70`
   - Evidence: Retrospective record or "not created yet"

7. **L15 (Database-First)**:
   - Action: Verify `recursion_events` insert happens BEFORE UI redirect in code
   - Evidence: Code snippet showing database write precedes UI state change

---

## Cross-Stage Reuse Opportunities (L3)

**Expected Reuse from Prior Stages**:

| Source Stage | Reusable Pattern | Location | Stage 5 Application |
|--------------|------------------|----------|---------------------|
| **Stage 3** | Validation threshold framework | `validationFramework.ts` | Reuse for ROI < 15% threshold detection |
| **Stage 4** | Quality scoring logic | `evaValidation.ts` | Reuse for margin quality assessment |
| **Stage 2** | CrewAI agent pattern | `agent-platform/app/crews/research_crew.py` | Adapt for `FinancialAnalystAgent` crew |
| **SD-GITHUB-ACTIONS** | Verification-first pattern | `gh secret list` approach | Test recursion DB before implementing triggers |

**Search Actions**:
- Grep: `pattern:"validationFramework" output_mode:"files_with_matches"`
- Grep: `pattern:"evaValidation" output_mode:"files_with_matches"`
- Glob: `agent-platform/app/crews/**/*.py`

---

## When Starting Stage 5 Review (Checklist)

- [x] Read `/docs/workflow/stage_review_lessons.md` (Universal Framework)
- [x] Identify 7 CRITICAL lessons (L1, L2, L4, L8, L11, L14, L15)
- [ ] Add lesson verification steps to Stage 5 as-built inventory
- [ ] Consult retrospectives database for FIN-001 or recursion patterns
- [ ] Document lesson adaptations in gap analysis
- [ ] Update lesson references in decision record metadata
- [ ] Verify all CRITICAL lessons applied before final approval

---

## Stage 5 Specific Notes

**Key Risk**: This is a **CRITICAL recursion trigger stage**. If recursion logic is incomplete, ventures may proceed with invalid financial assumptions, wasting resources on unviable projects.

**Validation Focus**: Prioritize evidence that FIN-001 triggers actually work:
1. Unit test showing ROI=12% triggers recursion
2. Database record in `recursion_events` after trigger
3. UI correctly displays recursion explanation modal
4. Venture state correctly updated to "recursing to Stage 3"

**Chairman Authority**: Per dossier, Chairman can override recursion for "strategic reasons." Verify override capability exists and is logged.

---

**End of Stage 5 Lesson Map**
**Next Step**: Create `01_dossier_summary.md` and begin as-built inventory with lesson-guided verification actions.
