import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: me } = await sb.from('strategic_directives_v2').select('metadata,description,scope')
  .eq('sd_key','SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001').maybeSingle();
console.log('=== THIS SD full plan_content (tail from Scope item 3) ===');
const pc = me?.metadata?.plan_content || '';
const i = pc.indexOf('- (3)');
console.log(pc.slice(i >= 0 ? i : 0));
console.log('\n--- description col ---\n', (me?.description||'(null)').slice(0,1200));
console.log('\n--- scope col ---\n', (me?.scope||'(null)').slice(0,1200));
