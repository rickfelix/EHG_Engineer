# Plan: Parent-Child SD Protocol Clarity


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, e2e, unit, migration

**Status**: PROPOSED
**Date**: 2025-12-06
**Author**: Claude (LEO Protocol Enhancement)
**Scope**: LEO Protocol v4.3.4 Enhancement

---

## Executive Summary

This plan addresses **confusion in the LEO Protocol** around how parent and child Strategic Directives progress through phases. The database schema supports parent-child relationships, but the CLAUDE.md files lack clear documentation, creating ambiguity during execution.

---

## Problem Statement

### Current State

1. **Database has parent-child infrastructure** ✅
   - `parent_sd_id` column exists
   - `relationship_type` enum: `standalone`, `parent`, `child_phase`, `child_independent`
   - `sd_family_tree` view exists
   - `calculate_parent_sd_progress()` function exists
   - Validation trigger `validate_child_sd_phase_transition()` exists

2. **CLAUDE.md files have GAPS** ❌
   - `CLAUDE_LEAD.md` has partial coverage (lines 503-575) but only blocking rules
   - `CLAUDE_PLAN.md` has **NO** parent-child guidance
   - `CLAUDE_EXEC.md` has **NO** parent-child guidance
   - `CLAUDE_CORE.md` has **NO** parent-child overview
   - Pending sections exist in `docs/pending-protocol-updates/` but **never applied**

3. **Real-world data shows inconsistencies**
   - Parent `SD-ARCH-EHG-000` has `progress: 65` but child `SD-ARCH-EHG-003` has `progress: 100`
   - Children marked as `status: completed` but `progress: 0`
   - Mixed `relationship_type` values (`child_phase` vs `standalone`) in same family

---

## Root Cause Analysis

| Issue | Root Cause |
|-------|------------|
| Agents don't know when to create child SDs | No decision matrix in CLAUDE_PLAN.md |
| Agents don't know how handoffs work for children | No handoff guidance in CLAUDE_EXEC.md |
| Agents don't know how parent progress is calculated | No calculation explanation in CLAUDE_CORE.md |
| Phase rules are unclear | CLAUDE_LEAD.md only shows blocking, not workflow |
| Pending sections never applied | Manual step was never executed after migration |

---

## Proposed Solution: Unified Parent-Child SD Documentation

### Design Principles

1. **Parent SDs are Orchestrators** - They don't contain implementation code
2. **Child Types Have Different Workflows**:
   - `child_phase`: Shares parent's EXEC phase (checkpoints)
   - `child_independent`: Own full LEAD→PLAN→EXEC cycle
3. **Progress Flows Upward** - Parent progress = weighted child progress
4. **Handoffs Are Per-SD** - Each SD (parent and child) needs proper handoffs
5. **Phase Gates Apply to All** - Both parent and child must pass quality gates

---

## Implementation Plan

### Phase 1: Database Protocol Sections (Insert Missing Content)

**Task 1.1**: Add Parent-Child Overview to CLAUDE_CORE.md

```sql
INSERT INTO leo_protocol_sections (
  protocol_id,
  section_key,
  title,
  content,
  section_type,
  target_file,
  context_tier,
  sort_order,
  is_active
) VALUES (
  'leo-v4-3-3-ui-parity',
  'parent_child_sd_overview',
  'Parent-Child SD Hierarchy',
  '## Parent-Child SD Hierarchy

### Overview

The LEO Protocol supports hierarchical SD relationships for multi-phase or multi-session work.

### Relationship Types

| Type | Description | LEO Workflow | Use Case |
|------|-------------|--------------|----------|
| `standalone` | Default, no parent | Full LEAD→PLAN→EXEC | Normal single-scope SDs |
| `parent` | Orchestrator SD | LEAD→PLAN→(wait for children)→PLAN→LEAD | Coordinates child SDs |
| `child_phase` | Inherits parent EXEC | Activates when parent in EXEC | Checkpoints, shared implementation |
| `child_independent` | Own workflow | Full LEAD→PLAN→EXEC per child | Parallel work streams |

### Key Rules

1. **Parent must reach EXEC** before `child_phase` SDs can activate
2. **Parent progress** = weighted average of child progress (by priority)
3. **Each SD needs handoffs** - parent and children have separate handoff records
4. **Parent completes last** - after all children complete

### Database Functions

```sql
-- View family hierarchy
SELECT * FROM sd_family_tree WHERE parent_id = ''SD-PARENT-001'';

-- Calculate parent progress from children
SELECT calculate_parent_sd_progress(''SD-PARENT-001'');

-- Get progress breakdown (includes parent-child rollup)
SELECT * FROM get_parent_sd_progress_with_children(''SD-PARENT-001'');
```

### Phase Flow Diagram

```
PARENT SD (Orchestrator):
  LEAD → PLAN → [PRD defines children] → EXEC (parent enters EXEC)
                                              ↓
  CHILD SDs (child_phase):           [Children activate]
                                              ↓
    Child A: EXEC (work) → Complete
    Child B: EXEC (work) → Complete
    Child C: EXEC (work) → Complete
                                              ↓
  PARENT SD:                          [All children complete]
                                              ↓
                              EXEC → PLAN (verify) → LEAD (close)
```

### Progress Calculation

Parent progress is calculated from weighted child progress:

| Child Priority | Weight |
|----------------|--------|
| critical | 40% |
| high | 30% |
| medium | 20% |
| low | 10% |

**Formula**: `parent_progress = Σ(child.progress × weight) / Σ(weight)`
',
  'core_context',
  'CLAUDE_CORE.md',
  'ALL',
  150,
  true
);
```

**Task 1.2**: Add Child SD Pattern to CLAUDE_PLAN.md

```sql
INSERT INTO leo_protocol_sections (
  protocol_id,
  section_key,
  title,
  content,
  section_type,
  target_file,
  context_tier,
  sort_order,
  is_active
) VALUES (
  'leo-v4-3-3-ui-parity',
  'child_sd_pattern_plan',
  'Child SD Pattern: When to Create Child SDs',
  '## Child SD Pattern: When to Create Child SDs

### Decision Matrix

| Criteria | Use Single SD | Use Parent + Children |
|----------|---------------|----------------------|
| User Stories | < 8 | ≥ 8 |
| Sessions | 1-2 | 3+ |
| Phases | 1-2 | 3+ distinct phases |
| Parallelization | Sequential | Can parallelize |
| Duration | Days | Weeks |

### When to Use `child_phase` vs `child_independent`

| Use `child_phase` When | Use `child_independent` When |
|------------------------|------------------------------|
| Children share same EXEC context | Children need separate PRDs |
| Checkpoints within one implementation | Parallel work by different agents |
| Sequential dependencies | No dependencies between children |
| Shared codebase/branch | Separate branches/repos |

### Creating Child SDs in PLAN Phase

**Step 1: Mark Parent as Orchestrator**
```sql
UPDATE strategic_directives_v2
SET relationship_type = ''parent''
WHERE id = ''SD-PARENT-001'';
```

**Step 2: Create Child SDs with Parent Reference**
```sql
INSERT INTO strategic_directives_v2 (id, title, parent_sd_id, relationship_type, priority)
VALUES
  (''SD-PARENT-001-PHASE-A'', ''Phase A: Foundation'', ''SD-PARENT-001'', ''child_phase'', ''critical''),
  (''SD-PARENT-001-PHASE-B'', ''Phase B: Features'', ''SD-PARENT-001'', ''child_phase'', ''high''),
  (''SD-PARENT-001-PHASE-C'', ''Phase C: Polish'', ''SD-PARENT-001'', ''child_phase'', ''medium'');
```

**Step 3: Parent PRD Documents Children**

The parent PRD should include:
- **Children Overview**: List all child SDs with scope
- **Dependencies**: Which children depend on others
- **Phase Sequence**: Order of execution
- **Rollup Criteria**: When parent can complete

### Handoffs for Parent SDs

| Transition | What Happens |
|------------|--------------|
| LEAD→PLAN | Parent approved, children identified |
| PLAN→EXEC | Parent enters EXEC, `child_phase` children can activate |
| EXEC (ongoing) | Children work independently |
| Children→Complete | Each child creates EXEC→PLAN handoff |
| EXEC→PLAN | Parent verifies all children complete |
| PLAN→LEAD | Parent final approval |

### PRD Template for Parent SDs

```markdown
## Child SD Overview

| Child ID | Scope | Priority | Dependency |
|----------|-------|----------|------------|
| SD-XXX-PHASE-A | Foundation | critical | None |
| SD-XXX-PHASE-B | Features | high | Phase A |
| SD-XXX-PHASE-C | Polish | medium | Phase B |

## Completion Criteria

Parent SD completes when:
- [ ] All child SDs have status = ''completed''
- [ ] Parent progress = 100% (calculated from children)
- [ ] Orchestration retrospective created
```
',
  'planning_pattern',
  'CLAUDE_PLAN.md',
  'PHASE_PLAN',
  850,
  true
);
```

**Task 1.3**: Add Child SD Execution to CLAUDE_EXEC.md

```sql
INSERT INTO leo_protocol_sections (
  protocol_id,
  section_key,
  title,
  content,
  section_type,
  target_file,
  context_tier,
  sort_order,
  is_active
) VALUES (
  'leo-v4-3-3-ui-parity',
  'exec_child_sds',
  'Working with Child SDs During EXEC',
  '## Working with Child SDs During EXEC

### Activation Rules

**For `child_phase` SDs**:
- Parent MUST be in EXEC phase before children can activate
- Children automatically inherit EXEC phase from parent
- Attempting to activate child while parent in PLAN will FAIL

**For `child_independent` SDs**:
- Each child goes through full LEAD→PLAN→EXEC
- No dependency on parent phase
- Can run in parallel with parent

### Implementation Flow

```
Parent enters EXEC
      ↓
Children activate (child_phase) or work independently (child_independent)
      ↓
For each child:
  1. Work on child''s user stories
  2. Run child''s tests
  3. Update child''s progress
  4. Create child''s EXEC→PLAN handoff
  5. Mark child as completed
      ↓
After ALL children complete:
  1. Verify via: SELECT * FROM sd_family_tree WHERE parent_id = ''SD-XXX''
  2. Check: SELECT calculate_parent_sd_progress(''SD-XXX'')
  3. Create parent EXEC→PLAN handoff
  4. Mark parent as completed
```

### Progress Tracking During EXEC

```javascript
// Update child progress as you work
await supabase
  .from(''strategic_directives_v2'')
  .update({ progress: 75 })
  .eq(''id'', ''SD-PARENT-001-PHASE-A'');

// Parent progress auto-calculates from children
// DO NOT manually set parent progress when children exist
```

### Common Mistakes to Avoid

| Mistake | Why It''s Wrong | Correct Approach |
|---------|-----------------|------------------|
| Setting parent progress manually | Overwrites calculated value | Let function calculate |
| Activating child before parent in EXEC | Trigger will block | Move parent to EXEC first |
| Skipping child handoffs | Missing audit trail | Each child needs EXEC→PLAN |
| Completing parent before children | Progress will be wrong | Wait for all children |

### Handoff Checklist for Child SDs

Before creating child EXEC→PLAN handoff:
- [ ] Child''s user stories completed
- [ ] Child''s tests passing (unit + E2E)
- [ ] Child''s deliverables verified
- [ ] Child''s progress = 100
- [ ] Child''s retrospective created (optional per child)

Before creating parent EXEC→PLAN handoff:
- [ ] All children have status = completed
- [ ] `calculate_parent_sd_progress()` returns 100
- [ ] Orchestration summary written
- [ ] Cross-child learnings documented

### Re-activating Parent SD for Child Work

If parent SD transitions back to PLAN while children still need work:

```sql
-- Re-activate parent to EXEC
UPDATE strategic_directives_v2
SET current_phase = ''EXEC'', status = ''in_progress''
WHERE id = ''SD-PARENT-001'';

-- Document the re-activation
INSERT INTO sd_phase_handoffs (sd_id, from_phase, to_phase, summary, created_by)
VALUES (''SD-PARENT-001'', ''PLAN'', ''EXEC'', ''Re-activating for child SD execution'', ''UNIFIED-HANDOFF-SYSTEM'');
```
',
  'execution_pattern',
  'CLAUDE_EXEC.md',
  'PHASE_EXEC',
  350,
  true
);
```

**Task 1.4**: Update CLAUDE_LEAD.md Parent-Child Governance Section

The existing section (lines 503-575) needs expansion:

```sql
UPDATE leo_protocol_sections
SET content = '## Parent-Child SD Phase Governance (PAT-PARENT-CHILD-001)

### Overview

Parent-child SD relationships enable multi-phase, multi-session work while maintaining LEO Protocol discipline.

### The Two Child Types

| Type | `child_phase` | `child_independent` |
|------|---------------|---------------------|
| **Workflow** | Inherits parent EXEC | Own LEAD→PLAN→EXEC |
| **Activation** | When parent enters EXEC | Anytime (follows standard SD rules) |
| **Phase Sync** | Locked to parent phase | Independent phases |
| **Handoffs** | Simplified (EXEC only) | Full handoff set |
| **Use Case** | Checkpoints, phases | Parallel work streams |

### Phase Governance Rules

**Rule 1: Parent Must Lead**
- Parent SD completes LEAD approval first
- Parent SD completes PLAN (PRD defines children)
- Parent SD enters EXEC → children can activate

**Rule 2: Child Phase Sync**
- `child_phase` SDs cannot have different phase than parent
- Database trigger enforces: "Child SD cannot be activated while parent is in PLAN phase"

**Rule 3: Completion Order**
- Children complete first (each marks status = completed)
- Parent completes last (after verifying all children)
- Parent retrospective covers orchestration learnings

### LEAD Agent Actions for Parent SDs

**During SD Approval**:
1. Identify if work requires parent-child pattern (≥8 stories, multi-phase)
2. If yes, mark SD as `relationship_type = ''parent''`
3. Document expected children in SD description
4. Note dependencies between children

**During Final Approval**:
1. Verify all children have status = completed
2. Verify parent progress = 100% (from children)
3. Review orchestration retrospective
4. Approve parent SD closure

### Error Messages and Resolution

**Error**: "Child SD cannot be activated while parent is in PLAN phase"
- **Cause**: Attempted to activate `child_phase` SD before parent reached EXEC
- **Fix**: Run parent PLAN→EXEC handoff first

**Error**: Parent progress lower than expected
- **Cause**: Not all children are at 100% progress
- **Fix**: Complete remaining children, progress will auto-calculate

### Quick Reference Commands

```bash
# View parent-child hierarchy
node -e "... select from sd_family_tree ..."

# Check parent progress calculation
node -e "... select calculate_parent_sd_progress(''SD-XXX'') ..."

# Re-activate parent for child work
node scripts/reactivate-parent-sd.js SD-PARENT-001
```
'
WHERE section_key = 'parent_child_governance';
```

---

### Phase 2: Create Helper Scripts

**Task 2.1**: Create `scripts/reactivate-parent-sd.js`

Script to safely transition parent SD back to EXEC for child work.

**Task 2.2**: Create `scripts/check-parent-child-status.js`

Script to display family tree status and progress calculation.

**Task 2.3**: Update `scripts/handoff.js` for Parent-Child Awareness

Add checks:
- If SD is parent, verify children status before completion
- If SD is child_phase, verify parent is in EXEC

---

### Phase 3: Regenerate CLAUDE.md Files

**Task 3.1**: Run Generation Script

```bash
node scripts/generate-claude-md-from-db.js
```

**Task 3.2**: Verify Content Appears

Check that all four sections now appear in:
- CLAUDE_CORE.md: Parent-Child SD Hierarchy
- CLAUDE_PLAN.md: Child SD Pattern
- CLAUDE_EXEC.md: Working with Child SDs
- CLAUDE_LEAD.md: Parent-Child Governance (updated)

---

### Phase 4: Update ADR-002

**Task 4.1**: Add Section to ADR-002

Add to "Section 5: Leo Dashboard Integration":

```markdown
### Parent SD Orchestration for Stage Implementation

When implementing the 25-stage Venture Workflow:

**Option A: Stage-per-SD (Recommended for MVP)**
- Each stage gets its own standalone SD
- Simpler workflow, no parent-child complexity
- Progress tracked per-stage

**Option B: Phase Bundles (For Large Implementations)**
- Parent SD: "Implement Stages 1-6" (orchestrator)
- Child SDs: One per stage (child_phase or child_independent)
- Parent progress rolls up from children

**Recommendation**: Start with Option A. Use Option B only when stages have shared dependencies or parallel execution benefits.

### LEO Phase Mapping for Stages

| Factory Stage | LEO Phase | Notes |
|---------------|-----------|-------|
| Not started | LEAD | SD awaiting approval |
| Planning | PLAN | PRD being created |
| In Progress | EXEC | Implementation underway |
| Completed | completed | All tests passing, merged |
```

---

### Phase 5: Data Cleanup (Optional)

**Task 5.1**: Fix Inconsistent Child Data

The existing data shows issues:
- Children with `status: completed` but `progress: 0`
- Mixed relationship types in same family

```sql
-- Fix children that are completed but progress = 0
UPDATE strategic_directives_v2
SET progress = 100
WHERE status = 'completed' AND progress = 0 AND parent_sd_id IS NOT NULL;
```

---

## Success Criteria

| Criterion | Metric |
|-----------|--------|
| Documentation Complete | All 4 CLAUDE files have parent-child sections |
| No Pending Updates | `docs/pending-protocol-updates/` is empty or archived |
| Agents Understand | New sessions correctly identify when to use parent-child |
| Data Consistent | No children with completed status but 0 progress |
| ADR Updated | ADR-002 references parent-child pattern |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Agents still confused | Medium | High | Add examples and error messages |
| Database trigger conflicts | Low | High | Test in staging first |
| Existing parent SDs break | Low | Medium | Cleanup optional, not forced |

---

## Appendix: Current vs Proposed State

### CLAUDE_CORE.md

| Current | Proposed |
|---------|----------|
| No parent-child overview | Full hierarchy documentation with diagram |

### CLAUDE_PLAN.md

| Current | Proposed |
|---------|----------|
| No guidance on when to create children | Decision matrix + creation workflow |

### CLAUDE_EXEC.md

| Current | Proposed |
|---------|----------|
| No guidance on working with children | Activation rules + progress tracking |

### CLAUDE_LEAD.md

| Current | Proposed |
|---------|----------|
| Only blocking rules (lines 503-575) | Full governance including approval workflow |

---

## Implementation Order

1. **Task 1.1-1.4**: Insert all protocol sections (SQL)
2. **Task 3.1-3.2**: Regenerate CLAUDE files (verify)
3. **Task 2.1-2.3**: Create helper scripts (optional but recommended)
4. **Task 4.1**: Update ADR-002 (documentation)
5. **Task 5.1**: Data cleanup (optional)

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Database Sections | 30 minutes |
| Phase 2: Helper Scripts | 1 hour |
| Phase 3: Regeneration | 5 minutes |
| Phase 4: ADR Update | 15 minutes |
| Phase 5: Data Cleanup | 15 minutes |
| **Total** | ~2 hours |

---

**Plan Author**: Claude Code
**Review Required**: Chairman approval before execution
**Related SDs**: SD-VISION-TRANSITION-001 (parent orchestrator pattern)
