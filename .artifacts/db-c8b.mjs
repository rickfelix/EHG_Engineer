import { q } from './db-exec.mjs';
console.log('=== INSTRUMENT VALIDATION: known-positive fn_is_chairman (SD claims 29 policies) ===');
let r = await q(`SELECT count(*) AS n FROM pg_policies
WHERE coalesce(qual,'')||' '||coalesce(with_check,'') LIKE '%fn_is_chairman%'`);
console.table(r[0].result);
r = await q(`SELECT count(*) AS n FROM pg_policies
WHERE coalesce(qual,'')||' '||coalesce(with_check,'') ~ '\mfn_is_chairman\M'`);
console.log('regex \m..\M form:'); console.table(r[0].result);
