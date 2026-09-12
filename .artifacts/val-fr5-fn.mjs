import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
import fs from 'fs';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  // Install the EXACT function body from the migration into pg_temp (session-local, auto-dropped,
  // no public-schema write). Only the schema qualifier differs.
  const sql = fs.readFileSync('database/chairman-gated/20260912_sd_mutation_audit_actor_threading.sql','utf8');
  const m = sql.match(/CREATE OR REPLACE FUNCTION resolve_sd_mutation_audit_actor\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/);
  if (!m) throw new Error('could not extract helper fn from migration');
  await c.query(m[0].replace('FUNCTION resolve_sd_mutation_audit_actor()','FUNCTION pg_temp.resolve_sd_mutation_audit_actor()'));
  console.log('installed verbatim helper body into pg_temp (only the schema qualifier changed)\n');

  const probe = async (label, setup) => {
    if (setup) await c.query(setup);
    try {
      const r = await c.query('SELECT * FROM pg_temp.resolve_sd_mutation_audit_actor()');
      console.log(`${label.padEnd(44)} -> actor_id=${JSON.stringify(r.rows[0].actor_id)} source=${r.rows[0].actor_source}`);
    } catch (e) { console.log(`${label.padEnd(44)} -> THREW: ${e.message}`); }
  };

  await c.query("SELECT set_config('app.actor','', false)");
  await probe('T1 nothing set (request.headers absent)');
  await probe('T2 app.actor set', "SELECT set_config('app.actor','sess-aaa', false)");
  await probe('T3 app.actor blank + headers valid JSON', "SELECT set_config('app.actor','',false), set_config('request.headers','{\"x-actor-session\":\"hdr-bbb\"}',false)");
  await probe('T4 headers MALFORMED json (cast must not throw)', "SELECT set_config('request.headers','not-json-at-all{{{',false)");
  await probe('T5 headers valid json, no x-actor-session key', "SELECT set_config('request.headers','{\"accept\":\"*/*\"}',false)");
  await probe('T6 headers json ARRAY (->> on array)', "SELECT set_config('request.headers','[1,2,3]',false)");
  await probe('T7 headers json scalar string', "SELECT set_config('request.headers','\"hello\"',false)");
  await probe('T8 headers empty string', "SELECT set_config('request.headers','',false)");
  await probe('T9 x-actor-session present but empty', "SELECT set_config('request.headers','{\"x-actor-session\":\"\"}',false)");
  await probe('T10 app.actor wins over headers', "SELECT set_config('app.actor','sess-wins',false), set_config('request.headers','{\"x-actor-session\":\"hdr-loses\"}',false)");

  // session_user under SECURITY DEFINER: prove the fallback is unchanged
  await c.query(`CREATE OR REPLACE FUNCTION pg_temp.secdef_probe() RETURNS TABLE(su text, cu text)
                 AS $x$ BEGIN RETURN QUERY SELECT session_user::text, current_user::text; END; $x$
                 LANGUAGE plpgsql SECURITY DEFINER`);
  const sd = await c.query('SELECT * FROM pg_temp.secdef_probe()');
  console.log(`\nSECURITY DEFINER context: session_user=${sd.rows[0].su} current_user=${sd.rows[0].cu} (fallback uses session_user -> unchanged)`);
} finally { await c.end(); }
