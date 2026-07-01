// SD-LEO-FIX-GUARD-UNGUARDED-UUID-001: BEGIN...ROLLBACK round-trip validation of
// the 4 SD-completion AFTER triggers guarded by this SD's migrations:
//   record_mttr_on_sd_completion, fn_emit_sd_completed_event (F-1, safe_uuid),
//   fn_auto_close_feedback_on_sd_completion (F-2, outer EXCEPTION guard),
//   try_auto_complete_parent_orchestrator (F-9, outer EXCEPTION guard).
//
// Exercises malformed-metadata / forced-failure conditions against temp SD rows
// inside a single transaction, asserts each completion UPDATE succeeds (instead
// of raising), then ROLLS BACK — zero persistent writes. Proves reversibility via
// a per-function md5 fingerprint before/after.
//
// Modes:
//   --live or SKIP_FN_APPLY=1 (post-apply verification): validates the LIVE functions as deployed.
//   default: CREATE OR REPLACEs all 3 migrations' functions inside the txn first
//       (pre-apply validation of the migrations themselves, before chairman approval).
//
// Usage: npm run validate:trigger-guard-pack            (pre-apply mode)
//        npm run validate:trigger-guard-pack -- --live   (post-apply mode)
//
// Requires SUPABASE_POOLER_URL. Exits non-zero on assertion failure or fingerprint drift.
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config();

const MIGRATIONS = [
  'database/migrations/20260619_uuid_cast_guard_sd_completion.sql',
  'database/migrations/20260621_auto_close_feedback_exception_guard.sql',
  'database/migrations/20260701_guard_orchestrator_auto_complete_exception.sql',
];

const FUNCTIONS = [
  'safe_uuid',
  'record_mttr_on_sd_completion',
  'fn_emit_sd_completed_event',
  'fn_auto_close_feedback_on_sd_completion',
  'try_auto_complete_parent_orchestrator',
];

function extractCreateStatements(sql) {
  const statements = [];
  let idx = 0;
  while (true) {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION', idx);
    if (start < 0) break;
    // Function bodies are $function$ or $safe_uuid$ tagged; find the matching close tag.
    const tagMatch = sql.slice(start).match(/AS \$(\w*)\$/);
    if (!tagMatch) throw new Error('could not find dollar-quote tag after ' + sql.slice(start, start + 80));
    const tag = tagMatch[1];
    const closeMarker = `$${tag}$;`;
    const bodyStart = start + tagMatch.index + tagMatch[0].length;
    const end = sql.indexOf(closeMarker, bodyStart);
    if (end < 0) throw new Error('could not find closing tag $' + tag + '$;');
    statements.push(sql.slice(start, end + closeMarker.length));
    idx = end + closeMarker.length;
  }
  return statements;
}

const c = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
c.on('notice', n => console.log('   [pg notice]', n.message));
await c.connect();

async function fingerprint(fnName) {
  const { rows } = await c.query(
    `SELECT md5(pg_get_functiondef(p.oid)) AS h FROM pg_proc p WHERE p.proname = $1`,
    [fnName]
  );
  return rows[0]?.h ?? null;
}

const before = {};
for (const fn of FUNCTIONS) before[fn] = await fingerprint(fn);
console.log('fingerprints BEFORE:', before);

let failed = false;
try {
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SET LOCAL statement_timeout = '60s'");
  await c.query("SET LOCAL leo.bypass_completion_check = 'true'");

  const live = process.env.SKIP_FN_APPLY === '1' || process.argv.includes('--live');
  if (live) {
    console.log('--live — validating the LIVE functions as deployed (post-apply mode)');
  } else {
    for (const path of MIGRATIONS) {
      const statements = extractCreateStatements(readFileSync(path, 'utf8'));
      for (const stmt of statements) await c.query(stmt);
      console.log(`applied ${statements.length} function(s) from ${path} inside txn`);
    }
  }

  // TS-1: record_mttr_on_sd_completion with a malformed proposal_id.
  const SD1 = 'SD-TEST-GUARDPACK-ROUNDTRIP-001';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, metadata)
     VALUES (gen_random_uuid()::text, $1, 'guard-pack round-trip fixture 1', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test',
        'EHG_Engineer', jsonb_build_object('proposal_id', 'not-a-uuid'))`,
    [SD1]
  );
  await c.query(`UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [SD1]);
  console.log('TS-1: record_mttr_on_sd_completion — malformed proposal_id did not abort completion ✔');

  // TS-2: fn_emit_sd_completed_event with a malformed venture_id.
  const SD2 = 'SD-TEST-GUARDPACK-ROUNDTRIP-002';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, metadata)
     VALUES (gen_random_uuid()::text, $1, 'guard-pack round-trip fixture 2', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test',
        'EHG_Engineer', jsonb_build_object('venture_id', 'also-not-a-uuid'))`,
    [SD2]
  );
  await c.query(`UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [SD2]);
  console.log('TS-2: fn_emit_sd_completed_event — malformed venture_id did not abort completion ✔');

  // TS-5: safe_uuid direct unit assertions.
  const { rows: su } = await c.query(
    `SELECT public.safe_uuid('not-a-uuid') AS bad,
            public.safe_uuid(repeat('-', 36)) AS dashes,
            public.safe_uuid('00000000-0000-0000-0000-000000000000') AS valid`
  );
  if (su[0].bad !== null) throw new Error('safe_uuid did not NULL a malformed value');
  if (su[0].dashes !== null) throw new Error('safe_uuid accepted a 36-dash string');
  if (su[0].valid !== '00000000-0000-0000-0000-000000000000') throw new Error('safe_uuid did not pass through a valid UUID');
  console.log('TS-5: safe_uuid unit assertions ✔');

  // TS-3: fn_auto_close_feedback_on_sd_completion — force a failure inside the guarded
  // UPDATE by temporarily dropping the feedback table's expected column via a savepoint,
  // then confirm the SD completion itself still succeeds (only the trigger's inner UPDATE fails).
  const SD3 = 'SD-TEST-GUARDPACK-ROUNDTRIP-003';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application)
     VALUES (gen_random_uuid()::text, $1, 'guard-pack round-trip fixture 3', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test', 'EHG_Engineer')`,
    [SD3]
  );
  await c.query('SAVEPOINT before_break_feedback');
  await c.query(`ALTER TABLE feedback RENAME COLUMN status TO status_renamed_for_test`);
  await c.query(`UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [SD3]);
  console.log('TS-3: fn_auto_close_feedback_on_sd_completion — forced UPDATE failure (renamed column) did not abort completion ✔');
  await c.query('ROLLBACK TO SAVEPOINT before_break_feedback');

  // TS-4: try_auto_complete_parent_orchestrator — force complete_orchestrator_sd() to
  // raise by pointing a child at a non-existent parent_sd_id that satisfies
  // is_orchestrator_sd() via a throwaway orchestrator fixture, then break the RPC path
  // by renaming it away transactionally, confirming the CHILD's own completion still succeeds.
  const PARENT = 'SD-TEST-GUARDPACK-ROUNDTRIP-PARENT';
  const CHILD = 'SD-TEST-GUARDPACK-ROUNDTRIP-CHILD';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, current_phase)
     VALUES (gen_random_uuid()::text, $1, 'guard-pack parent fixture', 'fixture', 'fixture', 'active', 'orchestrator', 'quality_assurance', 'low', 'test', 'EHG_Engineer', 'EXEC')`,
    [PARENT]
  );
  const { rows: prow } = await c.query(`SELECT id FROM strategic_directives_v2 WHERE sd_key=$1`, [PARENT]);
  // Parent is in EXEC (past LEAD_APPROVAL), so enforce_child_creation_timing allows the
  // child to be inserted directly as 'active' — no intermediate draft->active transition
  // (which would double-fire the handoff-logging trigger within the same millisecond).
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, parent_sd_id, relationship_type)
     VALUES (gen_random_uuid()::text, $1, 'guard-pack child fixture', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test', 'EHG_Engineer', $2, 'child')`,
    [CHILD, prow[0].id]
  );
  await c.query('SAVEPOINT before_break_orchestrator_rpc');
  await c.query(`ALTER FUNCTION complete_orchestrator_sd(varchar) RENAME TO complete_orchestrator_sd_renamed_for_test`);
  await c.query(`UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [CHILD]);
  console.log('TS-4: try_auto_complete_parent_orchestrator — forced complete_orchestrator_sd() failure did not abort child completion ✔');
  await c.query('ROLLBACK TO SAVEPOINT before_break_orchestrator_rpc');
} catch (e) {
  failed = true;
  console.error('ROUND-TRIP FAILED:', e.message);
} finally {
  await c.query('ROLLBACK');
  console.log('rolled back');
}

const after = {};
for (const fn of FUNCTIONS) after[fn] = await fingerprint(fn);
console.log('fingerprints AFTER :', after);

let drift = false;
for (const fn of FUNCTIONS) {
  if (before[fn] !== after[fn]) {
    console.error(`✗ FINGERPRINT CHANGED for ${fn} — INVESTIGATE`);
    drift = true;
  }
}
if (!drift) console.log('reversibility ✔ (all fingerprints byte-identical, pre/post-rollback)');

await c.end();
if (failed || drift) process.exitCode = 1;
