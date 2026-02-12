#!/usr/bin/env node
/**
 * Add Anti-Pattern Documentation Sections to Database
 * Inserts SD and PRD creation anti-patterns into leo_protocol_sections
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Anti-pattern sections to add
const sections = [
  {
    section_type: 'sd_creation_anti_pattern',
    title: 'SD Creation Anti-Pattern (PROHIBITED)',
    content: `## SD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off SD creation scripts like:**
- \`create-*-sd.js\`
- \`create-sd*.js\`

**ALWAYS use the standard CLI:**
\`\`\`bash
node scripts/leo-create-sd.js
\`\`\`

### Why This Matters
- One-off scripts bypass validation and governance
- They create maintenance burden (100+ orphaned scripts)
- They fragment the codebase and confuse future developers

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- \`scripts/archived-sd-scripts/\`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run \`node scripts/leo-create-sd.js\`
2. Follow interactive prompts
3. SD is properly validated and tracked in database`,
    order_index: 999,
    target_file: 'CLAUDE_LEAD.md'
  },
  {
    section_type: 'prd_creation_anti_pattern',
    title: 'PRD Creation Anti-Pattern (PROHIBITED)',
    content: `## PRD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off PRD creation scripts like:**
- \`create-prd-sd-*.js\`
- \`insert-prd-*.js\`
- \`enhance-prd-*.js\`

**ALWAYS use the standard CLI:**
\`\`\`bash
node scripts/add-prd-to-database.js
\`\`\`

### Why This Matters
- One-off scripts bypass PRD quality validation
- They create massive maintenance burden (100+ orphaned scripts)
- They fragment PRD creation patterns

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- \`scripts/archived-prd-scripts/\`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run \`node scripts/add-prd-to-database.js\`
2. Follow the modular PRD creation system in \`scripts/prd/\`
3. PRD is properly validated against quality rubrics`,
    order_index: 999,
    target_file: 'CLAUDE_PLAN.md'
  },
  {
    section_type: 'script_anti_patterns',
    title: 'Script Creation Anti-Patterns',
    content: `## Script Creation Anti-Patterns

### PROHIBITED Patterns

**One-Off Creation Scripts**
Never create single-use scripts for SD or PRD creation:
- ❌ \`create-prd-sd-*.js\` → Use \`node scripts/add-prd-to-database.js\`
- ❌ \`create-*-sd.js\` → Use \`node scripts/leo-create-sd.js\`
- ❌ \`insert-prd-*.js\` → Use the modular PRD system

**Why This is Critical**
1. **Maintenance Debt**: We archived 200+ one-off scripts in LEO 5.0 cleanup
2. **Validation Bypass**: One-off scripts skip quality gates
3. **Pattern Fragmentation**: Each script implements creation differently

### Archived Script Locations
- \`scripts/archived-prd-scripts/\` - Legacy PRD creation scripts
- \`scripts/archived-sd-scripts/\` - Legacy SD creation scripts

### Required CLI Tools
| Purpose | Command |
|---------|---------|
| Create SD | \`node scripts/leo-create-sd.js\` |
| Create PRD | \`node scripts/add-prd-to-database.js\` |
| PRD Validation | \`node scripts/validate-new-prd.js\` |`,
    order_index: 998,
    target_file: 'CLAUDE_CORE.md'
  }
];

async function main() {
  console.log('Adding anti-pattern documentation sections to database...\n');

  // Get active protocol
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('Failed to get active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`Active protocol: ${protocol.id} (${protocol.version})\n`);

  // Insert each section
  for (const section of sections) {
    const { target_file, ..._sectionData } = section;

    // Check if section already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('protocol_id', protocol.id)
      .eq('section_type', section.section_type)
      .single();

    if (existing) {
      console.log(`✓ Section '${section.section_type}' already exists, updating...`);

      const { error } = await supabase
        .from('leo_protocol_sections')
        .update({
          title: section.title,
          content: section.content,
          order_index: section.order_index
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`  Error updating: ${error.message}`);
      } else {
        console.log(`  Updated for ${target_file}`);
      }
    } else {
      console.log(`+ Adding section '${section.section_type}' for ${target_file}`);

      const { error } = await supabase
        .from('leo_protocol_sections')
        .insert({
          protocol_id: protocol.id,
          section_type: section.section_type,
          title: section.title,
          content: section.content,
          order_index: section.order_index
        });

      if (error) {
        console.error(`  Error inserting: ${error.message}`);
      } else {
        console.log('  Added successfully');
      }
    }
  }

  console.log('\n✓ Anti-pattern sections added to database');
  console.log('Run: node scripts/generate-claude-md-from-db.js to regenerate files');
}

main().catch(console.error);
