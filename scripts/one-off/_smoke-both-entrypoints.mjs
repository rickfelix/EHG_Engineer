import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const esm = await import('../../lib/supabase-client.js');
const cjs = require('../../lib/supabase-client.cjs');
console.log('ESM exports:', Object.keys(esm).sort().join(','));
console.log('CJS exports:', Object.keys(cjs).sort().join(','));
const c1 = esm.createSupabaseClient ? esm.createSupabaseClient() : (esm.default || esm.supabase);
const c2 = cjs.createSupabaseClient ? cjs.createSupabaseClient() : (cjs.default || cjs.supabase);
console.log('ESM client ok:', !!c1, 'CJS client ok:', !!c2);
// live smoke: real table count must resolve; missing relation head+count must reject
const r = await c1.from('strategic_directives_v2').select('id', { count: 'exact', head: true });
console.log('LIVE real-table count:', r.count, 'error:', r.error?.message ?? null);
try {
  await c1.from('__no_such_relation_probe__').select('id', { count: 'exact', head: true });
  console.log('LIVE missing-relation head+count: RESOLVED (BAD - guard did not fire)');
} catch (e) {
  console.log('LIVE missing-relation head+count: REJECTED code=', e.code, '|', String(e.message).slice(0,90));
}
