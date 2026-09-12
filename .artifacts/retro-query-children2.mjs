import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHILD_KEYS = ['A','B','C','D','E','F','G'].map(l => `SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-${l}`);

async function main() {
  for (const key of CHILD_KEYS) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, strategic_objectives, success_metrics')
      .eq('sd_key', key)
      .maybeSingle();
    console.log('\n\n########## ' + key + ' ##########');

    // Try PRD by sd_key text (common trap: sd_id column stores sd_key, not uuid)
    const { data: prdByKey } = await supabase
      .from('product_requirements_v2')
      .select('id, title, functional_requirements, acceptance_criteria')
      .eq('sd_id', key)
      .limit(1);
    if (prdByKey && prdByKey[0]) {
      console.log('PRD (by sd_key):', prdByKey[0].title);
      console.log('FRs:', JSON.stringify(prdByKey[0].functional_requirements)?.slice(0, 1500));
    } else {
      console.log('PRD by sd_key: none');
    }

    // Full SD_COMPLETION retro content
    const { data: retro } = await supabase
      .from('retrospectives')
      .select('what_went_well, key_learnings, action_items, success_patterns, failure_patterns, improvement_areas, what_needs_improvement')
      .eq('sd_id', sd.id)
      .eq('retro_type', 'SD_COMPLETION')
      .order('created_at', { ascending: false })
      .limit(1);
    if (retro && retro[0]) {
      console.log('\nFULL SD_COMPLETION what_went_well:', JSON.stringify(retro[0].what_went_well, null, 1));
      console.log('\nFULL key_learnings:', JSON.stringify(retro[0].key_learnings, null, 1));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
