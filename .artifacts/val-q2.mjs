import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const q = async (label, sql, params=[]) => {
  try { const { rows } = await c.query(sql, params); console.log(`\n== ${label} ==`); console.log(JSON.stringify(rows, null, 1).slice(0, 2500)); }
  catch (e) { console.log(`\n== ${label} == ERR: ${e.message}`); }
};
await q('trigger live?', `SELECT tgname, tgrelid::regclass::text AS tbl, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname='trg_sd_mutation_audit'`);
await q('function live?', `SELECT proname, pg_get_function_identity_arguments(oid) args FROM pg_proc WHERE proname IN ('log_sd_mutation_audit','handoff_actor_policy')`);
await q('who am I (no SET)', `SELECT session_user, current_user, current_setting('app.actor', true) AS app_actor`);
await q('ALL funcs reading app.actor', `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%app.actor%'`);
await q('ALL funcs reading request.headers', `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%request.headers%'`);
await q('audit_log distinct created_by last 48h', `SELECT created_by, count(*) FROM audit_log WHERE created_at > now() - interval '48 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
await q('trigger-authored rows last 48h', `SELECT created_by, event_type, count(*) FROM audit_log WHERE created_at > now() - interval '48 hours' AND metadata->>'trigger'='trg_sd_mutation_audit' GROUP BY 1,2 ORDER BY 3 DESC`);
await q('does SET app.actor persist on this client', `SET app.actor = 'val-probe-961a30d3'`);
await q('read back after SET', `SELECT current_setting('app.actor', true) AS app_actor`);
await c.end();
