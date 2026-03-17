/**
 * Apply Database Migration: 20251011_eva_content_catalogue_mvp.sql
 * Target: EHG database (liapbndqlqxdcgpwntbv)
 * SD-EVA-CONTENT-001
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('🗄️ DATABASE ARCHITECT: Applying EVA Content Catalogue Migration\n');
  console.log('Target: EHG Database (liapbndqlqxdcgpwntbv)\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20251011_eva_content_catalogue_mvp.sql');
  console.log(`📄 Reading migration file: ${migrationPath}`);

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log(`✅ Migration file loaded (${(migrationSQL.length / 1024).toFixed(1)} KB)\n`);

  // Connect to EHG database
  const client = new Client({
    connectionString: process.env.EHG_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to EHG database\n');

    console.log('⚙️ Executing migration...\n');

    // Execute the migration SQL
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...\n');

    const tables = [
      'content_types',
      'screen_layouts',
      'content_catalogue',
      'content_versions',
      'content_layout_assignments',
      'eva_conversations',
      'conversation_content_links',
      'eva_user_settings',
      'content_item_metadata'
    ];

    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }

    console.log('\n✅ DATABASE ARCHITECT: Migration Complete!');
    console.log('➡️  Next: Install dependencies and implement components\n');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('Details:', err.detail || err.hint || 'No additional details');
    throw err;
  } finally {
    await client.end();
  }
}

applyMigration();
