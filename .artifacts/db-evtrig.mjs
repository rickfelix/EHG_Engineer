import { q } from './db-exec.mjs';
console.log('=== EVENT TRIGGERS (could re-grant after CREATE FUNCTION) ===');
let r = await q(`SELECT evtname, evtevent, evtenabled, pg_get_userbyid(evtowner) AS owner, p.proname AS fn
FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid ORDER BY 1`);
console.table(r[0].result);
console.log('\n=== bodies of any grant-ish event trigger fns ===');
r = await q(`SELECT p.proname, left(p.prosrc, 1200) AS src
FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
WHERE p.prosrc ILIKE '%GRANT%' OR p.proname ILIKE '%grant%'`);
for (const x of (r[0].result||[])) console.log('---', x.proname, '---\n', x.src);
