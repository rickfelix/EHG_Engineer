# Plan: Parent-Child SD Protocol Clarity (v3 - CORRECTED)


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, protocol

**Status**: IMPLEMENTED
**Date**: 2025-12-06
**Author**: Claude (LEO Protocol Enhancement)
**Scope**: LEO Protocol v4.3.4 Enhancement

---

## Executive Summary

This plan implements a simplified parent-child SD model where:
- Every child goes through **full LEAD→PLAN→EXEC** workflow (no shortcuts)
- Parent SD serves as orchestrator (no implementation code)
- Children execute sequentially (one completes before next starts)
- Parent completes after last child completes
- PLAN agent proposes child decomposition during parent PRD creation
- **Each child needs individual LEAD approval** (validates strategic value per child)

---

## CORRECTION: Children Need Full LEAD Phase

**Initial Mistake**: Plan v2 suggested "batch approval" where children would skip LEAD.

**Why This Was Wrong**:
- Each child SD represents distinct strategic value
- LEAD validates: Is THIS child worth building?
- LEAD locks scope for THIS specific child
- LEAD assesses risks for THIS particular child
- Skipping LEAD = skipping essential validation

**Corrected Workflow**: Every child goes through LEAD→PLAN→EXEC.

---

## Simplified Relationship Types

| Type | Description | Workflow |
|------|-------------|----------|
| `standalone` | Normal SD (default) | LEAD→PLAN→EXEC |
| `parent` | Orchestrator (no code, tracks children) | LEAD→PLAN→waits→Complete |
| `child` | Has `parent_sd_id`, full workflow | LEAD→PLAN→EXEC→Complete |

**Removed**: `child_phase`, `child_independent` - too complex, caused confusion.

---

## The Corrected Workflow

```
PARENT SD:
  LEAD (approve multi-phase initiative)
    ↓
  PLAN (discover 15 user stories → propose 3 children)
    ↓
  Parent enters "orchestrator/waiting" state

CHILDREN (sequential):
  Child A: LEAD → PLAN → EXEC → Complete
           ↓ (Child B waits for Child A)
  Child B: LEAD → PLAN → EXEC → Complete
           ↓ (Child C waits for Child B)
  Child C: LEAD → PLAN → EXEC → Complete
           ↓
PARENT SD:
  After last child → Auto-complete (progress = 100%)
```

---

## Key Principles (Corrected)

1. **Every child gets full LEAD→PLAN→EXEC** - complete workflow, no shortcuts
2. **Parent PLAN creates children** - PLAN agent proposes decomposition during parent PRD
3. **Each child needs LEAD approval** - validates strategic value, scope, risks per child
4. **Children execute sequentially** - Child B waits for Child A to complete
5. **Parent progress = weighted child progress** - auto-calculated
6. **Parent completes last** - after all children finish

---

## Why Each Child Needs LEAD

| LEAD Question | Why It Matters Per Child |
|---------------|--------------------------|
| Strategic value? | Child A (foundation) has different value than Child C (polish) |
| Right thing to build? | May decide Child C isn't worth it after seeing Child A results |
| Scope locked? | Each child has different scope requiring separate lock |
| Risks? | Each child has unique technical/business risks |
| Resources available? | Resource needs differ per child |

**Example**:
- **Parent LEAD**: Approve "Build payment system" (overall initiative)
- **Child A LEAD**: Approve "Stripe integration" (specific strategic decision)
- **Child B LEAD**: Approve "PayPal integration" (may reject after Stripe learnings)
- **Child C LEAD**: Approve "Crypto payment" (may defer based on earlier results)

---

## What Was Implemented

### 1. Database Schema
- Simplified `relationship_type`: `standalone`, `parent`, `child` only
- Added `dependency_chain` column for sequential execution
- Updated `sd_family_tree` view
- Created `get_next_child_sd()` function
- Updated validation trigger for sequential dependencies

### 2. Protocol Sections (4 Sections Updated)

| File | Section | Key Content |
|------|---------|-------------|
| CLAUDE_CORE.md | Parent-Child SD Hierarchy | Overview, workflow diagram, **why children need LEAD** |
| CLAUDE_PLAN.md | Child SD Pattern | When to decompose (≥8 stories), children created as `status='draft'` |
| CLAUDE_EXEC.md | Working with Child SDs | Full LEAD→PLAN→EXEC lifecycle, sequential execution |
| CLAUDE_LEAD.md | Parent-Child Decomposition Approval | Individual child approval, **anti-pattern: batch approval** |

### 3. Anti-Pattern Warning Added

In CLAUDE_LEAD.md:

```markdown
### Anti-Pattern: Batch Approval

**❌ Don't do this**:
> "All 3 children look good, approve them all at once"

**✅ Do this instead**:
> "Approve Child A. After Child A completes, we'll review Child B with updated context."

Sequential LEAD approval allows learning from earlier children to inform later decisions.
```

---

## Implementation Timeline

1. ✅ Created plan (v2 with batch approval)
2. ✅ Inserted protocol sections into database
3. ✅ Ran database migration
4. ✅ Regenerated CLAUDE.md files
5. ✅ **CORRECTED**: Removed batch approval, added full LEAD for children
6. ✅ Updated all 4 protocol sections
7. ✅ Regenerated CLAUDE.md files (corrected)
8. ✅ Verified all sections

---

## Files Modified

| File | Size Change | Status |
|------|-------------|--------|
| CLAUDE_CORE.md | +464 bytes | ✅ Corrected |
| CLAUDE_PLAN.md | +383 bytes | ✅ Corrected |
| CLAUDE_EXEC.md | +404 bytes | ✅ Corrected |
| CLAUDE_LEAD.md | +993 bytes | ✅ Corrected (anti-pattern added) |

---

## Success Criteria

- [x] Database has 3 relationship types only (standalone, parent, child)
- [x] All 4 CLAUDE files have parent-child sections
- [x] **Children workflow shows full LEAD→PLAN→EXEC** ✅
- [x] **No "batch approval" language remains** ✅
- [x] **"Why Children Need LEAD" section added** ✅
- [x] **Anti-pattern warning added** ✅
- [x] Validation trigger enforces sequential execution
- [x] No references to `child_phase` or `child_independent`

---

## What's Now Clear

Agents (and Chairman) now understand:

1. **When to use parent-child**: ≥8 user stories, 3+ phases, multi-week duration
2. **How phases work**:
   - Parent: LEAD→PLAN (creates children)→waits
   - Children: LEAD→PLAN→EXEC (full workflow each)
3. **Who creates children**: PLAN agent during parent PRD
4. **Approval process**:
   - Parent LEAD approves parent
   - Each child gets individual LEAD approval
   - **No batch approval** - sequential approval with learning
5. **Why children need LEAD**: Different strategic validation per child
6. **Progress calculation**: Weighted by priority (critical=40%, high=30%, medium=20%, low=10%)
7. **Sequential execution**: Database enforces Child B waits for Child A

---

## Lessons Learned

**Initial Error**: Suggested "batch approval" to reduce overhead.

**Why It Was Wrong**:
- Violated LEO Protocol philosophy (thorough validation)
- Each child SD represents different strategic decisions
- LEAD approval isn't overhead - it's essential validation
- Learning from Child A should inform Child B approval

**Correction Applied**: Full LEAD→PLAN→EXEC for every child, with explicit anti-pattern warning.

---

**Status**: COMPLETE AND CORRECTED
**Next**: No further action needed - documentation is accurate
