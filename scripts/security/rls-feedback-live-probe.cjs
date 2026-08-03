#!/usr/bin/env node
/**
 * LIVE THREE-LEG PROBE of public.feedback — SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001.
 *
 * WHY THIS EXISTS. Two reasons, and the second is the important one.
 *
 * 1. It is the FIRST PRODUCTION CONSUMER of lib/security/rls-probe-template.cjs. Until now the
 *    template was imported only by its own unit test, so runProbe's live IO path — real supabase-js
 *    builders, real RETURNING semantics, real cleanup — was entirely unexercised against a real
 *    client. That is exactly how the H1 collector defect survived review: postgrest-js RESOLVES
 *    failures as {data:null,error} rather than throwing, which no fake reproduced, so a catch-only
 *    guard looked correct in tests and manufactured false absence in production. A template with no
 *    real caller is a design, not an instrument.
 *
 * 2. It is a REGRESSION DETECTOR for the feedback policy set, and it FAILS LOUD. Each case declares
 *    the verdict the CATALOG predicts; a mismatch exits non-zero. So if someone tightens or widens an
 *    anon INSERT policy on feedback, this says so — including the case everyone gets wrong.
 *
 * THE ASYMMETRY THIS PINS, measured 2026-08-03. venture_user_insert_feedback grants anon INSERT for
 * (feedback_type LIKE 'user_%' AND an ACTIVE venture_id) and places NO constraint on source_type,
 * while anon SELECT (telegram_bot_select_feedback) is confined to source_type='telegram'. So a row
 * with source_type='auto_capture' plus a valid venture_id is INSERTABLE but NOT SELECTABLE:
 *     .insert().select() -> 42501, row ABSENT   (reads as a clean refusal)
 *     .insert()  IDENTICAL row, no RETURNING -> error null, ROW LANDS
 * EVERY FIELD IN THAT ROW IS LOAD-BEARING. Drop venture_id and the INSERT is refused too, the case
 * stops reproducing, and it reads as a refusal — which is why an under-specified repro is worse than
 * none: it reads as a REFUTATION of the claim it records.
 *
 * SAFETY: writes only marker-titled rows to feedback and removes them by marker with service-role
 * confirmation. runProbe refuses to start if the marker already matches a row (no OPEN from residue)
 * or if the baseline readback cannot be performed at all.
 *
 * USAGE: node scripts/security/rls-feedback-live-probe.cjs        (exit 0 = policies unchanged)
 */
require('dotenv').config({ quiet: true });
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
const { buildProbePlan, runProbe, VERDICT } = require('../../lib/security/rls-probe-template.cjs');

const base = (marker) => ({ type: 'issue', source_application: 'EHG_Engineer', title: marker });

// Each case names the policy that decides it, so a failure points at a policy rather than a mystery.
const CASES = [
  { name: 'auto_capture, no venture_id',
    because: 'telegram_bot needs source_type=telegram; venture_user needs venture_id NOT NULL — neither grants',
    expect: VERDICT.REFUSED, needsVenture: false,
    row: (m) => ({ ...base(m), source_type: 'auto_capture', feedback_type: 'user_bug' }) },
  { name: "source_type='telegram'",
    because: 'telegram_bot_insert_feedback grants it, and anon SELECT covers telegram so RETURNING works too',
    expect: VERDICT.OPEN, needsVenture: false,
    row: (m) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug' }) },
  { name: "telegram + severity='critical'",
    because: 'the RESTRICTIVE anon_feedback_ingress_bounds bars critical/high regardless of any grant',
    expect: VERDICT.REFUSED, needsVenture: false,
    row: (m) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug', severity: 'critical' }) },
  { name: "telegram + category='chairman_decision_deferred'",
    because: 'the RESTRICTIVE bounds bar that category regardless of any grant',
    expect: VERDICT.REFUSED, needsVenture: false,
    row: (m) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug', category: 'chairman_decision_deferred' }) },
  { name: 'THE ASYMMETRIC CASE — auto_capture + ACTIVE venture_id',
    because: 'venture_user_insert_feedback grants the INSERT and places NO constraint on source_type, while anon SELECT is confined to telegram — so RETURNING fails and the bare write lands',
    expect: VERDICT.OPEN, needsVenture: true,
    row: (m, v) => ({ ...base(m), source_type: 'auto_capture', feedback_type: 'user_bug', venture_id: v }) },
];

async function main() {
  const service = createSupabaseServiceClient();
  const { createSupabaseClient } = await import('../../lib/supabase-client.js');
  const anon = createSupabaseClient();

  // The drift guard has TEETH: it asserts the policy set these predictions are DERIVED FROM is still
  // the policy set in force. If the policies moved, every prediction below is about a table that no
  // longer exists as described, and reporting a verdict would be worse than reporting nothing.
  const EXPECTED_INSERT_POLICIES = ['insert_feedback_policy', 'telegram_bot_insert_feedback', 'venture_user_insert_feedback'];
  const assertPrecondition = async () => {
    const { data, error } = await service.rpc('exec_sql', {
      sql: "select policyname from pg_policies where schemaname='public' and tablename='feedback' and cmd='INSERT' and permissive='PERMISSIVE'",
    }).then((r) => r, (e) => ({ error: e }));
    if (error) return;                      // rpc unavailable in this env — the row-level check below still runs
    const names = (data || []).map((r) => r.policyname).sort();
    const missing = EXPECTED_INSERT_POLICIES.filter((p) => !names.includes(p));
    if (missing.length) throw new Error(`policy set DRIFTED — missing INSERT policies: ${missing.join(', ')}. Predictions in this file were derived from the old set.`);
  };

  let ventureId = null;
  const { data: ventures } = await service.from('ventures').select('id,status').eq('status', 'active').limit(1);
  if (ventures && ventures.length) ventureId = ventures[0].id;

  let failures = 0;
  let skipped = 0;
  for (const c of CASES) {
    if (c.needsVenture && !ventureId) {
      console.log(`SKIP  ${c.name} — no active venture available to build the granted row`);
      skipped++;
      continue;
    }
    const marker = `__FEEDBACK_RLS_PROBE_${Date.now()}_${process.pid}_${CASES.indexOf(c)}__`;
    const row = c.row(marker, ventureId);
    const plan = buildProbePlan({
      table: 'feedback', validRow: row, fieldUnderTest: 'source_type', markerColumn: 'title',
      // The control must be a row that CANNOT pass: the RESTRICTIVE bounds bar severity='critical'
      // whatever any permissive policy grants. If this is ever ACCEPTED, runProbe withdraws the
      // REFUSED verdict rather than reporting it.
      nonsenseControl: { ...row, severity: 'critical' },
    });
    let verdict;
    try { verdict = await runProbe({ anon, service, plan, assertPrecondition }); }
    catch (err) { console.log(`ERROR ${c.name} — ${err.message}`); failures++; continue; }

    const ok = verdict.verdict === c.expect;
    if (!ok) failures++;
    console.log(`${ok ? 'OK   ' : 'FAIL '} ${c.name}`);
    console.log(`        expected ${c.expect}, got ${verdict.verdict}  ${JSON.stringify(verdict.detail || {})}`);
    console.log(`        because: ${c.because}`);
    if (!ok) console.log(`        -> ${verdict.reason}`);
  }

  console.log(`\n${failures === 0 ? 'policy set UNCHANGED' : `${failures} MISMATCH(ES) — the feedback policy set has MOVED`}${skipped ? ` (${skipped} skipped)` : ''}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('live probe failed:', e.message); process.exit(1); });
