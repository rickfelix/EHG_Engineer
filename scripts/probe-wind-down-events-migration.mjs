// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 — live probe for the chairman-gated worker_wind_down_events
// migration pair. Runs UP inside a transaction, exercises insert + dedup_key collision +
// RLS/grant posture, then ROLLS BACK. Never commits anything. Mirrors the probe pattern used by
// scripts/probe-eva-scheduler-hygiene-migrations.mjs / scripts/probe-purge-migration.mjs.
import { createDatabaseClient } from './lib/supabase-connection.js';
import fs from 'node:fs';

const results = [];
function record(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// SECURITY evidence (d0547fd5): a defensive guard against ever executing a migration file that
// contains its OWN COMMIT/BEGIN — this probe's entire safety property rests on being the only
// thing that opens/closes the transaction. Every migration file in this repo is required to omit
// explicit BEGIN/COMMIT (apply-migration.js owns the transaction) — this just makes that
// assumption an explicit, checked precondition here too, not merely an unenforced convention.
//
// Must NOT match a PL/pgSQL block's bare `BEGIN` (as in `DO $$ BEGIN ... END $$;`) — that BEGIN
// opens a procedural block, not a transaction, and this migration legitimately contains two of
// them (the idempotent-constraint DO block and the self-verification DO block). The reliable
// discriminator: real transaction-control BEGIN/COMMIT/START TRANSACTION always terminate that
// same statement with `;` right there (optionally via TRANSACTION/WORK) — a PL/pgSQL block-opening
// BEGIN is never itself followed directly by `;`.
function assertNoOwnTransactionControl(sql, path) {
  if (/^\s*(BEGIN\s*(TRANSACTION|WORK)?\s*;|START\s+TRANSACTION\b[^;]*;|COMMIT\s*(TRANSACTION|WORK)?\s*;)/im.test(sql)) {
    throw new Error(`${path}: contains its own BEGIN/COMMIT/START TRANSACTION — refusing to execute inside this probe's transaction`);
  }
}

const client = await createDatabaseClient('engineer', {
  connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
});

try {
  await client.query('BEGIN');

  const upPath = 'database/migrations/20260821_worker_wind_down_events.sql';
  const upSql = fs.readFileSync(upPath, 'utf8');
  assertNoOwnTransactionControl(upSql, upPath);
  await client.query(upSql);
  record('UP migration executes without error (includes its own self-verification DO block)', true);

  // Insert exercise: a normal row succeeds, app-computed dedup_key matching the hook's own
  // `${sessionId}::${reason}::${at.slice(0,16)}` contract.
  const minuteBucket = new Date().toISOString().slice(0, 16);
  const dedupKey1 = `probe-session::signaled::${minuteBucket}`;
  const ins1 = await client.query(
    `INSERT INTO public.worker_wind_down_events (session_id, reason, had_claim, dedup_key)
     VALUES ('probe-session', 'signaled', true, $1) RETURNING id, dedup_key`,
    [dedupKey1],
  );
  record('insert succeeds with an app-supplied dedup_key', ins1.rows.length === 1 && ins1.rows[0].dedup_key === dedupKey1,
    `dedup_key=${ins1.rows[0]?.dedup_key}`);

  // Dedup collision exercise: the SAME dedup_key on a second insert must violate the UNIQUE
  // constraint (23505), matching the hook's "double-fire in the same minute" contract. A failed
  // statement poisons the rest of the enclosing transaction in Postgres, so this is wrapped in
  // its own SAVEPOINT — rolled back after capturing the error code — so the checks that follow
  // can still run inside the same outer (still-uncommitted) transaction.
  await client.query('SAVEPOINT collision_probe');
  let collisionCode = null;
  try {
    await client.query(
      `INSERT INTO public.worker_wind_down_events (session_id, reason, had_claim, dedup_key)
       VALUES ('probe-session', 'signaled', false, $1)`,
      [dedupKey1],
    );
  } catch (e) {
    collisionCode = e.code;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT collision_probe');
  }
  record('a repeated dedup_key collides on the UNIQUE constraint (23505)', collisionCode === '23505', `code=${collisionCode}`);

  // Posture exercise: anon/authenticated must NOT be able to insert.
  const anonIns = await client.query(
    `SELECT has_table_privilege('anon', 'public.worker_wind_down_events', 'INSERT') AS anon_ins,
            has_table_privilege('authenticated', 'public.worker_wind_down_events', 'INSERT') AS authn_ins`,
  );
  const { anon_ins: anonInsert, authn_ins: authnInsert } = anonIns.rows[0];
  record('anon has no table-level INSERT privilege', anonInsert === false);
  record('authenticated has no table-level INSERT privilege', authnInsert === false);

  const rls = await client.query(
    `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.worker_wind_down_events'::regclass`,
  );
  record('RLS is enabled', rls.rows[0]?.relrowsecurity === true);

  // Different reason in the same minute must NOT collide (dedup_key includes reason).
  const dedupKey2 = `probe-session::no_claim_idle::${minuteBucket}`;
  const ins2 = await client.query(
    `INSERT INTO public.worker_wind_down_events (session_id, reason, had_claim, dedup_key)
     VALUES ('probe-session', 'no_claim_idle', false, $1) RETURNING id`,
    [dedupKey2],
  );
  record('a different reason in the same session/minute does NOT collide', ins2.rows.length === 1);

  // DOWN exercise: apply DOWN (still inside the same outer transaction — never committed).
  const downPath = 'database/migrations/20260821_worker_wind_down_events_DOWN.sql';
  const downSql = fs.readFileSync(downPath, 'utf8');
  assertNoOwnTransactionControl(downSql, downPath);
  await client.query(downSql);
  const afterDown = await client.query(`SELECT to_regclass('public.worker_wind_down_events') AS t`);
  record('DOWN migration drops the table cleanly', afterDown.rows[0]?.t === null);

  await client.query('ROLLBACK');
  console.log('\nrolled back — NO committed change');
} catch (e) {
  try { await client.query('ROLLBACK'); } catch { /* already rolled back or connection gone */ }
  console.error('PROBE FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map((f) => f.label).join(', ')}`);
  process.exitCode = 1;
}
