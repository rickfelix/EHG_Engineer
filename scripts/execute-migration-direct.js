#!/usr/bin/env node

/**
 * Execute Vision V2 Migration - Direct Approach
 * Uses service role key to execute SQL via Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDQwNjU3NSwiZXhwIjoyMDQ1OTgyNTc1fQ.kxEeT15iVJaF_0Z_Gcr_FzBBn44UgQx0fXFrHDvr5cQ';

async function main() {
  console.log('========================================');
  console.log('VISION V2 RESET AND SEED MIGRATION');
  console.log('========================================\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20251213_vision_v2_reset_and_seed.sql');
  console.log(`Reading migration file: ${migrationPath}\n`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  console.log(`✅ Migration file loaded (${sqlContent.length} bytes)\n`);

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log('Executing migration...\n');

  try {
    // Execute the SQL via the REST API
    // Since the migration contains BEGIN/COMMIT, we execute it as a single transaction
    const { data, error } = await supabase.rpc('exec_raw_sql', { sql_query: sqlContent });

    if (error) {
      // If exec_raw_sql doesn't exist, try manual approach
      console.log('Note: exec_raw_sql RPC not available, using manual execution\n');

      // Execute via direct query - split into parts
      // Since this is a complex migration with transaction control, we need to use pg client
      const { Client } = await import('pg');

      // Decode password from environment or use hardcoded
      const password = 'Fl!M32DaM00n!1';
      const connectionString = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;

      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });

      await client.connect();
      console.log('✅ Connected to database\n');

      // Execute migration
      await client.query(sqlContent);

      console.log('\n✅ Migration executed successfully!\n');

      // Run verification queries
      console.log('Running verification queries...\n');

      const visionSDs = await client.query(`
        SELECT COUNT(*) as count
        FROM strategic_directives_v2
        WHERE id LIKE 'SD-VISION-V2-%'
      `);
      console.log(`Vision V2 SDs created: ${visionSDs.rows[0].count}`);

      const archivedSDs = await client.query(`
        SELECT COUNT(*) as count
        FROM governance_archive.strategic_directives
      `);
      console.log(`Archived SDs: ${archivedSDs.rows[0].count}`);

      const archivedPRDs = await client.query(`
        SELECT COUNT(*) as count
        FROM governance_archive.product_requirements
      `);
      console.log(`Archived PRDs: ${archivedPRDs.rows[0].count}`);

      // Display created SDs
      console.log('\n========================================');
      console.log('CREATED VISION V2 STRATEGIC DIRECTIVES');
      console.log('========================================\n');

      const createdSDs = await client.query(`
        SELECT id, title, relationship_type, priority, sequence_rank, status
        FROM strategic_directives_v2
        WHERE id LIKE 'SD-VISION-V2-%'
        ORDER BY sequence_rank
      `);

      createdSDs.rows.forEach(sd => {
        console.log(`${sd.id} (${sd.relationship_type})`);
        console.log(`  Title: ${sd.title}`);
        console.log(`  Priority: ${sd.priority} | Sequence: ${sd.sequence_rank} | Status: ${sd.status}\n`);
      });

      await client.end();

    } else {
      console.log('✅ Migration executed successfully!\n');
      console.log('Result:', JSON.stringify(data, null, 2));
    }

    console.log('\n========================================');
    console.log('ROLLBACK INSTRUCTIONS');
    console.log('========================================\n');
    console.log('To restore all archived data:');
    console.log('  SELECT * FROM governance_archive.restore_all_from_archive();\n');

    console.log('========================================');
    console.log('NEXT STEPS');
    console.log('========================================\n');
    console.log('1. Regenerate CLAUDE files:');
    console.log('   node scripts/generate-claude-md-from-db.js\n');
    console.log('2. Check SD queue:');
    console.log('   npm run sd:next\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
