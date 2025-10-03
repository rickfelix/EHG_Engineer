import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Logical order based on user journey through the application
const testSortOrder = {
  // Entry point - Dashboard
  'MANUAL-DASHBOARD-MG5GGDV0': 1,
  'TEST-NAV-001': 2,  // Chairman Console

  // AI Features (most important core features)
  'TEST-NAV-002': 3,  // EVA Assistant
  'TEST-NAV-005': 4,  // EVA Dashboard
  'TEST-NAV-006': 5,  // Workflows
  'TEST-NAV-007': 6,  // AI Agents
  'TEST-NAV-008': 7,  // EVA Knowledge Base

  // Core Business Features
  'TEST-NAV-003': 8,  // Ventures
  'TEST-NAV-004': 9,  // Portfolios

  // Analytics & Reports (data analysis features)
  'TEST-NAV-009': 10, // Analytics
  'TEST-NAV-010': 11, // Reports
  'TEST-NAV-011': 12, // Insights
  'TEST-NAV-012': 13, // Risk Forecasting
  'TEST-NAV-013': 14, // Advanced Analytics
  'TEST-NAV-014': 15, // Mobile Companion

  // Administration (admin/config features)
  'TEST-NAV-015': 16, // Governance
  'TEST-NAV-016': 17, // Integration Hub
  'TEST-NAV-017': 18, // Enhanced Security
  'TEST-NAV-018': 19, // Settings

  // Cross-cutting concerns (last)
  'TEST-NAV-019': 20  // General Navigation & UX
};

async function applySortOrder() {
  console.log('🔧 Step 1: Adding sort_order column to uat_cases table...\n');

  // Read and execute migration SQL
  const sql = fs.readFileSync('./database/migrations/add-uat-sort-order.sql', 'utf8');

  // Try to execute via RPC if available, otherwise just update the records
  try {
    const { error } = await supabase.rpc('execute_sql', { sql });
    if (error) {
      console.log('⚠️  Could not execute migration via RPC. Column may already exist or needs manual creation.');
      console.log('   Please run the SQL manually in Supabase Dashboard if needed.');
    } else {
      console.log('✅ Migration executed successfully');
    }
  } catch (err) {
    console.log('⚠️  RPC not available. Will proceed to update sort_order values.');
  }

  console.log('\n📊 Step 2: Applying logical sort order to manual UAT tests...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [testId, sortOrder] of Object.entries(testSortOrder)) {
    const { data, error } = await supabase
      .from('uat_cases')
      .update({ sort_order: sortOrder })
      .eq('id', testId)
      .select();

    if (error) {
      console.error(`❌ Error updating ${testId}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${sortOrder.toString().padStart(2, ' ')}. ${testId}`);
      successCount++;
    }
  }

  console.log(`\n======================`);
  console.log(`Summary:`);
  console.log(`✅ Successfully updated: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`======================`);

  // Verify the order
  console.log('\n📋 Verifying logical order...\n');
  const { data: sortedTests, error: fetchError } = await supabase
    .from('uat_cases')
    .select('id, title, section, sort_order')
    .eq('test_type', 'manual')
    .order('sort_order', { ascending: true });

  if (fetchError) {
    console.error('Error fetching sorted tests:', fetchError);
    return;
  }

  console.log('Manual UAT Tests in Logical Order:');
  console.log('===================================\n');

  let currentGroup = '';
  sortedTests.forEach(test => {
    // Group by section category
    let group = '';
    if (test.sort_order <= 2) group = '🏠 ENTRY POINT';
    else if (test.sort_order <= 7) group = '🤖 AI FEATURES';
    else if (test.sort_order <= 9) group = '💼 CORE BUSINESS';
    else if (test.sort_order <= 15) group = '📊 ANALYTICS & REPORTS';
    else if (test.sort_order <= 19) group = '⚙️  ADMINISTRATION';
    else group = '🔀 CROSS-CUTTING';

    if (group !== currentGroup) {
      console.log(`\n${group}`);
      console.log('─'.repeat(50));
      currentGroup = group;
    }

    console.log(`${test.sort_order.toString().padStart(2, ' ')}. [${test.section}]`);
    console.log(`    ${test.title}`);
  });

  console.log('\n\n✅ Sort order applied! UI will now display tests in logical sequence.');
  console.log('💡 Update your UI query to: .order(\'sort_order\', { ascending: true })');
}

applySortOrder().catch(console.error);
