const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryPRDAndBacklog() {
  const sdId = 'SD-VIDEO-VARIANT-001';

  console.log('=== STEP 2: Checking for Existing PRD ===\n');

  // Query PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sdId)
    .maybeSingle();

  if (prdError) {
    console.error('❌ PRD query error:', prdError.message);
  } else if (prd) {
    console.log('✅ PRD EXISTS:');
    console.log(`   ID: ${prd.id}`);
    console.log(`   Status: ${prd.status}`);
    console.log(`   Title: ${prd.title || 'N/A'}`);
    console.log(`   Objectives length: ${prd.objectives?.length || 0} chars`);
    console.log(`   Acceptance Criteria: ${prd.acceptance_criteria || 'N/A'}`);
  } else {
    console.log('❌ NO PRD exists - PRD creation required (PLAN responsibility)');
  }

  console.log('\n=== STEP 3: Querying Backlog Items (CRITICAL) ===\n');

  // Query backlog items
  const { data: backlogItems, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', sdId)
    .order('priority', { ascending: false })
    .order('sequence_no', { ascending: true });

  if (backlogError) {
    console.error('❌ Backlog query error:', backlogError.message);
    return;
  }

  if (!backlogItems || backlogItems.length === 0) {
    console.log('⚠️ NO backlog items found for this SD');
    console.log('   This may indicate scope definition is incomplete');
    return;
  }

  console.log(`✅ Found ${backlogItems.length} backlog items:\n`);

  backlogItems.forEach((item, index) => {
    console.log(`--- Backlog Item #${index + 1} ---`);
    console.log(`Title: ${item.backlog_title || 'N/A'}`);
    console.log(`Description: ${item.item_description || 'N/A'}`);
    console.log(`Priority: ${item.priority || 'N/A'}`);
    console.log(`Description Raw: ${item.description_raw || 'N/A'}`);
    console.log(`Completion Status: ${item.completion_status || 'NOT_STARTED'}`);
    console.log(`Phase: ${item.phase || 'N/A'}`);
    console.log(`Stage Number: ${item.stage_number || 'N/A'}`);

    if (item.extras) {
      console.log(`\n📋 DETAILED FEATURE DESCRIPTION (extras.Description_1):`);
      console.log(item.extras.Description_1 || 'N/A');

      if (item.extras.Page_Category_1) {
        console.log(`\nPage Category: ${item.extras.Page_Category_1}`);
      }
      if (item.extras.Category) {
        console.log(`Business Category: ${item.extras.Category}`);
      }
    }
    console.log('');
  });
}

queryPRDAndBacklog().catch(console.error);
