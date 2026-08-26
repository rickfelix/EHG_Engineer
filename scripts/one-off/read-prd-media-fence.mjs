import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);
const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const { data: sd } = await sb.from('strategic_directives_v2').select('id, sd_key, title, status, current_phase').eq('sd_key', SD_KEY).maybeSingle();
console.log('SD:', JSON.stringify(sd, null, 2));
let prd = null;
for (const col of ['directive_id','sd_id']) {
  for (const val of [SD_KEY, sd?.id]) {
    if (!val) continue;
    const { data, error } = await sb.from('product_requirements_v2').select('*').eq(col, val).limit(5);
    if (!error && data && data.length) { prd = data[0]; console.log(`FOUND via ${col}=${val} (n=${data.length})`); break; }
  }
  if (prd) break;
}
if (!prd) { console.log('NO PRD FOUND'); process.exit(0); }
console.log('PRD id:', prd.id, '| title:', prd.title, '| status:', prd.status);
console.log('TOP-LEVEL KEYS:', Object.keys(prd).join(', '));
const c = prd.content || {};
console.log('CONTENT KEYS:', Object.keys(c).join(', '));
import fs from 'fs';
fs.writeFileSync('scripts/one-off/.prd-dump.json', JSON.stringify(prd, null, 2));
console.log('=== FUNCTIONAL REQUIREMENTS ===');
console.log(JSON.stringify(c.functional_requirements, null, 2));
console.log('=== TEST SCENARIOS ===');
console.log(JSON.stringify(c.test_scenarios, null, 2));
