#!/usr/bin/env node

/**
 * Apply RLS Policy Migration: anon_read_strategic_directives_v2
 * Purpose: Execute SQL migration to grant anon role SELECT access
 * Context: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 PLAN phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Need elevated privileges for policy creation
);

async function applyMigration() {
  console.log('🔧 Applying RLS Policy Migration...\n');
  console.log('Migration: anon_read_strategic_directives_v2');
  console.log('Context: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001\n');

  // SQL to create policy
  const createPolicySQL = `
    CREATE POLICY IF NOT EXISTS anon_read_strategic_directives_v2
      ON public.strategic_directives_v2
      FOR SELECT
      TO anon
      USING (true);
  `;

  const commentSQL = `
    COMMENT ON POLICY anon_read_strategic_directives_v2
      ON public.strategic_directives_v2
      IS 'LEO Protocol automation scripts require read access to SDs for PRD creation and handoff management. Strategic Directives are organizational work items (not user PII), so system-wide SELECT is safe. Write operations remain protected by authenticated/service_role policies.';
  `;

  console.log('Step 1: Creating RLS policy...');
  const { data: policyData, error: policyError } = await supabase.rpc('exec_sql', {
    sql: createPolicySQL
  });

  if (policyError) {
    // Try direct query method
    console.log('   Trying alternative method...');

    try {
      // Use raw SQL execution
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: createPolicySQL })
      });

      if (!response.ok) {
        console.error('❌ Failed to create policy via API');
        console.error('   Error:', await response.text());
        console.log('\n📋 Manual application required:');
        console.log('\nOption 1: Supabase Dashboard SQL Editor');
        console.log('   1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
        console.log('   2. Copy and run the following SQL:\n');
        console.log(createPolicySQL);
        console.log(commentSQL);
        console.log('\nOption 2: Supabase CLI');
        console.log('   npx supabase db push\n');
        process.exit(1);
      }

      console.log('✅ Policy created successfully (via API)');
    } catch (apiError) {
      console.error('❌ API call failed:', apiError.message);
      console.log('\n📋 MANUAL APPLICATION REQUIRED:\n');
      console.log('Go to Supabase Dashboard SQL Editor:');
      console.log('https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new\n');
      console.log('Copy and execute this SQL:\n');
      console.log('--- BEGIN SQL ---');
      console.log(createPolicySQL);
      console.log(commentSQL);
      console.log('--- END SQL ---\n');
      process.exit(1);
    }
  } else {
    console.log('✅ Policy created successfully');
  }

  console.log('\nStep 2: Verifying policy exists...');

  // Verify using anon key query
  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: testData, error: testError } = await anonClient
    .from('strategic_directives_v2')
    .select('id, title')
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .single();

  if (testError) {
    console.error('❌ Verification failed - anon role still cannot SELECT');
    console.error('   Error:', testError.message);
    console.log('\n⚠️  Policy may not have been applied. Please apply manually.');
    process.exit(1);
  }

  console.log('✅ Verification passed - anon role can now SELECT');
  console.log('   Found SD:', testData.id);

  console.log('\n🎉 Migration applied successfully!');
  console.log('\nNext steps:');
  console.log('1. Run verification script: node scripts/verify-anon-access-strategic-directives.mjs');
  console.log('2. Retry PRD creation: node scripts/add-prd-to-database.js SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
}

applyMigration();
