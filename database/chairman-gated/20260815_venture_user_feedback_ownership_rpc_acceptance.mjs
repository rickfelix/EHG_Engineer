// Behavioural acceptance for database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql
// (SD-LEO-FIX-CLOSE-ANON-VENTURE-001). Modeled directly on the sibling
// 20260812_venture_ingest_key_binding_acceptance.mjs — same baseline/verify discipline, same
// service-role-readback verification, same anon-key .rpc()/.from() surface real callers use.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. fn_submit_venture_user_feedback must be
//                                  unreachable (PGRST202); the OLD venture_user_insert_feedback
//                                  policy must still admit a raw anon user_% INSERT — proof the
//                                  vulnerability this migration closes is genuinely present.
//   node <this file> --verify      AFTER  the apply. Every test below must PASS.
//
// A post-apply green proves nothing on its own unless the baseline first proved the probe CAN
// fail (RPC) / succeed (raw insert). Every write is verified by SERVICE-ROLE READBACK, never by
// trusting the RPC's own reported {ok:true} alone, and cleaned up in a finally block.
//
// ── BLAST RADIUS ──────────────────────────────────────────────────────────────────────────────
// Mints and then deletes a venture_ingest_keys row for one real, dynamically-chosen venture
// (first active venture returned) — same caveat as the sibling script: do not run --verify
// against a venture whose secret a live caller already depends on.

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

const TAG = `qf-304-${Date.now()}`;
const createdFeedbackIds = [];
let venture = null, secret = null;

async function readback(id) {
  const { data, error } = await svc.from('feedback').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`readback failed: ${error.message}`);
  return data;
}

// RCA-304: a `.insert(...).select()` anon call adds `Prefer: return=representation`, which makes
// Postgres ALSO require a SELECT policy to return the row -- anon has none for source_type=
// 'user_feedback' (only telegram_bot_select_feedback, scoped to source_type='telegram'), so THAT
// call fails with the identical generic 42501 regardless of whether the INSERT policy under test
// admitted the row. A false green by construction: it would pass identically before and after this
// migration. Fixed per the repo's established idiom (20260803_bound_anon_ingress_source_type_
// qualifier_acceptance.mjs's probe()): insert BARE (no .select()), decide landed-vs-refused by an
// INDEPENDENT SERVICE-ROLE readback keyed on a distinctive title tag, never by the anon call's own
// response.
async function rawInsertProbe(name) {
  const title = `${TAG} ${name}`;
  await anon.from('feedback').insert({
    venture_id: venture.id, feedback_type: 'user_bug', type: 'issue',
    source_type: 'user_feedback', source_application: 'qf-304-probe', title,
  });
  const { data, error } = await svc.from('feedback').select('id').eq('title', title);
  if (error) throw new Error(`raw-insert-probe readback failed: ${error.message}`);
  if (data?.[0]?.id) createdFeedbackIds.push(data[0].id);
  return { landed: (data?.length || 0) > 0 };
}

async function setup() {
  const { data: ventures, error } = await svc.from('ventures').select('id, name').is('deleted_at', null).limit(1);
  if (error || !ventures || ventures.length < 1) throw new Error('need at least 1 live venture to run this acceptance script');
  [venture] = ventures;
  console.log(`using venture: ${venture.id} (${venture.name})`);

  if (MODE === 'verify') {
    const { data, error: provErr } = await svc.rpc('fn_provision_venture_ingest_key', { p_venture_id: venture.id });
    if (provErr) throw new Error(`provisioning failed in verify mode — the migration may not actually be applied: ${provErr.message}`);
    secret = data;
    console.log(`provisioned secret for venture (length ${secret?.length})`);
  }
}

async function teardown() {
  if (createdFeedbackIds.length) {
    const { error } = await svc.from('feedback').delete().in('id', createdFeedbackIds);
    if (error) console.error(`CLEANUP WARNING: failed to delete probe feedback rows: ${error.message}`);
  }
  if (secret !== null && venture) {
    const { error } = await svc.from('venture_ingest_keys').delete().eq('venture_id', venture.id);
    if (error) console.error(`CLEANUP WARNING: failed to delete provisioned test secret: ${error.message}`);
    else console.log('cleaned up: provisioned test secret deleted');
  }
}

async function runBaseline() {
  console.log('\n--- BASELINE: the fix is absent; the vulnerability it closes is present ---');
  const { error: rpcErr } = await anon.rpc('fn_submit_venture_user_feedback', {
    p_venture_id: venture.id, p_ingest_secret: 'x', p_feedback_type: 'user_bug',
    p_title: 'baseline probe', p_description: 'baseline probe',
  });
  record('fn_submit_venture_user_feedback is unreachable pre-apply', !!rpcErr && /could not find|PGRST202|does not exist/i.test(rpcErr.message || ''), rpcErr?.message);

  const { landed } = await rawInsertProbe('baseline-raw-insert');
  record('pre-apply: raw anon INSERT of a user_% row still succeeds (the open vulnerability)', landed, `landed=${landed}`);
}

async function runVerify() {
  console.log('\n--- VERIFY: post-apply behavioural contract ---');

  // (a) bound key -> success, row readback carries the RPC's own tag (source_type='user_feedback').
  const { data: okResult, error: okErr } = await anon.rpc('fn_submit_venture_user_feedback', {
    p_venture_id: venture.id, p_ingest_secret: secret, p_feedback_type: 'user_bug',
    p_title: 'acceptance probe — safe to delete', p_description: 'acceptance probe',
  });
  record('(a) bound key: valid submission succeeds', !okErr && okResult?.ok === true, okErr?.message);
  if (okResult?.id) {
    createdFeedbackIds.push(okResult.id);
    const row = await readback(okResult.id);
    record('(a) row readback carries the RPC tag (source_type=user_feedback) and server-derived status', row?.source_type === 'user_feedback' && row?.status === 'new', JSON.stringify({ source_type: row?.source_type, status: row?.status }));
  } else {
    record('(a) row readback', false, 'no row id returned — cannot verify');
  }

  // (b) unbound/wrong key -> rejected, no row.
  const { data: badResult, error: badErr } = await anon.rpc('fn_submit_venture_user_feedback', {
    p_venture_id: venture.id, p_ingest_secret: 'not-the-real-secret', p_feedback_type: 'user_bug',
    p_title: 'should be rejected', p_description: 'should be rejected',
  });
  record('(b) unbound key: rejected', !!badErr && (badErr.code === '28000' || /unauthorized/i.test(badErr.message || '')), badErr?.message);
  record('(b) unbound key: no row created', !badResult?.id, badResult?.id);

  // (c) direct anon INSERT bypassing the RPC -> refused now that venture_user_insert_feedback is dropped.
  const { landed } = await rawInsertProbe('verify-raw-insert');
  record('(c) direct anon INSERT of a user_% row is refused (no longer lands)', !landed, `landed=${landed}`);
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
