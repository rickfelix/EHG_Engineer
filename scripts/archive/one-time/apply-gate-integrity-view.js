#!/usr/bin/env node

/**
 * Apply Gate Integrity View Migration
 *
 * Creates the v_gate_rule_integrity view and check_gate_weights() function
 * needed by the LEO Protocol Drift Check CI workflow.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load environment variables
dotenv.config({ path: join(rootDir, '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🔧 Applying Gate Integrity View Migration');
  console.log('═'.repeat(60));

  try {
    // Read migration file
    const migrationPath = join(rootDir, 'database', 'migrations', 'create-gate-integrity-view.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file:', migrationPath);

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (!statement || statement.startsWith('--')) continue;

      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);

      try {
        const { error } = await supabase.rpc('execute_sql', { sql: statement + ';' });

        if (error) {
          // If execute_sql RPC doesn't exist, we can't apply via this method
          if (error.message.includes('function') && error.message.includes('does not exist')) {
            console.log('\n⚠️  RPC function execute_sql not available');
            console.log('📋 Manual Steps Required:');
            console.log('   1. Go to Supabase Dashboard SQL Editor');
            console.log(`   2. Execute: ${migrationPath}`);
            console.log('   3. Or use psql:');
            console.log(`      psql $DATABASE_URL -f ${migrationPath}`);
            process.exit(2);
          }
          throw error;
        }

        console.log('   ✅ Success');
      } catch (err) {
        console.error(`   ❌ Failed: ${err.message}`);
        throw err;
      }
    }

    console.log('\n═'.repeat(60));
    console.log('✅ Migration applied successfully!');
    console.log('\n🔍 Verifying view creation...');

    // Verify the view was created
    const { data, error } = await supabase
      .from('v_gate_rule_integrity')
      .select('*')
      .limit(5);

    if (error) {
      console.error('⚠️  View verification failed:', error.message);
      console.log('View may not be accessible via Supabase client API.');
      console.log('Try querying directly with psql or Supabase Dashboard.');
    } else {
      console.log(`✅ View accessible - found ${data?.length || 0} gates`);
      if (data && data.length > 0) {
        console.log('\n📊 Gate Status:');
        data.forEach(gate => {
          console.log(`   ${gate.icon} Gate ${gate.gate}: ${gate.status} (${gate.total_weight})`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nTo apply manually:');
    console.error('1. psql $DATABASE_URL -f database/migrations/create-gate-integrity-view.sql');
    console.error('2. Or use Supabase Dashboard SQL Editor');
    process.exit(1);
  }
}

applyMigration();
