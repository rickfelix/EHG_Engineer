#!/usr/bin/env node
/**
 * Insert SD Type-Aware Workflow section into database
 * Part of SD-LEO-GEMINI-001 improvements
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the active protocol ID
const { data: protocol } = await supabase
  .from('leo_protocol_versions')
  .select('id')
  .eq('status', 'ACTIVE')
  .single();

const PROTOCOL_ID = protocol?.id;

if (!PROTOCOL_ID) {
  console.error('No active protocol found');
  process.exit(1);
}

console.log('Active protocol:', PROTOCOL_ID);

// Get max order_index for CLAUDE_CORE.md
const { data: maxOrder } = await supabase
  .from('leo_protocol_sections')
  .select('order_index')
  .eq('target_file', 'CLAUDE_CORE.md')
  .order('order_index', { ascending: false })
  .limit(1)
  .single();

const nextOrder = (maxOrder?.order_index || 50) + 1;

const SD_TYPE_WORKFLOW_SECTION = `
## SD Type-Aware Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs. Always check the workflow before executing handoffs.

### Workflow Command
\`\`\`bash
# Check recommended workflow for any SD
node scripts/handoff.js workflow SD-XXX-001
\`\`\`

### Workflow by SD Type

| SD Type | Required Handoffs | Optional | Skipped Validation |
|---------|-------------------|----------|-------------------|
| **feature** | LEAD→PLAN→EXEC→PLAN (verify)→LEAD (final) | None | None |
| **infrastructure** | LEAD→PLAN→EXEC→LEAD (final) | EXEC-TO-PLAN | TESTING, GITHUB, E2E, Gates 3&4 |
| **documentation** | LEAD→PLAN→EXEC→LEAD (final) | EXEC-TO-PLAN | All code validation |
| **database** | Full workflow | None | Some E2E (UI-dependent) |
| **security** | Full workflow | None | None |

### Key Rules

1. **Feature SDs**: Full 5-handoff workflow with all validation gates
2. **Infrastructure SDs**: Can skip EXEC-TO-PLAN (no code to validate)
3. **Documentation SDs**: Can skip EXEC-TO-PLAN (no implementation to verify)
4. **Database/Security SDs**: Full workflow but may skip UI-dependent E2E tests

### Example: Infrastructure SD
\`\`\`
SD: SD-LEO-GEMINI-001 (infrastructure)
Workflow: LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC-TO-PLAN optional] → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
\`\`\`

### Pre-Handoff Check
Before executing any handoff:
1. Run \`node scripts/handoff.js workflow SD-ID\` to see the recommended path
2. The execute command will warn you if a handoff is optional
3. Infrastructure/docs SDs can proceed directly from EXEC to PLAN-TO-LEAD
`;

// Check if section exists
const { data: existing } = await supabase
  .from('leo_protocol_sections')
  .select('id')
  .eq('section_type', 'sd_type_workflow_paths')
  .single();

if (existing) {
  // Update existing
  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({
      content: SD_TYPE_WORKFLOW_SECTION.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id);

  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('✅ Updated existing section');
  }
} else {
  // Insert new
  const { error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: PROTOCOL_ID,
      section_type: 'sd_type_workflow_paths',
      title: 'SD Type-Aware Workflow Paths',
      content: SD_TYPE_WORKFLOW_SECTION.trim(),
      order_index: nextOrder,
      target_file: 'CLAUDE_CORE.md',
      context_tier: 'CORE',
      is_active: true,
      metadata: {
        sd_source: 'SD-LEO-GEMINI-001',
        purpose: 'Guide agents on correct workflow path based on SD type'
      }
    });

  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('✅ Inserted new section');
  }
}

console.log('Done');
