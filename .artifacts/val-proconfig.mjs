import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const q = await c.query(`
    SELECT p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname IN ('log_sd_mutation_audit','resolve_sd_mutation_audit_actor') AND n.nspname='public'`);
  console.log('=== pg_proc state (LIVE) ===');
  console.log(JSON.stringify(q.rows, null, 2));
  const pid = await c.query('SELECT pg_backend_pid() AS pid, current_setting(\'app.actor\', true) AS app_actor, session_user, inet_server_port() AS port');
  console.log('=== connection / actor (LIVE) ===');
  console.log(JSON.stringify(pid.rows, null, 2));
  const t = await c.query(`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname='trg_sd_mutation_audit'`);
  console.log('=== trigger def (LIVE) ===');
  console.log(t.rows.map(r=>r.def).join('\n'));
} finally { await c.end(); }
