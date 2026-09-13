import { createDatabaseClient } from '../lib/supabase-connection.js';

const REQ = ['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'];

// PRD-specified corrected predicate: all 4 keys PRESENT AND none === 'not_attempted'
const FN_CORRECT = `
CREATE OR REPLACE FUNCTION pg_temp.derive_correct() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE k text; st jsonb; ok boolean := true;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    st := NEW.metadata->'control_pack_status';
    IF st IS NULL OR jsonb_typeof(st) <> 'object' THEN
      ok := false;
    ELSE
      FOREACH k IN ARRAY ARRAY['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'] LOOP
        IF NOT (st ? k) OR st->>k = 'not_attempted' THEN ok := false; END IF;
      END LOOP;
    END IF;
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb), '{control_pack_evaluated}', to_jsonb(ok));
    NEW.fired := COALESCE(NEW.fired,0) + 1;
  END IF;
  RETURN NEW;
END; $f$;`;

const FN_BARE = `
CREATE OR REPLACE FUNCTION pg_temp.derive_bare() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb), '{touched}', 'true'::jsonb);
  END IF;
  RETURN NEW;
END; $f$;`;

async function sp(c, label, fn) {
  const n = 'sp_' + Math.random().toString(36).slice(2,8);
  await c.query(`SAVEPOINT ${n}`);
  try { const r = await fn(); await c.query(`RELEASE SAVEPOINT ${n}`); return { ok:true, r }; }
  catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${n}`); return { ok:false, err: e.message, code: e.code }; }
}

const c = await createDatabaseClient();
await c.query('BEGIN');
try {
  const v = await c.query('SHOW server_version');
  console.log('PG server_version =', v.rows[0].server_version);

  await c.query(`CREATE TEMP TABLE t_probe (id serial primary key, metadata jsonb, fired int) ON COMMIT DROP`);

  // ---- TEST A: bare OLD guard on BEFORE INSERT OR UPDATE ----
  await c.query(FN_BARE);
  await c.query(`CREATE TRIGGER trg_bare BEFORE INSERT OR UPDATE ON t_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.derive_bare()`);
  const A = await sp(c, 'bare-insert', () => c.query(`INSERT INTO t_probe (metadata) VALUES ('{"a":1}'::jsonb) RETURNING metadata`));
  console.log('\n[A] BARE `IF OLD.metadata IS DISTINCT FROM NEW.metadata` on INSERT =>',
    A.ok ? 'NO ERROR; metadata=' + JSON.stringify(A.r.rows[0].metadata) : 'ERROR ' + A.code + ': ' + A.err);
  await c.query(`DROP TRIGGER trg_bare ON t_probe`);

  // ---- TEST B: corrected guard, fixture matrix ----
  await c.query(FN_CORRECT);
  await c.query(`CREATE TRIGGER trg_ok BEFORE INSERT OR UPDATE ON t_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.derive_correct()`);

  const fixtures = [
    ['AC-2 live-84d310e1 shape (3 of 4 not_attempted)', {fence_two_sidedness:'not_attempted',canary_mutation_control:'not_attempted',live_deployment_binding:'not_attempted',minimum_assertion_manifest:'evaluated'}, false],
    ['AC-3 all 4 evaluated (clean pass)', Object.fromEntries(REQ.map(k=>[k,'evaluated'])), true],
    ['AC-6 one waived + three evaluated', {fence_two_sidedness:'waived: chairman ruling 1234',canary_mutation_control:'evaluated',live_deployment_binding:'evaluated',minimum_assertion_manifest:'evaluated'}, true],
    ['KEY-ABSENT (3 present evaluated, 1 key missing)', {fence_two_sidedness:'evaluated',canary_mutation_control:'evaluated',live_deployment_binding:'evaluated'}, false],
    ['EMPTY control_pack_status {}', {}, false],
  ];
  console.log('\n[B] corrected predicate fixture matrix (via INSERT path):');
  const ids = {};
  for (const [name, st, expect] of fixtures) {
    const r = await sp(c, name, () => c.query(`INSERT INTO t_probe (metadata) VALUES (jsonb_build_object('control_pack_status', $1::jsonb, 'other', 'x')) RETURNING id, metadata`, [JSON.stringify(st)]));
    if (!r.ok) { console.log(`   FAIL(error) ${name}: ${r.err}`); continue; }
    const got = r.r.rows[0].metadata.control_pack_evaluated;
    ids[name] = r.r.rows[0].id;
    console.log(`   ${got===expect?'PASS':'*** MISMATCH ***'}  ${name}: expected=${expect} got=${got}`);
  }

  // ---- TEST C: AC-7 INSERT path succeeds without error (already proven above), AC-8 UPDATE short-circuit ----
  const ins = await c.query(`INSERT INTO t_probe (metadata, fired) VALUES (jsonb_build_object('control_pack_status', $1::jsonb, 'unrelated','v1'), 0) RETURNING id, metadata, fired`, [JSON.stringify(Object.fromEntries(REQ.map(k=>[k,'evaluated'])))]);
  const rid = ins.rows[0].id;
  console.log('\n[C] AC-7 INSERT fully-evaluated => control_pack_evaluated =', ins.rows[0].metadata.control_pack_evaluated, '| fired =', ins.rows[0].fired);

  // UPDATE that does NOT touch metadata at all
  const u1 = await c.query(`UPDATE t_probe SET fired = fired WHERE id=$1 RETURNING metadata, fired`, [rid]);
  console.log('[C] AC-8a UPDATE not touching metadata => fired =', u1.rows[0].fired, '(unchanged=1 means guard short-circuited)');

  // UPDATE that changes an UNRELATED metadata sub-key (this is the literal AC-8 wording)
  const u2 = await c.query(`UPDATE t_probe SET metadata = jsonb_set(metadata,'{unrelated}','"v2"') WHERE id=$1 RETURNING metadata, fired`, [rid]);
  console.log('[C] AC-8b UPDATE changing UNRELATED metadata sub-key => fired =', u2.rows[0].fired, '| control_pack_evaluated =', u2.rows[0].metadata.control_pack_evaluated);

  console.log('\n[D] AC-8 literal-wording check: does changing an unrelated metadata sub-key short-circuit?',
    u2.rows[0].fired === u1.rows[0].fired ? 'YES (did not recompute)' : 'NO -- guard DOES recompute (fired incremented)');

} finally {
  await c.query('ROLLBACK');
  await c.end();
  console.log('\n-- transaction ROLLED BACK, nothing persisted --');
}
