#!/usr/bin/env node

/**
 * Insert Child SD Preflight Validation Section into LEO Protocol
 * Run once to add the new section to the database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Inserting Child SD Preflight Validation section...\n');

  // Get active protocol ID
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('Error finding active protocol:', protocolError?.message);
    process.exit(1);
  }

  console.log(`Found active protocol: ${protocol.id} (v${protocol.version})`);

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'child_sd_preflight_validation')
    .eq('protocol_id', protocol.id)
    .single();

  if (existing) {
    console.log('Section already exists. Updating...');

    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        title: 'Child SD Pre-Work Validation (MANDATORY)',
        content: getSectionContent(),
        order_index: 15,
        context_tier: 'CORE',
        target_file: 'CLAUDE_CORE.md'
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Error updating section:', updateError.message);
      process.exit(1);
    }

    console.log('Section updated successfully!');
  } else {
    // Insert new section
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'child_sd_preflight_validation',
        title: 'Child SD Pre-Work Validation (MANDATORY)',
        content: getSectionContent(),
        order_index: 15,
        context_tier: 'CORE',
        target_file: 'CLAUDE_CORE.md'
      });

    if (insertError) {
      console.error('Error inserting section:', insertError.message);
      process.exit(1);
    }

    console.log('Section inserted successfully!');
  }

  console.log('\nDone! Run `node scripts/generate-claude-md-from-db.js` to regenerate CLAUDE.md files.');
}

function getSectionContent() {
  return `### Child SD Pre-Work Validation

**CRITICAL**: Before starting work on any child SD (SD with parent_sd_id), you MUST run the preflight validation.

#### When to Run
- Before starting work on ANY child SD
- The validation is automatic - run it immediately when selecting a child SD

#### Validation Command
\`\`\`bash
node scripts/child-sd-preflight.js SD-XXX-001
\`\`\`

#### What It Checks
1. **Is Child SD**: Verifies the SD has a parent_sd_id (is a child)
2. **Dependency Chain**: For each SD in the dependency_chain:
   - Status must be \`completed\`
   - Progress must be \`100%\`
   - Required handoffs must be present (varies by SD type)
3. **Parent Context**: Loads parent orchestrator for reference

#### Validation Results

**PASS** - Ready to work:
- SD is not a child (standalone), OR
- SD is a child with no dependencies, OR
- All dependency SDs are complete with required handoffs

**BLOCKED** - Cannot proceed:
- One or more dependency SDs are incomplete
- Missing required handoffs on dependencies
- Action: Complete the blocking dependency first

#### Example Output (BLOCKED)
\`\`\`
═══════════════════════════════════════════════════════════
  CHILD SD PRE-WORK VALIDATION
═══════════════════════════════════════════════════════════

📋 SD: SD-QUALITY-CLI-001 (/inbox CLI Command)
   Parent: SD-QUALITY-LIFECYCLE-001 (Quality Lifecycle System)

🔗 DEPENDENCY CHECK
┌─────────────────────────┬──────────┬──────────┬──────────┐
│ Dependency              │ Status   │ Progress │ Handoffs │
├─────────────────────────┼──────────┼──────────┼──────────┤
│ SD-QUALITY-DB-001       │ in_prog  │ 60%      │ 2/4      │
└─────────────────────────┴──────────┴──────────┴──────────┘

❌ RESULT: BLOCKED
   Cannot start SD-QUALITY-CLI-001 until dependencies are complete.

   🚫 SD-QUALITY-DB-001 is not complete:
      - Status: in_progress (expected: completed)
      - Progress: 60% (expected: 100%)
      - Handoffs: 2/4 (expected: 4)

   ACTION: Complete SD-QUALITY-DB-001 first, then return to this SD.
\`\`\`

#### Integration with Workflow
- \`npm run sd:next\` shows dependency status in the queue
- Child SDs with incomplete dependencies show as BLOCKED
- Complete dependencies in sequence before proceeding`;
}

main().catch(console.error);
