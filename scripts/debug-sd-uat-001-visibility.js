import { createSupabaseClient, fetchSD } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

async function debugSDVisibility() {
  console.log('🔍 Debugging SD-UAT-001 Visibility\n');
  console.log('='.repeat(60));

  // Get SD-UAT-001
  const { data: sd, error } = await fetchSD('SD-UAT-001');

  if (error) {
    console.error('❌ Error fetching SD:', error);
    return;
  }

  console.log('\n📋 SD-UAT-001 Full Record:');
  console.log('  SD Key:', sd.sd_key);
  console.log('  Title:', sd.title);
  console.log('  Status:', sd.status, '(type:', typeof sd.status + ')');
  console.log('  Priority:', sd.priority, '(type:', typeof sd.priority + ')');
  console.log('  Category:', sd.category);
  console.log('  Target Application:', sd.target_application);
  console.log('  Sequence Rank:', sd.sequence_rank);
  console.log('  Is Active:', sd.is_active);
  console.log('  Is Working On:', sd.is_working_on);

  console.log('\n🎯 Filter Matching Analysis:');
  console.log('='.repeat(60));

  // Default filters from SDManager.jsx lines 52-82
  const statusFilter = 'active,draft';
  const priorityFilter = 'critical,high';
  const applicationFilter = 'EHG';

  // Status filter check
  const sdStatus = sd.status?.toLowerCase();
  const statusValues = statusFilter.split(',');
  const statusMatch = statusValues.some(status => {
    const match = status === sdStatus;
    console.log(`  Status '${status}' === '${sdStatus}': ${match}`);
    return match;
  });
  console.log(`✅ Status Filter Result: ${statusMatch ? 'PASS' : 'FAIL'}`);

  // Priority filter check
  const priorityValues = priorityFilter.split(',');
  const priorityMatch = priorityValues.some(priority =>
    sd.priority?.toLowerCase() === priority.toLowerCase()
  );
  console.log(`\n  Priority filter: ${priorityFilter}`);
  console.log(`  SD priority (lowercase): ${sd.priority?.toLowerCase()}`);
  console.log(`✅ Priority Filter Result: ${priorityMatch ? 'PASS' : 'FAIL'}`);

  // Application filter check
  const applicationMatch = sd.target_application === applicationFilter;
  console.log(`\n  Application filter: ${applicationFilter}`);
  console.log(`  SD target_application: ${sd.target_application}`);
  console.log(`✅ Application Filter Result: ${applicationMatch ? 'PASS' : 'FAIL'}`);

  // Overall result
  console.log('\n' + '='.repeat(60));
  const allPass = statusMatch && priorityMatch && applicationMatch;
  console.log(`\n🎯 Overall Filter Result: ${allPass ? '✅ SHOULD BE VISIBLE' : '❌ WILL BE FILTERED OUT'}`);

  if (!allPass) {
    console.log('\n⚠️  ISSUES FOUND:');
    if (!statusMatch) console.log('  - Status does not match filter');
    if (!priorityMatch) console.log('  - Priority does not match filter');
    if (!applicationMatch) console.log('  - Application does not match filter');
  }

  // Check other active/draft SDs for comparison
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Other Active/Draft SDs with EHG application:');
  const { data: otherSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, priority, target_application, sequence_rank')
    .in('status', ['active', 'draft'])
    .eq('target_application', 'EHG')
    .in('priority', ['critical', 'high'])
    .order('sequence_rank', { ascending: true, nullsLast: true })
    .limit(5);

  otherSDs?.forEach(other => {
    console.log(`  ${other.sd_key}: status=${other.status}, priority=${other.priority}, seq=${other.sequence_rank}`);
  });
}

debugSDVisibility();