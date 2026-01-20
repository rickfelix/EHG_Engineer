#!/usr/bin/env node
/**
 * Update Section 390 with SDKeyGenerator patterns
 * Adds SDKeyGenerator-specific troubleshooting to existing content
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const ADDITIONAL_CONTENT = `

### SDKeyGenerator Errors (SD-LEO-SDKEY-001)

#### Error: \`Invalid SD type\` or \`new value for domain sd_type violates check constraint\`

**Cause**: Using user-friendly type names that don't match database constraint
**Solution**: SDKeyGenerator automatically maps user types to valid database types:
\`\`\`javascript
// User-friendly types → Database types
fix, bugfix → bugfix
feature, feat → feature
enhancement → feature
refactor, refactoring → refactor
infrastructure, infra → infrastructure
documentation, docs → documentation
testing, test → testing
security → security
\`\`\`

**Reference**: \`scripts/modules/sd-key-generator.js\` line 45-60

#### Error: \`SD key collision detected\` or duplicate key in different format

**Cause**: Proposed SD key matches existing SD in either \`sd_key\` OR \`id\` column
**Solution**: SDKeyGenerator checks BOTH columns automatically:
\`\`\`javascript
// Checks both columns
const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .or(\`sd_key.eq.\${proposedKey},id.eq.\${proposedKey}\`);
\`\`\`
If collision detected, sequential number auto-increments (001 → 002 → 003).

**Reference**: \`scripts/modules/sd-key-generator.js\` keyExists() function

#### Error: Semantic extraction produces unclear abbreviations

**Cause**: Title contains many small words or acronyms
**Solution**: SDKeyGenerator extracts 2-3 meaningful words, skipping common words:
\`\`\`javascript
// "Fix navigation route not working" → "NAV-ROUTE"
// "Add user authentication feature" → "USER-AUTH"
// Skips: the, a, an, and, or, but, to, from, with, of, for, in, on, at
\`\`\`

**Manual override available**:
\`\`\`javascript
await generateSDKey({
  source: 'UAT',
  type: 'bugfix',
  title: 'Fix navigation route not working',
  semanticOverride: 'NAV-FIX'  // Force specific semantic
});
\`\`\`

**Reference**: \`scripts/modules/sd-key-generator.js\` extractSemanticWords() function

#### Error: Child SD key format incorrect (e.g., \`SD-UAT-FIX-NAV-001-A\` vs \`SD-UAT-FIX-NAV-001A\`)

**Cause**: Manual child key creation without using SDKeyGenerator hierarchy functions
**Solution**: Use SDKeyGenerator hierarchy functions for consistent encoding:
\`\`\`javascript
// Root SD
const rootKey = await generateSDKey({...}); // SD-UAT-FIX-NAV-001

// Child (no hyphen before suffix)
const childKey = generateChildKey(rootKey, 'A'); // SD-UAT-FIX-NAV-001A

// Grandchild (hyphen before numeric suffix)
const grandchildKey = generateGrandchildKey(childKey, '1'); // SD-UAT-FIX-NAV-001A-1

// Great-grandchild (dot separator)
const greatGrandchildKey = generateGreatGrandchildKey(grandchildKey, '1'); // SD-UAT-FIX-NAV-001A-1.1
\`\`\`

**Hierarchy encoding rules**:
- Root: \`SD-SOURCE-TYPE-SEMANTIC-NUM\`
- Child: Append letter (no hyphen): \`-NUMA\`
- Grandchild: Add hyphen + number: \`-NUMA-1\`
- Great-grandchild: Add dot + number: \`-NUMA-1.1\`

**Reference**: \`docs/reference/sd-key-generator-guide.md\` Hierarchy Support section

#### Error: Sequential numbering gaps (e.g., 001, 002, 005)

**Cause**: Deleted SDs or manual key creation creating gaps
**Solution**: SDKeyGenerator automatically finds next available number:
\`\`\`javascript
// If SD-UAT-FIX-NAV-001 and SD-UAT-FIX-NAV-003 exist
// Next key will be SD-UAT-FIX-NAV-002 (fills gap)
// Then SD-UAT-FIX-NAV-004 (next sequential)
\`\`\`

**Reference**: \`scripts/modules/sd-key-generator.js\` getNextSequentialNumber() function

### Using /leo create Command

#### Recommended: Unified SD creation interface (SD-LEO-SDKEY-001)

Instead of manually calling SDKeyGenerator or legacy scripts, use \`/leo create\`:

\`\`\`bash
# Interactive mode - Prompts for all fields
/leo create

# From UAT finding
/leo create --from-uat <test-id>

# From /learn pattern
/leo create --from-learn <pattern-id>

# From /inbox feedback
/leo create --from-feedback <feedback-id>

# Create child SD
/leo create --child SD-UAT-FIX-NAV-001 A
\`\`\`

**Features**:
- Automatic source detection (UAT, LEARN, FEEDBACK, etc.)
- Type mapping to valid database constraints
- Collision detection across both \`sd_key\` and \`id\` columns
- Sequential numbering with gap detection
- Hierarchy support (4 levels)

**Reference**: \`docs/reference/npm-scripts-guide.md\` line 121-148, \`docs/reference/sd-key-generator-guide.md\`

#### Migration from legacy scripts

If you have code using old SD creation patterns, migrate to SDKeyGenerator:

\`\`\`javascript
// OLD (manual key generation)
const sdKey = \`SD-\${source}-\${type.toUpperCase()}-\${semantic}-001\`;

// NEW (SDKeyGenerator)
import { generateSDKey } from './modules/sd-key-generator.js';
const sdKey = await generateSDKey({ source, type, title });
\`\`\`

**Migrated scripts**:
1. \`scripts/uat-to-strategic-directive-ai.js\`
2. \`scripts/sd-from-feedback.js\`
3. \`scripts/pattern-alert-sd-creator.js\`
4. \`scripts/create-sd.js\`
5. \`scripts/modules/learning/executor.js\`
`;

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Get current content
    const result = await client.query(
      'SELECT id, title, content FROM leo_protocol_sections WHERE id = 390;'
    );

    if (result.rows.length === 0) {
      console.error('❌ Section 390 not found');
      process.exit(1);
    }

    const section = result.rows[0];
    const currentContent = section.content || '';
    const updatedContent = currentContent + ADDITIONAL_CONTENT;

    console.log(`\n📝 Updating Section 390: ${section.title}`);
    console.log(`Current length: ${currentContent.length} chars`);
    console.log(`Additional content: ${ADDITIONAL_CONTENT.length} chars`);
    console.log(`New length: ${updatedContent.length} chars\n`);

    // Update the section
    const updateResult = await client.query(
      'UPDATE leo_protocol_sections SET content = $1 WHERE id = 390 RETURNING id, title;',
      [updatedContent]
    );

    if (updateResult.rowCount > 0) {
      console.log('✅ Section 390 updated successfully');
      console.log(`\n📋 Updated: ${updateResult.rows[0].title}`);
      console.log('\n💡 Next step: Run `node scripts/generate-claude-md-from-db.js` to regenerate CLAUDE.md files\n');
    } else {
      console.error('❌ Update failed - no rows affected');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
