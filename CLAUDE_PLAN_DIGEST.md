<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-03-25T07:16:32.303Z -->
<!-- git_commit: 7de0b7c0 -->
<!-- db_snapshot_hash: 1ba41d24a4b01a2a -->
<!-- file_content_hash: pending -->

# CLAUDE_PLAN_DIGEST.md - PLAN Phase (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: PRD requirements and constraints (<5k chars)

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

## ESCALATE TO FULL FILE WHEN

- Debugging specific gate scoring or failure reasons
- Need handoff quality gate details (thresholds, weights, rubrics)
- PRD field requirements are unclear beyond anti-patterns



---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_PLAN.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-03-25 8:16:32 AM*
*Protocol: 4.3.3*
