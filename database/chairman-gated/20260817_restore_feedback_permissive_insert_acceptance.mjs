// Behavioural acceptance for database/chairman-gated/20260817_restore_feedback_permissive_insert.sql
// (SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001, Remedy B). Modeled directly on the sibling
// 20260815_venture_user_feedback_ownership_rpc_acceptance.mjs -- same baseline/verify discipline,
// same service-role-readback verification (never trust the anon/authenticated call's own reported
// status), same probe-then-cleanup shape.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. The CONTROL probe must be ABSENT on readback
//                                  (proof the defect this migration fixes is genuinely present).
//   node <this file> --verify      AFTER  the apply. CONTROL must LAND; every AC-* must be ABSENT.
//
// ── KNOWN SCOPE LIMITATION, STATED EXPLICITLY RATHER THAN SILENTLY OMITTED ──────────────────────
// This script only exercises the ANON leg of the new policy (TO anon, authenticated). Probing the
// AUTHENTICATED leg genuinely (a real Supabase Auth session, not `SET LOCAL ROLE`, which per this
// repo's own established gotcha proves EXECUTE grants only -- postgres bypasses RLS and role GUCs
// are not re-applied, producing a false green) requires test user credentials this script does not
// have wired. The authenticated-role SHAPE is instead verified structurally by the migration's own
// in-transaction DO $verify$ block (check (a): polroles contains exactly {anon, authenticated}) --
// that is a real, load-bearing check, just not a live behavioral probe. Before relying on this
// acceptance script alone as proof FeedbackWidget.tsx (an authenticated caller) actually works,
// also run a real authenticated-session probe manually or extend this script with test credentials.
//
// ── BLAST RADIUS ──────────────────────────────────────────────────────────────────────────────
// Inserts and deletes tagged probe rows in public.feedback for one real, dynamically-chosen active
// venture. Does not touch venture_ingest_keys or any RPC (this migration is independent of Remedy A).

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

const TAG = `sd-fdbk-fix-critical-${Date.now()}`;
const createdFeedbackIds = [];
let venture = null;

async function rawInsertProbe(name, overrides = {}) {
  const title = `${TAG} ${name}`;
  await anon.from('feedback').insert({
    venture_id: venture.id, feedback_type: 'user_bug', type: 'issue',
    source_type: 'manual_feedback', source_application: 'sd-fdbk-fix-critical-probe',
    title, severity: 'medium', status: 'new',
    ...overrides,
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
}

async function teardown() {
  if (createdFeedbackIds.length) {
    const { error } = await svc.from('feedback').delete().in('id', createdFeedbackIds);
    if (error) console.error(`CLEANUP WARNING: failed to delete probe feedback rows: ${error.message}`);
    else console.log(`cleaned up: ${createdFeedbackIds.length} probe row(s) deleted`);
  }
}

async function runBaseline() {
  console.log('\n--- BASELINE: the fix is absent; the defect it closes is present ---');
  const control = await rawInsertProbe('control-baseline');
  record('CONTROL is ABSENT pre-apply (proves the defect is real)', !control.landed,
    control.landed ? 'unexpected: control LANDED before the migration applied -- baseline is void, do not trust a post-apply green' : undefined);
}

async function runVerify() {
  console.log('\n--- VERIFY: the fix is applied ---');

  const control = await rawInsertProbe('control-verify');
  record('CONTROL lands post-apply (proves the probe can pass at all)', control.landed);

  const ac1 = await rawInsertProbe('ac1-venture-error', { feedback_type: 'venture_error' });
  record('AC-1: feedback_type=venture_error is ABSENT (preserves TS-5, tests/integration/venture-error-aggregation.db.test.js)', !ac1.landed);

  const ac2a = await rawInsertProbe('ac2a-critical', { severity: 'critical' });
  record('AC-2a: severity=critical is ABSENT (anon_feedback_ingress_bounds still bounds this policy)', !ac2a.landed);

  const ac2b = await rawInsertProbe('ac2b-high', { severity: 'high' });
  record('AC-2b: severity=high is ABSENT', !ac2b.landed);

  const ac3 = await rawInsertProbe('ac3-deferred', { severity: 'low', category: 'chairman_decision_deferred' });
  record('AC-3: category=chairman_decision_deferred is ABSENT even at severity=low', !ac3.landed);

  const ac4a = await rawInsertProbe('ac4a-null-venture', { venture_id: null });
  record('AC-4a: venture_id=NULL is ABSENT', !ac4a.landed);

  const ac4b = await rawInsertProbe('ac4b-fake-venture', { venture_id: '00000000-0000-4000-8000-000000000000' });
  record('AC-4b: a nonexistent venture_id is ABSENT', !ac4b.landed);

  // AC-6: service_role bypasses RLS entirely (rolbypassrls=true) -- confirm this policy change
  // did not somehow affect that, since it would be a much larger, unrelated failure.
  const svcTitle = `${TAG} ac6-service-role`;
  const { error: svcErr } = await svc.from('feedback').insert({
    venture_id: venture.id, feedback_type: 'user_bug', type: 'issue',
    source_type: 'manual_feedback', source_application: 'sd-fdbk-fix-critical-probe',
    title: svcTitle, severity: 'critical', category: 'chairman_decision_deferred', status: 'new',
  }).select('id');
  if (!svcErr) {
    const { data } = await svc.from('feedback').select('id').eq('title', svcTitle);
    if (data?.[0]?.id) createdFeedbackIds.push(data[0].id);
  }
  record('AC-6: service-role insert of category=chairman_decision_deferred still SUCCEEDS (rolbypassrls unaffected)', !svcErr, svcErr?.message);
}

(async () => {
  try {
    await setup();
    if (MODE === 'baseline') await runBaseline();
    else await runVerify();
  } finally {
    await teardown();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${MODE.toUpperCase()}: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error('ACCEPTANCE SCRIPT ERROR:', err?.message || err);
  process.exit(2);
});
