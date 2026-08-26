import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. The specific row
const { data: row, error } = await s.from('eva_sync_state').select('*').eq('id','5ea38ba3-6b46-4f17-be5a-3a87a4075143').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
console.log('=== TARGET ROW (id 5ea38ba3) ===');
console.log(JSON.stringify(row, null, 2));

// 2. Independent token-shape census across the WHOLE table
const { data: all, error: e2 } = await s.from('eva_sync_state').select('id, source_type, source_identifier, source_metadata, updated_at');
if (e2) { console.error('ERR2', e2); process.exit(1); }
console.log(`\n=== FULL eva_sync_state CENSUS: ${all.length} rows ===`);

const TOKEN_RE = /(ya29\.[A-Za-z0-9_\-\.]{20,}|1\/\/0[A-Za-z0-9_\-]{20,}|AIza[A-Za-z0-9_\-]{30,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|ey[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})/;
function walk(obj, path, hits, keys) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    keys.add(path.split('.').pop());
    if (TOKEN_RE.test(obj)) hits.push({ path, len: obj.length, prefix: obj.slice(0,6) });
    return;
  }
  if (typeof obj !== 'object') return;
  for (const [k,v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k, hits, keys);
}
const allKeys = new Set();
let anyHit = false;
for (const r of all) {
  const hits = [];
  walk(r.source_metadata, '', hits, allKeys);
  const topKeys = Object.keys(r.source_metadata || {});
  const suspicious = topKeys.filter(k => /token|secret|password|credential|key|auth/i.test(k));
  console.log(`  ${r.id.slice(0,8)} ${String(r.source_type).padEnd(12)} ${String(r.source_identifier).padEnd(22)} keys=[${topKeys.join(',')}] suspiciousKeys=[${suspicious.join(',')}] tokenShapeHits=${hits.length}`);
  if (hits.length) { anyHit = true; console.log('     !!! HITS:', JSON.stringify(hits)); }
}
console.log(`\nTOKEN-SHAPE HITS ACROSS eva_sync_state: ${anyHit ? 'YES (FAIL)' : 'NONE'}`);
console.log(`\nDISTINCT LEAF KEY NAMES across all source_metadata:\n  ${[...allKeys].sort().join(', ')}`);

// 3. Explicit checks the SD claims
console.log('\n=== SD CLAIM CHECKS on target row ===');
const sm = row?.source_metadata || {};
console.log('has legacy `tokens` key:', Object.prototype.hasOwnProperty.call(sm, 'tokens'));
console.log('has `encrypted_tokens` key:', Object.prototype.hasOwnProperty.call(sm, 'encrypted_tokens'));
console.log('raw JSON contains "ya29.":', JSON.stringify(sm).includes('ya29.'));
console.log('raw JSON contains "1//0":', JSON.stringify(sm).includes('1//0'));
console.log('row.updated_at:', row?.updated_at);
console.log('full raw source_metadata JSON:', JSON.stringify(sm));

// 4. Count rows matching what getStoredTokens queries (maybeSingle would throw on >1)
const { data: yt, error: e3 } = await s.from('eva_sync_state').select('id').eq('source_type','youtube').eq('source_identifier','youtube_oauth');
console.log('\nRows matching (source_type=youtube, source_identifier=youtube_oauth):', yt?.length, e3 || '');
