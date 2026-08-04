// Behavioural acceptance for the G2 amendment to anon_feedback_ingress_bounds.
// Requirement (2) from Adam, condition of the chairman's Option A approval:
//   "include a test that the limit still REJECTS past threshold for a single source_type after
//    the qualifier lands — narrowing the counting scope is exactly how a limit accidentally stops
//    limiting."
//
// NOT YET EXECUTED. Authored alongside the staged amendment; the policy it tests is not applied.
// This file makes no claim to have passed. It is the instrument, not the evidence.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. Test B must FAIL.
//   node <this file> --verify      AFTER  the apply. Every test must PASS.
//
// A post-apply green proves nothing on its own: if the probe cannot detect the defect, it would
// read green against the UNAMENDED policy too, and "the fix works" would be indistinguishable from
// "the test cannot see". The baseline run is what makes the verify run mean something. Test B is
// the discriminator — under the current (unamended) policy a non-telegram anon insert is denied
// while telegram is over threshold, which IS the G2 defect; after the amendment it must be allowed.
//
// ── METHOD ────────────────────────────────────────────────────────────────────────────────────
// Three-leg, because an error code never decides landed-vs-refused:
//   leg 1  observe what the client reports
//   leg 2  SERVICE-ROLE READBACK — the only thing that establishes whether the row exists
//   leg 3  re-attempt the IDENTICAL write WITHOUT RETURNING (bare insert), read back again
// The two write forms DIVERGE: a bare insert can persist a row while the .select() form of the same
// write reports an error, so a suite built only from the RETURNING variant proves only that
// RETURNING refused.
//
// Probe rows are otherwise VALID and differ only in the field under test — NOT NULL and CHECK
// constraints are evaluated BEFORE the RLS WITH CHECK, so a malformed probe never reaches the
// policy and returns a misleading error. That trap voided a full acceptance battery four times on
// the parent SD; the control below is what catches it.
//
// ── BLAST RADIUS, read before running ─────────────────────────────────────────────────────────
// Setup inserts enough tagged telegram rows (as service_role, which bypasses RLS) to push the
// 1-hour window past 50. For that hour the REAL telegram ingress path is rate-limited. Measured
// organic telegram volume is 1 row/hour all-time, so this is near-zero impact — but it is not zero,
// and cleanup runs in a finally block with a verified residual count. Do not run this while a
// telegram incident is in progress.

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

const TAG = 'G2ACCEPT-SOURCE-TYPE-QUALIFIER';
const THRESHOLD = 50;
const results = [];

/** Otherwise-valid row; callers vary ONLY the field under test. */
const validBase = (name, extra = {}) => ({
  type: 'issue',
  source_application: 'chairman_bot',
  source_type: 'telegram',
  severity: 'medium',
  title: `${TAG} ${name} — automated acceptance probe, safe to delete`,
  description: 'G2 amendment acceptance probe. Reader side is fenced; this row cannot govern anything.',
  ...extra,
});

async function readback(name) {
  const { data, error } = await svc.from('feedback').select('id').ilike('title', `${TAG} ${name}%`);
  if (error) throw new Error(`readback failed (results are void without it): ${error.message}`);
  return data || [];
}

/** Three-leg probe. Decides landed-vs-refused by READBACK under BOTH write forms. */
async function probe(name, fields) {
  const withReturning = await anon.from('feedback').insert(validBase(name, fields)).select('id');
  const afterReturning = await readback(name);

  const bare = await anon.from('feedback').insert(validBase(`${name}-bare`, fields)); // no .select()
  const afterBare = await readback(`${name}-bare`);

  const landedReturning = afterReturning.length > 0;
  const landedBare = afterBare.length > 0;
  const agree = landedReturning === landedBare;

  console.log(`  ${name.padEnd(30)} RETURNING=${landedReturning ? 'LANDED' : 'absent'} bare=${landedBare ? 'LANDED' : 'absent'}${agree ? '' : '   *** FORMS DISAGREE ***'}`);
  if (withReturning.error && landedReturning) {
    console.log('      *** the client reported an error AND the row is present — the status code would have lied.');
  }
  if (!agree) {
    console.log('      *** bare-insert and RETURNING diverge. This is the exact hazard leg 3 exists for.');
    console.log('      *** Treat the LANDED side as the truth: the write happened.');
  }
  return { landed: landedReturning || landedBare, agree };
}

function record(id, desc, pass, detail) {
  results.push({ id, desc, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id}: ${desc}${detail ? ` — ${detail}` : ''}`);
}

async function windowCount(sourceType) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await svc.from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', sourceType).gt('created_at', since);
  if (error) throw new Error(`window count failed: ${error.message}`);
  return count ?? 0;
}

let filled = [];
try {
  console.log(`=== G2 acceptance — mode: ${MODE} ===\n`);

  // ── D. CONTROL FIRST. Without a demonstrated positive, every absence below is meaningless. ──
  console.log('D. CONTROL (must LAND — proves the probe can produce a positive at all)');
  const control = await probe('control-benign', { severity: 'medium', category: 'harness_backlog' });
  record('D', 'benign anon telegram insert lands', control.landed,
    control.landed ? undefined : 'HARNESS BROKEN — every absence result below is void. Stop here.');
  if (!control.landed) {
    console.log('\n*** ABORTING: the control did not land, so no absence result can be trusted. ***');
    process.exitCode = 1;
  } else {

    // ── C. Clauses (1) and (2) unchanged by the amendment. ──
    console.log('\nC. UNCHANGED CLAUSES (must be REFUSED)');
    const crit = await probe('severity-critical', { severity: 'critical' });
    record('C1', 'severity=critical still refused', !crit.landed);
    const defer = await probe('category-deferred', { severity: 'low', category: 'chairman_decision_deferred' });
    record('C2', 'category=chairman_decision_deferred still refused (severity legal on purpose, so only the category clause can be doing the work)', !defer.landed);

    // ── SETUP: push telegram past threshold, as service_role (bypasses RLS). ──
    const before = await windowCount('telegram');
    const need = Math.max(0, THRESHOLD - before + 1);
    console.log(`\nSETUP: telegram rows in window = ${before}; inserting ${need} tagged rows to exceed ${THRESHOLD}`);
    if (need > 0) {
      const rows = Array.from({ length: need }, (_, i) => validBase(`fill-${i}`));
      const { data, error } = await svc.from('feedback').insert(rows).select('id');
      if (error) throw new Error(`setup insert failed: ${error.message}`);
      filled = (data || []).map(r => r.id);
    }
    const after = await windowCount('telegram');
    console.log(`  telegram rows in window now = ${after} (must exceed ${THRESHOLD}: ${after > THRESHOLD})`);
    if (after <= THRESHOLD) {
      record('SETUP', 'could not push telegram over threshold — A and B are unrunnable', false);
    } else {

      // ── A. REQUIREMENT (2): the limit must STILL REJECT past threshold for one source_type. ──
      console.log('\nA. LIMIT STILL REJECTS past threshold for a single source_type (requirement 2)');
      const over = await probe('telegram-over-limit', { severity: 'medium' });
      record('A', 'anon telegram insert refused while telegram is over threshold', !over.landed,
        over.landed ? 'THE LIMIT STOPPED LIMITING — narrowing the counting scope is exactly how this happens. Do not ship.' : undefined);

      // ── B. THE DISCRIMINATOR: another source_type under threshold must still be ACCEPTED. ──
      // Under the UNAMENDED policy this is DENIED (that is G2). Under the amendment it is allowed.
      // anon cannot write an arbitrary source_type — the permissive layer must admit it — so this
      // uses the venture-user path. If no such path can be constructed, the test FAILS LOUDLY
      // rather than being silently skipped: an unrunnable discriminator is not a pass.
      console.log('\nB. DISCRIMINATOR — a DIFFERENT source_type, under its own threshold, must still be accepted');
      const ventureUnder = await windowCount('user_feedback');
      console.log(`  user_feedback rows in window = ${ventureUnder} (must be under ${THRESHOLD})`);
      // LESSON STAMPED AT FIRST LIVE VERIFY (2026-08-03): this probe originally carried NO
      // venture_id. For a non-telegram anon row the ONLY permissive path is
      // venture_user_insert_feedback, which requires venture_id IS NOT NULL AND
      // venture_exists_and_active(venture_id) — so the row was refused by the PERMISSIVE layer
      // regardless of G2, in baseline AND verify. The baseline B-failure was OVERDETERMINED
      // (G2 + missing venture), and the suite credited it entirely to G2 — the exact
      // "permissive layer refused for an unrelated reason" hazard this test's own remark text
      // warns about on the opposite arm. The probe must ride the venture path fully.
      // Venture resolved AT RUN TIME (a hardcoded id goes stale silently). Selection calls the
      // REAL venture_exists_and_active function (param p_venture_id, verified from pg_proc) —
      // never a reimplementation of its semantics.
      const { data: activeVentures } = await svc.from('ventures').select('id, name').order('updated_at', { ascending: false }).limit(25);
      let ventureId = null;
      for (const v of activeVentures || []) {
        const { data: ok } = await svc.rpc('venture_exists_and_active', { p_venture_id: v.id }).then(r => r, () => ({ data: null }));
        if (ok === true) { ventureId = v.id; console.log(`  venture-user path rides venture: ${v.name} (${v.id.slice(0, 8)})`); break; }
      }
      if (!ventureId) {
        console.log('  *** NO ACTIVE VENTURE FOUND — the venture-user permissive path cannot be exercised.');
        console.log('  *** Test B is NOT RUNNABLE, which is a FAIL, not a skip: an absence result would mean nothing.');
      }
      const other = await probe('other-source-under-limit', {
        source_type: 'user_feedback',
        feedback_type: 'user_general',
        severity: 'low',
        venture_id: ventureId,
      });
      const expectLanded = MODE === 'verify';
      record('B', `non-telegram anon insert ${expectLanded ? 'ACCEPTED (G2 fixed)' : 'DENIED (G2 present — this FAIL is the point of --baseline)'}`,
        other.landed === expectLanded,
        MODE === 'baseline' && !other.landed
          ? 'EXPECTED FAILURE. The probe can see the defect, so the --verify green will mean something.'
          : (MODE === 'baseline' && other.landed
              ? 'the baseline did NOT reproduce G2 — either the permissive layer refused for an unrelated reason, or the premise is wrong. Investigate before trusting --verify.'
              : undefined));
    }
  }
} catch (err) {
  console.error('\n*** PROBE ERROR:', err.message);
  process.exitCode = 1;
} finally {
  // ── CLEANUP, verified. Probe rows sit inside the live rate-limit window until removed. ──
  const { data: mine } = await svc.from('feedback').select('id').ilike('title', `${TAG}%`);
  const ids = (mine || []).map(r => r.id);
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      await svc.from('feedback').delete().in('id', ids.slice(i, i + 100));
    }
  }
  const { count: residual } = await svc.from('feedback')
    .select('id', { count: 'exact', head: true }).ilike('title', `${TAG}%`);
  console.log(`\ncleanup: deleted ${ids.length} (setup fill: ${filled.length}) | residual probe rows: ${residual}`);
  if (residual > 0) {
    console.log('*** CLEANUP INCOMPLETE — remove manually; these rows are inside the live rate-limit window.');
    process.exitCode = 1;
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${MODE.toUpperCase()}: ${results.length - failed.length}/${results.length} passed ===`);
  if (MODE === 'baseline') {
    const b = results.find(r => r.id === 'B');
    console.log(b && b.pass
      ? 'Baseline OK: the probe reproduced G2, so a --verify green is meaningful.'
      : 'Baseline did NOT reproduce G2 — a --verify green would be uninterpretable. Fix the probe first.');
  } else if (failed.length) {
    console.log('DO NOT accept the amendment. Failing: ' + failed.map(f => f.id).join(', '));
    process.exitCode = 1;
  }
}
