# Pending LEO Protocol Section Updates: Child SD Governance

**Date**: 2025-11-28
**Status**: PENDING - Database migration applied, protocol sections need adding
**Related**: SD-UI-PARITY-001, database/migrations/20251128_child_sd_governance.sql

## Context

The database migration for child SD governance has been applied:
- `parent_sd_id` column added
- `relationship_type` column added (standalone, parent, child_phase, child_independent)
- `sd_family_tree` view created
- Validation trigger created

## Sections to Add to leo_protocol_sections

### For CLAUDE_PLAN.md (target_file: 'CLAUDE_PLAN')

**Section Title**: Child SD Pattern for Large SDs
**Section Key**: child_sd_pattern
**Sort Order**: After "Checkpoint Plans" section

```markdown
## Child SD Pattern for Large SDs

### When to Create Child SDs

**Use Child SDs when**:
- SD has ≥8 user stories (can't complete in single session)
- Work naturally breaks into distinct phases/components
- Phases can be completed independently or in parallel
- Implementation spans multiple sessions/weeks

**DO NOT use Child SDs when**:
- Total scope < 8 user stories
- Work is sequential (single session)
- No clear phase boundaries

### Relationship Types

| Type | Use Case | Workflow |
|------|----------|----------|
| `child_phase` | Checkpoint tracking, shared EXEC | Inherits parent's EXEC phase |
| `child_independent` | Fully separate work streams | Own LEAD→PLAN→EXEC cycle |

### Creating Child SDs

1. **Set parent SD as orchestrator**:
   ```sql
   UPDATE strategic_directives_v2
   SET relationship_type = 'parent'
   WHERE id = 'SD-PARENT-001';
   ```

2. **Create child SDs linked to parent**:
   ```sql
   UPDATE strategic_directives_v2
   SET parent_sd_id = 'SD-PARENT-001',
       relationship_type = 'child_phase'
   WHERE id IN ('SD-PARENT-001A', 'SD-PARENT-001B');
   ```

3. **View family tree**:
   ```sql
   SELECT * FROM sd_family_tree WHERE parent_id = 'SD-PARENT-001';
   ```

### Progress Calculation

Parent SD progress is calculated from weighted child progress:
- critical: 40%
- high: 30%
- medium: 20%
- low: 10%

Use: `SELECT calculate_parent_sd_progress('SD-PARENT-001');`
```

### For CLAUDE_EXEC.md (target_file: 'CLAUDE_EXEC')

**Section Title**: Working with Child SDs During EXEC
**Section Key**: exec_child_sds
**Sort Order**: After "Database-First Progress Tracking" section

```markdown
## Working with Child SDs During EXEC

### Implementation Flow

For SDs with `child_phase` relationship:
1. Parent SD completes PLAN-TO-EXEC handoff
2. All child_phase SDs automatically inherit EXEC phase
3. Work proceeds on parent SD's user stories
4. Progress tracked per checkpoint (child SD = checkpoint)
5. Update child SD progress as checkpoints complete

### Tracking Checkpoint Progress

```javascript
// After completing Checkpoint 1 (Phase A)
await supabase
  .from('strategic_directives_v2')
  .update({
    progress: 100,
    status: 'completed'
  })
  .eq('id', 'SD-PARENT-001A');

// Parent progress auto-calculates from children
```

### Validation Rules

- `child_phase` SDs cannot be activated until parent is in EXEC
- Child phase is synchronized with parent phase
- Child completion triggers parent progress recalculation
```

## How to Apply

Once the other Claude Code instance finishes with the CLAUDE MD files:

```bash
node scripts/add-protocol-section.js \
  --target-file CLAUDE_PLAN \
  --section-key child_sd_pattern \
  --title "Child SD Pattern for Large SDs" \
  --content "[content from above]"

node scripts/add-protocol-section.js \
  --target-file CLAUDE_EXEC \
  --section-key exec_child_sds \
  --title "Working with Child SDs During EXEC" \
  --content "[content from above]"

# Then regenerate CLAUDE files
node scripts/generate-claude-md-from-db.js
```
