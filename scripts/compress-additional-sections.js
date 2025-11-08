#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const additionalCompression = [
  {
    id: 31, // Database Migration Validation (4790 chars)
    content: `**Database Migration Validation - Two-Phase Approach (MANDATORY)**:

**Phase 1: Static File Validation** (always runs):
- Migration files exist for SD-ID
- SQL syntax is valid
- Required patterns present (CREATE TABLE, ALTER TABLE)
- Cross-schema foreign keys detected

**Phase 2: Database Verification** (optional, via \`--verify-db\`):
- Tables mentioned in migration actually exist
- Tables are accessible (RLS policies)
- Seed data was inserted (with \`--check-seed-data\`)

**Commands**:
\`\`\`bash
# Basic validation (file-only)
node scripts/validate-migration-files.js <SD-ID>

# Full validation (file + database + seed data)
node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data
\`\`\`

**Complete Guide**: See \`docs/database-migration-validation-guide.md\``
  },
  {
    id: 47, // Retrospective Table Schema Reference (4139 chars)
    content: `**Retrospective Schema**: Critical field mappings to prevent constraint errors.

**Quick Reference:**
- \`generated_by\`: Must be 'MANUAL'
- \`status\`: Must be 'PUBLISHED'
- \`team_satisfaction\`: 1-10 scale (NOT 0-100)
- Array fields: Use arrays, NOT JSON.stringify()
- Boolean fields: true/false, NOT integers

**Common Errors**:
- Column "key_learnings" not found → Use \`key_learnings\`
- Malformed array literal → Remove JSON.stringify()
- team_satisfaction_check violation → Use 1-10 scale

**Complete Schema**: See \`docs/reference/retrospective-schema.md\``
  },
  {
    id: 40, // Database Migration Pre-Flight Checklist (3506 chars)
    content: `**Database Migration Pre-Flight Checklist (MANDATORY)**:

**Before attempting ANY migration**:
1. Read established pattern: \`scripts/lib/supabase-connection.js\`
2. Verify connection: Region aws-1, Port 5432, SSL config
3. Use helper functions: \`createDatabaseClient\`, \`splitPostgreSQLStatements\`
4. Validate migration file: No cross-schema FKs, correct RLS syntax
5. Handle conflicts: Check existing tables, use CASCADE carefully

**Anti-Patterns to AVOID**:
- Using psql without understanding connection format
- Trial-and-error with regions/ports/SSL
- Not handling "already exists" errors

**Complete Guide**: See \`docs/reference/migration-preflight.md\``
  }
];

async function compressAdditional() {
  console.log('Compressing additional sections...\n');
  
  let totalSaved = 0;
  
  for (const section of additionalCompression) {
    // Get current content first
    const { data: current } = await supabase
      .from('leo_protocol_sections')
      .select('content')
      .eq('id', section.id)
      .single();
    
    const oldChars = current.content ? current.content.length : 0;
    
    // Update with compressed version
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: section.content })
      .eq('id', section.id);

    if (error) {
      console.error('Error updating section ' + section.id + ':', error);
      continue;
    }

    const newChars = section.content.length;
    const saved = oldChars - newChars;
    const percent = Math.round((saved / oldChars) * 100);
    totalSaved += saved;
    
    console.log('Section ' + section.id + ': ' + oldChars + ' → ' + newChars + ' chars (saved ' + saved + ', ' + percent + '%)');
  }
  
  console.log('\nTotal saved: ' + totalSaved + ' chars');
}

compressAdditional().catch(console.error);
