import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sd = await s.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,metadata,description,scope').eq('sd_key','SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001').maybeSingle();
if (sd.error) console.error('SD err', sd.error);
console.log('SD id:', sd.data?.id, '| key:', sd.data?.sd_key, '| phase:', sd.data?.current_phase, '| status:', sd.data?.status);
if (!sd.data) process.exit(1);
for (const key of [sd.data.id, sd.data.sd_key]) {
  const r = await s.from('product_requirements_v2').select('*').eq('sd_id', key);
  console.log('lookup', key, '->', r.data?.length ?? 'err', r.error?.message ?? '');
  for (const p of (r.data||[])) {
    console.log('=== PRD', p.id, '|', p.title, '| status', p.status);
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (v === null || v === undefined) continue;
      const str = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
      if (str.length < 3) continue;
      console.log(`\n--- ${k} ---\n${str}`);
    }
  }
}
