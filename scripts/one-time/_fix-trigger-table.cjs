const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  // 1. Find all EXEC_IMPLEMENTATION_COMPLETE triggers
  const { data: triggers } = await supabase.from('leo_sub_agent_triggers')
    .select('id, sub_agent_id, trigger_phrase')
    .eq('trigger_phrase', 'EXEC_IMPLEMENTATION_COMPLETE');

  console.log('Found', (triggers || []).length, 'triggers with EXEC_IMPLEMENTATION_COMPLETE');

  // 2. Get sub-agent names for context
  for (const t of (triggers || [])) {
    const { data: agent } = await supabase.from('leo_sub_agents')
      .select('code, name')
      .eq('id', t.sub_agent_id)
      .single();
    console.log('  Agent:', agent ? agent.code : 'unknown', '- trigger ID:', t.id);
  }

  // 3. Update to EXEC-TO-PLAN
  const { error: updateErr, data: updated } = await supabase.from('leo_sub_agent_triggers')
    .update({ trigger_phrase: 'EXEC-TO-PLAN' })
    .eq('trigger_phrase', 'EXEC_IMPLEMENTATION_COMPLETE')
    .select('id, trigger_phrase');

  if (updateErr) {
    console.error('Update error:', updateErr.message);
  } else {
    console.log('\nUpdated', (updated || []).length, 'triggers to EXEC-TO-PLAN');
  }

  // 4. Also fix EXEC_IMPLEMENTATION (partial match)
  const { data: partial } = await supabase.from('leo_sub_agent_triggers')
    .select('id, sub_agent_id, trigger_phrase')
    .eq('trigger_phrase', 'EXEC_IMPLEMENTATION');

  if (partial && partial.length > 0) {
    console.log('\nFound', partial.length, 'triggers with EXEC_IMPLEMENTATION (partial)');
    // This one is just 'EXEC_IMPLEMENTATION' without _COMPLETE — leave it or update?
    // It's still not a valid handoff type, update to EXEC-TO-PLAN too
    const { error: partErr } = await supabase.from('leo_sub_agent_triggers')
      .update({ trigger_phrase: 'EXEC-TO-PLAN' })
      .eq('trigger_phrase', 'EXEC_IMPLEMENTATION');
    if (partErr) console.error('Partial update error:', partErr.message);
    else console.log('Updated EXEC_IMPLEMENTATION to EXEC-TO-PLAN');
  }

  // 5. Update section 411 content
  const { data: section } = await supabase.from('leo_protocol_sections')
    .select('id, content')
    .eq('id', 411)
    .single();

  if (section) {
    const newContent = section.content.replace(/EXEC_IMPLEMENTATION_COMPLETE/g, 'EXEC-TO-PLAN');
    const { error: secErr } = await supabase.from('leo_protocol_sections')
      .update({ content: newContent })
      .eq('id', 411);
    if (secErr) console.error('Section 411 update error:', secErr.message);
    else console.log('\nUpdated section 411: replaced EXEC_IMPLEMENTATION_COMPLETE with EXEC-TO-PLAN');
  }

  // 6. Update section 254 (Testing sub-agent)
  const { data: section254 } = await supabase.from('leo_protocol_sections')
    .select('id, content')
    .eq('id', 254)
    .single();

  if (section254 && section254.content.includes('EXEC_IMPLEMENTATION_COMPLETE')) {
    const newContent254 = section254.content.replace(/EXEC_IMPLEMENTATION_COMPLETE/g, 'EXEC-TO-PLAN');
    const { error: sec254Err } = await supabase.from('leo_protocol_sections')
      .update({ content: newContent254 })
      .eq('id', 254);
    if (sec254Err) console.error('Section 254 update error:', sec254Err.message);
    else console.log('Updated section 254: replaced EXEC_IMPLEMENTATION_COMPLETE with EXEC-TO-PLAN');
  }

  // 7. Verify
  const { data: verify } = await supabase.from('leo_sub_agent_triggers')
    .select('trigger_phrase')
    .eq('trigger_phrase', 'EXEC_IMPLEMENTATION_COMPLETE');
  console.log('\nRemaining EXEC_IMPLEMENTATION_COMPLETE triggers:', (verify || []).length);
}

fix().catch(console.error);
