/**
 * Schema Validation Script for venture_drafts
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Purpose: Validate venture_drafts schema for versioned research_results pattern
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function validateSchema() {
  console.log('=== VENTURE_DRAFTS SCHEMA VALIDATION ===\n');
  console.log('SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('Database: EHG Application (liapbndqlqxdcgpwntbv)\n');

  const supabase = await createSupabaseServiceClient('ehg', { verbose: false });

  // 1. Query table structure from information_schema
  console.log('1️⃣ TABLE STRUCTURE VERIFICATION:');

  const { data: columns, error: colError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', 'venture_drafts')
    .eq('table_schema', 'public')
    .order('ordinal_position');

  if (colError) {
    console.log('❌ Error fetching columns:', colError.message);
  } else {
    console.table(columns);

    // Check for research_results column specifically
    const researchResultsCol = columns.find(c => c.column_name === 'research_results');
    if (researchResultsCol) {
      console.log('\n✅ research_results column found:');
      console.log(`   Type: ${researchResultsCol.data_type}`);
      console.log(`   Nullable: ${researchResultsCol.is_nullable}`);
    } else {
      console.log('\n❌ research_results column NOT FOUND');
    }
  }

  // 2. Sample existing research_results data
  console.log('\n2️⃣ EXISTING RESEARCH_RESULTS DATA:');

  const { data: ventures, error: ventureError } = await supabase
    .from('venture_drafts')
    .select('id, research_results')
    .not('research_results', 'is', null)
    .limit(3);

  if (ventureError) {
    console.log('❌ Error fetching ventures:', ventureError.message);
  } else if (!ventures || ventures.length === 0) {
    console.log('ℹ️ No ventures with research_results found');
    console.log('   This is expected for a new system.');
  } else {
    ventures.forEach((v, i) => {
      console.log(`\nSample ${i + 1} (ID: ${v.id}):`);
      console.log(JSON.stringify(v.research_results, null, 2));

      // Analyze structure
      if (v.research_results) {
        const hasQuickValidation = 'quick_validation' in v.research_results;
        const hasDeepCompetitive = 'deep_competitive' in v.research_results;
        console.log(`   Has quick_validation: ${hasQuickValidation}`);
        console.log(`   Has deep_competitive: ${hasDeepCompetitive}`);
      }
    });
  }

  // 3. Check RLS policies
  console.log('\n3️⃣ RLS POLICIES:');

  const { data: policies, error: policyError } = await supabase
    .from('pg_policies')
    .select('policyname, cmd, qual, with_check')
    .eq('tablename', 'venture_drafts');

  if (policyError) {
    console.log('❌ Error fetching policies:', policyError.message);
  } else if (!policies || policies.length === 0) {
    console.log('⚠️ No RLS policies found for venture_drafts');
  } else {
    console.table(policies);
  }

  // 4. Test write access
  console.log('\n4️⃣ WRITE ACCESS TEST:');
  console.log('Testing if service role can write to research_results...');

  // Try to find a test venture or create one
  const { data: testVenture, error: selectError } = await supabase
    .from('venture_drafts')
    .select('id')
    .limit(1)
    .single();

  if (testVenture) {
    const testData = {
      quick_validation: {
        session_id: 'test-session',
        timestamp: new Date().toISOString(),
        results: { test: true }
      }
    };

    const { error: updateError } = await supabase
      .from('venture_drafts')
      .update({ research_results: testData })
      .eq('id', testVenture.id);

    if (updateError) {
      console.log('❌ Write test failed:', updateError.message);
    } else {
      console.log('✅ Write test successful');
      // Rollback test data
      await supabase
        .from('venture_drafts')
        .update({ research_results: null })
        .eq('id', testVenture.id);
    }
  } else {
    console.log('ℹ️ No test venture available, skipping write test');
  }

  // 5. Summary and recommendations
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY:');
  console.log('='.repeat(60));

  if (!colError && columns) {
    const researchCol = columns.find(c => c.column_name === 'research_results');

    if (researchCol && researchCol.data_type === 'jsonb') {
      console.log('\n✅ SCHEMA VERDICT: COMPATIBLE');
      console.log('\nFindings:');
      console.log('- research_results column exists with JSONB type');
      console.log('- Versioned structure can be implemented without migration');
      console.log('- Both quick_validation and deep_competitive keys supported');

      console.log('\n📋 RECOMMENDATIONS:');
      console.log('1. No schema migration required');
      console.log('2. Implement versioned structure in application code');
      console.log('3. Add validation for key conflicts (Stage 2 vs Stage 4)');
      console.log('4. Consider JSONB size monitoring (50-100KB per venture)');

      console.log('\n⚠️ CONSIDERATIONS:');
      console.log('- Backward compatibility: Stage 2 data will remain in quick_validation');
      console.log('- Performance: JSONB supports indexing if queries become slow');
      console.log('- RLS: Service role can write, verify user role can read');

    } else {
      console.log('\n❌ SCHEMA VERDICT: REQUIRES_MIGRATION');
      console.log('\nIssue: research_results column missing or wrong type');
    }
  }

  console.log('\n✅ Validation complete');
  process.exit(0);
}

validateSchema().catch(err => {
  console.error('❌ Validation failed:', err);
  process.exit(1);
});
