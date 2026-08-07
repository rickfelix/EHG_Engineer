#!/usr/bin/env node
/**
 * SEEDED-FIRING VERIFICATION — SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001, FR-3 (binding criterion).
 *
 * WHY THIS IS A STANDALONE OPERATOR SCRIPT AND NOT A VITEST INTEGRATION TEST.
 * The PRD's TR-6 called the DB tier's empty include a blocker. Reading vitest.config.js at source
 * corrects that: `DB_INCLUDE_GATED = DB_TARGET.allowed ? DB_INCLUDE : []` is a DELIBERATE
 * fail-closed design whose own comment reads "fail-closed-with-nothing-to-allow is a safe end state;
 * every DB test skips, which is strictly better than running against production." There is no
 * designated non-prod ref, so the tier is telling me not to write to production from the test
 * runner — and it is right. Satisfying the binding criterion by pointing the runner at production
 * would be defeating a safety control to make a test go green, which is the exact move this SD
 * family exists to stop. So the demonstration is an explicit, one-shot, operator-invoked script with
 * run-id-scoped cleanup, and its CAPTURED OUTPUT is the evidence. Nothing automated runs it.
 *
 * WHAT THE SEED IS AND IS NOT PROTECTED FROM. MY FIRST VERSION OF THIS PARAGRAPH WAS 1-OF-3 RIGHT
 * AND A REVIEWER PROVED IT AT SOURCE. Corrected, because a safety argument that overstates its own
 * coverage is worse than none — it stops the next reader looking.
 * The real stuck-seat shape is sd_key NULL / claimed_at NULL / worktree_path NULL /
 * continuous_sds_completed 0 (three of the four live stuck specimens), and FR-3 requires the seed
 * carry it so it traverses the same filters a real stuck seat does.
 *   TRUE — stale-session-sweep's main candidate feed selects `.not('sd_key','is',null)`, so a
 *     sd_key-NULL row is not swept there and runClaimBoundaryProbe cannot reach it (claimed_at NULL
 *     would disarm that probe anyway). BUT a SECOND feed selects the inverse, `.is('sd_key', null)`,
 *     and INSERTs a CLAIM_REMINDER. It is dead only because STALE_THRESHOLD_SECONDS defaults to 300
 *     and the nudge needs >= 300 while aliveIdle keeps < 300 — a provably empty interval TODAY that
 *     inverts the moment anyone raises that env var. Safe by a default, not by design.
 *   HALF FALSE — everClaimed FALSE does exclude it from the isFleetWorker/liveFleetWorkers family,
 *     but NOT from isDispatchableFleetMember, which deliberately does not require everClaimed and is
 *     what capacity actually runs on. So the seed IS visible to getFleetRoster, the capacity
 *     forecaster's idleNow, coordination-events' unfiltered scan, and detectStalledLoop (it matches
 *     every guard). ACCEPTED IN-WINDOW RISK, not an exclusion.
 *   DIRECTION INVERTED, CORRECTED AFTER REVIEW — I wrote that worktree_path NULL "can hold a
 *     worker-exclusion lock for 15 minutes, outliving this script". auto-exec-checkout-sync does
 *     read NULL as "this worker is in the MAIN checkout", and MAIN_WORKER_TTL_MS is 15 minutes, but
 *     the seed BLOCKS lock acquisition (the code aborts with reason 'live_worker_in_main') rather
 *     than holding one — and that whole path is default-OFF behind a disabled flag. Less severe than
 *     I claimed, and in the opposite direction; recorded rather than quietly deleted.
 *   REAL AND UNMENTIONED — resolve-own-session's last-resort strategy picks the freshest
 *     status='active' row by heartbeat, which this seed becomes BY CONSTRUCTION, so a process
 *     falling through to it during the window could adopt the synthetic row as its own session.
 *   TRUE — no session_coordination row is written at all. The shipped predicate does not read
 *     outbound escalation-ness (that conjunct was dropped as unproven), so there is nothing to seed
 *     and nothing for lib/coordinator/signal-router.cjs to promote into a durable feedback row.
 * CONCLUSION: this is a ONE-SHOT, OPERATOR-ATTENDED script with a seconds-long window. It must never
 * be scheduled, CI-wired or npm-scripted.
 * The ONLY protection for claude_sessions is this script's own cleanup: the SD-TEST- fence in
 * stale-session-sweep.cjs guards strategic_directives_v2, NOT this table, and cancelStaleTestFixtures
 * is likewise SD-side. Cleanup is therefore scoped to the two exact session_ids generated here and
 * runs in a finally block — never a prefix DELETE (the sweep records a TOCTOU fatal from that).
 *
 * Usage: node scripts/seeded-firing-stuck-seat.cjs [--falsify]
 *   --falsify  break the population query on purpose; the positive assertion MUST then fail.
 */

'use strict';

// WALK UP TO THE .env RATHER THAN COUNTING DIRECTORIES. The original hardcoded ../../../.env, which
// is correct from a worktree (.worktrees/<SD>/scripts) and resolves to C:\Users\rickf\Projects\.env
// — a path that does not exist — from the merged main tree. The FR-3 acceptance artifact would have
// stopped running the moment it merged, which is the quietest possible way for an acceptance
// criterion to stop being checked.
(() => {
  const path = require('node:path');
  const fs = require('node:fs');
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) { require('dotenv').config({ path: candidate }); return; }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  require('dotenv').config();   // last resort: ambient env
})();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const { fetchPopulation } = require('../lib/fleet/stuck-seat-population.cjs');
const { classifySeat, VERDICT } = require('../lib/fleet/stuck-seat-predicate.cjs');

const FALSIFY = process.argv.includes('--falsify');
const CUT_POINT_MINUTES = 120;      // for THIS demonstration only — not shipped, not a calibration
const STALE_MINUTES = 600;

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = randomUUID().slice(0, 8);
  const now = Date.now();

  // DISTINCT identifiers for the twins. Sharing one would be a claim conflict the sweep resolves by
  // evicting one, producing a false negative in the very assertion meant to prove firing.
  const stuckId = randomUUID();
  const healthyId = randomUUID();

  const base = {
    status: 'active', loop_state: 'active',
    heartbeat_at: new Date(now).toISOString(),      // FRESH — the whole point: it looks alive
    sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0,
    metadata: { seeded_by: 'seeded-firing-stuck-seat', run_id: runId }
  };
  const rows = [
    { ...base, session_id: stuckId,   last_tool_at: new Date(now - STALE_MINUTES * 60000).toISOString() },
    { ...base, session_id: healthyId, last_tool_at: new Date(now).toISOString() }   // MATCHED NEGATIVE
  ];

  let inserted = false;
  // A finally block does NOT run on SIGINT/SIGTERM, and nothing in this repo reaps a claim-free
  // status='active' row — readers without a heartbeat filter would carry an orphan forever. Ctrl-C
  // during the seconds-long window is the realistic way that happens, so it gets a handler.
  const emergencyCleanup = async () => {
    try { await sb.from('claude_sessions').delete().in('session_id', [stuckId, healthyId]); } catch { /* best effort */ }
    console.error('\nINTERRUPTED — emergency cleanup attempted for ' + stuckId + ', ' + healthyId);
    process.exit(130);
  };
  process.on('SIGINT', emergencyCleanup);
  process.on('SIGTERM', emergencyCleanup);

  // Reap any orphan a previous killed run left behind, before adding more.
  const { data: orphans } = await sb.from('claude_sessions')
    .select('session_id').eq('metadata->>seeded_by', 'seeded-firing-stuck-seat');
  if (orphans && orphans.length) {
    console.log('REAPING ' + orphans.length + ' orphan(s) from a previous run: ' + orphans.map((o) => o.session_id).join(', '));
    await sb.from('claude_sessions').delete().in('session_id', orphans.map((o) => o.session_id));
  }

  try {
    const { error } = await sb.from('claude_sessions').insert(rows);
    if (error) throw new Error('seed insert failed: ' + error.message);
    inserted = true;
    console.log('SEEDED run_id=' + runId);
    console.log('  positive (stuck shape) : ' + stuckId + '  last_tool_at ' + STALE_MINUTES + 'm stale');
    console.log('  matched negative       : ' + healthyId + '  last_tool_at 0m');
    console.log('  both: sd_key NULL, claimed_at NULL, worktree_path NULL, continuous_sds_completed 0 (the REAL stuck-seat shape)');

    // THE DETECTOR RUNS ITS OWN PRODUCTION QUERY. The rows are NOT handed in — that is the whole
    // point of the binding criterion: a detector can score SILENT because the harness never fed it
    // anything, and that false negative is indistinguishable from a real finding.
    let { seats: population, truncated } = await fetchPopulation(sb);
    if (FALSIFY) {
      population = population.filter(() => false);   // mutate the feed to select nothing
      console.log('\n[--falsify] population feed forced empty');
    }

    const findings = population
      .map((row) => classifySeat(row, { cutPointMinutes: CUT_POINT_MINUTES, now }))
      .filter((r) => r.verdict === VERDICT.STUCK);
    const unknowns = population
      .map((row) => classifySeat(row, { cutPointMinutes: CUT_POINT_MINUTES, now }))
      .filter((r) => r.verdict === VERDICT.UNKNOWN);

    console.log('\nPOPULATION: ' + population.length + ' seats');
    console.log('FINDINGS  : ' + findings.length + ' stuck, ' + unknowns.length + ' unknown');
    findings.forEach((f) => console.log('   STUCK ' + f.session_id + '  silent ' + f.toolSilentMinutes + 'm  (' + f.reason + ')'));

    const positiveFound = findings.some((f) => f.session_id === stuckId);
    const negativeSilent = !findings.some((f) => f.session_id === healthyId);

    console.log('\nASSERTIONS');
    console.log('  seeded positive is NAMED in the output : ' + (positiveFound ? 'PASS' : 'FAIL'));
    console.log('  matched negative stays SILENT          : ' + (negativeSilent ? 'PASS' : 'FAIL'));

    const ok = positiveFound && negativeSilent;
    console.log('\nRESULT: ' + (ok ? 'SEEDED FIRING DEMONSTRATED' : 'NOT DEMONSTRATED')
      + (FALSIFY ? '   <- expected NOT DEMONSTRATED under --falsify' : ''));
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (inserted) {
      // RUN-ID SCOPED, by exact session_id. Never a prefix DELETE. This is the ONLY protection this
      // table has, so it runs even when the assertions throw.
      const { error } = await sb.from('claude_sessions').delete().in('session_id', [stuckId, healthyId]);
      // THE DELETE ERROR IS FATAL IN ITS OWN RIGHT. It previously delegated entirely to the survivor
      // check below — so "CLEANUP: ERROR <msg>; survivors=0, exit 0" was reachable.
      if (error) { console.error('\nCLEANUP: DELETE FAILED — ' + error.message); process.exitCode = 1; }
      const { data: left, error: checkError } = await sb.from('claude_sessions')
        .select('session_id').in('session_id', [stuckId, healthyId]);
      // AND THE SURVIVOR CHECK'S OWN ERROR IS CHECKED. It was discarded: on any transient failure
      // `left` came back undefined, the report printed survivors=0 and the guard never fired — a
      // leaked synthetic active seat reporting clean. A check the caller can satisfy without
      // changing the harm is not a check, which is the thesis of this entire SD.
      if (checkError) {
        console.error('CLEANUP: could not VERIFY removal (' + checkError.message + ') — treat as leaked: ' + stuckId + ', ' + healthyId);
        process.exitCode = 1;
      } else {
        const survivors = (left || []).length;
        console.log('\nCLEANUP: deleted; survivors=' + survivors);
        if (survivors) process.exitCode = 1;   // a leaked synthetic active seat is a failure
      }
    }
  }
}

main().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
