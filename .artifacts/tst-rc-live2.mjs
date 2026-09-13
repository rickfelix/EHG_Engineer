import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';
const UP = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive.sql','utf8');
const c = await createDatabaseClient('ehg');
const out = [];
await c.query('BEGIN');
try {
  // ===== PART 1: measure live corpus against the exact trigger predicate (NO BACKFILL claim) =====
  const pred = `(CASE WHEN metadata->'control_pack_status' IS NULL OR jsonb_typeof(metadata->'control_pack_status')!='object' THEN false
      WHEN NOT (metadata->'control_pack_status' ? 'fence_two_sidedness') OR metadata->'control_pack_status'->>'fence_two_sidedness'='not_attempted' THEN false
      WHEN NOT (metadata->'control_pack_status' ? 'canary_mutation_control') OR metadata->'control_pack_status'->>'canary_mutation_control'='not_attempted' THEN false
      WHEN NOT (metadata->'control_pack_status' ? 'live_deployment_binding') OR metadata->'control_pack_status'->>'live_deployment_binding'='not_attempted' THEN false
      WHEN NOT (metadata->'control_pack_status' ? 'minimum_assertion_manifest') OR metadata->'control_pack_status'->>'minimum_assertion_manifest'='not_attempted' THEN false
      ELSE true END)`;
  let r = await c.query(`SELECT count(*)::int total,
     count(*) FILTER (WHERE metadata ? 'control_pack_evaluated')::int has_key,
     count(*) FILTER (WHERE NOT (metadata ? 'control_pack_evaluated'))::int missing_key,
     count(*) FILTER (WHERE metadata ? 'control_pack_evaluated' AND (metadata->'control_pack_evaluated')::text <> to_jsonb(${pred})::text)::int disagree_present,
     count(*) FILTER (WHERE NOT (metadata ? 'control_pack_evaluated') AND ${pred})::int missing_but_would_be_true
     FROM uat_test_runs`);
  out.push({step:'LIVE CORPUS vs predicate', ...r.rows[0]});

  // ===== PART 2: infinite-recompute / recursion probe =====
  await c.query(UP);
  await c.query(`CREATE TEMP TABLE tstrc_calls (n int)`);
  // instrumented clone: identical logic + an invocation counter
  await c.query(`CREATE OR REPLACE FUNCTION derive_instrumented() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE v_status jsonb; v_required text[] := ARRAY['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest']; v_key text; v_evaluated boolean := true;
  BEGIN
    INSERT INTO tstrc_calls VALUES (1);
    IF TG_OP='INSERT'
       OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status'
       OR OLD.metadata->'control_pack_evaluated' IS DISTINCT FROM NEW.metadata->'control_pack_evaluated' THEN
      v_status := NEW.metadata->'control_pack_status';
      IF v_status IS NULL OR jsonb_typeof(v_status)!='object' THEN v_evaluated := false;
      ELSE FOREACH v_key IN ARRAY v_required LOOP IF NOT (v_status ? v_key) OR v_status->>v_key='not_attempted' THEN v_evaluated := false; END IF; END LOOP; END IF;
      NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{control_pack_evaluated}',to_jsonb(v_evaluated));
    END IF; RETURN NEW; END; $$;`);
  await c.query(`DROP TRIGGER trg_uat_control_pack_evaluated_derive ON uat_test_runs`);
  await c.query(`CREATE TRIGGER trg_instr BEFORE INSERT OR UPDATE ON uat_test_runs FOR EACH ROW EXECUTE FUNCTION derive_instrumented()`);
  const NA = {fence_two_sidedness:'not_attempted',canary_mutation_control:'not_attempted',live_deployment_binding:'not_attempted',minimum_assertion_manifest:'not_attempted'};
  await c.query(`DELETE FROM tstrc_calls`);
  r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id`, [`tstrc-i-${randomUUID()}`, JSON.stringify({control_pack_status:NA})]);
  const iId = r.rows[0].id;
  let n = await c.query(`SELECT count(*)::int n FROM tstrc_calls`);
  out.push({step:'INSERT trigger invocations', n:n.rows[0].n, expect:1});
  await c.query(`DELETE FROM tstrc_calls`);
  const t0 = Date.now();
  await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','true') WHERE id=$1`, [iId]);
  const ms = Date.now()-t0;
  n = await c.query(`SELECT count(*)::int n FROM tstrc_calls`);
  out.push({step:'UPDATE forcing wrong cpe: trigger invocations', n:n.rows[0].n, expect:1, ms, note:'NEW-mutation inside a BEFORE trigger does not re-fire it'});
  // bulk update across whole table -- would blow up if recursive
  await c.query(`DELETE FROM tstrc_calls`);
  const t1 = Date.now();
  const bulk = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb),'{control_pack_evaluated}','true')`);
  const ms2 = Date.now()-t1;
  n = await c.query(`SELECT count(*)::int n FROM tstrc_calls`);
  const rows = await c.query(`SELECT count(*)::int n FROM uat_test_runs`);
  out.push({step:'BULK update all rows', rowsUpdated:bulk.rowCount, triggerInvocations:n.rows[0].n, tableRows:rows.rows[0].n, ms:ms2, expect:'invocations == rowsUpdated (exactly 1 per row)'});
  console.log(JSON.stringify(out,null,2));
} catch(e){ console.log('ERROR: '+e.message+'\n'+JSON.stringify(out,null,2)); }
finally { await c.query('ROLLBACK'); await c.end(); }
