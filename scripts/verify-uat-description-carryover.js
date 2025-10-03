import { createSupabaseClient, fetchSD } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

async function verifyDescriptionCarryover() {
  console.log('🔍 Verifying UAT test description carryover to Strategic Directive\n');
  console.log('='.repeat(80));

  // Get SD-UAT-001
  const { data: sd, error: sdError } = await fetchSD('SD-UAT-001');

  if (sdError) {
    console.error('❌ Error fetching SD:', sdError);
    return;
  }

  console.log('\n📋 Strategic Directive (SD-UAT-001):');
  console.log('  Title:', sd.title);
  console.log('  Description:', sd.description);
  console.log('  Metadata:', JSON.stringify(sd.metadata, null, 2));

  // Get the UAT test case ID from metadata
  const uatTestId = sd.metadata?.uat_test_id;

  if (!uatTestId) {
    console.log('\n⚠️  No UAT test ID found in SD metadata');
    return;
  }

  console.log('\n🧪 UAT Test Case ID:', uatTestId);

  // Get the UAT test case
  const { data: uatTest, error: uatError } = await supabase
    .from('uat_cases')
    .select('*')
    .eq('id', uatTestId)
    .single();

  if (uatError) {
    console.error('❌ Error fetching UAT test:', uatError);
    return;
  }

  console.log('\n📋 UAT Test Case:');
  console.log('  ID:', uatTest.id);
  console.log('  Title:', uatTest.title);
  console.log('  Description:', uatTest.description);
  console.log('  Section:', uatTest.section);
  console.log('  Priority:', uatTest.priority);

  // Compare descriptions
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Description Carryover Analysis:');
  console.log('');
  console.log('UAT Test Description (original):');
  console.log('-'.repeat(80));
  console.log(uatTest.description);
  console.log('-'.repeat(80));
  console.log('');
  console.log('SD Description (AI-generated from UAT):');
  console.log('-'.repeat(80));
  console.log(sd.description);
  console.log('-'.repeat(80));
  console.log('');

  // Check if UAT description is referenced in SD
  const uatDescInSD = sd.description?.toLowerCase().includes(uatTest.description?.toLowerCase().substring(0, 50));
  const uatTitleInSD = sd.title?.toLowerCase().includes(uatTest.title?.toLowerCase()) ||
                       sd.description?.toLowerCase().includes(uatTest.title?.toLowerCase());

  console.log('✓ Verification:');
  console.log(`  UAT title referenced in SD: ${uatTitleInSD ? '✅ YES' : '⚠️  NO'}`);
  console.log(`  UAT description text in SD: ${uatDescInSD ? '✅ YES' : '⚠️  NO (AI rewrote it)'}`);
  console.log(`  UAT test ID preserved: ${uatTestId ? '✅ YES' : '❌ NO'}`);
  console.log(`  UAT section preserved: ${sd.category === uatTest.section ? '✅ YES' : '❌ NO'}`);
  console.log(`  UAT priority preserved: ${sd.metadata?.uat_priority === uatTest.priority ? '✅ YES' : '❌ NO'}`);

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Note: The AI transforms UAT descriptions into formal Strategic Directive format.');
  console.log('   Original UAT context is preserved in metadata for traceability.');
}

verifyDescriptionCarryover();