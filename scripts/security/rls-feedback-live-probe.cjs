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
 * FIXED (SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 T-4/TR-5): assertPrecondition's exec_sql call used
 * `{ sql: ... }`, which does not match the live RPC's real parameter name `sql_text` — PostgREST
 * 404'd on every run and the `if (error) return;` swallowed it silently, so this drift guard has
 * NEVER actually executed despite the header above claiming "TEETH". Fixed to `{ sql_text: ... }`
 * and a failed read now THROWS rather than silently no-op'ing, so a future signature drift fails
 * loud, not silently, again. Fixing the call shape surfaced a SECOND, previously-invisible bug
 * (exactly the risk this SD's own PRD flagged): public.exec_sql RETURNS TABLE(result jsonb), one
 * row whose single column holds the ENTIRE aggregated result as a JSON array — `data` is
 * `[{ result: [...] }]`, not one row per policy. The original `data.map(r => r.policyname)` would
 * have silently produced an empty/garbage policy list forever, DRIFTED-failing on every run, had
 * the call-shape bug ever been fixed without also fixing this. Also split EXPECTED_INSERT_POLICIES:
 * telegram_bot_insert_feedback is
 * measured (not hard-asserted) via ALWAYS_EXPECTED_INSERT_POLICIES + a live pg_policies read —
 * once SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001's migration is chairman-applied, the ONE case whose
 * premise depends on that policy granting the row SKIPs rather than FAILs.
 *
 * CORRECTED (DATABASE sub-agent finding, SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 EXEC review):
 * anon_feedback_ingress_bounds is RESTRICTIVE (measured live via the `permissive` column), not a
 * fallback PERMISSIVE grant — it narrows whatever a PERMISSIVE policy already authorized, and it
 * was already constraining telegram_bot_insert_feedback's writes before that migration, and
 * continues to constrain venture_user_insert_feedback's writes after. The severity/category CASES
 * below therefore do NOT need telegram_bot_insert_feedback to exist — they only need a row shaped
 * to satisfy venture_user_insert_feedback (a real venture_id) so the RESTRICTIVE bound is actually
 * reached and still provably fires post-migration. Only the plain "source_type='telegram'" case is
 * genuinely telegram_bot_insert_feedback-dependent (nothing else grants that exact shape) and is
 * the ONLY one gated to SKIP.
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
    expect: VERDICT.OPEN, needsVenture: false, requiresTelegramPolicy: true,
    row: (m) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug' }) },
  { name: "telegram + severity='critical', venture-owned",
    because: 'the RESTRICTIVE anon_feedback_ingress_bounds bars critical/high regardless of which permissive policy would otherwise grant — venture-owned so the RESTRICTIVE bound stays exercised even after telegram_bot_insert_feedback is dropped (it was never a fallback grant)',
    expect: VERDICT.REFUSED, needsVenture: true,
    row: (m, v) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug', venture_id: v, severity: 'critical' }) },
  { name: "telegram + category='chairman_decision_deferred', venture-owned",
    because: 'the RESTRICTIVE bounds bar that category regardless of which permissive policy would otherwise grant — venture-owned so the bound stays exercised post-drop too',
    expect: VERDICT.REFUSED, needsVenture: true,
    row: (m, v) => ({ ...base(m), source_type: 'telegram', feedback_type: 'user_bug', venture_id: v, category: 'chairman_decision_deferred' }) },
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
  // telegram_bot_insert_feedback is MEASURED, not hard-asserted: SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001
  // drops it via chairman-gated migration, and the CASES whose premise depends on it granting the row
  // must SKIP once that lands, not FAIL forever.
  const ALWAYS_EXPECTED_INSERT_POLICIES = ['insert_feedback_policy', 'venture_user_insert_feedback'];
  // SECURITY sub-agent finding (EXEC review, condition C5): the old query filtered
  // permissive='PERMISSIVE', which structurally EXCLUDES anon_feedback_ingress_bounds — the one
  // RESTRICTIVE policy the severity/category CASES below depend on continuing to bound every anon
  // INSERT. Its silent removal would previously have gone undetected by this drift guard.
  const ALWAYS_EXPECTED_RESTRICTIVE_POLICY = 'anon_feedback_ingress_bounds';
  let telegramPolicyPresent = true; // conservative default until measured below
  const assertPrecondition = async () => {
    const { data, error } = await service.rpc('exec_sql', {
      sql_text: "select policyname, permissive from pg_policies where schemaname='public' and tablename='feedback' and cmd='INSERT'",
    });
    if (error) {
      // FIXED (T-4): this used to be `if (error) return;`, silently no-op'ing on the exec_sql
      // call-shape bug and making this drift guard never actually run. A failed policy-set read
      // must not be treated as "policies unchanged" — it means this guard cannot see the truth.
      throw new Error(`assertPrecondition: exec_sql RPC failed (${error.code ?? 'no code'}): ${error.message}`);
    }
    // SECOND bug found only once the call-shape fix let this code path actually execute (measured
    // live, not assumed): public.exec_sql RETURNS TABLE(result jsonb) — one row whose single
    // column is the WHOLE query's aggregated JSON array, not one row per policy. `data` is
    // therefore `[{ result: [...] }]`; the policy rows live at `data[0].result`.
    const rows = data?.[0]?.result || [];
    const permissiveNames = rows.filter((r) => r.permissive === 'PERMISSIVE').map((r) => r.policyname).sort();
    const restrictiveNames = rows.filter((r) => r.permissive === 'RESTRICTIVE').map((r) => r.policyname).sort();

    const missing = ALWAYS_EXPECTED_INSERT_POLICIES.filter((p) => !permissiveNames.includes(p));
    if (missing.length) throw new Error(`policy set DRIFTED — missing PERMISSIVE INSERT policies: ${missing.join(', ')}. Predictions in this file were derived from the old set.`);

    if (!restrictiveNames.includes(ALWAYS_EXPECTED_RESTRICTIVE_POLICY)) {
      throw new Error(`policy set DRIFTED — missing RESTRICTIVE INSERT policy: ${ALWAYS_EXPECTED_RESTRICTIVE_POLICY}. The severity/category CASES in this file rely on it continuing to bound every anon INSERT.`);
    }

    telegramPolicyPresent = permissiveNames.includes('telegram_bot_insert_feedback');
  };

  // Measured once, up front, so the per-case SKIP decision below has the flag before the loop runs.
  // runProbe() also invokes this same callback again per case (unchanged behavior) — that re-confirms
  // the same live state rather than trusting a snapshot taken before any writes in this run.
  await assertPrecondition();

  let ventureId = null;
  const { data: ventures } = await service.from('ventures').select('id,status').eq('status', 'active').limit(1);
  if (ventures && ventures.length) ventureId = ventures[0].id;

  let failures = 0;
  let skipped = 0;
  for (const c of CASES) {
    if (c.requiresTelegramPolicy && !telegramPolicyPresent) {
      console.log(`SKIP  ${c.name} — telegram_bot_insert_feedback has been revoked (SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001); this case's premise no longer applies`);
      skipped++;
      continue;
    }
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
