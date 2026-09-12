import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd } = await sb.from('strategic_directives_v2').select('metadata').eq('id','3f128d5c-8168-4415-86cc-ab5da4663d11').single();
const m = sd.metadata||{};
for (const k of ['needs_coordinator_review','review_hold_reason','review_hold_set_at','review_hold_set_by','coordinator_review_cleared_at','coordinator_review_cleared_by','not_before_reason','not_before_cleared_at','deferred_blocker','model_tier_decisions','plan_linkage','roadmap_link_exception'])
  console.log(k, '=', JSON.stringify(m[k]));
console.log('=== SIBLINGS ===');
const { data: sibs } = await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,progress').ilike('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002%').order('sd_key');
for (const s of sibs||[]) {
  const { count } = await sb.from('sd_backlog_map').select('*',{count:'exact',head:true}).eq('sd_id', s.id);
  const { data: p } = await sb.from('product_requirements_v2').select('id').eq('directive_id', s.sd_key);
  console.log(` ${s.sd_key.padEnd(48)} ${String(s.status).padEnd(12)} ${String(s.current_phase).padEnd(18)} prog=${String(s.progress).padEnd(4)} backlog=${count} prds=${(p||[]).length}`);
}
