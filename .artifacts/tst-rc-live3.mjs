import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('ehg');
const out=[];
await c.query('BEGIN');
try {
  // An UNGUARDED trigger (always recomputes). If TS-2j still passes against this,
  // TS-2j does not discriminate "short-circuited" from "recomputed to the same answer".
  await c.query(`CREATE OR REPLACE FUNCTION derive_noguard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE v_status jsonb; v_required text[] := ARRAY['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest']; v_key text; v_evaluated boolean := true;
  BEGIN
    v_status := NEW.metadata->'control_pack_status';
    IF v_status IS NULL OR jsonb_typeof(v_status)!='object' THEN v_evaluated := false;
    ELSE FOREACH v_key IN ARRAY v_required LOOP IF NOT (v_status ? v_key) OR v_status->>v_key='not_attempted' THEN v_evaluated := false; END IF; END LOOP; END IF;
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{control_pack_evaluated}',to_jsonb(v_evaluated));
    RETURN NEW; END; $$;`);
  await c.query(`CREATE TRIGGER trg_noguard BEFORE INSERT OR UPDATE ON uat_test_runs FOR EACH ROW EXECUTE FUNCTION derive_noguard()`);
  const ALL_EVAL = {fence_two_sidedness:'evaluated',canary_mutation_control:'evaluated',live_deployment_binding:'evaluated',minimum_assertion_manifest:'evaluated'};
  let r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id`, [`tstrc-j-${randomUUID()}`, JSON.stringify({control_pack_status:ALL_EVAL, note:'v1'})]);
  const id = r.rows[0].id;
  // TS-2j's EXACT sequence + EXACT assertion
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{note}','"v2"') WHERE id=$1 RETURNING metadata`,[id]);
  const ts2jAgainstNoGuard = r.rows[0].metadata.control_pack_evaluated === true && r.rows[0].metadata.note === 'v2';
  out.push({step:'TS-2j assertion evaluated against a NO-GUARD (always-recompute) trigger', passes: ts2jAgainstNoGuard,
    verdict: ts2jAgainstNoGuard ? 'TS-2j does NOT discriminate -- it passes even with no guard at all' : 'TS-2j discriminates'});
  console.log(JSON.stringify(out,null,2));
} catch(e){ console.log('ERROR: '+e.message); }
finally { await c.query('ROLLBACK'); await c.end(); }
