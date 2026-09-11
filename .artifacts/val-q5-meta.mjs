import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: r } = await sb.from('strategic_directives_v2').select('metadata,governance_metadata,scope_keywords,worktree_path').eq('id','b0331d11-b360-4fd1-b1e7-6b97676654bf').maybeSingle();
const m = r.metadata||{};
for (const k of ['needs_enrichment','needs_coordinator_review','needs_coordinator_review_reason','sd_authoring_validated_at','sd_authoring_validation_summary','target_application_explicit','plan_linkage','roadmap_link_exception','dedup_match_sd_key','files_to_modify','files_count','steps_count','work_selection','adam_sourced','plan_file_path','min_tier_rank','security_reviewed','dispatch_reason_band']) {
  console.log(`--- ${k}:`, JSON.stringify(m[k], null, 1));
}
console.log('--- scope_keywords:', JSON.stringify(r.scope_keywords));
console.log('--- worktree_path:', r.worktree_path);
console.log('\n=== PLAN_CONTENT (len ' + String(m.plan_content||'').length + ') ===');
console.log(String(m.plan_content||'').slice(0, 9000));
