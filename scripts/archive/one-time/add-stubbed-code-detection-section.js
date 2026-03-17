#!/usr/bin/env node

/**
 * Add Stubbed/Mocked Code Detection Section to LEO Protocol Database
 *
 * Purpose: Insert the stubbed code detection requirement into leo_protocol_sections
 *          so it becomes part of Phase 4 (PLAN Supervisor Verification)
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const SECTION_CONTENT = `
**CRITICAL: Stubbed/Mocked Code Detection** (MANDATORY):

Before PLAN→LEAD handoff, MUST verify NO stubbed/mocked code in production files:

**Check For** (BLOCKING if found):
\`\`\`bash
# 1. TEST_MODE flags in production code
grep -r "TEST_MODE.*true\\|NODE_ENV.*test" lib/ src/ --exclude-dir=test

# 2. Mock/stub patterns
grep -r "MOCK:\\|STUB:\\|TODO:\\|PLACEHOLDER:\\|DUMMY:" lib/ src/ --exclude-dir=test

# 3. Commented-out implementations
grep -r "// REAL IMPLEMENTATION\\|// TODO: Implement" lib/ src/ --exclude-dir=test

# 4. Mock return values without logic
grep -r "return.*mock.*result\\|return.*dummy" lib/ src/ --exclude-dir=test
\`\`\`

**Acceptable Patterns** ✅:
- \`TEST_MODE\` in test files (\`tests/\`, \`*.test.js\`, \`*.spec.js\`)
- TODO comments with SD references for future work: \`// TODO (SD-XXX): Implement caching\`
- Feature flags with proper configuration: \`if (config.enableFeature)\`

**BLOCKING Patterns** ❌:
- \`const TEST_MODE = process.env.TEST_MODE === 'true'\` in production code
- \`return { verdict: 'PASS' }\` without actual logic
- \`console.log('MOCK: Using dummy data')\`
- Empty function bodies: \`function execute() { /* TODO */ }\`
- Commented-out real implementations

**Verification Script**:
\`\`\`bash
# Create verification script
node scripts/detect-stubbed-code.js <SD-ID>
\`\`\`

**Manual Code Review**:
- Read all modified files from git diff
- Verify implementations are complete
- Check for placeholder comments
- Validate TEST_MODE usage is test-only

**Exit Requirement**: Zero stubbed code in production files, OR documented in "Known Issues" with follow-up SD created.
`;

async function main() {
  console.log('\n🔧 Adding Stubbed Code Detection Section to Database');
  console.log('═'.repeat(70));

  const client = await createDatabaseClient('engineer', { verify: true });

  try {
    // Get the active protocol ID
    const protocolResult = await client.query(
      'SELECT id FROM leo_protocols WHERE status = \'active\' LIMIT 1'
    );

    if (protocolResult.rows.length === 0) {
      throw new Error('No active protocol found');
    }

    const protocolId = protocolResult.rows[0].id;
    console.log(`📋 Active protocol: ${protocolId}`);

    // Check if section already exists
    const checkResult = await client.query(
      `SELECT id FROM leo_protocol_sections
       WHERE protocol_id = $1 AND title = 'Stubbed/Mocked Code Detection'`,
      [protocolId]
    );

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Section already exists, updating...');

      await client.query(
        `UPDATE leo_protocol_sections
         SET content = $1
         WHERE id = $2`,
        [SECTION_CONTENT, checkResult.rows[0].id]
      );

      console.log('✅ Section updated successfully');
    } else {
      console.log('📝 Inserting new section...');

      await client.query(
        `INSERT INTO leo_protocol_sections
         (protocol_id, section_type, title, content, order_index, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          protocolId,
          'PHASE_4_VERIFICATION',
          'Stubbed/Mocked Code Detection',
          SECTION_CONTENT,
          45, // Display after other Phase 4 content
          JSON.stringify({ category: 'PLAN_SUPERVISOR', mandatory: true, blocking: true })
        ]
      );

      console.log('✅ Section inserted successfully');
    }

    // Regenerate CLAUDE.md
    console.log('\n🔄 Regenerating CLAUDE.md from database...');
    const { execSync } = await import('child_process');
    execSync('node scripts/generate-claude-md-from-db.js', { stdio: 'inherit' });

    console.log('\n✅ Done! Stubbed code detection is now part of LEO Protocol');
    console.log('📄 Location: PHASE 4: PLAN SUPERVISOR VERIFICATION');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
