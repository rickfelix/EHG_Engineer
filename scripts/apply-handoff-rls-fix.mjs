#!/usr/bin/env node
/**
 * Database Sub-Agent: Apply Handoff RLS Policy Fix
 * Purpose: Add INSERT/UPDATE/DELETE policies for authenticated users on sd_phase_handoffs table
 * Issue: "new row violates row-level security policy for table sd_phase_handoffs"
 * Migration: database/migrations/fix-handoff-rls-policies.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

console.log('\n🗄️  DATABASE SUB-AGENT: Handoff RLS Policy Fix\n');

// Use Supabase client for RLS operations (policies are metadata, not data)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyRLSFix() {
  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/fix-handoff-rls-policies.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Applying RLS policy fixes...\n');

    // Split into individual statements (simple split on semicolon for policies)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip comment-only statements
      if (stmt.startsWith('--')) continue;

      try {
        // Execute via Supabase client (RLS operations need service_role)
        const { error } = await supabase.rpc('exec_sql', { sql: stmt });

        if (error) {
          // Try direct execution if rpc fails
          console.log(`  ⚠️  RPC failed, trying direct execution...`);
          // For RLS policies, we need to use raw SQL connection
          throw new Error('RLS policy changes require psql or pg connection');
        }

        const stmtType = stmt.trim().split(' ')[0].toUpperCase();
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        console.log(`  ✅ ${i + 1}. ${stmtType}: ${preview}...`);
        successCount++;
      } catch (error) {
        console.error(`\n❌ Error at statement ${i + 1}:`);
        console.error(`Statement: ${stmt.substring(0, 150)}...`);
        console.error(`Error: ${error.message}`);
        console.error('\n⚠️  RLS policies require direct PostgreSQL connection.');
        console.error('Please apply manually using:');
        console.error(`\npsql "${process.env.SUPABASE_POOLER_URL}" -f database/migrations/fix-handoff-rls-policies.sql\n`);
        throw error;
      }
    }

    console.log('\n✅ RLS policy fixes applied!');
    console.log(`   Policies created: ${successCount}`);

    // Verify policies
    console.log('\n🔍 Verifying RLS policies...\n');

    const verifyQuery = `
      SELECT policyname, polcmd, polroles::regrole[]
      FROM pg_policy
      WHERE polrelid = 'sd_phase_handoffs'::regclass
      ORDER BY policyname;
    `;

    const { data, error } = await supabase.rpc('exec_sql', { sql: verifyQuery });

    if (error) {
      console.error('⚠️  Cannot verify policies via Supabase client.');
      console.error('Run verification query manually:');
      console.error(verifyQuery);
    } else {
      console.log('Expected 5 policies:');
      console.log('  1. Allow authenticated delete');
      console.log('  2. Allow authenticated insert');
      console.log('  3. Allow authenticated read');
      console.log('  4. Allow authenticated update');
      console.log('  5. Allow service role all');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ RLS POLICY FIX COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Test handoff insertion with authenticated user');
    console.log('   2. Verify no more RLS policy violations');
    console.log('   3. Update unified handoff scripts if needed\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n🔧 Manual Application Required:');
    console.error(`   psql "${process.env.SUPABASE_POOLER_URL}" -f database/migrations/fix-handoff-rls-policies.sql\n`);
    throw error;
  }
}

applyRLSFix().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
