import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ALTIFY = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const out = {};

// 1. REAL existence probe (non-head) -- head+count gives false "exists"
{
  const { data, error } = await sb.from('venture_experience_review_runs').select('id').limit(1);
  out.review_runs_real_probe = error ? { exists: false, code: error.code, msg: error.message } : { exists: true, rows: (data||[]).length };
}
// 2. blueprint_wireframes + wireframe_screens full payload shape
{
  for (const t of ['blueprint_wireframes','wireframe_screens']) {
    const { data } = await sb.from('venture_artifacts').select('id, content, metadata, title')
      .eq('venture_id', ALTIFY).eq('artifact_type', t).eq('is_current', true).limit(1).maybeSingle();
    out[t] = data ? {
      id: data.id, title: data.title,
      metadata_keys: Object.keys(data.metadata || {}),
      metadata_sample: JSON.stringify(data.metadata || {}).slice(0, 400),
      content_type: typeof data.content,
      content_len: typeof data.content === 'string' ? data.content.length : null,
      content_head: typeof data.content === 'string' ? data.content.slice(0, 300) : null,
      content_parses: (() => { try { const p = JSON.parse(data.content); return { ok: true, keys: Object.keys(p), wireframes: Array.isArray(p.wireframes)?p.wireframes.length:null, screens: Array.isArray(p.screens)?p.screens.length:null }; } catch { return { ok: false }; } })(),
    } : null;
  }
}
// 3. stage 15 gates (no name column)
{
  const { data, error } = await sb.from('venture_stages').select('*').eq('stage_number', 15);
  out.stage15 = error ? { error: error.message } : (data||[]).map(r => ({
    cols: Object.keys(r), stage_number: r.stage_number, label: r.stage_name || r.title || null,
    gates: r.metadata?.gates ?? null, metadata_keys: Object.keys(r.metadata || {}),
  }));
}
// 4. siblings by sd_key / id ilike
{
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, progress, metadata, created_at')
    .or('id.ilike.%CAPA-001%,sd_key.ilike.%CAPA-001%').limit(60);
  out.siblings = error ? { error: error.message } : (data||[]).map(s => ({
    id: s.id, sd_key: s.sd_key, status: s.status, phase: s.current_phase, progress: s.progress,
    title: (s.title||'').slice(0,100),
    files: s.metadata?.files_touched || s.metadata?.target_files || null,
  }));
}
// 5. active claims on siblings
{
  const { data, error } = await sb.from('claude_sessions')
    .select('session_id, sd_id, sd_key, status, heartbeat_at, worktree_path')
    .order('heartbeat_at', { ascending: false }).limit(40);
  out.sessions = error ? { error: error.message } : (data||[]).filter(s => (s.sd_id||'').includes('CAPA') || (s.sd_key||'').includes('CAPA'));
}
// 6. existing EXIT_GATE_OBSERVE_ONLY row volume per stage (is stage 15 ever evaluated?)
{
  const { data, error } = await sb.from('system_events').select('payload, created_at')
    .eq('event_type','EXIT_GATE_OBSERVE_ONLY').order('created_at',{ascending:false}).limit(1000);
  if (error) out.observe_rows = { error: error.message };
  else {
    const byStage = {};
    for (const r of data||[]) { const k = `stage_${r.payload?.stage_number}`; byStage[k]=(byStage[k]||0)+1; }
    out.observe_rows = { total_sampled: (data||[]).length, by_stage: byStage, newest: data?.[0]?.created_at || null };
  }
}
// 7. any stage transition FROM 15 ever? (does the enforcer even run at stage 15)
{
  const { count, error } = await sb.from('system_events').select('id', { count: 'exact', head: true }).eq('event_type','EXIT_GATE_ANOMALY');
  out.anomaly_count = error ? error.message : count;
}
console.log(JSON.stringify(out, null, 2));
