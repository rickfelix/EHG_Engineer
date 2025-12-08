#!/usr/bin/env node

/**
 * Update Parent-Child SD Protocol Sections
 * Fix: Children get FULL LEAD→PLAN→EXEC (not batch approval)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const updatedSections = [
  {
    title: 'Parent-Child SD Hierarchy',
    target_file: 'CLAUDE_CORE.md',
    content: `## Parent-Child SD Hierarchy

### Overview

The LEO Protocol supports hierarchical SDs for multi-phase work. Parent SDs coordinate children; **every child goes through full LEAD→PLAN→EXEC**.

### Relationship Types

| Type | Description | Workflow | Use Case |
|------|-------------|----------|----------|
| \`standalone\` | Default | LEAD→PLAN→EXEC | Normal SDs |
| \`parent\` | Orchestrator | LEAD→PLAN→waits→Complete | Multi-phase coordinator |
| \`child\` | Has parent | LEAD→PLAN→EXEC→Complete | Sequential execution units |

### Key Rules

1. **Every child gets full LEAD→PLAN→EXEC** - complete workflow, no shortcuts
2. **Parent PLAN creates children** - PLAN agent proposes decomposition during parent PRD
3. **Each child needs LEAD approval** - validates strategic value, scope, risks per child
4. **Children execute sequentially** - Child B waits for Child A to complete
5. **Parent progress = weighted child progress** - auto-calculated
6. **Parent completes last** - after all children finish

### Workflow Diagram

\`\`\`
PARENT SD:
  LEAD (approve multi-phase initiative)
    ↓
  PLAN (discover 15 user stories → propose 3 children)
    ↓
  Parent enters "orchestrator/waiting" state

CHILDREN (sequential):
  Child A: LEAD → PLAN → EXEC → Complete
           ↓
  Child B: LEAD → PLAN → EXEC → Complete
           ↓
  Child C: LEAD → PLAN → EXEC → Complete

PARENT SD:
  After last child → Auto-complete (progress = 100%)
\`\`\`

### Why Children Need LEAD

Each child SD needs LEAD approval because:
- **Strategic validation**: Is THIS child the right thing to build?
- **Scope lock**: What exactly does THIS child deliver?
- **Risk assessment**: What are the risks for THIS specific child?
- **Resource check**: Do we have what we need for THIS child?

LEAD is not redundant - it's essential validation per child.

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

-- Get next child to execute
SELECT get_next_child_sd('SD-PARENT-001');
\`\`\`
`
  },
  {
    title: 'Child SD Pattern: When to Decompose',
    target_file: 'CLAUDE_PLAN.md',
    content: `## Child SD Pattern: When to Decompose

### PLAN Agent Responsibility

During parent PRD creation, PLAN agent must evaluate:
- **User story count**: ≥8 stories → consider decomposition
- **Phase boundaries**: 3+ distinct phases → consider decomposition
- **Duration estimate**: Multi-week work → consider decomposition
- **Complexity**: High complexity → consider decomposition

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
5. Mark children as \`status = 'draft'\` (they need LEAD approval)

**Step 2: Create Child SDs**

\`\`\`javascript
// Example: Parent PLAN creates 3 children
await supabase.from('strategic_directives_v2').insert([
  {
    id: 'SD-PARENT-001-A',
    title: 'Phase A: Foundation',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft', // Needs LEAD approval
    current_phase: null,
    priority: 'critical'
  },
  {
    id: 'SD-PARENT-001-B',
    title: 'Phase B: Features',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft',
    current_phase: null,
    priority: 'high'
  },
  {
    id: 'SD-PARENT-001-C',
    title: 'Phase C: Polish',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft',
    current_phase: null,
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

**Step 3: Children Go Through LEAD**

After parent PLAN completes:
- Each child SD goes to LEAD individually
- LEAD validates strategic value of THAT child
- LEAD locks scope for THAT child
- LEAD assesses risks for THAT child
- After LEAD approval, child enters PLAN

**Step 4: Sequential Execution**

- Child A: LEAD → PLAN → EXEC → Complete
- Then Child B: LEAD → PLAN → EXEC → Complete
- Then Child C: LEAD → PLAN → EXEC → Complete
- Then Parent: Auto-completes

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
1. Child A completes full LEAD→PLAN→EXEC
2. Child B starts LEAD after Child A completes
3. Child C starts LEAD after Child B completes
4. Parent completes after Child C completes

## Why Children Need Individual LEAD Approval

Each child represents distinct strategic value:
- **Child A (Foundation)**: Validates core architecture decisions
- **Child B (Features)**: Validates feature priority and scope
- **Child C (Polish)**: Validates UX investment vs other priorities

## Completion Criteria

Parent completes when:
- [ ] All children have status = 'completed'
- [ ] Parent progress = 100% (auto-calculated)
\`\`\`
`
  },
  {
    title: 'Working with Child SDs During EXEC',
    target_file: 'CLAUDE_EXEC.md',
    content: `## Working with Child SDs During EXEC

### Child SD Lifecycle

**Children have FULL workflow** (not simplified):
1. LEAD validates child (strategic value, scope, risks)
2. PLAN creates child PRD (detailed requirements)
3. PLAN→EXEC handoff (with validation gates)
4. EXEC implements (full testing required)
5. EXEC→PLAN handoff (verification)
6. Mark child as 'completed'

### Sequential Execution Rules

**Database trigger enforces**:
- Child B cannot start until Child A has \`status = 'completed'\`
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
| Skipping child LEAD | No strategic validation | Full LEAD required |
| Skipping child PRD | No requirements doc | Full PLAN required |

### Why Full Workflow Matters

Each child SD is a strategic directive, not a task:
- **LEAD validates**: Is this child strategically sound?
- **PLAN defines**: What exactly does this child deliver?
- **EXEC implements**: How do we build it?

Skipping phases = skipping essential validation.
`
  },
  {
    title: 'Parent-Child Decomposition Approval',
    target_file: 'CLAUDE_LEAD.md',
    content: `## Parent-Child Decomposition Approval

### When PLAN Proposes Decomposition

PLAN agent will propose decomposition when:
- Parent SD has ≥8 user stories
- Work spans 3+ distinct phases
- Duration estimate exceeds 1-2 weeks

### LEAD Review of Parent SD

When approving parent SD, LEAD should:
- [ ] Understand this will create child SDs
- [ ] Review proposed child structure in parent PRD
- [ ] Validate decomposition makes sense
- [ ] Approve parent SD (which creates children)

**Note**: Approving parent SD does NOT approve children. Children need individual LEAD approval.

### LEAD Review of Each Child SD

**After parent PLAN completes**, each child goes to LEAD individually:

#### Child A LEAD Review Checklist
- [ ] Strategic value: Is this child worth building?
- [ ] Scope: Is child scope clear and locked?
- [ ] Dependencies: Is parent complete enough to start this child?
- [ ] Risks: What are the specific risks for this child?
- [ ] Resources: Do we have what we need?

Repeat for Child B, Child C, etc.

### Why Individual Child Approval Matters

Each child represents different strategic decisions:
- **Child A (Foundation)**: Architecture decisions, tech stack validation
- **Child B (Features)**: Feature priority, user value validation
- **Child C (Polish)**: UX investment, quality bar validation

These are **different strategic questions** requiring separate LEAD approval.

### Rejecting a Child

LEAD can approve parent but reject a specific child:
- Approve Child A and Child B
- Reject Child C (not worth it)
- Update parent's \`dependency_chain\` to remove Child C

### Parent Completion Approval

Parent completes automatically after last child, but LEAD should verify:
- [ ] All approved children have status = 'completed'
- [ ] Parent progress = 100%
- [ ] Orchestration learnings documented (optional)

### Anti-Pattern: Batch Approval

**❌ Don't do this**:
> "All 3 children look good, approve them all at once"

**✅ Do this instead**:
> "Approve Child A. After Child A completes, we'll review Child B with updated context."

Sequential LEAD approval allows learning from earlier children to inform later decisions.
`
  }
];

async function main() {
  console.log('=== Updating Parent-Child Protocol Sections (Full LEAD) ===\n');

  for (const section of updatedSections) {
    console.log(`Updating: ${section.title} → ${section.target_file}`);

    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: section.content })
      .eq('title', section.title)
      .eq('target_file', section.target_file);

    if (error) {
      console.error(`  ✗ Error updating: ${error.message}`);
    } else {
      console.log('  ✓ Updated successfully');
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`Updated ${updatedSections.length} sections`);
  console.log('\nKey Changes:');
  console.log('- Removed "batch approval" language');
  console.log('- Children now go through full LEAD→PLAN→EXEC');
  console.log('- Each child needs individual LEAD approval');
  console.log('- LEAD validates strategic value per child');
  console.log('\nNext step:');
  console.log('node scripts/generate-claude-md-from-db.js');
}

main().catch(console.error);
