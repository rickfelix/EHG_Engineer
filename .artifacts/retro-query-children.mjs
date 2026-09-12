import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHILD_KEYS = ['A','B','C','D','E','F','G'].map(l => `SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-${l}`);

async function main() {
  for (const key of CHILD_KEYS) {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, description, scope, metadata, created_at, updated_at')
      .eq('sd_key', key)
      .maybeSingle();
    console.log('\n\n########## ' + key + ' ##########');
    if (error || !sd) { console.log('NOT FOUND', error); continue; }
    console.log('STATUS:', sd.status);
    console.log('TITLE:', sd.title);
    console.log('DESCRIPTION:', (sd.description||'').slice(0, 600));

    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, title, functional_requirements, acceptance_criteria, success_metrics, status, metadata')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (prd && prd[0]) {
      const p = prd[0];
      console.log('--- PRD ---');
      console.log('PRD title:', p.title, '| status:', p.status);
      console.log('functional_requirements:', JSON.stringify(p.functional_requirements)?.slice(0, 1200));
      console.log('acceptance_criteria:', JSON.stringify(p.acceptance_criteria)?.slice(0, 800));
      console.log('success_metrics:', JSON.stringify(p.success_metrics)?.slice(0, 800));
    } else {
      console.log('--- PRD: none found ---');
    }

    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status, executive_summary, created_at')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: true });
    console.log('--- HANDOFFS ---', handoffs?.length || 0);
    for (const h of (handoffs||[])) {
      console.log(`  ${h.handoff_type} [${h.status}] @ ${h.created_at}: ${(h.executive_summary||'').slice(0,200)}`);
    }

    const { data: retro } = await supabase
      .from('retrospectives')
      .select('id, retro_type, retrospective_type, quality_score, what_went_well, what_needs_improvement, key_learnings, action_items, improvement_areas, success_patterns, failure_patterns, created_at')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false });
    console.log('--- RETROSPECTIVES ---', retro?.length || 0);
    for (const r of (retro||[])) {
      console.log(`  [${r.retro_type}/${r.retrospective_type}] score=${r.quality_score} @ ${r.created_at}`);
      console.log('   what_went_well:', JSON.stringify(r.what_went_well)?.slice(0,500));
      console.log('   key_learnings:', JSON.stringify(r.key_learnings)?.slice(0,500));
      console.log('   action_items:', JSON.stringify(r.action_items)?.slice(0,500));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
