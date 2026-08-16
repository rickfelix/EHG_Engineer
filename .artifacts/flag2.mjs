import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`select flag_key, is_enabled, lifecycle_state, target, updated_at from public.leo_feature_flags
 where flag_key ilike '%migration%' or flag_key ilike '%tier%' or flag_key ilike '%bypass%' order by flag_key`);
console.log('MATCHING FLAGS:', r.rows.length);
r.rows.forEach(x=>console.log(` ${x.flag_key} | is_enabled=${x.is_enabled} | state=${x.lifecycle_state} | target=${JSON.stringify(x.target)}`));
await c.end();
