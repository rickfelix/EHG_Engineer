import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const UP = readFileSync('database/chairman-gated/20260912_venture_channel_publish_ledger_execution_mode.sql', 'utf8');
const client = await createDatabaseClient();
const log = [];
let sp = 0;
async function tryQ(c, sql, params) {
  const n = `sp_${++sp}`;
  await c.query(`SAVEPOINT ${n}`);
  try { await c.query(sql, params); await c.query(`RELEASE SAVEPOINT ${n}`); return { ok: true }; }
  catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${n}`); return { ok: false, code: e.code, message: e.message }; }
}
try {
  await client.query('BEGIN');
  const cons = await client.query(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='public.venture_channel_publish_ledger'::regclass ORDER BY conname`);
  log.push('CONSTRAINTS: ' + cons.rows.map(r => `${r.conname}=${r.def}`).join(' | '));

  const vid = randomUUID();
  await client.query(`SET LOCAL session_replication_role = 'replica'`);
  await client.query(`INSERT INTO ventures (id,name,problem_statement,is_demo,status,current_lifecycle_stage,launch_mode) VALUES ($1,$2,'sec-verify fixture, rolled back',false,'active',24,'live')`, [vid, `sec-verify-${vid}`]);
  await client.query(`SET LOCAL session_replication_role = 'origin'`);

  // (A) duplicate correlation_id -> UNIQUE violation? (the SEC-M2 reorder replay scenario)
  const corr = `${vid}:c1:x:dupe`;
  const ins = (c) => tryQ(client, `INSERT INTO venture_channel_publish_ledger (venture_id,channel_type,content_ref,correlation_id,decision,decision_by,decision_at) VALUES ($1,'x','c1',$2,'accepted','system:autonomous',now())`, [vid, c]);
  const a1 = await ins(corr); const a2 = await ins(corr);
  log.push(`(A) 1st insert ok=${a1.ok}; 2nd SAME correlation_id ok=${a2.ok} code=${a2.code || '-'} msg=${(a2.message||'').slice(0,90)}`);

  // (B) post-migration: does a writer that OMITS execution_mode (stale negative probe cache) fail?
  await client.query(UP);
  log.push('(B) execution_mode migration applied in-txn');
  const b1 = await tryQ(client, `INSERT INTO venture_channel_publish_ledger (venture_id,channel_type,content_ref,correlation_id,decision,decision_by,decision_at) VALUES ($1,'x','c2',$2,'accepted','system:autonomous',now())`, [vid, `${vid}:c2:x:nostamp`]);
  log.push(`(B) INSERT omitting execution_mode (probe-degraded payload): ok=${b1.ok} code=${b1.code || '-'} msg=${(b1.message||'').slice(0,120)}`);
  const b2 = await tryQ(client, `INSERT INTO venture_channel_publish_ledger (venture_id,channel_type,content_ref,correlation_id,decision,decision_by,decision_at,execution_mode) VALUES ($1,'x','c3',$2,'accepted','system:autonomous',now(),'live')`, [vid, `${vid}:c3:x:stamped`]);
  log.push(`(B) INSERT WITH execution_mode='live': ok=${b2.ok} code=${b2.code || '-'}`);
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
console.log(log.join('\n'));
console.log('\nALL ROLLED BACK — nothing persisted.');
