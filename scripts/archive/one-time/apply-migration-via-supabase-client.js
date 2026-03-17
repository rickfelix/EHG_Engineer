/**
 * Apply Migration via Supabase Client (Alternative Approach)
 * SD-EVA-CONTENT-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('🗄️ DATABASE ARCHITECT: Applying Migration via Supabase Client\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20251011_eva_content_catalogue_mvp.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log(`📄 Migration file loaded (${(migrationSQL.length / 1024).toFixed(1)} KB)\n`);

  // Create Supabase client for EHG database
  const supabase = createClient(
    process.env.EHG_SUPABASE_URL,
    process.env.EHG_SUPABASE_ANON_KEY
  );

  console.log(`📡 Target: ${process.env.EHG_SUPABASE_URL}\n`);

  try {
    // Note: Supabase client doesn't support raw SQL execution via API
    // This requires database admin access or SQL editor in Supabase dashboard

    console.log('⚠️ LIMITATION: Supabase client cannot execute raw DDL SQL\n');
    console.log('Options:');
    console.log('1. Apply migration manually via Supabase Dashboard SQL Editor');
    console.log('2. Use service role key (if available)');
    console.log('3. Check if tables already exist in EHG app\n');

    // Let's check if we can access the database at all
    console.log('🔍 Testing database connection...\n');

    const { data, error } = await supabase
      .from('content_types')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Table "content_types" does not exist - migration NOT applied\n');
        console.log('✅ Recommendation: Apply migration via Supabase Dashboard\n');
        console.log('Migration file location:');
        console.log(`   ${migrationPath}\n`);
      } else {
        console.log(`Error: ${error.message}\n`);
      }
    } else {
      console.log('✅ Table "content_types" exists - migration already applied!\n');
      console.log(`Found ${data?.length || 0} content types\n`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

applyMigration();
