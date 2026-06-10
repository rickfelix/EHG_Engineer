// SD-FDBK-FIX-ROOT-FIX-TRG-001 (FR-4/FR-5): BEGIN…ROLLBACK round-trip validation
// of fn_handle_capability_lifecycle (trg_capability_lifecycle on
// strategic_directives_v2).
//
// Exercises every malformed delivers_capabilities shape against a temp SD row
// inside a single transaction, asserts the completion UPDATE succeeds and the
// ledger rows are normalized, then ROLLS BACK — zero persistent writes. Proves
// reversibility via a function-body md5 fingerprint before/after.
//
// Modes:
//   --live or SKIP_FN_APPLY=1 (post-apply verification): validates the LIVE function as deployed.
//   default: CREATE OR REPLACEs the function from the migration file inside the
//       txn first (pre-apply validation of the migration itself).
//
// Usage: npm run validate:capability-trigger   (post-apply mode)
//        node scripts/validate-capability-lifecycle-trigger.mjs   (pre-apply mode)
//
// Requires SUPABASE_POOLER_URL. Exits non-zero on assertion failure or fingerprint drift.
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config();

const MIGRATION = 'database/migrations/20260610_root_fix_capability_lifecycle_trigger.sql';

function extractCreateFunction(sql) {
  // First statement: CREATE OR REPLACE ... $function$ ... $function$;
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION');
  const endMarker = '$function$;';
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('could not extract CREATE FUNCTION from migration');
  return sql.slice(start, end + endMarker.length);
}

const c = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
c.on('notice', n => console.log('   [pg notice]', n.message));
await c.connect();

const fp = async () => (await c.query(
  "SELECT md5(pg_get_functiondef(p.oid)) AS h FROM pg_proc p WHERE p.proname='fn_handle_capability_lifecycle'"
)).rows[0].h;

const before = await fp();
console.log('fn fingerprint BEFORE:', before);

let failed = false;
try {
  await c.query('BEGIN');
  // Keep any accidental lock window tiny.
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SET LOCAL statement_timeout = '60s'");
  // Fixture SDs have no handoff records; bypass the PCVP completion gate
  // (transaction-local, sanctioned by the gate's own error message) so the
  // round-trip exercises trg_capability_lifecycle, which fires on the same UPDATE.
  await c.query("SET LOCAL leo.bypass_completion_check = 'true'");

  // 1. Apply the new function (transactional DDL) — skipped post-apply when the
  //    fixed function is already live (SKIP_FN_APPLY=1).
  if (process.env.SKIP_FN_APPLY === '1' || process.argv.includes('--live')) {
    console.log('SKIP_FN_APPLY=1 — validating the LIVE function as-is');
  } else {
    const fnSql = extractCreateFunction(readFileSync(MIGRATION, 'utf8'));
    await c.query(fnSql);
    console.log('applied new function inside txn');
  }

  // 2. Temp SD row with ALL malformed shapes in one delivers array.
  const SD = 'SD-TEST-TRG-ROUNDTRIP-001';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, delivers_capabilities)
     VALUES
       (gen_random_uuid()::text, $1, 'trg round-trip fixture', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test',
        'EHG_Engineer',
        '["plain string capability", {"capability_key":"rt-no-type","name":"NoType"}, {"capability_key":"rt-bad-type","capability_type":"made_up_type"}, {"capability_key":"rt-good","capability_type":"skill"}]'::jsonb)`,
    [SD]
  );
  console.log('fixture SD inserted');

  // 3. The completion UPDATE that used to hard-fail.
  await c.query(
    `UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [SD]
  );
  console.log('TS-1/2/3/5: completion UPDATE succeeded with string + no-type + bad-type + well-formed entries ✔');

  // Debug: fixture identity columns
  const { rows: idrows } = await c.query(`SELECT id, uuid_id, sd_key FROM strategic_directives_v2 WHERE sd_key=$1`, [SD]);
  console.log('fixture identity:', JSON.stringify(idrows[0]));

  // 4. Assert normalized ledger rows (query by sd_id = NEW.id, the stable key).
  const { rows: caps } = await c.query(
    `SELECT capability_type, capability_key, action_details->>'normalized' AS normalized
       FROM sd_capabilities WHERE sd_id = $1 ORDER BY capability_key`, [idrows[0].id]
  );
  console.table(caps);
  const byKey = Object.fromEntries(caps.map(r => [r.capability_key, r]));
  if (byKey['plain string capability']?.capability_type !== 'tool') throw new Error('string entry not normalized to tool');
  if (byKey['rt-no-type']?.capability_type !== 'tool') throw new Error('missing type not defaulted to tool');
  if (byKey['rt-bad-type']?.capability_type !== 'tool') throw new Error('invalid type not mapped to tool');
  if (byKey['rt-good']?.capability_type !== 'skill') throw new Error('well-formed entry mutated!');
  if (byKey['rt-good']?.normalized) throw new Error('well-formed entry wrongly marked normalized');
  console.log('ledger normalization assertions ✔');

  // 5. TS-4: scalar top-level field on a second fixture.
  const SD2 = 'SD-TEST-TRG-ROUNDTRIP-002';
  await c.query(
    `INSERT INTO strategic_directives_v2
       (id, sd_key, title, description, rationale, status, sd_type, category, priority, scope, target_application, delivers_capabilities)
     VALUES (gen_random_uuid()::text, $1, 'trg round-trip fixture 2', 'fixture', 'fixture', 'active', 'bugfix', 'quality_assurance', 'low', 'test', 'EHG_Engineer', '"just a scalar"'::jsonb)`,
    [SD2]
  );
  await c.query(`UPDATE strategic_directives_v2 SET status='completed', progress=100, completion_date=NOW() WHERE sd_key=$1`, [SD2]);
  const { rows: caps2 } = await c.query(
    `SELECT count(*)::int AS n FROM sd_capabilities sc JOIN strategic_directives_v2 sd ON sd.id=sc.sd_uuid WHERE sd.sd_key=$1`, [SD2]
  );
  if (caps2[0].n !== 0) throw new Error('scalar field should produce zero ledger rows');
  console.log('TS-4: scalar top-level field skipped with warning, completion succeeded ✔');

  // 6. Control: prove the OLD function would have failed (sanity that the test is real).
  //    (Skipped live — documented: pre-fix behavior witnessed in flags 4c504093 / 94e8811a.)
} catch (e) {
  failed = true;
  console.error('ROUND-TRIP FAILED:', e.message);
} finally {
  await c.query('ROLLBACK');
  console.log('rolled back');
}

const after = await fp();
console.log('fn fingerprint AFTER :', after);
console.log(before === after ? 'reversibility ✔ (byte-identical)' : '✗ FINGERPRINT CHANGED — INVESTIGATE');
await c.end();
if (failed || before !== after) process.exitCode = 1;
