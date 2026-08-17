#!/usr/bin/env node
// Live-safe, ROLLBACK-guarded dry run for 20260817_fdbk_internal_feedback_rpc.sql.
// Runs the REAL UP file body (function definitions only — its own BEGIN/COMMIT/NOTIFY are
// stripped, this script supplies its own transaction wrapper) against production inside one
// transaction that always ROLLBACKs. Never leaves residue in public.feedback or pg_proc.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractBody(sql) {
  const start = sql.indexOf('BEGIN;');
  const end = sql.lastIndexOf('COMMIT;');
  if (start === -1 || end === -1) throw new Error('Could not locate BEGIN;/COMMIT; markers');
  return sql
    .slice(start + 'BEGIN;'.length, end)
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

  const upSql = readFileSync(join(__dirname, '20260817_fdbk_internal_feedback_rpc.sql'), 'utf8');
  await client.query(extractBody(upSql));
  log.push('Migration functions created inside test transaction');

  const userA = '00000000-0000-0000-0000-0000000000aa';
  const userB = '00000000-0000-0000-0000-0000000000bb';
  const userC = '00000000-0000-0000-0000-0000000000cc';

  // TS-1: critical severity succeeds (the exact severity that fails today)
  await setAuthUser(client, userA);
  let r = await withSavepoint(client, 'TS-1', () =>
    client.query(
      `SELECT public.fn_submit_internal_feedback($1,$2,$3,$4) AS result`,
      ['Critical repro', 'desc', 'issue', 'critical']
    )
  );
  assert(r.ok, 'TS-1 critical severity submit succeeds');
  if (r.ok) {
    // TS-11 (plan_critiques 3ff1325f BLOCK finding): response contract is exactly {ok:true, id:<uuid>}.
    const payload = r.result.rows[0].result;
    const payloadKeys = Object.keys(payload).sort();
    assert(payload.ok === true, `TS-11 response.ok === true (got ${payload.ok})`);
    assert(typeof payload.id === 'string' && payload.id.length > 0, `TS-11 response.id is a non-empty string (got ${JSON.stringify(payload.id)})`);
    assert(payloadKeys.join(',') === 'id,ok', `TS-11 response has exactly {ok, id}, no extra keys (got ${payloadKeys.join(',')})`);

    const row = await client.query(
      `SELECT severity, feedback_type, type, priority, source_type, source_application, user_id, venture_id, status
       FROM public.feedback WHERE id = ($1::jsonb->>'id')::uuid`,
      [payload]
    );
    const f = row.rows[0];
    assert(f.severity === 'critical', `TS-1 severity persisted as critical (got ${f.severity})`);
    assert(f.feedback_type === 'user_bug', `TS-1 feedback_type=user_bug (got ${f.feedback_type})`);
    assert(f.priority === 'P0', `TS-1 priority=P0 (got ${f.priority})`);
    assert(f.source_type === 'manual_feedback', `TS-1 source_type=manual_feedback (got ${f.source_type})`);
    assert(f.source_application === 'EHG', `TS-1 source_application=EHG (got ${f.source_application})`);
    assert(f.user_id === userA, `TS-1 user_id=auth.uid() (got ${f.user_id})`);
    assert(f.venture_id === null, `TS-1 venture_id is NULL (got ${f.venture_id})`);
    assert(f.status === 'new', `TS-1 status=new (got ${f.status})`);
  }

  // TS-2: enhancement mapping
  r = await withSavepoint(client, 'TS-2', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4) AS result`, [
      'Enhancement idea', 'desc', 'enhancement', 'low',
    ])
  );
  assert(r.ok, 'TS-2 enhancement submit succeeds');
  if (r.ok) {
    const row = await client.query(
      `SELECT feedback_type, priority FROM public.feedback WHERE id = ($1::jsonb->>'id')::uuid`,
      [r.result.rows[0].result]
    );
    assert(row.rows[0].feedback_type === 'user_feature_request', `TS-2 feedback_type=user_feature_request (got ${row.rows[0].feedback_type})`);
    assert(row.rows[0].priority === 'P2', `TS-2 enhancement priority=P2 regardless of severity (got ${row.rows[0].priority})`);
  }

  // TS-3: invalid type
  r = await withSavepoint(client, 'TS-3', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'bug', 'medium'])
  );
  assert(!r.ok && r.code === '22004', `TS-3 invalid p_type raises 22004 (got ${r.ok ? 'success' : r.code})`);

  // TS-4: invalid severity
  r = await withSavepoint(client, 'TS-4', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'issue', 'urgent'])
  );
  assert(!r.ok && r.code === '22004', `TS-4 invalid p_severity raises 22004 (got ${r.ok ? 'success' : r.code})`);

  // TS-5: empty title
  r = await withSavepoint(client, 'TS-5', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['', 'd', 'issue', 'medium'])
  );
  assert(!r.ok && r.code === '22004', `TS-5 empty title raises 22004 (got ${r.ok ? 'success' : r.code})`);

  // auth.uid() NULL scenario
  await setAuthUser(client, null);
  r = await withSavepoint(client, 'auth-null', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'issue', 'medium'])
  );
  assert(!r.ok && r.code === '28000', `auth.uid() NULL raises 28000 (got ${r.ok ? 'success' : r.code})`);

  // TS-6/TS-7: per-user rate limit — seed 20 rows for userA (2 already exist from TS-1/TS-2 above),
  // so seed 18 more directly, then the 21st live call (already 20 present) should trip.
  await client.query(
    `INSERT INTO public.feedback (type, feedback_type, source_type, source_application, title, user_id, status)
     SELECT 'issue','user_bug','manual_feedback','EHG','seed-'||g, $1::uuid, 'new'
     FROM generate_series(1,18) g`,
    [userA]
  );
  await setAuthUser(client, userA);
  r = await withSavepoint(client, 'TS-6', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'issue', 'medium'])
  );
  assert(!r.ok && r.code === '53400', `TS-6 per-user rate limit trips at 20 (got ${r.ok ? 'success' : r.code})`);

  await setAuthUser(client, userB);
  r = await withSavepoint(client, 'TS-7', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'issue', 'medium'])
  );
  assert(r.ok, `TS-7 different user under their own limit still succeeds (got ${r.ok ? 'success' : r.code})`);

  // TS-8: global ceiling — pad up to 200 manual_feedback rows total, then a fresh user should trip
  const countRes = await client.query(
    `SELECT count(*)::int AS n FROM public.feedback WHERE source_type = 'manual_feedback' AND created_at > now() - interval '1 hour'`
  );
  const need = Math.max(0, 200 - countRes.rows[0].n);
  if (need > 0) {
    await client.query(
      `INSERT INTO public.feedback (type, feedback_type, source_type, source_application, title, user_id, status)
       SELECT 'issue','user_bug','manual_feedback','EHG','pad-'||g, $1::uuid, 'new'
       FROM generate_series(1,$2) g`,
      [userC, need]
    );
  }
  await setAuthUser(client, userC);
  r = await withSavepoint(client, 'TS-8', () =>
    client.query(`SELECT public.fn_submit_internal_feedback($1,$2,$3,$4)`, ['t', 'd', 'issue', 'medium'])
  );
  assert(!r.ok && r.code === '53400', `TS-8 global ceiling (200/hr) trips (got ${r.ok ? 'success' : r.code})`);

  console.log(JSON.stringify({ pass: allPass, log }, null, 2));
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
