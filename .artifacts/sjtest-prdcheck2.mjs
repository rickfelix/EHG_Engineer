import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sds } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase').ilike('sd_key', '%FIX-STAGE-JOURNEY%');
console.log('SDs:', JSON.stringify(sds, null, 1));
if (!sds?.length) process.exit(0);
const sd = sds[0];
const { data: prds, error } = await sb.from('product_requirements_v2').select('id,sd_id,directive_id,title,status,content,updated_at').or(`sd_id.eq.${sd.id},sd_id.eq.${sd.sd_key},directive_id.eq.${sd.id},directive_id.eq.${sd.sd_key}`);
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('PRD rows:', prds?.length);
const file = JSON.parse(fs.readFileSync('scripts/one-off/prd-content-fix-stage-journey-001.json', 'utf8'));
for (const r of prds || []) {
  const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
  console.log('PRD', r.id, '| status', r.status, '| updated', r.updated_at);
  console.log('  keys:', Object.keys(c || {}).join(','));
  console.log('  DB === file?', JSON.stringify(c) === JSON.stringify(file));
  for (const k of new Set([...Object.keys(c||{}), ...Object.keys(file)])) {
    if (JSON.stringify(c?.[k]) !== JSON.stringify(file[k])) console.log('    DIFFERS:', k);
  }
}
