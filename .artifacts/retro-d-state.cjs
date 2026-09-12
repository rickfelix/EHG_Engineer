require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sd, error: e1 } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,status,current_phase,sd_type,progress_percentage,metadata,updated_at').eq('sd_key', KEY).single();
  if (e1) return console.error('sd', e1);
  console.log('SD', sd.id, sd.status, sd.current_phase, sd.sd_type, sd.progress_percentage);
  console.log('meta keys', Object.keys(sd.metadata || {}).filter(k => /blocked|checkpoint/i.test(k)));
  const { data: retros } = await sb.from('retrospectives').select('id,retro_type,status,quality_score,generated_by,created_at,key_learnings').eq('sd_id', sd.id).order('created_at');
  console.log('RETROS', (retros||[]).map(r => [r.id, r.retro_type, r.status, r.quality_score, r.generated_by, r.created_at, (r.key_learnings||[]).length]));
  const { data: ho } = await sb.from('sd_phase_handoffs').select('handoff_type,status,validation_score,created_at').eq('sd_id', sd.id).order('created_at');
  console.log('HANDOFFS', (ho||[]).map(h => [h.handoff_type, h.status, h.validation_score, h.created_at]));
  const { data: sar } = await sb.from('sub_agent_execution_results').select('sub_agent_code,verdict,confidence,created_at,metadata').eq('sd_id', sd.id).order('created_at');
  console.log('SUBAGENTS', (sar||[]).map(r => [r.sub_agent_code, r.verdict, r.confidence, r.created_at, r.metadata?.phase, r.metadata?.session_id ? 'sid' : '-']));
  const { data: srf, error: e2 } = await sb.from('ship_review_findings').select('pr_number,round,severity,created_at').in('pr_number',[8364,8365,8366,8371,8372,8373,8375,8377,8378,8379,8380,8385,8392]);
  if (e2) console.error('srf', e2.message);
  else {
    const byPr = {};
    for (const f of srf) { byPr[f.pr_number] = byPr[f.pr_number] || {n:0, rounds:new Set()}; byPr[f.pr_number].n++; byPr[f.pr_number].rounds.add(f.round); }
    console.log('SRF', Object.entries(byPr).map(([k,v]) => `${k}:${v.n} findings, rounds ${[...v.rounds].sort().join(',')}`).join(' | '));
  }
})();
