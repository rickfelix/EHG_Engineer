#!/usr/bin/env node

/**
 * Insert Mandatory Phase Transitions section into leo_protocol_sections
 *
 * This script inserts a new section that enforces the use of handoff.js
 * and phase-preflight.js commands for ALL phase transitions.
 *
 * Target: CLAUDE_CORE.md, order_index: 4 (after session verification, before model routing)
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const SECTION_CONTENT = `**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using \`database-agent\` to directly insert into \`sd_phase_handoffs\`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### LEAD → PLAN Transition
\`\`\`bash
# Step 1: MANDATORY - Run preflight (loads context from database)
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (validates and blocks if not ready)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
\`\`\`

#### PLAN → EXEC Transition
\`\`\`bash
# Step 1: MANDATORY - Run preflight
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (enforces BMAD, branch, and gate validation)
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
\`\`\`

#### EXEC → PLAN Transition (Verification)
\`\`\`bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001
\`\`\`

#### PLAN → LEAD Transition (Final Approval)
\`\`\`bash
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
\`\`\`

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| \`phase-preflight.js\` | Loads context, patterns, and lessons from database |
| \`handoff.js LEAD-TO-PLAN\` | SD completeness (100% required), strategic objectives |
| \`handoff.js PLAN-TO-EXEC\` | BMAD validation, DESIGN→DB workflow, Git branch enforcement |
| \`handoff.js EXEC-TO-PLAN\` | Implementation fidelity, test coverage, deliverables |
| \`handoff.js PLAN-TO-LEAD\` | Traceability, workflow ROI, retrospective quality |

### Compliance Marker
Valid handoffs are recorded with \`created_by: 'UNIFIED-HANDOFF-SYSTEM'\`. Handoffs with other \`created_by\` values indicate process bypass.

### Check Compliance
\`\`\`bash
npm run handoff:compliance        # Check all recent handoffs
npm run handoff:compliance SD-ID  # Check specific SD
\`\`\`

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**`;

async function insertSection() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('Checking for existing section...');

    // Check if section already exists
    const checkResult = await client.query(`
      SELECT id, section_type, order_index
      FROM leo_protocol_sections
      WHERE protocol_id = 'leo-v4-3-3-ui-parity'
        AND section_type = 'mandatory_phase_transitions'
    `);

    if (checkResult.rows.length > 0) {
      console.log('❌ Section already exists:', checkResult.rows[0]);
      console.log('Skipping insert to avoid duplicate.');
      return;
    }

    console.log('✅ No existing section found. Proceeding with insert...');

    // Insert the new section
    const insertResult = await client.query(`
      INSERT INTO leo_protocol_sections (
        protocol_id,
        section_type,
        title,
        content,
        order_index,
        target_file,
        metadata
      ) VALUES (
        'leo-v4-3-3-ui-parity',
        'mandatory_phase_transitions',
        '🚫 MANDATORY: Phase Transition Commands (BLOCKING)',
        $1,
        4,
        'CLAUDE_CORE.md',
        '{"category": "workflow_enforcement", "criticality": "mandatory"}'::jsonb
      )
      RETURNING id, section_type, title, order_index, target_file
    `, [SECTION_CONTENT]);

    console.log('\n✅ Section inserted successfully:');
    console.log(JSON.stringify(insertResult.rows[0], null, 2));

    console.log('\n📋 Next steps:');
    console.log('1. Regenerate CLAUDE_CORE.md: npm run schema:generate-claude-md');
    console.log('2. Verify placement in file (should be after session verification)');
    console.log('3. Commit changes if satisfied');

  } catch (error) {
    console.error('❌ Error inserting section:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the script
insertSection().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
