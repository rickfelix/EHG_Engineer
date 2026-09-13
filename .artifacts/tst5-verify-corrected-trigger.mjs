#!/usr/bin/env node
// TESTING pass 5 - independent live verification of the CORRECTED trigger design
// prescribed by PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3 / AC-1.
// Always-ROLLBACK, TEMP table only. Never touches a real table.
import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const REQ = ['fence_two_sidedness', 'canary_mutation_control', 'live_deployment_binding', 'minimum_assertion_manifest'];
const results = [];
function rec(id, desc, expected, actual, pass, note = '') {
  results.push({ id, desc, expected, actual, pass, note });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + id.padEnd(8) + ' exp=' + JSON.stringify(expected) + ' act=' + JSON.stringify(actual) + ' ' + note);
}

async function main() {
  const client = await createDatabaseClient('ehg');
  try {
    await client.query('BEGIN');
    const v = await client.query('SELECT version()');
    console.log('PG:', v.rows[0].version.split(',')[0]);

    const col = await client.query(
      "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'uat_test_runs' AND column_name = 'metadata'"
    );
    console.log('LIVE uat_test_runs.metadata =>', JSON.stringify(col.rows));
    const trg = await client.query(
      "SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='uat_test_runs' AND NOT t.tgisinternal"
    );
    console.log('LIVE uat_test_runs non-internal triggers:', trg.rows.length, JSON.stringify(trg.rows));
    console.log('');

    await client.query('CREATE TEMP TABLE t_uat_runs (id serial PRIMARY KEY, metadata jsonb) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE t_body_runs (n int) ON COMMIT DROP');
    await client.query('INSERT INTO t_body_runs VALUES (0)');

    const fnSql = [
      'CREATE OR REPLACE FUNCTION pg_temp.f_derive_cpe() RETURNS trigger AS $fn$',
      'DECLARE',
      "  req text[] := ARRAY['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'];",
      '  st jsonb;',
      '  k text;',
      '  ok boolean := true;',
      'BEGIN',
      "  IF TG_OP = 'INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN",
      '    UPDATE t_body_runs SET n = n + 1;',
      "    st := COALESCE(NEW.metadata, '{}'::jsonb) -> 'control_pack_status';",
      "    IF st IS NULL OR jsonb_typeof(st) <> 'object' THEN",
      '      ok := false;',
      '    ELSE',
      '      FOREACH k IN ARRAY req LOOP',
      '        IF NOT (st ? k) THEN ok := false; EXIT; END IF;',
      "        IF st->>k = 'not_attempted' THEN ok := false; EXIT; END IF;",
      '      END LOOP;',
      '    END IF;',
      "    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{control_pack_evaluated}', to_jsonb(ok));",
      '  END IF;',
      '  RETURN NEW;',
      'END;',
      '$fn$ LANGUAGE plpgsql;'
    ].join('\n');
    await client.query(fnSql);
    await client.query('CREATE TRIGGER trg_derive_cpe BEFORE INSERT OR UPDATE ON t_uat_runs FOR EACH ROW EXECUTE FUNCTION pg_temp.f_derive_cpe()');

    const statusAll = (val) => Object.fromEntries(REQ.map((k) => [k, val]));
    const ins = async (meta) => {
      const r = await client.query('INSERT INTO t_uat_runs (metadata) VALUES ($1::jsonb) RETURNING id, metadata', [
        meta === undefined ? null : JSON.stringify(meta)
      ]);
      return r.rows[0];
    };
    const cpe = (row) => (row.metadata === null ? '<metadata NULL>' : row.metadata.control_pack_evaluated);
    const bodyRuns = async () => (await client.query('SELECT n FROM t_body_runs')).rows[0].n;

    let r = await ins({ control_pack_status: statusAll('evaluated') });
    rec('TS-1', 'all 4 evaluated', true, cpe(r), cpe(r) === true, '(derived by trigger, not written by INSERT)');

    const shape84 = {
      fence_two_sidedness: 'evaluated',
      canary_mutation_control: 'not_attempted',
      live_deployment_binding: 'not_attempted',
      minimum_assertion_manifest: 'not_attempted'
    };
    r = await ins({ control_pack_status: shape84 });
    rec('TS-2', '3 of 4 not_attempted (live row 84d310e1 shape)', false, cpe(r), cpe(r) === false);

    r = await ins({ control_pack_status: statusAll('evaluated'), control_pack_failures: null });
    rec('TS-2b', 'clean pass, failures = jsonb null', true, cpe(r), cpe(r) === true);

    r = await ins({ control_pack_status: shape84 });
    const beforeC = cpe(r);
    const u = await client.query(
      "UPDATE t_uat_runs SET metadata = jsonb_set(metadata, '{control_pack_status}', $2::jsonb) WHERE id=$1 RETURNING metadata",
      [r.id, JSON.stringify(statusAll('evaluated'))]
    );
    const afterC = u.rows[0].metadata.control_pack_evaluated;
    rec('TS-2c', 'UPDATE completing controls flips false->true', 'false->true', beforeC + '->' + afterC, beforeC === false && afterC === true);

    r = await ins({ some_other_key: 1 });
    rec('TS-2d', 'metadata lacks control_pack_status entirely', false, cpe(r), cpe(r) === false, '(fails closed, no error)');

    const waived = Object.assign(statusAll('evaluated'), { minimum_assertion_manifest: 'waived: chairman ruling' });
    r = await ins({ control_pack_status: waived });
    rec('TS-2f', '1 waived + 3 evaluated', true, cpe(r), cpe(r) === true, '(equality-vs-evaluated impl would wrongly give false)');

    const absentOne = statusAll('evaluated');
    delete absentOne.minimum_assertion_manifest;
    r = await ins({ control_pack_status: absentOne });
    rec('TS-2g', '1 of 4 required keys ABSENT', false, cpe(r), cpe(r) === false, '(presence requirement; app layer fails OPEN here)');

    const naive = REQ.every((k) => absentOne[k] !== 'not_attempted');
    rec('CTRL-1', 'inequality-only predicate on TS-2g fixture', true, naive, naive === true,
      '=> naive TRUE vs tightened FALSE: presence requirement IS load-bearing');

    const nBefore = await bodyRuns();
    r = await ins(undefined);
    const nAfter = await bodyRuns();
    rec('TS-2h', 'INSERT with metadata NULL', false, cpe(r), cpe(r) === false,
      '(body ran ' + nBefore + '->' + nAfter + "; TG_OP='INSERT' branch forced it)");

    await client.query('CREATE TEMP TABLE t_nogop (id serial PRIMARY KEY, metadata jsonb) ON COMMIT DROP');
    await client.query([
      'CREATE OR REPLACE FUNCTION pg_temp.f_nogop() RETURNS trigger AS $fn$',
      'BEGIN',
      "  IF OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN",
      "    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb), '{control_pack_evaluated}', 'false');",
      '  END IF;',
      '  RETURN NEW;',
      'END; $fn$ LANGUAGE plpgsql;'
    ].join('\n'));
    await client.query('CREATE TRIGGER trg_nogop BEFORE INSERT OR UPDATE ON t_nogop FOR EACH ROW EXECUTE FUNCTION pg_temp.f_nogop()');
    let skipErr = null;
    let skipRow = null;
    try {
      skipRow = (await client.query('INSERT INTO t_nogop (metadata) VALUES (NULL) RETURNING metadata')).rows[0];
    } catch (e) {
      skipErr = e.message;
    }
    rec('CTRL-2', 'no-TG_OP guard, INSERT metadata NULL', 'silent skip (metadata stays NULL), NO error',
      skipErr ? 'ERROR: ' + skipErr : JSON.stringify(skipRow.metadata),
      skipErr === null && skipRow.metadata === null,
      '=> confirms silent-skip gap AND that a bare/sub-key guard does NOT error on INSERT');

    let insErr = null;
    let insRow = null;
    try {
      insRow = await ins({ control_pack_status: statusAll('evaluated'), note: 'ts-2i' });
    } catch (e) {
      insErr = e.message;
    }
    rec('TS-2i', 'INSERT path succeeds w/o error, derives true', true, insErr ? 'ERROR: ' + insErr : cpe(insRow),
      insErr === null && cpe(insRow) === true);

    r = await ins({ control_pack_status: statusAll('evaluated'), unrelated: 'a' });
    await client.query("UPDATE t_uat_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','false') WHERE id=$1", [r.id]);
    const tampered = (await client.query('SELECT metadata FROM t_uat_runs WHERE id=$1', [r.id])).rows[0].metadata.control_pack_evaluated;
    const nPre = await bodyRuns();
    const j = await client.query("UPDATE t_uat_runs SET metadata = jsonb_set(metadata,'{unrelated}','\"b\"') WHERE id=$1 RETURNING metadata", [r.id]);
    const nPost = await bodyRuns();
    const jVal = j.rows[0].metadata.control_pack_evaluated;
    rec('TS-2j', 'UPDATE unrelated sub-key does NOT recompute', 'unchanged (' + tampered + ') & body runs +0',
      jVal + ' & body runs +' + (nPost - nPre), jVal === tampered && nPost - nPre === 0,
      '=> guard genuinely short-circuits; AC-8 satisfiable');

    await client.query('CREATE TEMP TABLE t_blob (id serial PRIMARY KEY, metadata jsonb) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE t_blob_runs (n int) ON COMMIT DROP');
    await client.query('INSERT INTO t_blob_runs VALUES (0)');
    await client.query([
      'CREATE OR REPLACE FUNCTION pg_temp.f_blob() RETURNS trigger AS $fn$',
      'BEGIN',
      "  IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN",
      '    UPDATE t_blob_runs SET n = n + 1;',
      "    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{control_pack_evaluated}','true');",
      '  END IF;',
      '  RETURN NEW;',
      'END; $fn$ LANGUAGE plpgsql;'
    ].join('\n'));
    await client.query('CREATE TRIGGER trg_blob BEFORE INSERT OR UPDATE ON t_blob FOR EACH ROW EXECUTE FUNCTION pg_temp.f_blob()');
    const b = (await client.query(
      'INSERT INTO t_blob (metadata) VALUES (\'{"control_pack_status":{"a":"evaluated"},"unrelated":"a"}\'::jsonb) RETURNING id'
    )).rows[0];
    await client.query("UPDATE t_blob SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','false') WHERE id=$1", [b.id]);
    const bPre = (await client.query('SELECT n FROM t_blob_runs')).rows[0].n;
    const bRow = (await client.query("UPDATE t_blob SET metadata = jsonb_set(metadata,'{unrelated}','\"b\"') WHERE id=$1 RETURNING metadata", [b.id])).rows[0];
    const bPost = (await client.query('SELECT n FROM t_blob_runs')).rows[0].n;
    rec('CTRL-3', 'whole-blob guard, same unrelated-subkey UPDATE', 'recomputes (+1 body run, value flips back to true)',
      'body runs +' + (bPost - bPre) + ', value=' + bRow.metadata.control_pack_evaluated,
      bPost - bPre === 1 && bRow.metadata.control_pack_evaluated === true,
      '=> pass-4 BLOCKER-2 was real; sub-key scoping is the fix');

    r = await ins({ control_pack_status: statusAll('evaluated') });
    const nX = await bodyRuns();
    await client.query('UPDATE t_uat_runs SET metadata = metadata WHERE id=$1', [r.id]);
    const nY = await bodyRuns();
    rec('EXTRA-1', 'byte-identical UPDATE short-circuits', 0, nY - nX, nY - nX === 0);

    let tErr = null;
    let tRow = null;
    try {
      tRow = await ins({ control_pack_status: 'garbage' });
    } catch (e) {
      tErr = e.message;
    }
    rec('EXTRA-2', 'control_pack_status is a scalar string', false, tErr ? 'ERROR: ' + tErr : cpe(tRow),
      tErr === null && cpe(tRow) === false, '(fails closed, no error)');

    let nuErr = null;
    let nuRow = null;
    try {
      nuRow = await ins({ control_pack_status: null });
    } catch (e) {
      nuErr = e.message;
    }
    rec('EXTRA-3', 'control_pack_status = jsonb null literal', false, nuErr ? 'ERROR: ' + nuErr : cpe(nuRow),
      nuErr === null && cpe(nuRow) === false, '(fails closed, no error)');

    await client.query('ROLLBACK');
    console.log('\nROLLBACK issued - nothing committed.');

    const failed = results.filter((x) => !x.pass);
    console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' checks passed ===');
    if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('FATAL:', e.message);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}
main();
