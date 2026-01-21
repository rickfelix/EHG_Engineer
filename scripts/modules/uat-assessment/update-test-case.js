/**
 * Update UAT Test Case
 * Updates the TEST-NAV-001 Chairman Console UAT Assessment
 *
 * @module update-test-case
 */

import { createClient } from '@supabase/supabase-js';
import { comprehensiveAssessment } from './assessment-template.js';

/**
 * Create Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client
 */
function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Update the TEST-NAV-001 test case with comprehensive assessment
 * @returns {Promise<void>}
 */
export async function updateTestCase() {
  const supabase = createSupabaseClient();

  console.log('Updating TEST-NAV-001 Chairman Console UAT Assessment...\n');

  const { data, error } = await supabase
    .from('uat_cases')
    .update({
      description: comprehensiveAssessment
    })
    .eq('id', 'TEST-NAV-001')
    .select();

  if (error) {
    console.error('Error updating test case:', error);
    process.exit(1);
  }

  console.log('Successfully updated UAT test case TEST-NAV-001');
  console.log('\nUpdated Record:');
  console.log('  ID:', data[0].id);
  console.log('  Title:', data[0].title);
  console.log('  Priority:', data[0].priority);
  console.log('  Section:', data[0].section);
  console.log('  Description Length:', data[0].description.length, 'characters');
  console.log('\nComprehensive systematic UAT assessment has been added.');
  console.log('View in dashboard at: http://localhost:3000/uat');
  console.log('\nThis assessment provides:');
  console.log('   - Complete page intent & context analysis');
  console.log('   - Backend integration status for all components');
  console.log('   - UI/UX evaluation with accessibility focus');
  console.log('   - Integration check with mapping table');
  console.log('   - Sub-agent responsibilities (Design, Database, Security)');
  console.log('   - 20 detailed testing sections with step-by-step checklists');
  console.log('   - Priority action items (Critical, High, Medium, Low)');
  console.log('');
  console.log('Ready for systematic UAT execution by QA team');
}
