#!/usr/bin/env node

/**
 * Direct RLS Policy Application
 * Uses Supabase PostgREST to execute SQL directly
 */

import dotenv from 'dotenv';

dotenv.config();

async function applyPolicy() {
  console.log('🔧 Applying RLS Policy for anon role on strategic_directives_v2...\n');

  const sql = `
CREATE POLICY IF NOT EXISTS anon_read_strategic_directives_v2
  ON public.strategic_directives_v2
  FOR SELECT
  TO anon
  USING (true);
  `.trim();

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });

    const result = await response.text();

    if (!response.ok) {
      console.log('❌ API method failed:', response.status, result);
      console.log('\n📋 MANUAL APPLICATION REQUIRED:\n');
      console.log('Please apply this SQL manually via Supabase Dashboard:\n');
      console.log('URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new\n');
      console.log('--- SQL TO EXECUTE ---');
      console.log(sql);
      console.log('\nCOMMENT ON POLICY anon_read_strategic_directives_v2');
      console.log("  ON public.strategic_directives_v2");
      console.log("  IS 'LEO Protocol automation scripts require read access to SDs.';");
      console.log('--- END SQL ---\n');
      console.log('After applying, run: node scripts/verify-anon-access-strategic-directives.mjs');
      process.exit(1);
    }

    console.log('✅ Policy creation attempted');
    console.log('Response:', result || '(no response body)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 MANUAL APPLICATION REQUIRED:\n');
    console.log('Please execute this SQL via Supabase Dashboard SQL Editor:\n');
    console.log(sql);
    process.exit(1);
  }

  // Test with ANON key
  console.log('\nTesting ANON access...');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .single();

  if (error) {
    console.log('❌ ANON access still blocked:', error.message);
    console.log('\n⚠️  Please apply the SQL manually (see above)');
    process.exit(1);
  }

  console.log('✅ ANON access verified!');
  console.log('   Found:', data.id);
  console.log('\n🎉 Migration successful!');
}

applyPolicy();
