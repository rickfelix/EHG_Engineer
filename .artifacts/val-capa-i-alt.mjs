import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: v } = await sb.from('ventures').select('id,name,current_lifecycle_stage,launch_mode,repo_url,github_repo,metadata').ilike('name','%altify%');
console.log('=== AltifyAI ventures ===');
for (const r of (v||[])) console.log(JSON.stringify({id:r.id,name:r.name,stage:r.current_lifecycle_stage,launch_mode:r.launch_mode,repo_url:r.repo_url,github_repo:r.github_repo}, null, 1));
const vid = v?.[0]?.id;
if (vid) {
  const { data: leg, error: le } = await sb.from('venture_legal_overrides').select('*').eq('venture_id', vid);
  console.log('=== venture_legal_overrides for AltifyAI ===', le ? 'ERR '+le.message : `rows=${leg.length}`);
  for (const r of (leg||[])) console.log(JSON.stringify({template_id:r.template_id, generated_at:r.generated_at}));
  const { data: arts, error: ae } = await sb.from('venture_artifacts').select('artifact_type,lifecycle_stage,is_current,created_at').eq('venture_id',vid).eq('is_current',true).order('lifecycle_stage');
  console.log('=== venture_artifacts (is_current) ===', ae ? 'ERR '+ae.message : `rows=${arts.length}`);
  const byStage = {};
  for (const a of (arts||[])) { (byStage[a.lifecycle_stage] ||= []).push(a.artifact_type); }
  for (const k of Object.keys(byStage).sort((a,b)=>a-b)) console.log('  S'+k+':', byStage[k].join(', '));
}
// legal_templates
const { data: lt, error: lte } = await sb.from('legal_templates').select('id,template_type,name').limit(20);
console.log('=== legal_templates ===', lte ? 'ERR '+lte.message : JSON.stringify(lt));
