import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Mapping of test IDs to their most appropriate sections based on titles
const sectionMappings = {
  'MANUAL-DASHBOARD-MG5GGDV0': 'Dashboard',  // "I'm on the chairman console"
  'TEST-NAV-001': 'Dashboard',               // "Chairman Console"
  'TEST-NAV-002': 'EVA Assistant',           // "EVA Assistant"
  'TEST-NAV-003': 'Ventures',                // "Ventures"
  'TEST-NAV-004': 'Portfolios',              // "Portfolios"
  'TEST-NAV-005': 'Dashboard',               // "EVA Dashboard"
  'TEST-NAV-006': 'Workflows',               // "Workflows"
  'TEST-NAV-007': 'AI Agents',               // "AI Agents"
  'TEST-NAV-008': 'EVA Knowledge Base',      // "EVA Knowledge Base"
  'TEST-NAV-009': 'Analytics',               // "Analytics"
  'TEST-NAV-010': 'Reports',                 // "Reports"
  'TEST-NAV-011': 'Analytics',               // "Insights"
  'TEST-NAV-012': 'Analytics',               // "Risk Forecasting"
  'TEST-NAV-013': 'Analytics',               // "Advanced Analytics"
  'TEST-NAV-014': 'Mobile',                  // "Mobile Companion"
  'TEST-NAV-015': 'Governance',              // "Governance"
  'TEST-NAV-016': 'Integration',             // "Integration Hub"
  'TEST-NAV-017': 'Security',                // "Enhanced Security"
  'TEST-NAV-018': 'Settings',                // "Settings"
  'TEST-NAV-019': 'Navigation'               // "General Navigation & UX"
};

async function updateSections() {
  console.log('Updating Section fields for manual UAT test cases...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [testId, section] of Object.entries(sectionMappings)) {
    const { data, error } = await supabase
      .from('uat_cases')
      .update({ section })
      .eq('id', testId)
      .select();

    if (error) {
      console.error(`❌ Error updating ${testId}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Updated ${testId} → Section: "${section}"`);
      successCount++;
    }
  }

  console.log('\n======================');
  console.log('Summary:');
  console.log(`✅ Successfully updated: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('======================');

  // Show updated records
  console.log('\nVerifying updates...\n');
  const { data: updatedData, error: fetchError } = await supabase
    .from('uat_cases')
    .select('id, title, section')
    .eq('test_type', 'manual')
    .order('id');

  if (fetchError) {
    console.error('Error fetching updated records:', fetchError);
    return;
  }

  console.log('Updated Manual Test Cases:');
  console.log('==========================\n');
  updatedData.forEach(test => {
    console.log(`${test.id}`);
    console.log(`  Title: ${test.title}`);
    console.log(`  Section: ${test.section}`);
    console.log('');
  });
}

updateSections().catch(console.error);
