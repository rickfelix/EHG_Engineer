import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Mapping of test IDs to correct section VALUES (matching UAT_SECTIONS config)
const sectionMappings = {
  'MANUAL-DASHBOARD-MG5GGDV0': 'chairman-console',  // "I'm on the chairman console"
  'TEST-NAV-001': 'chairman-console',               // "Chairman Console"
  'TEST-NAV-002': 'eva-assistant',                  // "EVA Assistant"
  'TEST-NAV-003': 'ventures',                       // "Ventures"
  'TEST-NAV-004': 'portfolios',                     // "Portfolios"
  'TEST-NAV-005': 'eva-dashboard',                  // "EVA Dashboard"
  'TEST-NAV-006': 'workflows',                      // "Workflows"
  'TEST-NAV-007': 'ai-agents',                      // "AI Agents"
  'TEST-NAV-008': 'eva-knowledge-base',             // "EVA Knowledge Base"
  'TEST-NAV-009': 'analytics',                      // "Analytics"
  'TEST-NAV-010': 'reports',                        // "Reports"
  'TEST-NAV-011': 'insights',                       // "Insights"
  'TEST-NAV-012': 'risk-forecasting',               // "Risk Forecasting"
  'TEST-NAV-013': 'advanced-analytics',             // "Advanced Analytics"
  'TEST-NAV-014': 'mobile-companion',               // "Mobile Companion"
  'TEST-NAV-015': 'governance',                     // "Governance"
  'TEST-NAV-016': 'integration-hub',                // "Integration Hub"
  'TEST-NAV-017': 'enhanced-security',              // "Enhanced Security"
  'TEST-NAV-018': 'settings',                       // "Settings"
  'TEST-NAV-019': 'navigation'                      // "General Navigation & UX"
};

async function fixSections() {
  console.log('Fixing Section fields to match UAT_SECTIONS config values...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [testId, section] of Object.entries(sectionMappings)) {
    const { data: _data, error } = await supabase
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

  console.log('Updated Manual Test Cases with Correct Section Values:');
  console.log('======================================================\n');
  updatedData.forEach(test => {
    console.log(`${test.id}`);
    console.log(`  Title: ${test.title}`);
    console.log(`  Section: ${test.section}`);
    console.log('');
  });
}

fixSections().catch(console.error);
