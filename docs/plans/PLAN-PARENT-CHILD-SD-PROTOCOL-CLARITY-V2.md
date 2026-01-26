# Plan: Parent-Child SD Protocol Clarity (v2 - Option D)


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, unit, migration

**Status**: APPROVED
**Date**: 2025-12-06
**Author**: Claude (LEO Protocol Enhancement)
**Scope**: LEO Protocol v4.3.4 Enhancement
**Decision**: Option D - Simplified model with batch approval

---

## Executive Summary

This plan implements **Option D**: A simplified parent-child SD model where:
- Every child goes through full LEAD→PLAN→EXEC workflow (no shortcuts)
- Parent SD serves as orchestrator (no implementation code)
- Children execute sequentially (one completes before next starts)
- Parent completes after last child completes
- PLAN agent proposes child decomposition during parent PRD creation
- LEAD approves decomposition as batch (children start in PLAN phase)

---

## Design Decisions (Approved)

| Question | Decision |
|----------|----------|
| Skip LEAD/PLAN for children? | **No** - every child has full workflow |
| Child types needed? | **No** - just one `child` type |
| Parallel or sequential? | **Sequential** - enforced by dependencies |
| When does parent complete? | **After last child completes** |
| Who creates children? | **PLAN agent** during parent PRD |
| Individual child LEAD approval? | **No** - batch approved via parent LEAD |

---

## Simplified Relationship Types

| Type | Description | Workflow |
|------|-------------|----------|
| `standalone` | Normal SD (default) | Full LEAD→PLAN→EXEC |
| `parent` | Orchestrator (no code, tracks children) | LEAD→PLAN→(waits)→Complete |
| `child` | Has `parent_sd_id`, batch-approved by parent LEAD | PLAN→EXEC→Complete (LEAD pre-approved) |

**Removed**: `child_phase`, `child_independent` - too complex, caused confusion.

---

## The Workflow (Option D)

### Step 1: Parent SD Creation & Approval

```
Chairman: Creates parent SD
  ↓
LEAD Agent: Reviews scope
  - Approves: "Yes, build this feature"
  - Marks SD as potentially requiring children (high complexity)
  ↓
Parent SD: LEAD phase complete
```

### Step 2: PLAN Discovers Decomposition Need

```
PLAN Agent: Creates parent PRD
  - Analyzes user stories (discovers 15 stories)
  - Realizes: Too complex for single SD
  - Decision: "This needs 3 child SDs"
  ↓
PLAN Agent: Proposes decomposition
  - Creates child SD records in database
  - Documents children in parent PRD
  - Adds dependency chain (Child A → Child B → Child C)
  ↓
PLAN Agent: Requests LEAD approval of decomposition
  ↓
LEAD Agent: Reviews decomposition plan
  - Approves child structure
  - Children marked as LEAD-approved (batch)
  ↓
Parent SD: PLAN complete, enters "waiting" state
Children: Start in PLAN phase (LEAD pre-approved)
```

### Step 3: Children Execute Sequentially

```
Child A:
  PLAN (create PRD) → EXEC (implement) → Complete
  ↓
Child B: (waits for Child A)
  PLAN (create PRD) → EXEC (implement) → Complete
  ↓
Child C: (waits for Child B)
  PLAN (create PRD) → EXEC (implement) → Complete
```

### Step 4: Parent Completes

```
After last child completes:
  ↓
Parent SD:
  - Progress auto-calculates to 100%
  - Status auto-updates to 'completed'
  - (Optional) PLAN agent creates orchestration summary
```

---

## Database Schema Changes

### Update `relationship_type` Enum

**Current**:
```sql
CHECK (relationship_type IN ('standalone', 'parent', 'child_phase', 'child_independent'))
```

**New**:
```sql
CHECK (relationship_type IN ('standalone', 'parent', 'child'))
```

### Add `dependency_chain` to Parent SD

```sql
ALTER TABLE strategic_directives_v2
ADD COLUMN dependency_chain JSONB;

COMMENT ON COLUMN strategic_directives_v2.dependency_chain IS
  'For parent SDs: ordered list of child SD IDs defining execution sequence';
```

Example:
```json
{
  "children": [
    {"sd_id": "SD-PARENT-001-A", "order": 1, "depends_on": null},
    {"sd_id": "SD-PARENT-001-B", "order": 2, "depends_on": "SD-PARENT-001-A"},
    {"sd_id": "SD-PARENT-001-C", "order": 3, "depends_on": "SD-PARENT-001-B"}
  ]
}
```

### Update Validation Trigger

**Remove**: Phase synchronization checks for `child_phase`

**Add**: Sequential execution validation for `child` type

```sql
CREATE OR REPLACE FUNCTION validate_child_sd_sequence()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id TEXT;
  v_dependency TEXT;
  v_dependency_status TEXT;
BEGIN
  -- Only validate if this is a child SD
  IF NEW.relationship_type != 'child' THEN
    RETURN NEW;
  END IF;

  -- Get dependency from parent's dependency_chain
  SELECT parent_sd_id INTO v_parent_id
  FROM strategic_directives_v2
  WHERE id = NEW.id;

  -- Check if dependency is complete
  IF v_dependency IS NOT NULL THEN
    SELECT status INTO v_dependency_status
    FROM strategic_directives_v2
    WHERE id = v_dependency;

    IF v_dependency_status != 'completed' THEN
      RAISE EXCEPTION 'LEO Protocol: Child SD % cannot start until dependency % completes',
        NEW.id, v_dependency;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Protocol Section Content

### CLAUDE_CORE.md: Parent-Child Overview

```markdown
## Parent-Child SD Hierarchy

### Overview

The LEO Protocol supports hierarchical SDs for multi-phase work. Parent SDs coordinate children; every child goes through full LEAD→PLAN→EXEC.

### Relationship Types

| Type | Description | Workflow | Use Case |
|------|-------------|----------|----------|
| `standalone` | Default | LEAD→PLAN→EXEC | Normal SDs |
| `parent` | Orchestrator | LEAD→PLAN→waits→Complete | Multi-phase coordinator |
| `child` | Has parent | PLAN→EXEC→Complete | Sequential execution units |

**Note**: Children skip LEAD because parent LEAD approval covers all children (batch approval).

### Key Rules

1. **Every child gets full PLAN and EXEC** - no shortcuts on requirements or implementation
2. **Children execute sequentially** - Child B waits for Child A to complete
3. **Parent progress = weighted child progress** - auto-calculated
4. **PLAN proposes decomposition** - when user stories exceed threshold (≥8)
5. **LEAD approves decomposition** - batch approval for all children

### Workflow Diagram

```
PARENT SD:
  LEAD (approve scope)
    ↓
  PLAN (discover 15 user stories → propose 3 children)
    ↓
  LEAD approves decomposition
    ↓
  Parent enters "waiting" state

CHILDREN (sequential):
  Child A: PLAN → EXEC → Complete
           ↓
  Child B: PLAN → EXEC → Complete
           ↓
  Child C: PLAN → EXEC → Complete

PARENT SD:
  After last child → Auto-complete (progress = 100%)
```

### Progress Calculation

Parent progress = weighted average of child progress:

| Child Priority | Weight |
|----------------|--------|
| critical | 40% |
| high | 30% |
| medium | 20% |
| low | 10% |

**Formula**: `Σ(child.progress × weight) / Σ(weight)`

### Database Functions

```sql
-- View family hierarchy
SELECT * FROM sd_family_tree WHERE parent_id = 'SD-PARENT-001';

-- Calculate parent progress
SELECT calculate_parent_sd_progress('SD-PARENT-001');
```
```

### CLAUDE_PLAN.md: When to Decompose

```markdown
## Child SD Pattern: When to Decompose

### PLAN Agent Responsibility

During parent PRD creation, PLAN agent must evaluate:
- **User story count**: ≥8 stories → consider decomposition
- **Phase boundaries**: 3+ distinct phases → consider decomposition
- **Duration estimate**: Multi-week work → consider decomposition
- **Parallelization**: Can work be split? → consider decomposition

### Decision Matrix

| Criteria | Single SD | Parent + Children |
|----------|-----------|-------------------|
| User Stories | < 8 | ≥ 8 |
| Distinct Phases | 1-2 | 3+ |
| Duration | Days | Weeks |
| Complexity | Low-Medium | High |

### Decomposition Workflow

**Step 1: PLAN Proposes Decomposition**

During parent PRD creation:
1. Identify natural boundaries (phases, features, components)
2. Create child SD records with `parent_sd_id` and `relationship_type = 'child'`
3. Define dependency chain in parent's `dependency_chain` field
4. Document children in parent PRD

**Step 2: Create Child SDs**

```javascript
// Example: Parent PLAN creates 3 children
await supabase.from('strategic_directives_v2').insert([
  {
    id: 'SD-PARENT-001-A',
    title: 'Phase A: Foundation',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'lead_approved', // Batch approved via parent
    current_phase: 'PLAN',
    priority: 'critical'
  },
  {
    id: 'SD-PARENT-001-B',
    title: 'Phase B: Features',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'lead_approved',
    current_phase: 'PLAN',
    priority: 'high'
  },
  {
    id: 'SD-PARENT-001-C',
    title: 'Phase C: Polish',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'lead_approved',
    current_phase: 'PLAN',
    priority: 'medium'
  }
]);

// Update parent with dependency chain
await supabase.from('strategic_directives_v2')
  .update({
    relationship_type: 'parent',
    dependency_chain: {
      children: [
        {sd_id: 'SD-PARENT-001-A', order: 1, depends_on: null},
        {sd_id: 'SD-PARENT-001-B', order: 2, depends_on: 'SD-PARENT-001-A'},
        {sd_id: 'SD-PARENT-001-C', order: 3, depends_on: 'SD-PARENT-001-B'}
      ]
    }
  })
  .eq('id', 'SD-PARENT-001');
```

**Step 3: Request LEAD Approval of Decomposition**

PLAN creates handoff to LEAD with:
- Parent PRD
- Proposed child structure
- Dependency rationale
- Request for batch approval

**Step 4: LEAD Approves or Rejects**

LEAD reviews:
- Are children properly scoped?
- Are dependencies logical?
- Is decomposition warranted?

If approved → children start in PLAN phase (LEAD pre-approved)
If rejected → PLAN revises decomposition or combines into single SD

### Parent PRD Template

```markdown
## Child SD Overview

This SD requires decomposition due to [complexity/phases/duration].

| Child ID | Scope | Priority | Depends On |
|----------|-------|----------|------------|
| SD-XXX-A | Foundation | critical | None |
| SD-XXX-B | Features | high | SD-XXX-A |
| SD-XXX-C | Polish | medium | SD-XXX-B |

## Sequential Execution

Children execute sequentially:
1. Child A completes → Child B can start
2. Child B completes → Child C can start
3. Child C completes → Parent completes

## Completion Criteria

Parent completes when:
- [ ] All children have status = 'completed'
- [ ] Parent progress = 100% (auto-calculated)
```
```

### CLAUDE_EXEC.md: Working with Children

```markdown
## Working with Child SDs During EXEC

### Child SD Activation

Children start in **PLAN phase** (LEAD pre-approved via parent):
1. PLAN creates child PRD (detailed requirements)
2. PLAN→EXEC handoff (with validation gates)
3. EXEC implements (full testing required)
4. EXEC→PLAN handoff (verification)
5. Mark child as 'completed'

### Sequential Execution Rules

**Database trigger enforces**:
- Child B cannot start EXEC until Child A is 'completed'
- Attempting to activate out-of-order will fail

**EXEC agent must**:
1. Check dependency status before starting
2. Wait if dependency not complete
3. Document in handoff when dependency cleared

### Progress Tracking

```javascript
// Update child progress as you work
await supabase.from('strategic_directives_v2')
  .update({ progress: 75 })
  .eq('id', 'SD-PARENT-001-A');

// Parent progress auto-calculates
// DO NOT manually set parent progress
```

### Parent Completion

After last child completes:
1. Parent progress auto-updates to 100%
2. Parent status auto-updates to 'completed'
3. (Optional) Create orchestration retrospective

### Common Mistakes

| Mistake | Why Wrong | Fix |
|---------|-----------|-----|
| Starting Child B before Child A done | Violates dependencies | Wait for dependency |
| Setting parent progress manually | Overwrites calculation | Let function calculate |
| Skipping child PRD | No requirements doc | Full PLAN phase required |
```

### CLAUDE_LEAD.md: Decomposition Approval

```markdown
## Parent-Child Decomposition Approval

### When PLAN Proposes Decomposition

PLAN agent will propose decomposition when:
- Parent SD has ≥8 user stories
- Work spans 3+ distinct phases
- Duration estimate exceeds 1-2 weeks

### LEAD Review Checklist

Before approving decomposition:
- [ ] Children are properly scoped (not too granular, not too broad)
- [ ] Dependencies are logical (sequential order makes sense)
- [ ] Decomposition is warranted (not premature)
- [ ] Each child has clear deliverable
- [ ] Rollup to parent is clear

### Batch Approval

**One LEAD approval covers all children**:
- Children skip individual LEAD phase
- Children start in PLAN phase (requirements gathering)
- Each child still gets full PLAN and EXEC

### Rejecting Decomposition

If decomposition is not warranted:
- LEAD rejects → PLAN revises parent PRD
- Consider: Can this be single SD?
- Avoid over-decomposition (creates overhead)

### Parent Completion Approval

Parent completes automatically after last child, but LEAD should verify:
- [ ] All children have status = 'completed'
- [ ] Parent progress = 100%
- [ ] Orchestration learnings documented (optional)
```

---

## Implementation Tasks

### Task 1: Update Database Schema

**File**: `database/migrations/20251206_simplify_parent_child_sds.sql`

```sql
-- Remove old child types, add 'child'
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_relationship_type_check;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_relationship_type_check
CHECK (relationship_type IN ('standalone', 'parent', 'child'));

-- Add dependency_chain column
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS dependency_chain JSONB;

-- Update existing child_phase/child_independent to 'child'
UPDATE strategic_directives_v2
SET relationship_type = 'child'
WHERE relationship_type IN ('child_phase', 'child_independent');

-- Update validation trigger
CREATE OR REPLACE FUNCTION validate_child_sd_sequence()
RETURNS TRIGGER AS $$
DECLARE
  v_dependency TEXT;
  v_dependency_status TEXT;
BEGIN
  IF NEW.relationship_type != 'child' OR NEW.status NOT IN ('in_progress', 'exec_active') THEN
    RETURN NEW;
  END IF;

  -- Get dependency from parent's dependency_chain
  SELECT jsonb_array_elements(sd.dependency_chain->'children')->>'depends_on' INTO v_dependency
  FROM strategic_directives_v2 sd,
       jsonb_array_elements(sd.dependency_chain->'children') child
  WHERE sd.id = NEW.parent_sd_id
    AND child->>'sd_id' = NEW.id;

  IF v_dependency IS NOT NULL THEN
    SELECT status INTO v_dependency_status
    FROM strategic_directives_v2
    WHERE id = v_dependency;

    IF v_dependency_status != 'completed' THEN
      RAISE EXCEPTION 'LEO Protocol: Child SD % cannot start until dependency % completes', NEW.id, v_dependency;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_child_sd_sequence ON strategic_directives_v2;
CREATE TRIGGER validate_child_sd_sequence
  BEFORE UPDATE OF status
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_child_sd_sequence();
```

### Task 2: Insert Protocol Sections

```bash
node scripts/insert-parent-child-protocol-sections.js
```

(Script will insert the 4 sections above into `leo_protocol_sections`)

### Task 3: Regenerate CLAUDE.md Files

```bash
node scripts/generate-claude-md-from-db.js
```

### Task 4: Update ADR-002

Add parent-child guidance to Section 5.

---

## Success Criteria

- [ ] Database has `relationship_type` values: `standalone`, `parent`, `child` only
- [ ] All 4 CLAUDE files have parent-child sections
- [ ] `dependency_chain` column exists and is documented
- [ ] Validation trigger enforces sequential execution
- [ ] No references to `child_phase` or `child_independent` in CLAUDE files
- [ ] ADR-002 references parent-child pattern

---

## Rollout Plan

1. Run database migration (updates schema)
2. Insert protocol sections (4 sections)
3. Regenerate CLAUDE files
4. Update ADR-002
5. Test with sample parent/child SDs

---

**Status**: Ready for execution
**Estimated Time**: 1 hour
**Risk**: Low (backward compatible - existing child SDs auto-migrate to 'child' type)
