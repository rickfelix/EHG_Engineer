require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function analyze() {
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, sd_type, priority, current_phase, progress, parent_sd_id, dependencies, is_working_on')
    .in('status', ['draft', 'in_progress', 'approved'])
    .order('priority', { ascending: true });

  const { data: sessions } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, computed_status')
    .eq('computed_status', 'active');

  const claimedSDs = new Set((sessions || []).map(s => s.sd_id).filter(Boolean));

  console.log('\n=== WORKABLE SDs (not CLAIMED) ===\n');

  for (const sd of (sds || [])) {
    if (claimedSDs.has(sd.sd_key)) continue;

    const phase = sd.current_phase || 'LEAD';
    const progress = sd.progress || 0;
    const status = sd.status;
    const type = sd.sd_type || 'unknown';
    const isOrch = (sds || []).some(s => s.parent_sd_id === sd.sd_key);
    const isChild = Boolean(sd.parent_sd_id);

    const flags = [];
    if (isOrch) flags.push('ORCHESTRATOR');
    if (isChild) flags.push('child of ' + sd.parent_sd_id);
    if (sd.is_working_on) flags.push('WORKING_ON');

    console.log(sd.sd_key);
    console.log('  Title: ' + (sd.title || '').substring(0, 70));
    console.log('  Status: ' + status + ' | Phase: ' + phase + ' | Progress: ' + progress + '% | Type: ' + type + ' | Priority: ' + (sd.priority || 'medium'));
    if (flags.length) console.log('  Flags: ' + flags.join(', '));
    console.log('');
  }
}

analyze();
