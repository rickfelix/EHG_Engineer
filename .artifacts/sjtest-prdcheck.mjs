import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(url, key);
const { data, error } = await sb.from('product_requirements_v2').select('id,sd_id,title,status,content,updated_at').ilike('sd_id', '%FIX-STAGE-JOURNEY%');
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('rows:', (data||[]).length);
const file = JSON.parse(fs.readFileSync('scripts/one-off/prd-content-fix-stage-journey-001.json', 'utf8'));
for (const r of data || []) {
  const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
  console.log('PRD', r.id, '| sd', r.sd_id, '| status', r.status, '| updated', r.updated_at);
  console.log('  content keys:', Object.keys(c || {}).join(','));
  console.log('  DB content === file content?', JSON.stringify(c) === JSON.stringify(file));
  for (const k of new Set([...Object.keys(c||{}), ...Object.keys(file)])) {
    if (JSON.stringify(c?.[k]) !== JSON.stringify(file[k])) console.log('    DIFFERS:', k);
  }
}
