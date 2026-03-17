#!/usr/bin/env node
/**
 * Add Migration Script Pattern section to CLAUDE_EXEC.md
 * Prevention for PAT-DB-MIGRATION-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addSection() {
  // Get active protocol ID
  const { data: protocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (!protocol) {
    console.log('No active protocol found');
    return;
  }

  console.log('Active protocol ID:', protocol.id);

  const content = `## Migration Script Pattern (MANDATORY)

**Issue Pattern**: PAT-DB-MIGRATION-001

When writing migration scripts, you MUST use the established pattern:

### Correct Pattern
\`\`\`javascript
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';

const migrationSQL = readFileSync('path/to/migration.sql', 'utf-8');
const client = await createDatabaseClient('engineer', { verify: true });
const statements = splitPostgreSQLStatements(migrationSQL);

for (const statement of statements) {
  await client.query(statement);
}

await client.end();
\`\`\`

### NEVER Use This Pattern
\`\`\`javascript
// WRONG - exec_sql RPC does not exist
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);
await supabase.rpc('exec_sql', { sql_query: sql }); // FAILS
\`\`\`

### Before Writing Migration Scripts
1. Search for existing patterns: \`Glob *migration*.js\`
2. Read \`scripts/run-sql-migration.js\` as canonical template
3. Use \`lib/supabase-connection.js\` utilities`;

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: protocol.id,
      section_type: 'guidance',
      title: 'Migration Script Pattern (MANDATORY)',
      content: content,
      order_index: 50,
      target_file: 'CLAUDE_EXEC.md',
      priority: 'STANDARD',
      context_tier: 'REFERENCE',
      metadata: { source: 'PAT-DB-MIGRATION-001', added: '2026-01-31' }
    })
    .select();

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Section added:', data?.[0]?.id);
  }
}

addSection().catch(console.error);
