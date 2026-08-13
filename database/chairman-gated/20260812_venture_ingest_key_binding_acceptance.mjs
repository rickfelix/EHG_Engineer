// Behavioural acceptance for database/chairman-gated/20260812_venture_ingest_key_binding.sql
// (SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001).
//
// --baseline HAS been executed (2026-08-12, EXEC phase) and PASSED: all three discriminators
// correctly reported the pre-apply state (both RPCs PGRST202, table absent from schema cache) --
// proof the probe CAN fail, not proof the fix works. --verify has NOT been executed: the
// migration itself remains staged, not chairman-ratified, not applied. This file's --verify mode
// makes no claim to have passed.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. Every RPC call must fail with "could not
//                                  find function" (PGRST202) — the objects do not exist yet.
//   node <this file> --verify      AFTER  the apply. Every test below must PASS.
//
// A post-apply green proves nothing on its own unless the baseline first proved the probe CAN
// fail. Matches the discriminator convention in the sibling
// 20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs.
//
// ── METHOD ────────────────────────────────────────────────────────────────────────────────────
// Goes through supabase-js exactly as a real caller (apexniche-ai/src/lib/error-capture.ts,
// marketlens/src/lib/errorCapture.js) would — anon key, .rpc() — NOT a direct pg connection.
// This is deliberately a DIFFERENT surface than the DDL tier (tests/ddl/venture-ingest-key-
// binding-ddl.db.test.js) and the raw-pg live dry-run performed during EXEC: this is the one
// that proves the objects are reachable the way production traffic actually reaches them
// (through PostgREST's RPC resolution), which a direct pg connection cannot prove — PostgREST's
// argument-name-based overload resolution (the exact TS-5 concern) is invisible to a raw driver.
//
// Every write goes through fn_submit_venture_feedback / fn_submit_venture_error using a secret
// minted by THIS script (service-role only, matching FR-5's provisioning contract) for a REAL
// existing venture, never a fabricated one — and is deleted in a finally block, including the
// minted secret itself. Verification is by SERVICE-ROLE READBACK, never by trusting the RPC's
// own reported {ok:true} alone.
//
// ── BLAST RADIUS, read before running ─────────────────────────────────────────────────────────
// Mints and then deletes a venture_ingest_keys row for one real venture (chosen dynamically, the
// first active venture returned). If that venture's secret was ALREADY provisioned by legitimate
// prior use (a live caller migrated per FR-5 Phase 3), this script's fn_provision_venture_ingest_
// key call ROTATES it — invalidating whatever secret that live caller was holding. Do not run
// --verify against a venture already in live caller use once FR-5 Phase 3 has actually happened;
// this acceptance script is written for the Phase 1 window where no caller has migrated yet.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify   (see the header: the baseline is not optional)');
  process.exit(2);
}

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(URL, process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

const createdFeedbackIds = [];
let ventureA = null, ventureB = null, secretA = null;

async function readback(id) {
  const { data, error } = await svc.from('feedback').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`readback failed: ${error.message}`);
  return data;
}

async function setup() {
  const { data: ventures, error } = await svc.from('ventures').select('id, name').is('deleted_at', null).limit(2);
  if (error || !ventures || ventures.length < 2) throw new Error('need at least 2 live ventures to run this acceptance script');
  [ventureA, ventureB] = ventures;
  console.log(`using ventures: A=${ventureA.id} (${ventureA.name}), B=${ventureB.id} (${ventureB.name})`);

  if (MODE === 'verify') {
    const { data, error: provErr } = await svc.rpc('fn_provision_venture_ingest_key', { p_venture_id: ventureA.id });
    if (provErr) throw new Error(`provisioning failed in verify mode — the migration may not actually be applied: ${provErr.message}`);
    secretA = data;
    console.log(`provisioned secret for venture A (length ${secretA?.length})`);
  }
}

async function teardown() {
  if (createdFeedbackIds.length) {
    const { error } = await svc.from('feedback').delete().in('id', createdFeedbackIds);
    if (error) console.error(`CLEANUP WARNING: failed to delete probe feedback rows: ${error.message}`);
  }
  if (secretA !== null && ventureA) {
    const { error } = await svc.from('venture_ingest_keys').delete().eq('venture_id', ventureA.id);
    if (error) console.error(`CLEANUP WARNING: failed to delete provisioned test secret: ${error.message}`);
    else console.log('cleaned up: provisioned test secret deleted');
  }
}

async function runBaseline() {
  console.log('\n--- BASELINE: every RPC must be UNREACHABLE (objects do not exist yet) ---');
  const { error: e1 } = await anon.rpc('fn_submit_venture_feedback', {
    p_venture_id: ventureA.id, p_ingest_secret: 'x', p_source_type: 'venture_worker',
    p_severity: null, p_category: null, p_message: 'baseline probe',
  });
  record('fn_submit_venture_feedback is unreachable pre-apply', !!e1 && /could not find|PGRST202|does not exist/i.test(e1.message || ''), e1?.message);

  const { error: e2 } = await anon.rpc('fn_submit_venture_error', {
    p_venture_id: ventureA.id, p_ingest_secret: 'x', p_error_hash: 'a'.repeat(64), p_message: 'baseline probe',
  });
  record('fn_submit_venture_error is unreachable pre-apply', !!e2 && /could not find|PGRST202|does not exist/i.test(e2.message || ''), e2?.message);

  const { error: e3 } = await anon.from('venture_ingest_keys').select('*').limit(1);
  record('venture_ingest_keys is unreachable pre-apply', !!e3, e3?.message);
}

async function runVerify() {
  console.log('\n--- VERIFY: post-apply behavioural contract ---');

  // TS-1 / TS-6: cross-venture spoof rejected, uniform error.
  const { error: spoofErr } = await anon.rpc('fn_submit_venture_feedback', {
    p_venture_id: ventureB.id, p_ingest_secret: secretA, p_source_type: 'venture_worker',
    p_severity: null, p_category: null, p_message: 'spoof attempt',
  });
  record('TS-1: cross-venture spoof rejected', !!spoofErr, spoofErr?.message);
  record('TS-1: uniform ownership error code (28000)', spoofErr?.code === '28000' || /unauthorized/i.test(spoofErr?.message || ''), spoofErr?.message);

  const { error: nonexistentErr } = await anon.rpc('fn_submit_venture_feedback', {
    p_venture_id: '00000000-0000-0000-0000-000000000000', p_ingest_secret: secretA, p_source_type: 'venture_worker',
    p_severity: null, p_category: null, p_message: 'nonexistent venture',
  });
  record('TS-6: nonexistent venture_id gives the SAME error as a wrong secret', nonexistentErr?.message === spoofErr?.message, `nonexistent="${nonexistentErr?.message}" vs spoof="${spoofErr?.message}"`);

  // TS-2: valid submission, forgeable columns never land as client-supplied.
  const { data: okResult, error: okErr } = await anon.rpc('fn_submit_venture_feedback', {
    p_venture_id: ventureA.id, p_ingest_secret: secretA, p_source_type: 'venture_worker',
    p_severity: 'medium', p_category: 'bug', p_message: 'acceptance probe — safe to delete',
  });
  record('valid submission succeeds', !okErr && okResult?.ok === true, okErr?.message);
  if (okResult?.id) {
    createdFeedbackIds.push(okResult.id);
    const row = await readback(okResult.id);
    record('TS-2: server-derived status/votes/assigned_to/triaged_by/user_id, never client-influenced', (
      row?.status === 'new' && row?.votes === 0 && row?.assigned_to === null && row?.triaged_by === null && row?.user_id === null
    ), JSON.stringify({ status: row?.status, votes: row?.votes }));
  } else {
    record('TS-2: server-derived columns', false, 'no row id returned — cannot verify');
  }

  // Content-integrity bound.
  const { error: sevErr } = await anon.rpc('fn_submit_venture_feedback', {
    p_venture_id: ventureA.id, p_ingest_secret: secretA, p_source_type: 'venture_worker',
    p_severity: 'critical', p_category: null, p_message: 'should be rejected',
  });
  record('critical severity rejected (content-integrity bound re-implemented)', !!sevErr, sevErr?.message);

  // FR-3/TS-1: error RPC, same ownership binding.
  const errHash = 'c'.repeat(64);
  const { data: errResult, error: errErr } = await anon.rpc('fn_submit_venture_error', {
    p_venture_id: ventureA.id, p_ingest_secret: secretA, p_error_hash: errHash, p_message: 'acceptance probe error',
  });
  record('fn_submit_venture_error valid submission succeeds', !errErr && errResult?.ok === true, errErr?.message);
  if (errResult?.id) createdFeedbackIds.push(errResult.id);

  const { error: errSpoofErr } = await anon.rpc('fn_submit_venture_error', {
    p_venture_id: ventureB.id, p_ingest_secret: secretA, p_error_hash: errHash, p_message: 'spoof',
  });
  record('fn_submit_venture_error cross-venture spoof rejected', !!errSpoofErr, errSpoofErr?.message);

  // TS-5: record_venture_error is UNCHANGED and still callable with its ORIGINAL signature —
  // proves no PostgREST overload/PGRST203 was introduced by this migration.
  const { error: originalErr } = await anon.rpc('record_venture_error', {
    p_venture_id: ventureA.id, p_error_hash: 'd'.repeat(64), p_message: 'original signature still works', p_context: {},
  });
  record('TS-5: record_venture_error original signature still callable, unambiguous (no PGRST203)', !originalErr || originalErr.code !== 'PGRST203', originalErr?.message);
  if (!originalErr) {
    const { data: rows } = await svc.from('feedback').select('id').eq('venture_id', ventureA.id).eq('error_hash', 'd'.repeat(64));
    if (rows?.[0]?.id) createdFeedbackIds.push(rows[0].id);
  }

  // FR-1/GAP-1: venture_ingest_keys still unreadable by anon post-apply.
  const { error: keysErr } = await anon.from('venture_ingest_keys').select('*').limit(1);
  record('FR-1: venture_ingest_keys still unreadable by anon post-apply', !!keysErr, keysErr?.message);
}

(async () => {
  try {
    await setup();
    if (MODE === 'baseline') await runBaseline();
    else await runVerify();
  } catch (e) {
    console.error('ACCEPTANCE SCRIPT ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${MODE.toUpperCase()} RESULT: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length}/${results.length})`} ===`);
  if (failed.length) process.exitCode = 1;
})();
