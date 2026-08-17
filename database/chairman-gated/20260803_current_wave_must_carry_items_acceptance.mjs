// Behavioural acceptance for
// database/chairman-gated/20260803_current_wave_must_carry_items.sql
// (SD-LEO-INFRA-PLAN-POSITION-READABLE-001, FR-2). Authored 2026-08-17 by
// SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001 (FR-2), which found the UP file had no acceptance
// script when re-scoping this migration for ceremony N+1.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. Writes .artifacts/current-wave-must-carry-
//                                  items-baseline.json (mechanism presence, live Wave-0 precondition
//                                  state).
//   node <this file> --verify      AFTER  the apply. Compares live state against the saved
//                                  baseline; the mechanism must now be PRESENT.
//   node <this file> --self-test   Fixture-only, zero DB/network dependency. Proves the invariant
//                                  predicate logic (mirrors the trigger's own IF conditions)
//                                  independent of live catalog observability.
//
// ── KNOWN LIMITATION ─────────────────────────────────────────────────────────────────────────
// This script verifies MECHANISM PRESENCE (trigger + function exist with the right shape) and
// reports the live PRECONDITION state (does any approved, time_horizon='now' wave currently hold
// zero items). It does NOT behaviourally fire the trigger by inserting/updating a real row —
// doing so against production roadmap_waves would itself be a mutating action this prep-only
// script must not take. The UP file's own header names the precondition violation (Wave 0) as a
// PLAN decision, not an engineering one; this script surfaces the live state so the ceremony
// operator can decide, it does not resolve it.
//
// KNOWN LIMITATION (adversarial review, PR #7172 round 3, INFO-level): fetchMechanismState's
// query is not schema-qualified (no pg_namespace.nspname='public' filter) and inspects only
// rows[0] with no ORDER BY. A same-named trigger on a same-named table in a different schema
// would satisfy the check while public.roadmap_waves has none. Accepted as low-likelihood in
// this database rather than fixed, to avoid unbounded scope on a prep-only verification script.
//
// ── WHY A CATALOG READ, NOT A LIVE INSERT/UPDATE PROBE ──────────────────────────────────────────
// pg_trigger/pg_proc ARE the exact catalog rows Postgres consults to fire the constraint trigger —
// reading them directly confirms the mechanism exists and is wired to the right table/event/timing,
// without needing to actually mutate public.roadmap_waves (which --verify must never do; this is a
// prep/verification artifact, not an apply path).
//
// ── BLAST RADIUS ───────────────────────────────────────────────────────────────────────────────
// None in --baseline/--verify: every live query is a read-only SELECT via exec_sql (which itself
// rejects non-SELECT/WITH statements). --self-test makes zero network calls. Nothing is created,
// inserted, updated, or deleted by this script.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(REPO_ROOT, '.artifacts', 'current-wave-must-carry-items-baseline.json');

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : process.argv.includes('--self-test') ? 'self-test'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify | --self-test   (the baseline is not optional for --verify)');
  process.exit(2);
}

const supabase = MODE === 'self-test' ? null : createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Single-line SQL only — the exec_sql RPC wrapper falsely rejects multi-line/indented text
 *  with a 42501 "only allows SELECT/WITH" error (same constraint documented in the DEFACL
 *  acceptance script's mechanism-verification note). */
async function q(sql_text) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql_text.replace(/\s+/g, ' ').trim() });
  if (error) throw new Error(`exec_sql failed: ${error.message || JSON.stringify(error)}`);
  return data?.[0]?.result ?? data;
}

/** Mechanism presence: does the constraint trigger + its function exist, wired to the right
 *  table/event/timing? */
async function fetchMechanismState() {
  const rows = await q(`
    select t.tgname, c.relname as table_name, p.proname as function_name,
           t.tgdeferrable, t.tginitdeferred,
           pg_get_triggerdef(t.oid) as definition
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where t.tgname = 'trg_current_wave_carries_items' and not t.tgisinternal
  `);
  return rows;
}

/** Live precondition state: any approved, time_horizon='now' wave holding zero items would make
 *  the trigger reject the FIRST update to that wave once applied. Read-only; never resolved here. */
async function fetchPreconditionState() {
  const rows = await q(`
    select w.id, w.sequence_rank, w.status, w.time_horizon,
           (select count(*) from public.roadmap_wave_items i where i.wave_id = w.id) as item_count
      from public.roadmap_waves w
     where w.status = 'approved' and w.time_horizon = 'now'
  `);
  return rows;
}

/** Pure predicate mirroring the trigger's own IF conditions (UP file lines 44-52) — testable via
 *  --self-test with no DB. A wave VIOLATES the invariant iff it is approved, current, and empty. */
export function violatesInvariant(wave) {
  return wave.status === 'approved' && wave.time_horizon === 'now' && Number(wave.item_count) === 0;
}

/** Mechanism-shape assertion, PURE — testable via --self-test. Also asserts on the FULL
 *  pg_get_triggerdef() text (event + timing + column list), not just table/function/deferred —
 *  a trigger firing on the wrong event (e.g. AFTER DELETE) or the wrong UPDATE OF columns would
 *  otherwise pass every other check here while enforcing nothing (adversarial review finding,
 *  PR #7172: this function fetched `definition` but never inspected it). */
export function mechanismCorrect(rows) {
  const failures = [];
  if (rows.length === 0) return ['trigger trg_current_wave_carries_items not found on public.roadmap_waves'];
  const t = rows[0];
  if (t.table_name !== 'roadmap_waves') failures.push(`trigger is on table ${t.table_name}, expected roadmap_waves`);
  if (t.function_name !== 'assert_current_wave_carries_items') failures.push(`trigger calls ${t.function_name}, expected assert_current_wave_carries_items`);
  if (t.tgdeferrable !== true || t.tginitdeferred !== true) failures.push('trigger is not DEFERRABLE INITIALLY DEFERRED — same-transaction approve+populate would break');
  const def = t.definition || '';
  if (!/\bAFTER\b/.test(def)) failures.push(`trigger definition is not AFTER-timed: ${def}`);
  if (/\bBEFORE\b/.test(def)) failures.push(`trigger definition is BEFORE-timed, expected AFTER: ${def}`);
  if (!/\bINSERT\b/.test(def)) failures.push(`trigger definition does not fire on INSERT: ${def}`);
  const updateOfMatch = def.match(/UPDATE OF ([^)]*?)(?:\s+ON\b|$)/i);
  const updateOfCols = updateOfMatch ? updateOfMatch[1] : '';
  if (!/\bstatus\b/.test(updateOfCols)) failures.push(`trigger's UPDATE OF column list is missing 'status': ${def}`);
  if (!/\btime_horizon\b/.test(updateOfCols)) failures.push(`trigger's UPDATE OF column list is missing 'time_horizon': ${def}`);
  return failures;
}

async function runBaseline() {
  const mechanismRows = await fetchMechanismState();
  const preconditionRows = await fetchPreconditionState();
  const baseline = {
    captured_at: new Date().toISOString(),
    mechanism_rows: mechanismRows,
    mechanism_present_pre_apply: mechanismRows.length > 0, // EXPECTED false pre-apply
    precondition_violations: preconditionRows.filter(violatesInvariant),
    precondition_rows_checked: preconditionRows,
  };
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log('\n--- BASELINE (pre-apply) ---');
  console.log(JSON.stringify(baseline, null, 2));
  console.log(`\nMechanism present pre-apply: ${baseline.mechanism_present_pre_apply ? 'WARNING — already applied; a pre-existing mechanism voids the verify run\'s meaning' : 'false (expected)'}`);
  console.log(`\nWritten: ${BASELINE_PATH}`);
  if (baseline.precondition_violations.length > 0) {
    console.log(`\n⚠️  PRECONDITION VIOLATION: ${baseline.precondition_violations.length} approved, time_horizon='now' wave(s) hold zero items. Applying the UP migration is UNSAFE until this is resolved (a PLAN decision, not this script's job) — see this file's header and the UP file's own header.`);
    for (const w of baseline.precondition_violations) console.log(`   wave id=${w.id} seq=${w.sequence_rank}`);
    // Non-zero exit so a scripted/chained ceremony (baseline && apply-migration.js ...) actually
    // halts here instead of a human needing to catch this in stdout (adversarial review finding,
    // PR #7172 round 3: this branch previously fell through to a normal, exit-0 return).
    process.exit(1);
  }
  console.log('\n✅ No precondition violation found — safe to apply on this axis.');
}

async function runVerify() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`\n❌ No baseline found at ${BASELINE_PATH}. Run --baseline BEFORE the apply first — a verify without a baseline proves nothing (see this file's header).`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  // captured_at is recorded by --baseline but was never surfaced here (adversarial review
  // finding, PR #7172 round 3: "RUN IT TWICE, THE BASELINE IS NOT OPTIONAL" has no staleness
  // check at all) -- print the age so a human operator can judge whether a baseline captured
  // days ago (this migration is explicitly held back until Wave 0 is resolved, which is not
  // on this script's own timeline) is still trustworthy, rather than silently trusting a stale
  // snapshot.
  const baselineAgeMs = baseline.captured_at ? Date.now() - new Date(baseline.captured_at).getTime() : null;
  const baselineAgeMinutes = baselineAgeMs !== null ? Math.round(baselineAgeMs / 60000) : null;
  console.log(`\nBaseline captured_at: ${baseline.captured_at || '(missing)'} (~${baselineAgeMinutes ?? '?'} minute(s) ago)`);
  if (baselineAgeMinutes !== null && baselineAgeMinutes > 60) {
    console.log(`⚠️  Baseline is over an hour old -- re-run --baseline immediately before apply if the ceremony was delayed (e.g. holding on Wave 0), rather than trusting a snapshot from a prior session.`);
  }
  const mechanismRows = await fetchMechanismState();
  const preconditionRows = await fetchPreconditionState();
  const shapeFailures = mechanismCorrect(mechanismRows);
  const stillViolating = preconditionRows.filter(violatesInvariant);

  console.log('\n--- VERIFY (post-apply) ---');
  console.log(JSON.stringify({ mechanism_rows: mechanismRows, precondition_rows_checked: preconditionRows }, null, 2));

  const failures = [];
  if (mechanismRows.length === 0) failures.push('mechanism still absent post-apply — the migration did not take effect');
  failures.push(...shapeFailures);
  if (baseline.mechanism_present_pre_apply) failures.push('baseline already showed the mechanism present pre-apply — this verify run cannot distinguish "fixed by this apply" from "was already there"');

  if (failures.length > 0) {
    console.log(`\n❌ FAIL (${failures.length} issue(s)):`);
    for (const f of failures) console.log(`   - ${f}`);
    process.exit(1);
  }
  console.log('\n✅ PASS — mechanism present and correctly shaped.');
  if (stillViolating.length > 0) {
    console.log(`\n⚠️  NOTE: ${stillViolating.length} wave(s) STILL violate the invariant post-apply. The trigger does not retroactively reject existing rows (UP file's own header) — the next write touching those waves will now be rejected until resolved.`);
  }
}

function runSelfTest() {
  const cases = [
    { wave: { status: 'approved', time_horizon: 'now', item_count: 0 }, expected: true, label: 'approved + now + zero items -> violates' },
    { wave: { status: 'approved', time_horizon: 'now', item_count: 3 }, expected: false, label: 'approved + now + has items -> ok' },
    { wave: { status: 'approved', time_horizon: 'next', item_count: 0 }, expected: false, label: 'approved + next + zero items -> ok (not current)' },
    { wave: { status: 'draft', time_horizon: 'now', item_count: 0 }, expected: false, label: 'draft + now + zero items -> ok (not approved)' },
  ];
  let failed = 0;
  for (const c of cases) {
    const actual = violatesInvariant(c.wave);
    const ok = actual === c.expected;
    if (!ok) failed++;
    console.log(`   ${ok ? '✅' : '❌'} ${c.label}: expected=${c.expected} actual=${actual}`);
  }

  const GOOD_DEF = 'CREATE CONSTRAINT TRIGGER trg_current_wave_carries_items AFTER INSERT OR UPDATE OF status, time_horizon ON public.roadmap_waves DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_current_wave_carries_items()';
  const shapeOk = mechanismCorrect([{ table_name: 'roadmap_waves', function_name: 'assert_current_wave_carries_items', tgdeferrable: true, tginitdeferred: true, definition: GOOD_DEF }]);
  const shapeBad = mechanismCorrect([{ table_name: 'roadmap_waves', function_name: 'wrong_fn', tgdeferrable: false, tginitdeferred: false, definition: '' }]);
  // A trigger with the right table/function/deferred flags but the WRONG event (fires on DELETE,
  // not INSERT/UPDATE OF the right columns) — proves the definition-text checks catch what the
  // earlier table/function/deferred-only checks structurally cannot (adversarial review finding).
  const wrongEventDef = 'CREATE CONSTRAINT TRIGGER trg_current_wave_carries_items AFTER DELETE ON public.roadmap_waves DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_current_wave_carries_items()';
  const shapeWrongEvent = mechanismCorrect([{ table_name: 'roadmap_waves', function_name: 'assert_current_wave_carries_items', tgdeferrable: true, tginitdeferred: true, definition: wrongEventDef }]);
  console.log(`   ${shapeOk.length === 0 ? '✅' : '❌'} correct-shape fixture -> 0 failures (got ${shapeOk.length})`);
  // wrong_fn (1) + combined tgdeferrable/tginitdeferred check (1) + empty-definition checks
  // (not-AFTER, not-INSERT, missing-status, missing-time_horizon = 4) = 6.
  console.log(`   ${shapeBad.length === 6 ? '✅' : '❌'} wrong-shape fixture -> 6 failures (got ${shapeBad.length})`);
  // right table/function/deferred, wrong event: not-INSERT + missing-status + missing-time_horizon = 3.
  console.log(`   ${shapeWrongEvent.length === 3 ? '✅' : '❌'} wrong-event (fires on row removal, not row-creation/row-change) fixture -> 3 failures (got ${shapeWrongEvent.length})`);
  if (shapeOk.length !== 0) failed++;
  if (shapeBad.length !== 6) failed++;
  if (shapeWrongEvent.length !== 3) failed++;

  if (failed > 0) {
    console.log(`\n❌ SELF-TEST FAILED: ${failed} case(s)`);
    process.exit(1);
  }
  console.log('\n✅ SELF-TEST PASSED — assertion logic proven independent of live catalog observability.');
}

if (MODE === 'self-test') runSelfTest();
else if (MODE === 'baseline') await runBaseline();
else if (MODE === 'verify') await runVerify();
