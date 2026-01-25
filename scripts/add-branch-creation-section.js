#!/usr/bin/env node

/**
 * Add Branch Creation Section to LEO Protocol
 * Adds the branch creation documentation to leo_protocol_sections
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const branchCreationContent = `## 🌿 Branch Creation (Automated at LEAD-TO-PLAN)

### Automatic Branch Creation

As of LEO v4.4.1, **branch creation is automated** during the LEAD-TO-PLAN handoff:

1. When you run \`node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001\`
2. The \`SD_BRANCH_PREPARATION\` gate automatically creates the branch
3. Branch is created with correct naming: \`<type>/<SD-ID>-<slug>\`
4. Database is updated with branch name for tracking

### Manual Branch Creation (If Needed)

If branch creation fails or you need to create one manually:

\`\`\`bash
# Create branch for an SD (looks up title from database)
npm run sd:branch SD-XXX-001

# Create with auto-stash (non-interactive)
npm run sd:branch:auto SD-XXX-001

# Check if branch exists
npm run sd:branch:check SD-XXX-001

# Full command with options
node scripts/create-sd-branch.js SD-XXX-001 --app EHG --auto-stash
\`\`\`

### Branch Naming Convention

| SD Type | Branch Prefix | Example |
|---------|---------------|---------|
| Feature | \`feat/\` | \`feat/SD-UAT-001-user-auth\` |
| Fix | \`fix/\` | \`fix/SD-FIX-001-login-bug\` |
| Docs | \`docs/\` | \`docs/SD-DOCS-001-api-guide\` |
| Refactor | \`refactor/\` | \`refactor/SD-REFACTOR-001-cleanup\` |
| Test | \`test/\` | \`test/SD-TEST-001-e2e-coverage\` |

### Branch Hygiene Rules

From CLAUDE_EXEC.md (enforced at PLAN-TO-EXEC):
- **≤7 days stale** at PLAN-TO-EXEC handoff
- **One SD per branch** (no mixing work)
- **Merge main at phase transitions**

### When Branch is Created

\`\`\`
LEAD Phase                    PLAN Phase                   EXEC Phase
    |                              |                            |
    |   LEAD-TO-PLAN handoff       |                            |
    |---[Branch Created Here]----->|                            |
    |                              |   PRD Creation             |
    |                              |   Sub-agent validation     |
    |                              |                            |
    |                              |   PLAN-TO-EXEC handoff     |
    |                              |---[Branch Validated]------>|
    |                              |                            |
\`\`\`
`;

async function main() {
  console.log('Adding branch creation section to LEO Protocol...\n');

  // Get current protocol ID from existing sections
  const { data: sample } = await supabase
    .from('leo_protocol_sections')
    .select('protocol_id')
    .limit(1)
    .single();

  const protocolId = sample?.protocol_id || 'leo-v4-3-3-ui-parity';
  console.log('Protocol ID:', protocolId);

  // First check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('title', 'Branch Creation (Automated at LEAD-TO-PLAN)')
    .single();

  if (existing) {
    // Update existing
    const { error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: branchCreationContent,
        target_file: 'CLAUDE_PLAN.md',
        order_index: 15
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Update error:', updateError);
      process.exit(1);
    }
    console.log('✅ Updated existing branch creation section');
  } else {
    // Insert new - using actual schema columns
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocolId,
        section_type: 'workflow',
        title: 'Branch Creation (Automated at LEAD-TO-PLAN)',
        content: branchCreationContent,
        target_file: 'CLAUDE_PLAN.md',
        order_index: 15,
        context_tier: 'PHASE_PLAN',
        metadata: { version: '4.4.1', added_by: 'create-sd-branch' }
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      process.exit(1);
    }
    console.log('✅ Inserted new branch creation section');
  }

  // Also add a section for CLAUDE_EXEC.md about branch already existing
  const execContent = `### Branch Should Already Exist (LEO v4.4.1)

As of LEO v4.4.1, the branch is **automatically created during LEAD-TO-PLAN handoff**:
- The \`SD_BRANCH_PREPARATION\` gate creates the branch proactively
- By the time EXEC starts, the branch should already exist
- This gate now **validates** the branch rather than creating it

If branch doesn't exist (legacy SDs or manual workflow):
\`\`\`bash
npm run sd:branch SD-XXX-001    # Creates and switches to branch
\`\`\`
`;

  const { data: existingExec } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('title', 'Branch Should Already Exist (LEO v4.4.1)')
    .single();

  if (existingExec) {
    await supabase
      .from('leo_protocol_sections')
      .update({
        content: execContent
      })
      .eq('id', existingExec.id);
    console.log('✅ Updated branch exists section for EXEC');
  } else {
    const { error: execInsertError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocolId,
        section_type: 'workflow',
        title: 'Branch Should Already Exist (LEO v4.4.1)',
        content: execContent,
        target_file: 'CLAUDE_EXEC.md',
        order_index: 785,
        context_tier: 'PHASE_EXEC',
        metadata: { version: '4.4.1', added_by: 'create-sd-branch' }
      });

    if (execInsertError) {
      console.error('EXEC Insert error:', execInsertError);
    } else {
      console.log('✅ Inserted branch exists section for EXEC');
    }
  }

  console.log('\n📝 Run `node scripts/generate-claude-md-from-db.js` to regenerate files');
}

main().catch(console.error);
