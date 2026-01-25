#!/usr/bin/env node

/**
 * Insert LEO Protocol Section for Baseline Issues Management
 * SD: SD-HARDENING-V2-001B
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('📝 Inserting LEO Protocol Section: Baseline Issues Management\n');

    const sectionContent = `## Baseline Issues System

Pre-existing codebase issues are tracked in \`sd_baseline_issues\` table to prevent blocking unrelated SDs.

### LEAD Gate: BASELINE_DEBT_CHECK
- **BLOCKS** if: Stale critical issues (>30 days) exist without owner
- **WARNS** if: Total open issues > 10 or stale non-critical > 5

### Lifecycle
| Status | Meaning |
|--------|---------|
| open | Issue identified, no owner assigned |
| acknowledged | Issue reviewed, owner assigned |
| in_progress | Remediation SD actively working |
| resolved | Fixed and verified |
| wont_fix | Accepted risk (requires LEAD approval + justification) |

### Commands
\`\`\`bash
npm run baseline:list          # Show all open issues
npm run baseline:assign <key> <SD-ID>  # Assign ownership
npm run baseline:resolve <key> # Mark resolved
npm run baseline:summary       # Category summary
\`\`\`

### Categories
security, testing, performance, database, documentation, accessibility, code_quality, dependency, infrastructure

### Issue Key Format
\`BL-{CATEGORY}-{NNN}\` where:
- BL-SEC-001: Security baseline issue #1
- BL-TST-001: Testing baseline issue #1
- BL-PRF-001: Performance baseline issue #1
- BL-DB-001: Database baseline issue #1
- BL-DOC-001: Documentation baseline issue #1
- BL-A11Y-001: Accessibility baseline issue #1
- BL-CQ-001: Code quality baseline issue #1
- BL-DEP-001: Dependency baseline issue #1
- BL-INF-001: Infrastructure baseline issue #1

### Functions
- \`check_baseline_gate(p_sd_id)\`: Returns PASS/BLOCKED verdict for LEAD gate
- \`generate_baseline_issue_key(p_category)\`: Generates unique issue key`;

    // Get the current active protocol
    const protocolResult = await client.query(`
      SELECT id FROM leo_protocols
      WHERE status = 'active'
      ORDER BY version DESC
      LIMIT 1
    `);

    if (protocolResult.rows.length === 0) {
      throw new Error('No active LEO protocol found');
    }

    const protocolId = protocolResult.rows[0].id;
    console.log(`Using protocol ID: ${protocolId}\n`);

    // Check if section already exists
    const existingSection = await client.query(`
      SELECT id FROM leo_protocol_sections
      WHERE protocol_id = $1 AND title = 'Baseline Issues Management'
    `, [protocolId]);

    if (existingSection.rows.length > 0) {
      console.log('⚠️  Section already exists, updating...\n');

      await client.query(`
        UPDATE leo_protocol_sections
        SET content = $1,
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{updated_by}',
              '"SD-HARDENING-V2-001B"'
            )
        WHERE id = $2
      `, [sectionContent, existingSection.rows[0].id]);

      console.log('✅ Section updated successfully!\n');
    } else {
      // Get the highest order_index for governance sections
      const orderResult = await client.query(`
        SELECT COALESCE(MAX(order_index), 0) + 1 as next_order
        FROM leo_protocol_sections
        WHERE protocol_id = $1
          AND section_type = 'governance'
      `, [protocolId]);

      const orderIndex = orderResult.rows[0].next_order;

      const insertSQL = `
        INSERT INTO leo_protocol_sections (
          protocol_id,
          section_type,
          title,
          content,
          order_index,
          context_tier,
          target_file,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        RETURNING id
      `;

      const insertResult = await client.query(insertSQL, [
        protocolId,
        'governance',
        'Baseline Issues Management',
        sectionContent,
        orderIndex,
        'phase',
        'CLAUDE_LEAD.md',
        JSON.stringify({
          created_by: 'SD-HARDENING-V2-001B',
          category: 'governance',
          gate_integration: 'BASELINE_DEBT_CHECK'
        })
      ]);

      console.log(`✅ Section inserted successfully! (ID: ${insertResult.rows[0].id})\n`);
    }

    // Verify
    const verifyResult = await client.query(`
      SELECT id, protocol_id, section_type, title, order_index,
             context_tier, target_file, length(content) as content_length
      FROM leo_protocol_sections
      WHERE protocol_id = $1 AND title = 'Baseline Issues Management'
    `, [protocolId]);

    if (verifyResult.rows.length > 0) {
      const section = verifyResult.rows[0];
      console.log('📋 Verification:');
      console.log(`   ID: ${section.id}`);
      console.log(`   Protocol ID: ${section.protocol_id}`);
      console.log(`   Type: ${section.section_type}`);
      console.log(`   Title: ${section.title}`);
      console.log(`   Order: ${section.order_index}`);
      console.log(`   Tier: ${section.context_tier}`);
      console.log(`   Target: ${section.target_file}`);
      console.log(`   Content Length: ${section.content_length} bytes\n`);
    }

    console.log('📚 Next Step:');
    console.log('   Run: node scripts/generate-claude-md-from-db.js\n');

  } catch (error) {
    console.error('❌ Failed to insert section:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
