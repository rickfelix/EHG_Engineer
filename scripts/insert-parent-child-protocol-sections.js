#!/usr/bin/env node

/**
 * Insert Parent-Child SD Protocol Sections
 *
 * Inserts 4 protocol sections for parent-child SD documentation:
 * 1. CLAUDE_CORE.md: Overview
 * 2. CLAUDE_PLAN.md: When to decompose
 * 3. CLAUDE_EXEC.md: Working with children
 * 4. CLAUDE_LEAD.md: Decomposition approval
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sections = [
  {
    protocol_id: 'leo-v4-3-3-ui-parity',
    title: 'Parent-Child SD Hierarchy',
    content: `## Parent-Child SD Hierarchy

### Overview

The LEO Protocol supports hierarchical SDs for multi-phase work. Parent SDs coordinate children; every child goes through full LEAD→PLAN→EXEC.

### Relationship Types

| Type | Description | Workflow | Use Case |
|------|-------------|----------|----------|
| \`standalone\` | Default | LEAD→PLAN→EXEC | Normal SDs |
| \`parent\` | Orchestrator | LEAD→PLAN→waits→Complete | Multi-phase coordinator |
| \`child\` | Has parent | PLAN→EXEC→Complete | Sequential execution units |

**Note**: Children skip LEAD because parent LEAD approval covers all children (batch approval).

### Key Rules

1. **Every child gets full PLAN and EXEC** - no shortcuts on requirements or implementation
2. **Children execute sequentially** - Child B waits for Child A to complete
3. **Parent progress = weighted child progress** - auto-calculated
4. **PLAN proposes decomposition** - when user stories exceed threshold (≥8)
5. **LEAD approves decomposition** - batch approval for all children

### Workflow Diagram

\`\`\`
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
\`\`\`

### Progress Calculation

Parent progress = weighted average of child progress:

| Child Priority | Weight |
|----------------|--------|
| critical | 40% |
| high | 30% |
| medium | 20% |
| low | 10% |

**Formula**: \`Σ(child.progress × weight) / Σ(weight)\`

### Database Functions

\`\`\`sql
-- View family hierarchy
SELECT * FROM sd_family_tree WHERE parent_id = 'SD-PARENT-001';

-- Calculate parent progress
SELECT calculate_parent_sd_progress('SD-PARENT-001');
\`\`\`
`,
    section_type: 'parent_child_overview',
    target_file: 'CLAUDE_CORE.md',
    context_tier: null,
    order_index: 151
  },
  {
    protocol_id: 'leo-v4-3-3-ui-parity',
    title: 'Child SD Pattern: When to Decompose',
    content: `## Child SD Pattern: When to Decompose

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
2. Create child SD records with \`parent_sd_id\` and \`relationship_type = 'child'\`
3. Define dependency chain in parent's \`dependency_chain\` field
4. Document children in parent PRD

**Step 2: Create Child SDs**

\`\`\`javascript
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
\`\`\`

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

\`\`\`markdown
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
\`\`\`
`,
    section_type: 'parent_child_plan',
    target_file: 'CLAUDE_PLAN.md',
    context_tier: null,
    order_index: 851
  },
  {
    protocol_id: 'leo-v4-3-3-ui-parity',
    title: 'Working with Child SDs During EXEC',
    content: `## Working with Child SDs During EXEC

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

\`\`\`javascript
// Update child progress as you work
await supabase.from('strategic_directives_v2')
  .update({ progress: 75 })
  .eq('id', 'SD-PARENT-001-A');

// Parent progress auto-calculates
// DO NOT manually set parent progress
\`\`\`

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
`,
    section_type: 'parent_child_exec',
    target_file: 'CLAUDE_EXEC.md',
    context_tier: null,
    order_index: 351
  },
  {
    protocol_id: 'leo-v4-3-3-ui-parity',
    title: 'Parent-Child Decomposition Approval',
    content: `## Parent-Child Decomposition Approval

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
`,
    section_type: 'parent_child_lead',
    target_file: 'CLAUDE_LEAD.md',
    context_tier: null,
    order_index: 551
  }
];

async function main() {
  console.log('=== Inserting Parent-Child Protocol Sections ===\n');

  for (const section of sections) {
    console.log(`Inserting: ${section.title} → ${section.target_file}`);

    // Check if section with same title exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id, title')
      .eq('title', section.title)
      .eq('target_file', section.target_file)
      .single();

    if (existing) {
      console.log(`  ↳ Section exists (id: ${existing.id}), updating...`);
      const { error } = await supabase
        .from('leo_protocol_sections')
        .update(section)
        .eq('id', existing.id);

      if (error) {
        console.error(`  ✗ Error updating: ${error.message}`);
      } else {
        console.log('  ✓ Updated successfully');
      }
    } else {
      console.log('  ↳ Inserting new section...');
      const { error } = await supabase
        .from('leo_protocol_sections')
        .insert([section]);

      if (error) {
        console.error(`  ✗ Error inserting: ${error.message}`);
      } else {
        console.log('  ✓ Inserted successfully');
      }
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`Processed ${sections.length} sections`);
  console.log('\nNext steps:');
  console.log('1. Run database migration: database/migrations/20251206_simplify_parent_child_sds.sql');
  console.log('2. Regenerate CLAUDE files: node scripts/generate-claude-md-from-db.js');
}

main().catch(console.error);
