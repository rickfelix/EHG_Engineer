#!/usr/bin/env node
/**
 * Update LEO Protocol Section 210 with Gate 0 Enforcement Documentation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const gate0Section = `

### Gate 0 Enforcement 🚨

**CRITICAL**: Before ANY implementation work, verify SD has passed LEAD approval:

\`\`\`bash
# Check SD phase status
node scripts/verify-sd-phase.js SD-XXX-001

# Or check via sd:status
npm run sd:status SD-XXX-001
\`\`\`

**Valid Phases for Implementation**:
- PLANNING, PLAN_PRD, PLAN, PLAN_VERIFICATION (PRD creation)
- EXEC (implementation authorized)

**Blocked Phases**:
- draft - SD not approved
- LEAD_APPROVAL - Awaiting LEAD approval

**Why This Matters**: Gate 0 prevents the anti-pattern where code is shipped while SDs remain in draft status. This is the "naming illusion" - using LEO terminology while bypassing LEO workflow.

**Enforcement Layers**:
1. Pre-commit hook (blocks commits for draft SDs)
2. CLAUDE_EXEC.md (mandatory Phase 1 check)
3. LOC threshold (>500 LOC requires SD)
4. verify-sd-phase.js script
5. GitHub Action (PR validation)
6. Orchestrator progress calculation

See: \`docs/03_protocols_and_standards/gate0-workflow-entry-enforcement.md\` for complete documentation.

**If SD is in draft**: STOP. Do not implement. Run LEAD-TO-PLAN handoff first.
`;

async function updateSection210() {
  console.log('Updating section 210 with Gate 0 enforcement documentation...\n');

  // Read current content
  const { data: current, error: readError } = await supabase
    .from('leo_protocol_sections')
    .select('content')
    .eq('id', 210)
    .single();

  if (readError) {
    console.error('❌ Error reading section 210:', readError.message);
    process.exit(1);
  }

  // Check if Gate 0 content already exists
  if (current.content.includes('### Gate 0 Enforcement')) {
    console.log('⚠️  Gate 0 section already exists in section 210');
    console.log('   No update needed.');
    process.exit(0);
  }

  // Append Gate 0 section
  const updatedContent = current.content + gate0Section;

  // Update database
  const { error: updateError } = await supabase
    .from('leo_protocol_sections')
    .update({ content: updatedContent })
    .eq('id', 210);

  if (updateError) {
    console.error('❌ Error updating section 210:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Section 210 updated successfully');
  console.log('   Added Gate 0 enforcement documentation');
  console.log('\n📝 Next Step: Regenerate CLAUDE*.md files');
  console.log('   node scripts/generate-claude-md-from-db.js');
}

updateSection210().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
