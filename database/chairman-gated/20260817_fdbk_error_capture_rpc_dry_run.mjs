#!/usr/bin/env node
// Live-safe, ROLLBACK-guarded dry run for 20260817_fdbk_error_capture_rpc.sql.
// Runs the REAL UP file body (index + function definitions only — its own BEGIN/COMMIT/NOTIFY are
// stripped, this script supplies its own transaction wrapper) against production inside one
// transaction that always ROLLBACKs. Never leaves residue in public.feedback or pg_proc/pg_index.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractBody(sql) {
  // Anchored to column 0 so this matches ONLY a real (uncommented) statement line -- the file's
  // trailing "manual rollback" block contains "-- COMMIT;" (a comment), and a naive
  // lastIndexOf('COMMIT;') matches that substring too, silently truncating the body AFTER the
  // real COMMIT; -- which then executes mid-batch and commits the outer transaction early,
  // producing "SAVEPOINT can only be used in transaction blocks" (25P01) on the first savepoint.
  const startMatch = sql.match(/^BEGIN;\s*$/m);
  const endMatch = sql.match(/^COMMIT;\s*$/m);
  if (!startMatch || !endMatch) throw new Error('Could not locate BEGIN;/COMMIT; markers');
  return sql
    .slice(startMatch.index + startMatch[0].length, endMatch.index)
    .replace(/^SET LOCAL lock_timeout = '5s';\s*/m, '') // this script sets its own
    .replace(/NOTIFY pgrst, 'reload schema';\s*/g, ''); // no-op inside a txn that always rolls back
}

async function withSavepoint(client, label, fn) {
  await client.query('SAVEPOINT sp');
  try {
    const result = await fn();
    await client.query('RELEASE SAVEPOINT sp');
    return { ok: true, result };
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT sp');
    return { ok: false, code: err.code, message: err.message };
  }
}

async function setAuthUser(client, uuid) {
  if (uuid === null) {
    await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  } else {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uuid }),
    ]);
  }
}

const log = [];
let allPass = true;
function assert(cond, msg) {
  log.push(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) allPass = false;
}

const client = await createDatabaseClient('engineer', { verify: false });
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL lock_timeout = '5s'`);

  const upSql = readFileSync(join(__dirname, '20260817_fdbk_error_capture_rpc.sql'), 'utf8');
  await client.query(extractBody(upSql));
  log.push('Migration index + functions created inside test transaction');

  const authedUser = '00000000-0000-0000-0000-0000000000ee';

  // TS-1a (anon): basic submit succeeds, server-computed fields correct, severity NOT clamped
  // (input is 'medium', within the allowed range unclamped).
  await setAuthUser(client, null);
  let r = await withSavepoint(client, 'TS-1a', () =>
    client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, [
      'anon smoke-test error', 'at foo.js:1', '/dashboard', 'medium', JSON.stringify({ user_agent: 'test-ua', promote_payload: { sdType: 'feature' }, category: 'corrective_finding' }),
    ])
  );
  assert(r.ok, `TS-1a anon submit succeeds (got ${r.ok ? 'success' : r.code + ' ' + r.message})`);
  let newRowId = null;
  if (r.ok) {
    const payload = r.result.rows[0].result;
    assert(payload.ok === true, 'TS-1a response.ok === true');
    assert(typeof payload.id === 'string', 'TS-1a response.id is a string');
    newRowId = payload.id;
    const row = await client.query(
      `SELECT status, source_type, feedback_type, user_id, venture_id, page_url, severity, error_hash, occurrence_count, metadata, category
       FROM public.feedback WHERE id = $1::uuid`,
      [newRowId]
    );
    const f = row.rows[0];
    assert(f.status === 'new', `TS-1a status=new (got ${f.status})`);
    assert(f.source_type === 'error_capture', `TS-1a source_type=error_capture (got ${f.source_type})`);
    assert(f.feedback_type === 'sentry_error', `TS-1a feedback_type=sentry_error (got ${f.feedback_type})`);
    assert(f.user_id === null, `TS-1a anon caller -> user_id NULL (got ${f.user_id})`);
    assert(f.venture_id === null, `TS-1a venture_id NULL (got ${f.venture_id})`);
    assert(f.severity === 'medium', `TS-1a severity=medium unclamped (got ${f.severity})`);
    assert(f.occurrence_count === 1, `TS-1a occurrence_count=1 on first insert (got ${f.occurrence_count})`);
    assert(typeof f.error_hash === 'string' && f.error_hash.length === 64, `TS-1a error_hash is server-computed 64-hex (got ${f.error_hash})`);
    // TS-7: category/promote_payload injection surface -- must be stripped/never set
    assert(f.category === null || f.category === undefined, `TS-7 category never set from client input (got ${JSON.stringify(f.category)})`);
    assert(f.metadata.promote_payload === undefined, `TS-7 metadata.promote_payload stripped, not persisted (got ${JSON.stringify(f.metadata)})`);
    assert(f.metadata.user_agent === 'test-ua', `TS-7 allow-listed metadata key (user_agent) IS persisted (got ${JSON.stringify(f.metadata)})`);
  }

  // TS-1b (authenticated): user_id populated from auth.uid()
  await setAuthUser(client, authedUser);
  r = await withSavepoint(client, 'TS-1b', () =>
    client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, [
      'authed smoke-test error, distinct message', null, null, 'low', '{}',
    ])
  );
  assert(r.ok, `TS-1b authenticated submit succeeds (got ${r.ok ? 'success' : r.code})`);
  if (r.ok) {
    const payload = r.result.rows[0].result;
    const row = await client.query(`SELECT user_id FROM public.feedback WHERE id = $1::uuid`, [payload.id]);
    assert(row.rows[0].user_id === authedUser, `TS-1b authenticated caller -> user_id = auth.uid() (got ${row.rows[0].user_id})`);
  }

  // TS-1c: severity clamp -- critical/high are ALWAYS forced to medium, regardless of caller identity
  await setAuthUser(client, null);
  r = await withSavepoint(client, 'TS-1c', () =>
    client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, [
      'clamp-test distinct message', null, null, 'critical', '{}',
    ])
  );
  assert(r.ok, 'TS-1c submit with severity=critical still succeeds (not rejected)');
  if (r.ok) {
    const payload = r.result.rows[0].result;
    const row = await client.query(`SELECT severity FROM public.feedback WHERE id = $1::uuid`, [payload.id]);
    assert(row.rows[0].severity === 'medium', `TS-1c severity=critical is CLAMPED to medium, never stored as critical (got ${row.rows[0].severity})`);
  }

  // TS-3: invalid severity enum value rejected
  r = await withSavepoint(client, 'TS-3', () =>
    client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5)`, ['t', null, null, 'urgent', '{}'])
  );
  assert(!r.ok && r.code === '22004', `TS-3 invalid severity enum raises 22004 (got ${r.ok ? 'success' : r.code})`);

  // TS-4: empty message rejected
  r = await withSavepoint(client, 'TS-4', () =>
    client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5)`, ['', null, null, 'medium', '{}'])
  );
  assert(!r.ok && r.code === '22004', `TS-4 empty message raises 22004 (got ${r.ok ? 'success' : r.code})`);

  // TS-2: dedup -- an IDENTICAL (message, stack_trace) pair increments occurrence_count on the SAME
  // row rather than inserting a new one.
  await setAuthUser(client, null);
  const dedupMsg = ['dedup-test-message', 'stack-A', null, 'medium', '{}'];
  // Both calls must run inside the SAME savepoint (no rollback between them) to observe
  // accumulation -- withSavepoint's RELEASE (not ROLLBACK) on success keeps prior effects, so an
  // extra call here before this one would double-count occurrence_count.
  r = await withSavepoint(client, 'TS-2-pair', async () => {
    const first = await client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, dedupMsg);
    const second = await client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, dedupMsg);
    return { first, second };
  });
  assert(r.ok, `TS-2 dedup pair both succeed (got ${r.ok ? 'success' : r.code + ' ' + r.message})`);
  if (r.ok) {
    const firstId = r.result.first.rows[0].result.id;
    const secondId = r.result.second.rows[0].result.id;
    assert(firstId === secondId, `TS-2 second identical-fingerprint call returns the SAME row id, not a new one (first=${firstId} second=${secondId})`);
    assert(r.result.second.rows[0].result.deduped === true, 'TS-2 second call reports deduped:true');
    const row = await client.query(`SELECT occurrence_count FROM public.feedback WHERE id = $1::uuid`, [firstId]);
    assert(row.rows[0].occurrence_count === 2, `TS-2 occurrence_count incremented to 2 after the duplicate (got ${row.rows[0].occurrence_count})`);
  }

  // TS-2 negative control: two DISTINCT fingerprints in the same window produce TWO separate rows,
  // not deduped against each other -- proves dedup is keyed on fingerprint, not a blanket ceiling.
  r = await withSavepoint(client, 'TS-2-negative-control', async () => {
    const a = await client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, ['distinct-error-A', null, null, 'medium', '{}']);
    const b = await client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, ['distinct-error-B', null, null, 'medium', '{}']);
    return { a, b };
  });
  assert(r.ok, 'TS-2 negative control pair both succeed');
  if (r.ok) {
    const idA = r.result.a.rows[0].result.id;
    const idB = r.result.b.rows[0].result.id;
    assert(idA !== idB, `TS-2 negative control: two DISTINCT errors get two DIFFERENT row ids (got ${idA} vs ${idB})`);
  }

  // Isolation vs record_venture_error: a synthetic venture_id-IS-NULL, feedback_type='venture_error'
  // row (mirroring the 16 real TS-fixture rows already live in this DB from that sibling RPC's own
  // test suite) must NOT be counted by this function's storm check, and must NOT collide with this
  // function's own unique index -- proves the feedback_type predicate genuinely isolates the two
  // mechanisms' overlapping source_type/venture_id domain.
  r = await withSavepoint(client, 'TS-isolation', async () => {
    await client.query(
      `INSERT INTO public.feedback (
         type, feedback_type, source_type, source_application, title, description, severity, status,
         venture_id, error_hash, occurrence_count, first_seen, last_seen, metadata
       ) VALUES (
         'issue', 'venture_error', 'error_capture', 'isolation-test-fixture', 'unrelated venture error',
         'unrelated venture error', 'low', 'new', NULL, $1, 1, now(), now(), '{}'
       )`,
      ['ff'.repeat(32)] // distinct from the watermark sentinel and from any real error_hash below
    );
    const stormBefore = await client.query(`SELECT public.check_error_capture_storm() AS tripped`);
    const call = await client.query(`SELECT public.fn_submit_error_capture($1,$2,$3,$4,$5) AS result`, [
      'isolation-test message', null, null, 'medium', '{}',
    ]);
    return { stormBefore, call };
  });
  assert(r.ok, `TS-isolation: unrelated venture_error fixture + real submit both succeed (got ${r.ok ? 'success' : r.code + ' ' + r.message})`);
  if (r.ok) {
    assert(r.result.stormBefore.rows[0].tripped === false, 'TS-isolation: storm check ignores the unrelated feedback_type=venture_error row (not tripped by 1 unrelated row)');
    assert(r.result.call.rows[0].result.ok === true, 'TS-isolation: fn_submit_error_capture succeeds without colliding against the unrelated venture_error row');
  }

  console.log(JSON.stringify({ pass: allPass, log }, null, 2));
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
