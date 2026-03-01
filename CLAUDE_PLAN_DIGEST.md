
## Table of Contents

- [PLAN Phase Negative Constraints](#plan-phase-negative-constraints)
- [🚫 PLAN Phase Negative Constraints](#-plan-phase-negative-constraints)
  - [NC-PLAN-001: No Implementation in PLAN Phase](#nc-plan-001-no-implementation-in-plan-phase)
  - [NC-PLAN-002: No PRD Without Exploration](#nc-plan-002-no-prd-without-exploration)
  - [NC-PLAN-003: No Boilerplate Acceptance Criteria](#nc-plan-003-no-boilerplate-acceptance-criteria)
  - [NC-PLAN-004: No Skipping Sub-Agents](#nc-plan-004-no-skipping-sub-agents)
  - [NC-PLAN-005: No Placeholder Requirements](#nc-plan-005-no-placeholder-requirements)
- [PLAN Pre-EXEC Checklist](#plan-pre-exec-checklist)
- [PLAN Agent Pre-EXEC Checklist (MANDATORY)](#plan-agent-pre-exec-checklist-mandatory)
  - [Database Dependencies ✅](#database-dependencies-)
  - [Architecture Planning ✅](#architecture-planning-)
  - [Testing Strategy ✅](#testing-strategy-)
  - [Quality Validation ✅](#quality-validation-)
- [PRD Creation Anti-Pattern (PROHIBITED)](#prd-creation-anti-pattern-prohibited)
  - [Why This Matters](#why-this-matters)
  - [Archived Scripts Location](#archived-scripts-location)
  - [Correct Workflow](#correct-workflow)
- [Quality Assessment Integration in Handoffs](#quality-assessment-integration-in-handoffs)
  - [When Quality Assessment Runs](#when-quality-assessment-runs)
  - [Hierarchical Context in Handoff Validation](#hierarchical-context-in-handoff-validation)
  - [Handoff Failure Handling](#handoff-failure-handling)
  - [Integration with PRD Schema](#integration-with-prd-schema)
  - [Common Quality Issues and AI Feedback](#common-quality-issues-and-ai-feedback)
  - [Best Practices for PLAN Phase](#best-practices-for-plan-phase)
  - [Quality Assessment vs Traditional Validation](#quality-assessment-vs-traditional-validation)
  - [Performance and Cost in Handoffs](#performance-and-cost-in-handoffs)
  - [Example: Successful PLAN → EXEC Handoff](#example-successful-plan-exec-handoff)
  - [Files Reference](#files-reference)

<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-20T21:53:28.254Z -->
<!-- git_commit: 58a9f184 -->
<!-- db_snapshot_hash: 1787835840a9ee3a -->
<!-- file_content_hash: pending -->

# CLAUDE_PLAN_DIGEST.md - PLAN Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: PRD requirements and validation gates (<5k chars)

---

## PLAN Phase Negative Constraints

## 🚫 PLAN Phase Negative Constraints

<negative_constraints phase="PLAN">
These anti-patterns are specific to the PLAN phase. Violating them leads to incomplete PRDs and blocked handoffs.

### NC-PLAN-001: No Implementation in PLAN Phase
**Anti-Pattern**: Writing actual code (components, services, migrations) during PLAN
**Why Wrong**: PLAN is for specification, not execution. Code written here won't be tracked.
**Correct Approach**: Document requirements, architecture, and test scenarios. Save coding for EXEC.

### NC-PLAN-002: No PRD Without Exploration
**Anti-Pattern**: Creating PRD immediately after SD approval without reading codebase
**Why Wrong**: PRDs miss existing infrastructure, create duplicate work, conflict with patterns
**Correct Approach**: Read ≥5 relevant files, document findings in exploration_summary

### NC-PLAN-003: No Boilerplate Acceptance Criteria
**Anti-Pattern**: Using generic criteria like "all tests pass", "code review done", "meets requirements"
**Why Wrong**: Russian Judge detects boilerplate (≤50% score), blocks PLAN→EXEC handoff
**Correct Approach**: Write specific, measurable criteria tied to functional requirements

### NC-PLAN-004: No Skipping Sub-Agents
**Anti-Pattern**: Creating PRD without running DESIGN, DATABASE sub-agents
**Why Wrong**: Gate 1 blocks handoff if sub-agent execution not recorded
**Correct Approach**: Use Task tool with specialized sub-agents:
```
Task(subagent_type="design-agent", prompt="Execute DESIGN analysis for SD-XXX...")
Task(subagent_type="database-agent", prompt="Execute DATABASE analysis for SD-XXX...")
```
⚠️ Do NOT use `node lib/sub-agent-executor.js` in interactive sessions - use Task tool instead.

### NC-PLAN-005: No Placeholder Requirements
**Anti-Pattern**: Using "TBD", "to be defined", "will be determined" in requirements
**Why Wrong**: PRD validator blocks placeholders, signals incomplete planning
**Correct Approach**: If truly unknown, use AskUserQuestion to clarify before PRD creation
</negative_constraints>

## PLAN Pre-EXEC Checklist

## PLAN Agent Pre-EXEC Checklist (MANDATORY)

**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.

Before creating PLAN→EXEC handoff, PLAN agent MUST verify:

### Database Dependencies ✅
- [ ] **Identify all data dependencies** in PRD
- [ ] **Run schema verification script** for data-dependent SDs
- [ ] **Verify tables/columns exist** OR create migration
- [ ] **Document verification results** in PLAN→EXEC handoff
- [ ] If tables missing: **Escalate to LEAD** with options

**Success Pattern** (SD-UAT-003):
> "Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours"

### Architecture Planning ✅
- [ ] **Component sizing estimated** (target 300-600 lines per component)
- [ ] **Existing infrastructure identified** (don't rebuild what exists)
- [ ] **Third-party libraries considered** before custom code

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

### Testing Strategy ✅
- [ ] **Smoke tests defined** (3-5 tests minimum)
- [ ] **Test scenarios documented** in PRD

### Quality Validation ✅
- [ ] **Verified claims with code review** (if UI/UX SD)
- [ ] **Assessed technical feasibility**
- [ ] **Identified potential blockers**

**Success Pattern** (SD-UAT-002):
> "LEAD code review rejected 3/5 false claims → saved hours of unnecessary work"

## PRD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off PRD creation scripts like:**
- `create-prd-sd-*.js`
- `insert-prd-*.js`
- `enhance-prd-*.js`

**ALWAYS use the standard CLI:**
### Why This Matters
- One-off scripts bypass PRD quality validation
- They create massive maintenance burden (100+ orphaned scripts)
- They fragment PRD creation patterns

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- `scripts/archived-prd-scripts/`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run `node scripts/add-prd-to-database.js`
2. Follow the modular PRD creation system in `scripts/prd/`
3. PRD is properly validated against quality rubrics

## Quality Assessment Integration in Handoffs

**Context**: AI-powered Russian Judge quality assessment is integrated into PLAN → EXEC handoffs to validate PRD and User Story quality before implementation begins.

### When Quality Assessment Runs

**PLAN → EXEC Handoff** (`npm run handoff` from PLAN phase):
1. **PRD Quality Validation**: Evaluates PRD against 4 weighted criteria (see AI-Powered Russian Judge section)
2. **User Story Quality Validation**: Evaluates User Stories against INVEST principles + acceptance criteria clarity
3. **Threshold**: Both must score ≥70% to proceed to EXEC phase

**Why At Handoff Time?**:
- Catches quality issues BEFORE implementation starts (prevents rework)
- Forces PLAN agent to address ambiguity and placeholder text
- Ensures EXEC agent receives implementation-ready requirements

### Hierarchical Context in Handoff Validation

**PRD Validation**:
**What Happens**:
1. Handoff script fetches PRD from database
2. If `prd.sd_id` exists, fetches parent SD from `strategic_directives_v2`
3. Passes both PRD + SD context to AI evaluator
4. AI evaluates PRD requirements against SD strategic objectives
5. Returns holistic assessment ("PRD architecture is solid but doesn't address SD's cost reduction objective")

**User Story Validation**:
**What Happens**:
1. Handoff script fetches User Story from database
2. Fetches parent PRD via `user_story.prd_id`
3. Passes both User Story + PRD context to AI evaluator
4. AI validates User Story acceptance criteria align with PRD requirements

### Handoff Failure Handling

**If Quality Assessment Fails (score < 70)**:

**Handoff Script Returns**:
**PLAN Agent Must**:
1. **Address all `issues`** (score < 5/10) - These are blockers
2. **Consider `warnings`** (score 5-7/10) - Recommended improvements
3. **Regenerate PRD/User Stories** in database
4. **Re-run handoff validation** (`npm run handoff`)

**Quality Gate Enforcement**: Handoff script will NOT create EXEC handoff entry until PRD/User Story quality passes threshold.

### Integration with PRD Schema

**PRD Database Schema** (`product_requirements_v2` table):
- `id`: PRD identifier
- `sd_id`: Foreign key to parent Strategic Directive
- `functional_requirements`: JSONB array of requirements
- `ui_ux_requirements`: JSONB array of UI requirements
- `technical_architecture`: JSONB object (overview, components, data_flow, integration_points)
- `test_scenarios`: JSONB array of test scenarios
- `acceptance_criteria`: JSONB array of criteria
- `risks`: JSONB array of risks + mitigation
- `status`: PRD lifecycle status

**AI Assessment Validates**:
- **Depth**: Are requirements specific or generic?
- **Architecture**: Are components, data flow, and integration points explained?
- **Tests**: Do scenarios cover happy path + edge cases + error conditions?
- **Risks**: Are technical risks identified with mitigation + rollback plans?

**Quality Before Quantity**: Better to have 5 deeply detailed requirements (score 8/10) than 20 placeholder requirements (score 3/10).

### Common Quality Issues and AI Feedback

**Issue**: Placeholder Text in Requirements
```
AI Feedback: "requirements_depth_specificity: Needs significant improvement (3/10) -
Functional requirement #4 states 'Authentication flow to be defined during implementation'.
This prevents EXEC agent from implementing. Specify: authentication method (OAuth, JWT),
user roles, session timeout, error handling."
```

**Issue**: Missing Architecture Details
```
AI Feedback: "architecture_explanation_quality: Room for improvement (5/10) -
Architecture mentions 'React components and Node.js backend' but missing:
- How do components communicate? (Props, Context, Redux?)
- What is the API structure? (REST endpoints, GraphQL schema?)
- Where is state managed? (Client-side, server-side, hybrid?)"
```

**Issue**: Trivial Test Scenarios
```
AI Feedback: "test_scenario_sophistication: Room for improvement (6/10) -
Test scenarios only cover happy path ('user logs in successfully'). Missing:
- Edge cases: user enters wrong password, network timeout, expired session
- Error conditions: database unavailable, rate limiting, concurrent login attempts
- Performance tests: login under load, response time validation"
```

### Best Practices for PLAN Phase

**To Pass PRD Quality Gate (≥70%)**:
1. **Replace ALL placeholders** ("To be defined", "TBD") with specific details
2. **Add baseline + target metrics** for measurable requirements ("reduce from X to Y")
3. **Document data flow and integration points** in technical architecture
4. **Include edge cases and error conditions** in test scenarios
5. **Provide specific mitigation strategies** (not "test thoroughly") for risks

**To Pass User Story Quality Gate (≥70%)**:
1. **Write specific, testable acceptance criteria** ("Given X, When Y, Then Z")
2. **Follow INVEST principles** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
3. **Provide user context** (who is the user? what problem are they solving?)
4. **Link to parent PRD requirements** for traceability

### Quality Assessment vs Traditional Validation

**Traditional Validation** (still used):
- Field presence: "Does `functional_requirements` exist?"
- Data types: "Is `test_scenarios` a JSONB array?"
- Foreign keys: "Does `sd_id` reference a valid Strategic Directive?"

**AI Quality Assessment** (new):
- Content depth: "Are requirements specific or generic?"
- Semantic meaning: "Does PRD align with SD strategic objectives?"
- Anti-patterns: "Does content contain placeholder text or boilerplate?"

**Both Required**: Traditional validation catches structural issues. AI assessment catches quality issues. A PRD can pass traditional validation (all fields present) but fail AI assessment (all fields contain "To be defined").

### Performance and Cost in Handoffs

**Typical PLAN → EXEC Handoff**:
- PRD validation: ~3-8 seconds, $0.003-0.008
- User Story validation (×5 stories): ~5-10 seconds, $0.005-0.010
- **Total**: ~10-20 seconds, $0.01-0.02 per handoff

**User Prioritization**: Quality over speed. Better to wait 20 seconds for thorough validation than proceed with ambiguous requirements and waste hours in EXEC rework.

**Caching Strategy**: Assessments stored in `ai_quality_assessments` table. If PRD unchanged since last assessment, can reuse previous score (optimization for future implementation).

### Example: Successful PLAN → EXEC Handoff

1. **PLAN agent creates PRD** with specific requirements, detailed architecture, comprehensive tests
2. **User runs**: `npm run handoff`
3. **PRD Quality Assessment**:
   - requirements_depth_specificity: 8/10 (all requirements specific and actionable)
   - architecture_explanation_quality: 9/10 (components, data flow, integration points explained)
   - test_scenario_sophistication: 7/10 (happy path + edge cases covered)
   - risk_analysis_completeness: 8/10 (risks with mitigation + rollback plans)
   - **Weighted Score**: 82/100 ✅ PASS
4. **User Story Quality Assessment**: All stories score ≥70% ✅ PASS
5. **Handoff Entry Created**: `from_phase=PLAN`, `to_phase=EXEC`, `status=pending`
6. **EXEC Agent Proceeds**: Implementation with clear, unambiguous requirements

**Result**: No rework, no ambiguity, faster implementation.

### Files Reference

**Handoff Validation Script**:
- `/scripts/validate-plan-handoff.js` (PRD + User Story quality checks)

**Rubric Implementations**:
- `/scripts/modules/rubrics/prd-quality-rubric.js`
- `/scripts/modules/rubrics/user-story-quality-rubric.js`

**Database Tables**:
- `product_requirements_v2`: Product Requirements Documents
- `user_stories`: User Stories linked to PRDs
- `ai_quality_assessments`: Assessment history and scores
- `handoffs`: Handoff status tracking (includes quality gate results)


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_PLAN.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-20 4:53:28 PM*
*Protocol: 4.3.3*
