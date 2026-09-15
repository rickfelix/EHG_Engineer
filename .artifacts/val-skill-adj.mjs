import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keys = ['SD-LEO-INFRA-CORE-SKILLS-REBUILD-001','SD-LEO-INFRA-TALENT-FUNCTION-CREW-001','SD-LEO-INFRA-DELEGATION-RECEIVER-WRITTEN-001'];
const { data } = await s.from('strategic_directives_v2').select('sd_key,title,status,scope,description,metadata').in('sd_key',keys);
for (const r of data||[]) {
  console.log('\n########', r.sd_key, '['+r.status+']');
  console.log('TITLE:', r.title);
  console.log('SCOPE:', (r.scope||r.description||'').slice(0,1100));
  const sec = r.metadata?.design_section || r.metadata?.solomon_section;
  if (sec) console.log('design_section:', sec);
}
