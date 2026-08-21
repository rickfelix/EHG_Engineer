import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const { data } = await s.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,sd_type,created_at,scope,description,metadata')
  .eq('sd_key','SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-E').maybeSingle();
console.log('=== APA CHILD E (the NOT-completed one) ===');
console.log(`status=${data.status} phase=${data.current_phase} type=${data.sd_type} created=${(data.created_at||'').slice(0,10)}`);
console.log('TITLE:', data.title);
console.log('\nSCOPE:\n', String(data.scope||'(none)').slice(0,2500));
console.log('\nDESC:\n', String(data.description||'(none)').slice(0,1500));
