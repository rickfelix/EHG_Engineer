import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const out = {};

// stage 15 + neighbours high-consequence flags
{
  const { data } = await sb.from('venture_stages')
    .select('stage_number, stage_name, is_high_consequence, is_irreversible, gate_type, review_mode, required_artifacts, metadata')
    .in('stage_number', [15, 16, 17, 20, 24]);
  out.stages = (data||[]).map(r => ({ n: r.stage_number, name: r.stage_name, hc: r.is_high_consequence, irrev: r.is_irreversible,
    gate_type: r.gate_type, review_mode: r.review_mode, gates: r.metadata?.gates ?? null,
    required_artifacts: r.required_artifacts }));
}
// sibling -I and -D and -A full metadata
{
  for (const k of ['SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I','SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D','SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A']) {
    const { data } = await sb.from('strategic_directives_v2').select('id, sd_key, status, current_phase, description, scope, metadata, updated_at').eq('sd_key', k).maybeSingle();
    out[k] = data ? { id: data.id, status: data.status, phase: data.current_phase, updated_at: data.updated_at,
      description: (data.description||'').slice(0, 1400),
      scope: typeof data.scope === 'string' ? data.scope.slice(0,800) : JSON.stringify(data.scope||{}).slice(0,800),
      metadata_keys: Object.keys(data.metadata||{}) } : null;
  }
}
// PRDs for -I (what files does it name?)
{
  const { data } = await sb.from('product_requirements_v2').select('id, sd_id, title, content, functional_requirements, metadata')
    .eq('sd_id', '79975086-927e-4c35-a6f6-4a47ed972a2a').limit(2);
  out.prd_I = (data||[]).map(p => ({ id: p.id, title: p.title,
    blob: JSON.stringify({ c: p.content, fr: p.functional_requirements }).slice(0, 3000) }));
}
console.log(JSON.stringify(out, null, 2));
