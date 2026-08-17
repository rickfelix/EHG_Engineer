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
// ── KNOWN SCOPE LIMITATIONS, STATED EXPLICITLY RATHER THAN SILENTLY OMITTED ─────────────────────
// The migration's policy is anon-only (TO anon) -- an EXEC-phase correction; an earlier draft was
// TO anon, authenticated, but FeedbackWidget.tsx (the caller that draft was widened for) sets
// neither venture_id nor feedback_type, so it cannot satisfy this policy's WITH CHECK at any role
// scope regardless. There is therefore no authenticated leg for this script to probe -- the
// migration's own DO $verify$ block instead asserts NEGATIVELY that authenticated does NOT hold
// EXECUTE on either function this policy's WITH CHECK depends on (check (e)), which this script
// does not duplicate.
//
// AC-5 (the per-venture rate limit) is NOT live-probed here -- tripping it for real means exceeding
// check_feedback_rate_limit's live threshold (a flat count(*) >= 50 per venture per hour, scoped to
// feedback_type LIKE 'user_%' -- confirmed via pg_get_functiondef; this is a DIFFERENT function and
// threshold from anon_feedback_ingress_bounds's fn_anon_ingress_prior_hour_count, which is tiered
// 250/200/50 by source_type -- SECURITY sub-agent finding, evidence 71204b61-e78f-4231-8c9e-89fa6f3728bd,
// an earlier draft of this comment misattributed the tiered thresholds to this function), which is
// slow and writes real load against a function this migration does not modify. This script relies
// on check_feedback_rate_limit's own pre-existing, unmodified behavior instead of re-proving it.
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
  // Capture (never discard) the anon insert's own reported error. A missing EXECUTE grant on a
  // WITH CHECK function and a correctly-bounded rejection both produce `landed: false` on their
  // own -- without the error text, they're indistinguishable from this script's own output, which
  // is exactly the gap that let an earlier draft of the paired migration ship silently inert
  // (TESTING sub-agent finding, evidence 731d79a4-5498-4bd7-8628-427dbc31d3dc). A genuine RLS
  // WITH CHECK rejection reports 42501 with no further detail; a missing-EXECUTE failure also
  // reports 42501 but names the function in its message -- logged here so a future regression is
  // diagnosable from this script's own output instead of requiring a fresh investigation.
  const { error: insertError } = await anon.from('feedback').insert({
    venture_id: venture.id, feedback_type: 'user_bug', type: 'issue',
    source_type: 'manual_feedback', source_application: 'sd-fdbk-fix-critical-probe',
    title, severity: 'medium', status: 'new',
    ...overrides,
  });
  if (insertError) console.log(`    (anon insert reported: ${insertError.code || '?'} ${insertError.message})`);
  const { data, error } = await svc.from('feedback').select('id').eq('title', title);
  if (error) throw new Error(`raw-insert-probe readback failed: ${error.message}`);
  if (data?.[0]?.id) createdFeedbackIds.push(data[0].id);
  return { landed: (data?.length || 0) > 0, insertError };
}

async function setup() {
  // .order('id') -- a baseline run and a later verify run must probe the SAME venture, or a
  // passing verify could just mean the second venture behaves differently, not that the fix
  // works (TESTING sub-agent finding, evidence 731d79a4). limit(1) with no ORDER BY has no
  // guaranteed stable result across two separate connections/runs.
  const { data: ventures, error } = await svc.from('ventures').select('id, name').is('deleted_at', null).order('id').limit(1);
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

  // Known non-discriminating probe (TESTING sub-agent finding, evidence 731d79a4): the FK on
  // feedback.venture_id refuses a nonexistent UUID on its own, so this passes whether or not
  // venture_exists_and_active's own predicate is reached at all. It does NOT distinguish "the
  // policy correctly refused this" from "the FK refused this before the policy was even
  // evaluated." A genuinely discriminating case (a real, soft-deleted venture -- passes the FK,
  // should fail venture_exists_and_active specifically) is not probed here; left as a known gap
  // rather than adding a soft-deleted-venture fixture to keep this script's own footprint minimal.
  const ac4b = await rawInsertProbe('ac4b-fake-venture', { venture_id: '00000000-0000-4000-8000-000000000000' });
  record('AC-4b: a nonexistent venture_id is ABSENT (non-discriminating -- see comment above)', !ac4b.landed);

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
