const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function implement() {
  // Step 1: Find sub-agents with EXEC_IMPLEMENTATION_COMPLETE
  const { data: agents } = await supabase.from('leo_sub_agents')
    .select('id, code, name, trigger_keywords');

  const affected = (agents || []).filter(a =>
    a.trigger_keywords && a.trigger_keywords.includes('EXEC_IMPLEMENTATION_COMPLETE')
  );

  console.log('Sub-agents with EXEC_IMPLEMENTATION_COMPLETE:', affected.map(a => a.code));

  // Step 2: Replace EXEC_IMPLEMENTATION_COMPLETE with EXEC-TO-PLAN
  for (const agent of affected) {
    const newKeywords = agent.trigger_keywords
      .filter(k => k !== 'EXEC_IMPLEMENTATION_COMPLETE');

    // Add EXEC-TO-PLAN if not already present
    if (!newKeywords.includes('EXEC-TO-PLAN')) {
      newKeywords.push('EXEC-TO-PLAN');
    }

    const { error } = await supabase.from('leo_sub_agents')
      .update({ trigger_keywords: newKeywords })
      .eq('id', agent.id);

    if (error) console.error('Error updating', agent.code, ':', error.message);
    else console.log('Updated', agent.code, ': removed EXEC_IMPLEMENTATION_COMPLETE, added EXEC-TO-PLAN');
  }

  // Step 3: Verify no more EXEC_IMPLEMENTATION_COMPLETE
  const { data: verify } = await supabase.from('leo_sub_agents')
    .select('code, trigger_keywords');
  const remaining = (verify || []).filter(a =>
    a.trigger_keywords && a.trigger_keywords.includes('EXEC_IMPLEMENTATION_COMPLETE')
  );
  console.log('\nRemaining with EXEC_IMPLEMENTATION_COMPLETE:', remaining.length === 0 ? 'NONE (clean)' : remaining.map(a => a.code));

  // Step 4: Resolve pattern PAT-AUTO-ec5c4c80
  const { error: pat1Err } = await supabase.from('issue_patterns')
    .update({
      status: 'resolved',
      resolution_notes: 'Fixed: Removed invalid EXEC_IMPLEMENTATION_COMPLETE from sub-agent trigger keywords in leo_sub_agents table. Replaced with valid EXEC-TO-PLAN handoff type. SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028.'
    })
    .eq('pattern_id', 'PAT-AUTO-ec5c4c80');
  console.log('\nPAT-AUTO-ec5c4c80:', pat1Err ? 'ERROR: ' + pat1Err.message : 'RESOLVED');

  // Step 5: Resolve pattern PAT-AUTO-c205e83a
  const { error: pat2Err } = await supabase.from('issue_patterns')
    .update({
      status: 'resolved',
      resolution_notes: 'Already fixed: shouldSkipCodeValidation() in lib/utils/sd-type-validation.js skips testingSubAgentVerified gate for infrastructure SDs. SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-028.'
    })
    .eq('pattern_id', 'PAT-AUTO-c205e83a');
  console.log('PAT-AUTO-c205e83a:', pat2Err ? 'ERROR: ' + pat2Err.message : 'RESOLVED');

  // Step 6: Verify patterns resolved
  const { data: patterns } = await supabase.from('issue_patterns')
    .select('pattern_id, status, resolution_notes')
    .in('pattern_id', ['PAT-AUTO-ec5c4c80', 'PAT-AUTO-c205e83a']);
  console.log('\nPattern status:', JSON.stringify(patterns, null, 2));
}

implement().catch(console.error);
