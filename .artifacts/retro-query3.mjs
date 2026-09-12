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
      .select('id, sd_key, description')
      .eq('sd_key', key)
      .maybeSingle();
    console.log('\n\n########## ' + key + ' FULL DESCRIPTION ##########');
    console.log(sd.description);

    const { data: retro } = await supabase
      .from('retrospectives')
      .select('what_needs_improvement, action_items, failure_patterns')
      .eq('sd_id', sd.id)
      .eq('retro_type', 'SD_COMPLETION')
      .order('created_at', { ascending: false })
      .limit(1);
    if (retro && retro[0]) {
      console.log('\n-- what_needs_improvement --');
      console.log(JSON.stringify(retro[0].what_needs_improvement, null, 1));
      console.log('\n-- action_items (full) --');
      console.log(JSON.stringify(retro[0].action_items, null, 1));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
