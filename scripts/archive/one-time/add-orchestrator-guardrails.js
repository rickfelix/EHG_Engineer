#!/usr/bin/env node

/**
 * Add Orchestrator Child Workflow Guardrails
 *
 * This script adds three guardrail sections to prevent Claude from bypassing
 * LEO Protocol for orchestrator children:
 *
 * 1. Updates execution_philosophy with Anti-Bias Rules
 * 2. Creates new critical_term_definitions section
 * 3. Updates parent_child_overview with STOP Conditions
 *
 * Run after: node scripts/add-orchestrator-guardrails.js
 * Then run: node scripts/generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Section 1: Enhanced Execution Philosophy with Anti-Bias Rules
const EXECUTION_PHILOSOPHY_CONTENT = `## 🧠 EXECUTION PHILOSOPHY (Read First!)

These principles override default behavior and must be internalized before starting work:

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness and completeness are MORE IMPORTANT than speed.
- Take the time needed to understand requirements fully
- Verify BEFORE implementing, test BEFORE claiming completion
- 2-4 hours of careful implementation beats 6-12 hours of rework
- If rushing leads to mistakes, you haven't saved time - you've wasted it
- "Done right" > "Done fast" - ALWAYS

### Testing-First (MANDATORY)
**Build confidence through comprehensive testing.**
- E2E testing is MANDATORY, not optional
- 30-60 minute investment saves 4-6 hours of rework
- 100% user story coverage required
- Both unit tests AND E2E tests must pass
- Tests are not overhead - they ARE the work

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth.
- SDs → \`strategic_directives_v2\`
- PRDs → \`product_requirements_v2\`
- Handoffs → \`sd_phase_handoffs\`
- Retrospectives → \`retrospectives\`
- Sub-agent results → \`sub_agent_execution_results\`

### Validation-First (GATEKEEPING)
**Thorough validation BEFORE approval, full commitment AFTER.**
- LEAD validates: Real problem? Feasible solution? Resources available?
- After LEAD approval: SCOPE LOCK - deliver what was approved
- Exception: Critical blocker + human approval + new SD for deferred work

### Context-Aware (PROACTIVE)
**Monitor token usage proactively throughout execution.**
- Report context health in EVERY handoff
- HEALTHY (<70%), WARNING (70-90%), CRITICAL (90-95%), EMERGENCY (>95%)
- Use \`/context-compact\` when approaching WARNING threshold

### Application-Aware (VERIFICATION)
**Verify directory BEFORE writing ANY code.**
- Linux/WSL: \`cd /mnt/c/_EHG/ehg && pwd\` for customer features
- Windows: \`cd C:\\Users\\rickf\\Projects\\_EHG\\ehg; pwd\` for customer features
- \`git remote -v\` to confirm correct repository
- Wrong directory = STOP immediately

### Evidence-Based (PROOF REQUIRED)
**Screenshot, test, verify. Claims without evidence are rejected.**
- Screenshot BEFORE and AFTER changes
- Test results with pass/fail counts
- CI/CD pipeline status (green checks required)
- Sub-agent verification results in database

### Anti-Bias Rules (MANDATORY)

Claude has documented cognitive biases. These rules OVERRIDE those biases:

| Bias | Incorrect Behavior | Correct Behavior |
|------|-------------------|------------------|
| **Efficiency bias** | Skip workflow steps to ship faster | Full workflow is non-negotiable |
| **Completion bias** | Interpret "complete" as "code works" | "Complete" = database status + all validations |
| **Abstraction bias** | Treat children as sub-tasks | Children are INDEPENDENT SDs |
| **Autonomy bias** | "Continue autonomously" = no human gates | Each phase still requires validation |

**RULE**: When ANY bias-pattern is detected, STOP and verify with user.

**NEVER**:
- Ship code without completing full LEO Protocol
- Skip LEAD approval for child SDs
- Skip PRD creation for child SDs
- Skip handoffs for child SDs
- Mark parent complete before all children complete in database

**REMEMBER**: The goal is NOT to complete SDs quickly. The goal is to complete SDs CORRECTLY. A properly implemented SD that takes 8 hours is infinitely better than a rushed implementation that takes 4 hours but requires 6 hours of fixes.`;

// Section 2: New Critical Term Definitions
const CRITICAL_TERM_DEFINITIONS_CONTENT = `## 🚫 CRITICAL TERM DEFINITIONS (BINDING)

These definitions are BINDING. Misinterpretation is a protocol violation.

### "Complete an SD"
**Definition**: An SD is "complete" ONLY when:
1. Full LEAD→PLAN→EXEC cycle executed (per sd_type requirements)
2. Database status = 'completed'
3. All required handoffs recorded
4. Retrospective created
5. LEO Protocol validation trigger passes

**NOT complete**: Code shipped but database shows 'draft'/'in_progress'

### "Continue autonomously"
**Definition**: Execute the current SD through its full LEO Protocol workflow.
**NOT**: Skip workflow steps for efficiency.
**STOP condition**: If instruction is ambiguous about workflow requirements, ASK.

### "Child SD"
**Definition**: An INDEPENDENT Strategic Directive that requires its own full LEAD→PLAN→EXEC cycle.
**NOT**: A sub-task or implementation detail of the parent.
**Each child**: Has its own PRD, handoffs, retrospective, and completion validation.

### "Ship" vs "Complete"
**Ship**: Code merged to main branch.
**Complete**: Ship + database status 'completed' + all handoffs + retrospective.
**CRITICAL**: Shipping is NECESSARY but NOT SUFFICIENT for completion.`;

// Section 3: Enhanced Parent-Child Overview with STOP Conditions
const PARENT_CHILD_OVERVIEW_CONTENT = `## Parent-Child SD Hierarchy

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
3. **Parent SDs bypass user story gates** - user stories exist in child SDs, not parent (USER_STORY_EXISTENCE_GATE bypassed for orchestrators)
4. **Each child needs LEAD approval** - validates strategic value, scope, risks per child
5. **Children execute sequentially** - Child B waits for Child A to complete
6. **Parent progress = weighted child progress** - auto-calculated
7. **Parent completes last** - after all children finish

### Orchestrator Gate Handling

Parent orchestrator SDs have special validation logic:
- **USER_STORY_EXISTENCE_GATE**: Bypassed (user stories are in child SDs)
- **Gate thresholds**: Use \`orchestrator\` threshold (70%) instead of feature (85%)
- **Validation focus**: Child SD progress and completion status

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

### Orchestrator STOP Conditions (MANDATORY)

When working on orchestrator SDs, STOP and verify if:

1. **Instruction ambiguity**: "Continue autonomously" or similar without explicit workflow guidance
   - STOP: Ask "Should each child go through full LEAD→PLAN→EXEC, or is there a streamlined path?"

2. **Efficiency temptation**: Urge to ship children faster by skipping steps
   - STOP: The existing workflow exists for a reason. Do not optimize.

3. **Batch completion**: Desire to mark multiple children complete at once
   - STOP: Each child completes independently through LEO validation

4. **Database status mismatch**: Code shipped but database shows incomplete
   - STOP: Code shipped ≠ SD complete. Complete the protocol.

### Child SD Completion Checklist

Before claiming a child SD is "complete", verify ALL:
- [ ] Child has its own PRD in \`product_requirements_v2\`
- [ ] LEAD-TO-PLAN handoff recorded
- [ ] PLAN-TO-EXEC handoff recorded
- [ ] Implementation merged to main
- [ ] EXEC-TO-PLAN handoff recorded
- [ ] PLAN-TO-LEAD handoff recorded
- [ ] Retrospective created
- [ ] Database status = 'completed' (trigger passes)
- [ ] Parent progress recalculated

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

-- Detect orchestrator (for gate bypass)
SELECT COUNT(*) > 0 as is_orchestrator
FROM strategic_directives_v2
WHERE parent_sd_id = 'SD-XXX';
\`\`\``;

async function main() {
  console.log('=== Adding Orchestrator Child Workflow Guardrails ===\n');

  // Get active protocol ID
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ Could not find active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`✅ Found active protocol: ${protocol.id} (v${protocol.version})\n`);

  // Update 1: execution_philosophy section
  console.log('1️⃣ Updating execution_philosophy with Anti-Bias Rules...');
  const { data: execPhil, error: execPhilCheck } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'execution_philosophy')
    .eq('protocol_id', protocol.id)
    .single();

  if (execPhilCheck || !execPhil) {
    console.log('   ⚠️ Section not found, inserting new...');
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'execution_philosophy',
        title: 'Execution Philosophy',
        content: EXECUTION_PHILOSOPHY_CONTENT,
        order_index: 110
      });

    if (insertError) {
      console.error('   ❌ Insert error:', insertError.message);
    } else {
      console.log('   ✅ Inserted execution_philosophy');
    }
  } else {
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({ content: EXECUTION_PHILOSOPHY_CONTENT })
      .eq('id', execPhil.id);

    if (updateError) {
      console.error('   ❌ Update error:', updateError.message);
    } else {
      console.log('   ✅ Updated execution_philosophy');
    }
  }

  // Insert 2: critical_term_definitions (new section)
  console.log('\n2️⃣ Adding critical_term_definitions section...');
  const { data: existingTermDef, error: termDefCheck } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'critical_term_definitions')
    .eq('protocol_id', protocol.id)
    .single();

  if (termDefCheck || !existingTermDef) {
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'critical_term_definitions',
        title: 'Critical Term Definitions',
        content: CRITICAL_TERM_DEFINITIONS_CONTENT,
        order_index: 111  // Right after execution_philosophy (110)
      });

    if (insertError) {
      console.error('   ❌ Insert error:', insertError.message);
    } else {
      console.log('   ✅ Inserted critical_term_definitions');
    }
  } else {
    console.log('   Section exists, updating...');
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({ content: CRITICAL_TERM_DEFINITIONS_CONTENT })
      .eq('id', existingTermDef.id);

    if (updateError) {
      console.error('   ❌ Update error:', updateError.message);
    } else {
      console.log('   ✅ Updated critical_term_definitions');
    }
  }

  // Update 3: parent_child_overview section
  console.log('\n3️⃣ Updating parent_child_overview with STOP Conditions...');
  const { data: parentChild, error: parentChildCheck } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'parent_child_overview')
    .eq('protocol_id', protocol.id)
    .single();

  if (parentChildCheck || !parentChild) {
    console.log('   ⚠️ Section not found, inserting new...');
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'parent_child_overview',
        title: 'Parent-Child SD Hierarchy',
        content: PARENT_CHILD_OVERVIEW_CONTENT,
        order_index: 151
      });

    if (insertError) {
      console.error('   ❌ Insert error:', insertError.message);
    } else {
      console.log('   ✅ Inserted parent_child_overview');
    }
  } else {
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({ content: PARENT_CHILD_OVERVIEW_CONTENT })
      .eq('id', parentChild.id);

    if (updateError) {
      console.error('   ❌ Update error:', updateError.message);
    } else {
      console.log('   ✅ Updated parent_child_overview');
    }
  }

  console.log('\n=== Summary ===');
  console.log('✅ Updated/inserted 3 guardrail sections:');
  console.log('   1. execution_philosophy (with Anti-Bias Rules)');
  console.log('   2. critical_term_definitions (NEW)');
  console.log('   3. parent_child_overview (with STOP Conditions)');

  console.log('\n📋 Next steps:');
  console.log('   1. Update section-file-mapping.json to include critical_term_definitions');
  console.log('   2. Regenerate CLAUDE files: node scripts/generate-claude-md-from-db.js');
  console.log('   3. Create orchestrator-preflight.js script');
}

main().catch(console.error);
