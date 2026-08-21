// SD-LEO-GEN-STAGE-DECISION-RESTORE-001 -- live probe for the chairman-gated
// solomon_ledger_attestations migration pair. Runs UP inside a transaction, exercises the
// append-only guards + the 2-row attestation content, then ROLLS BACK. Never commits anything.
//
// SAFETY NOTE (the reason this probe exists in this exact shape): unlike an earlier probe this
// session for a DIFFERENT migration (which deliberately omitted its own BEGIN/COMMIT so a probe
// could wrap it directly), THIS migration file follows the real, previously-applied
// database/chairman-gated/20260817_venture_gate_attestations.sql precedent and DOES include its
// own top-level BEGIN;/COMMIT; (apply-migration.js's own BEGIN/COMMIT wrapping absorbs a nested
// BEGIN harmlessly, per empirical trace of apply-migration.js:180-186). If this probe naively
// wrapped the raw file text in its own transaction, the file's own COMMIT; would ACTUALLY COMMIT
// for real, and a later ROLLBACK call would have nothing left to roll back -- the exact class of
// accident a sub-agent hit earlier this session (an inspection action with a real production
// side effect). This probe strips ONLY the file's own top-level BEGIN;/COMMIT; (matched as an
// exact, semicolon-terminated statement alone on its own line) before executing the remainder
// inside ITS OWN transaction, which it always rolls back.
import { createDatabaseClient } from './lib/supabase-connection.js';
import fs from 'node:fs';

const results = [];
function record(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Strips a top-level, semicolon-terminated `BEGIN;` / `COMMIT;` line (transaction control) while
 * leaving every bare PL/pgSQL block-opener `BEGIN` (never followed immediately by `;` on the same
 * line) fully intact. Refuses (throws) if it can't find exactly one of each -- silently stripping
 * zero, or more than expected, would be exactly the kind of blind transformation this repo's own
 * "the obvious fix for a blind guard is usually blind too" lesson warns about.
 */
function stripOuterTransactionControl(sql, path) {
  const beginMatches = [...sql.matchAll(/^\s*BEGIN;\s*$/gm)];
  const commitMatches = [...sql.matchAll(/^\s*COMMIT;\s*$/gm)];
  if (beginMatches.length !== 1) {
    throw new Error(`${path}: expected exactly 1 top-level BEGIN; line, found ${beginMatches.length} -- refusing to strip blindly`);
  }
  if (commitMatches.length !== 1) {
    throw new Error(`${path}: expected exactly 1 top-level COMMIT; line, found ${commitMatches.length} -- refusing to strip blindly`);
  }
  return sql.replace(/^\s*BEGIN;\s*$/m, '-- (BEGIN; stripped by probe -- executing inside the probe\'s own transaction instead)')
    .replace(/^\s*COMMIT;\s*$/m, '-- (COMMIT; stripped by probe -- probe always rolls back)');
}

const client = await createDatabaseClient('engineer', {
  connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
});

try {
  await client.query('BEGIN');

  const upPath = 'database/chairman-gated/20260821_solomon_ledger_attestations.sql';
  const upSqlRaw = fs.readFileSync(upPath, 'utf8');
  const upSql = stripOuterTransactionControl(upSqlRaw, upPath);
  await client.query(upSql);
  record('UP migration executes without error (includes its own self-verification DO block)', true);

  const { rows: attestations } = await client.query(
    `SELECT ledger_row_id, incident_id, attested_by, produced_by, source_citation, findings
     FROM public.solomon_ledger_attestations WHERE incident_id = 'ba330d67' ORDER BY ledger_row_id`,
  );
  record('exactly 2 attestation rows exist for incident ba330d67', attestations.length === 2, `count=${attestations.length}`);

  const ids = attestations.map((r) => r.ledger_row_id).sort();
  record(
    'the 2 rows are exactly the tick-line-verified ids (922f8dfb, 0f9ffc05) -- never the unverified pair',
    JSON.stringify(ids) === JSON.stringify(['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', '922f8dfb-a548-49b4-869e-0f8c7b73fd73']),
    ids.join(', '),
  );

  const citations = attestations.map((r) => r.source_citation);
  record(
    'the 2 rows carry DIFFERENT source_citation text (not a boilerplate string papering over the evidentiary asymmetry)',
    new Set(citations).size === 2,
  );

  // Confirm decision_by itself was NEVER touched by this migration.
  const { rows: ledgerRows } = await client.query(
    `SELECT id, decision_by FROM public.solomon_advice_outcome_ledger WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  record(
    'decision_by for both attested rows is unchanged (still adam-08049808 -- attestation, not restoration)',
    ledgerRows.every((r) => r.decision_by === 'adam-08049808'),
    JSON.stringify(ledgerRows),
  );

  // Append-only guard: TRUNCATE must be rejected. SAVEPOINT-wrapped like every other rejection
  // test below -- a bare failed statement aborts the WHOLE enclosing transaction in Postgres, not
  // just itself, which would poison every check that follows it (caught live by this probe on
  // its first run: "current transaction is aborted, commands ignored until end of transaction
  // block" on the very next statement after an un-savepointed TRUNCATE rejection).
  await client.query('SAVEPOINT before_truncate_probe');
  let truncateBlocked = false;
  try {
    await client.query('TRUNCATE public.solomon_ledger_attestations');
  } catch (e) {
    truncateBlocked = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_truncate_probe');
  record('TRUNCATE is rejected by the statement-level guard', truncateBlocked);

  // Append-only guard: UPDATE must be rejected. Uses a SAVEPOINT so a rejected statement (which
  // aborts the current subtransaction in Postgres) doesn't poison every check after it.
  await client.query('SAVEPOINT before_update_probe');
  let updateBlocked = false;
  try {
    await client.query(
      `UPDATE public.solomon_ledger_attestations SET source_citation = 'tampered' WHERE ledger_row_id = $1`,
      [ids[0]],
    );
  } catch (e) {
    updateBlocked = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_update_probe');
  record('UPDATE is rejected by the append-only trigger', updateBlocked);

  // Append-only guard: DELETE must be rejected.
  await client.query('SAVEPOINT before_delete_probe');
  let deleteBlocked = false;
  try {
    await client.query(`DELETE FROM public.solomon_ledger_attestations WHERE ledger_row_id = $1`, [ids[0]]);
  } catch (e) {
    deleteBlocked = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_delete_probe');
  record('DELETE is rejected by the append-only trigger', deleteBlocked);

  // Generic-actor guard: attested_by='system' must be rejected.
  await client.query('SAVEPOINT before_generic_actor_probe');
  let genericActorBlocked = false;
  try {
    await client.query(
      `INSERT INTO public.solomon_ledger_attestations
         (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
       VALUES ($1, 'probe-verify-live', 'system', 'probe-producer', 'probe://verify', 'probe: generic-actor guard must reject, twenty chars', '{}'::jsonb)`,
      [ids[0]],
    );
  } catch (e) {
    genericActorBlocked = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_generic_actor_probe');
  record('generic-actor guard rejects attested_by=system', genericActorBlocked);

  // Judge-not-producer guard.
  await client.query('SAVEPOINT before_judge_probe');
  let judgeBlocked = false;
  try {
    await client.query(
      `INSERT INTO public.solomon_ledger_attestations
         (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
       VALUES ($1, 'probe-verify-live-2', 'golf-8', 'Golf-8 ', 'probe://verify', 'probe: judge-not-producer guard must reject case/ws evasion', '{}'::jsonb)`,
      [ids[0]],
    );
  } catch (e) {
    judgeBlocked = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_judge_probe');
  record('judge-not-producer guard rejects attester === producer (case/whitespace evasion)', judgeBlocked);

  // Posture: anon/authenticated hold nothing.
  const { rows: [{ v_anon_any, v_authn_any }] } = await client.query(`
    SELECT
      has_table_privilege('anon', 'public.solomon_ledger_attestations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v_anon_any,
      has_table_privilege('authenticated', 'public.solomon_ledger_attestations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v_authn_any
  `);
  record('anon/authenticated hold zero table-level privileges', !v_anon_any && !v_authn_any, `anon=${v_anon_any} authenticated=${v_authn_any}`);

  // A re-application attempt (same file, same rows) must not duplicate -- UNIQUE constraint.
  await client.query('SAVEPOINT before_reapply_probe');
  let reapplyRejected = false;
  try {
    await client.query(
      `INSERT INTO public.solomon_ledger_attestations
         (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
       VALUES ($1, 'ba330d67', 'golf-8', 'incident-ba330d67-damage-manifest', 'x', 'probe: duplicate insert for same (ledger_row_id, incident_id) must be rejected by unique constraint', '{}'::jsonb)`,
      [ids[0]],
    );
  } catch (e) {
    reapplyRejected = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT before_reapply_probe');
  record('duplicate (ledger_row_id, incident_id) insert is rejected (idempotency guard)', reapplyRejected);

  // DOWN exercise: apply DOWN (still inside the same outer transaction -- never committed).
  const downPath = 'database/chairman-gated/20260821_solomon_ledger_attestations_DOWN.sql';
  const downSqlRaw = fs.readFileSync(downPath, 'utf8');
  const downSql = stripOuterTransactionControl(downSqlRaw, downPath);
  await client.query(downSql);
  const { rows: [{ t }] } = await client.query(`SELECT to_regclass('public.solomon_ledger_attestations') AS t`);
  record('DOWN migration drops the table cleanly', t === null);

  await client.query('ROLLBACK');
  console.log('\nrolled back — NO committed change');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('PROBE FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exitCode = 1;
