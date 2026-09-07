const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NEW = ['human_action_note','human_action_reason','human_action_required','needs_coordinator_review_reason'];
const OLD = ['requires_human_action_reason','not_worker_claimable_reason','review_hold_reason','dispatch_ineligible_reason','pilot_throwaway','deferred_by'];
(async () => {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('strategic_directives_v2').select('sd_key,status,current_phase,metadata').range(from, from+999);
    if (error) { console.error(error.message); process.exit(1); }
    all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  console.log('total SDs scanned:', all.length);
  const newOnly = [], released = [], nonTerminalNewOnly = [];
  for (const sd of all) {
    const m = sd.metadata || {};
    const hasNew = NEW.filter(k => m[k] !== undefined && m[k] !== null && m[k] !== false && m[k] !== '');
    const hasOld = OLD.filter(k => m[k] !== undefined && m[k] !== null && m[k] !== false && m[k] !== '');
    if (hasNew.length && !hasOld.length) {
      newOnly.push({ k: sd.sd_key, status: sd.status, phase: sd.current_phase, keys: hasNew, unfenced: !!m.unfenced_at });
      if (m.unfenced_at) released.push(sd.sd_key);
      if (sd.status !== 'completed' && sd.current_phase !== 'LEAD-FINAL-APPROVAL') nonTerminalNewOnly.push(sd.sd_key);
    }
  }
  console.log('\nSDs newly-resolving ONLY because of the 4 widened keys:', newOnly.length);
  console.log('  of those, RELEASED (unfenced_at set, still resolves per AC-20):', released.length);
  console.log('  of those, NON-TERMINAL (would hit post-merge classifyState refuse_held):', nonTerminalNewOnly.length);
  console.log('\nsample (up to 25):');
  newOnly.slice(0,25).forEach(r => console.log('  ', r.k, '|', r.status, '|', r.phase, '| keys=' + r.keys.join(','), r.unfenced ? '| RELEASED' : ''));
  console.log('\nnon-terminal keys:', nonTerminalNewOnly.slice(0,30).join(', '));
})();
