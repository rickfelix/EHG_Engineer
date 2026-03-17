require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getSDDetails() {
  // Step 1: Get SD metadata
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-EXPORT-001')
    .single();

  if (sdError) {
    console.error('Error fetching SD:', sdError);
    return;
  }

  console.log('=== SD METADATA ===');
  console.log(JSON.stringify(sd, null, 2));

  // Step 2: Check for existing PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('strategic_directive_id', 'SD-EXPORT-001');

  console.log('\n=== PRD STATUS ===');
  if (prd && prd.length > 0) {
    console.log(JSON.stringify(prd, null, 2));
  } else {
    console.log('No PRD found');
  }

  // Step 3: Query backlog items
  const { data: backlog, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-EXPORT-001')
    .order('priority', { ascending: false })
    .order('sequence_no', { ascending: true });

  console.log('\n=== BACKLOG ITEMS ===');
  if (backlog && backlog.length > 0) {
    console.log(JSON.stringify(backlog, null, 2));
  } else {
    console.log('No backlog items found');
  }

  // Step 4: Check handoffs
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', 'SD-EXPORT-001')
    .order('created_at', { ascending: false });

  console.log('\n=== HANDOFFS ===');
  if (handoffs && handoffs.length > 0) {
    console.log(JSON.stringify(handoffs, null, 2));
  } else {
    console.log('No handoffs found');
  }
}

getSDDetails();
