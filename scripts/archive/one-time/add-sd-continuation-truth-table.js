#!/usr/bin/env node
/**
 * Add SD Continuation Truth Table section to leo_protocol_sections
 *
 * This adds the authoritative truth table for all SD transition decisions,
 * covering child-to-child, orchestrator-to-orchestrator, and error scenarios.
 *
 * Addresses root cause: D08 was written as absolute rule without specifying
 * exceptions for Chaining mode, and child-to-child continuation wasn't documented.
 *
 * Related decisions: D08, D31, D32, D33
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_CONTINUATION_CONTENT = `## SD Continuation Truth Table

**CRITICAL**: This table is AUTHORITATIVE for ALL SD transition decisions. It covers every transition type, not just orchestrator boundaries. When behavior is ambiguous, THIS TABLE WINS.

### Complete Transition Matrix

| Transition Context | AUTO-PROCEED | Chaining | Behavior | Implementation |
|-------------------|:------------:|:--------:|----------|----------------|
| **Child completes → next child** | ON | * | **AUTO-CONTINUE** to next ready child (priority-based) | \`getNextReadyChild()\` |
| Child completes → next child | OFF | * | PAUSE for user selection | User must invoke \`/leo next\` |
| **Child fails gate (retries exhausted)** | ON | * | **SKIP** to next sibling (D16) | \`executeSkipAndContinue()\` |
| Child fails gate (retries exhausted) | OFF | * | PAUSE with failure details | Manual remediation |
| **All children complete (orchestrator done)** | ON | ON | Run /learn → **AUTO-CONTINUE** to next orchestrator | \`orchestrator-completion-hook.js\` |
| All children complete (orchestrator done) | ON | OFF | Run /learn → Show queue → **PAUSE** (D08) | User selects next orchestrator |
| All children complete (orchestrator done) | OFF | * | PAUSE before /learn | Maximum human control |
| **All children blocked** | * | * | **PAUSE** - show blockers (D23) | Human decision required |
| **Dependency unresolved** | * | * | **SKIP** SD, continue to next ready | \`checkDependenciesResolved()\` |
| **Grandchild completes** | ON | * | Return to parent context, continue to next child | Hierarchical traversal |

### Key Rules

1. **AUTO-PROCEED OFF always pauses** - Chaining has no effect when AUTO-PROCEED is OFF
2. **Chaining only affects orchestrator-to-orchestrator transitions** - Child-to-child is controlled by AUTO-PROCEED alone
3. **Priority determines next SD** - \`sortByUrgency()\` ranks by: Band (P0→P3) → Score → FIFO
4. **Dependencies gate readiness** - SD with unresolved deps is skipped, not paused on
5. **Both ON = no pauses except hard stops** - Runs until D23 (all blocked) or context exhaustion

### Next SD Selection Priority

When AUTO-PROCEED determines "next SD", selection follows this order:

\`\`\`
1. Unblocked children of current orchestrator (by urgency score)
2. Unblocked grandchildren (depth-first, urgency-sorted)
3. Next orchestrator (if Chaining ON and current orchestrator complete)
4. PAUSE (if nothing ready or Chaining OFF at orchestrator boundary)
\`\`\`

**Urgency Score Components** (from \`urgency-scorer.js\`):
- SD Priority (critical/high/medium/low): 25% weight
- Active issue patterns: 20% weight
- Downstream blockers: 15% weight
- Time sensitivity: 15% weight
- Learning signals: 40% blend
- Progress (≥80% complete): 10% bonus

### Decision Flow (Complete)

\`\`\`
SD Completes (child, grandchild, or orchestrator)
         │
         ▼
   AUTO-PROCEED ON?
    │           │
   YES          NO
    │           └──► PAUSE (ask user to invoke /leo next)
    ▼
   Is this an orchestrator with all children done?
    │           │
   YES          NO (more children remain)
    │           │
    │           └──► getNextReadyChild() → Continue to next child
    ▼
   Run /learn automatically
         │
         ▼
   Chaining ON?
    │           │
   YES          NO
    │           └──► Show queue → PAUSE (D08)
    ▼
   findNextAvailableOrchestrator()
    │           │
   Found       Not Found
    │           └──► Show queue → PAUSE (no more work)
    ▼
   Auto-continue to next orchestrator
\`\`\`

### Implementation Files

| Component | File | Key Function |
|-----------|------|--------------|
| Child selection | \`scripts/modules/handoff/child-sd-selector.js\` | \`getNextReadyChild()\` |
| Skip failed child | \`scripts/modules/handoff/skip-and-continue.js\` | \`executeSkipAndContinue()\` |
| Orchestrator completion | \`scripts/modules/handoff/orchestrator-completion-hook.js\` | \`executeOrchestratorCompletionHook()\` |
| Urgency scoring | \`scripts/modules/auto-proceed/urgency-scorer.js\` | \`sortByUrgency()\` |
| Dependency check | \`scripts/modules/sd-next/dependency-resolver.js\` | \`checkDependenciesResolved()\` |
| Mode resolution | \`scripts/modules/handoff/auto-proceed-resolver.js\` | \`resolveAutoProceed()\` |

### Conflict Resolution

If documentation elsewhere conflicts with this truth table:
1. **This truth table wins** - It is the canonical specification
2. **Report the conflict** - Create an issue or RCA to fix inconsistent text
3. **Never guess** - When behavior is ambiguous, consult this table

### Historical Notes

**2026-02-01 (v1)**: D08 was written as absolute rule without Chaining exception. Added orchestrator completion matrix.

**2026-02-01 (v2)**: Expanded to cover ALL transition types after discovering pause occurred between children within an orchestrator. Root cause: only orchestrator boundaries were specified, not child-to-child continuation.

**2026-02-01 (v2 code fix)**: Fixed \`scripts/modules/handoff/cli/cli-main.js:handleExecuteWithContinuation()\`. Bug: only continued after \`LEAD-FINAL-APPROVAL\`, causing break after \`LEAD-TO-PLAN\` for new children. Fix: Added \`WORKFLOW_SEQUENCE\` mapping to automatically advance through LEAD-TO-PLAN → LEAD-FINAL-APPROVAL → (find next child) → repeat.`;

async function addSDContinuationSection() {
  console.log('Adding SD Continuation Truth Table section to database...\n');

  // Get the protocol_id from an existing section
  const { data: existingSection, error: fetchError } = await supabase
    .from('leo_protocol_sections')
    .select('protocol_id')
    .eq('id', 420) // Orchestrator Chaining section
    .single();

  if (fetchError) {
    console.error('Error fetching existing section:', fetchError.message);
    process.exit(1);
  }

  const protocolId = existingSection.protocol_id;
  console.log(`Using protocol_id: ${protocolId}`);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('title', 'SD Continuation Truth Table')
    .single();

  if (existing) {
    console.log('Section already exists with id:', existing.id);
    console.log('Updating existing section...');

    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: SD_CONTINUATION_CONTENT,
        target_file: 'CLAUDE.md',
        order_index: 7, // After Orchestrator Chaining (6)
        context_tier: null,
        metadata: {
          added_date: '2026-02-01',
          related_decisions: ['D08', 'D31', 'D32', 'D33'],
          root_cause: 'Incomplete behavior specification for AUTO-PROCEED + Chaining interaction'
        }
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Error updating section:', updateError.message);
      process.exit(1);
    }

    console.log('Section updated successfully');
  } else {
    // Insert new section
    const { data: newSection, error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocolId,
        section_type: 'guide',
        title: 'SD Continuation Truth Table',
        content: SD_CONTINUATION_CONTENT,
        order_index: 7, // After Orchestrator Chaining (6)
        target_file: 'CLAUDE.md',
        context_tier: null,
        priority: 'STANDARD',
        metadata: {
          added_date: '2026-02-01',
          related_decisions: ['D08', 'D31', 'D32', 'D33'],
          root_cause: 'Incomplete behavior specification for AUTO-PROCEED + Chaining interaction'
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting section:', insertError.message);
      process.exit(1);
    }

    console.log('Section created with id:', newSection.id);
  }

  // Also update D08 in Discovery Decisions to reference the exception
  console.log('\nUpdating Discovery Decisions section (D08 reference)...');

  const { data: discoverySection } = await supabase
    .from('leo_protocol_sections')
    .select('id, content')
    .ilike('title', '%Discovery Decisions%')
    .single();

  if (discoverySection && discoverySection.content) {
    // Update D08 to include the Chaining exception reference
    let updatedContent = discoverySection.content;
    if (updatedContent.includes('| D08 | Post-learn | Show queue, pause for user selection |')) {
      updatedContent = updatedContent.replace(
        '| D08 | Post-learn | Show queue, pause for user selection |',
        '| D08 | Post-learn | Show queue, pause for user selection **[unless Chaining ON - see SD Continuation Truth Table]** |'
      );

      const { error: updateError } = await supabase
        .from('leo_protocol_sections')
        .update({ content: updatedContent })
        .eq('id', discoverySection.id);

      if (updateError) {
        console.error('Error updating Discovery Decisions:', updateError.message);
      } else {
        console.log('Discovery Decisions section updated (D08 reference added)');
      }
    } else {
      console.log('D08 already has exception reference or format changed');
    }

    // Add D30-D33 if not present
    if (!updatedContent.includes('| D30 |')) {
      const d30to33 = `
| D30 | Background tasks | Use CLAUDE_CODE_DISABLE_BACKGROUND_TASKS env var |
| D31 | Mode interaction | **SD Continuation Truth Table governs ALL transitions** |
| D32 | Child-to-child | AUTO-PROCEED ON → auto-continue to next ready child (priority-based) |
| D33 | Grandchild return | After grandchild completes, return to parent context and continue |`;

      // Find the end of the table and insert before it
      if (updatedContent.includes('| D29 |')) {
        updatedContent = updatedContent.replace(
          /(\| D29 \|[^\n]*\n)/,
          `$1${d30to33}\n`
        );

        const { error: updateError } = await supabase
          .from('leo_protocol_sections')
          .update({ content: updatedContent })
          .eq('id', discoverySection.id);

        if (updateError) {
          console.error('Error adding D30-D33:', updateError.message);
        } else {
          console.log('Added D30-D33 to Discovery Decisions');
        }
      }
    }
  }

  console.log('\nDone! Run `node scripts/generate-claude-md-from-db.js` to regenerate CLAUDE.md');
}

addSDContinuationSection().catch(console.error);
