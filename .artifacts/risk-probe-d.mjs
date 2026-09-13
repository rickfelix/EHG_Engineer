import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ALTIFY = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

const out = {};

// 1. Does venture_experience_review_runs exist?
{
  const { data, error, count } = await sb.from('venture_experience_review_runs').select('id', { count: 'exact', head: true });
  out.review_runs_table = error ? { exists: false, error: error.message, code: error.code } : { exists: true, count };
}

// 2. AltifyAI artifacts
{
  const { data, error } = await sb.from('venture_artifacts')
    .select('id, artifact_type, is_current, version, lifecycle_stage, created_at')
    .eq('venture_id', ALTIFY).order('created_at', { ascending: false }).limit(200);
  out.altify_artifacts_err = error?.message || null;
  const byType = {};
  for (const a of data || []) {
    const k = a.artifact_type + (a.is_current ? '' : ' (not_current)');
    byType[k] = (byType[k] || 0) + 1;
  }
  out.altify_artifact_types = byType;
  out.altify_relevant = (data || []).filter(a => ['blueprint_wireframes','wireframe_screens','stitch_design_export','stitch_qa_report'].includes(a.artifact_type));
}

// 2b. does the existing stitch_qa_report already carry wireframe_fidelity?
{
  const { data } = await sb.from('venture_artifacts').select('id, metadata, version, is_current')
    .eq('venture_id', ALTIFY).eq('artifact_type','stitch_qa_report').eq('is_current', true).limit(1).maybeSingle();
  out.altify_stitch_qa_report = data ? { id: data.id, version: data.version, metadata_keys: Object.keys(data.metadata || {}), has_wireframe_fidelity: !!data.metadata?.wireframe_fidelity } : null;
}

// 2c. screen counts in the artifacts (cost estimate)
{
  const { data: wf } = await sb.from('venture_artifacts').select('metadata, content')
    .eq('venture_id', ALTIFY).eq('artifact_type','blueprint_wireframes').eq('is_current', true).limit(1).maybeSingle();
  const wfs = wf?.metadata?.wireframes || wf?.metadata?.screens || [];
  out.altify_wireframe_count = Array.isArray(wfs) ? wfs.length : 'non-array';
  const { data: ex } = await sb.from('venture_artifacts').select('metadata')
    .eq('venture_id', ALTIFY).eq('artifact_type','stitch_design_export').eq('is_current', true).limit(1).maybeSingle();
  const screens = ex?.metadata?.screens || ex?.metadata?.png_files_base64 || [];
  out.altify_stitch_design_export_screens = Array.isArray(screens) ? screens.length : (ex ? 'non-array' : 'NO stitch_design_export artifact');
  const { data: ws } = await sb.from('venture_artifacts').select('metadata')
    .eq('venture_id', ALTIFY).eq('artifact_type','wireframe_screens').eq('is_current', true).limit(1).maybeSingle();
  const wss = ws?.metadata?.screens || [];
  out.altify_wireframe_screens_metadata_keys = ws ? Object.keys(ws.metadata || {}) : 'NO wireframe_screens artifact';
  out.altify_wireframe_screens_count = Array.isArray(wss) ? wss.length : null;
}

// 3. venture_stages stage 15 metadata
{
  const { data, error } = await sb.from('venture_stages').select('stage_number, name, metadata').eq('stage_number', 15);
  out.stage15 = error ? { error: error.message } : (data || []).map(r => ({ stage_number: r.stage_number, name: r.name, gates: r.metadata?.gates || null, meta_keys: Object.keys(r.metadata || {}) }));
}

// 4. ventures at stage >= 20 (gauge applicability today)
{
  const { data, error } = await sb.from('ventures').select('id, name, current_lifecycle_stage, status').gte('current_lifecycle_stage', 20).limit(100);
  out.ventures_stage_ge20 = error ? { error: error.message } : (data || []).map(v => ({ id: v.id, name: v.name, stage: v.current_lifecycle_stage, status: v.status }));
}
// 4b. ventures at stage 15 exactly
{
  const { data, error } = await sb.from('ventures').select('id, name, current_lifecycle_stage, status').eq('current_lifecycle_stage', 15).limit(100);
  out.ventures_stage_15 = error ? { error: error.message } : (data || []).map(v => ({ id: v.id, name: v.name, status: v.status }));
}

// 5. sibling SDs CAPA-001-*
{
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, progress, metadata')
    .like('id', 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001%').limit(50);
  out.siblings = error ? { error: error.message } : (data || []).map(s => ({ id: s.id, status: s.status, phase: s.current_phase, progress: s.progress, title: (s.title||'').slice(0,110) }));
}

console.log(JSON.stringify(out, null, 2));
