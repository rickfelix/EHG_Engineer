#!/usr/bin/env node
/**
 * coordinator-capacity-forecast.mjs — proactive worker-utilization + belt-depth forecaster.
 *
 * WHY (operator directive 2026-06-10): "track the productivity of each worker and always have a
 * sense of how busy they are, and gauge at what point they will be ready for more work, so the belt
 * always has additional work to distribute. If you see a point where workers are going to run out of
 * work, that's when you reach out to Adam — that should be part of your protocol as coordinator."
 *
 * This closes the gap the coordinator kept hitting: REACTING to an already-idle worker instead of
 * FORECASTING the dry-out and refilling the belt ahead of need. It is the 5th SRE gauge made active.
 *
 * What it does each run:
 *   1. Per-worker productivity — for every live builder: current claim(s), phase, progress, and an
 *      ETA-to-free estimate (phase-median model). Idle workers are classified building/idle/STALLED.
 *   2. Belt depth — counts TRULY-claimable SDs (unmet_deps=0, unclaimed, non-parent, non-terminal).
 *   3. Demand forecast — idle-now + workers-freeing-soon (ETA-to-free <= HORIZON or progress>=65%).
 *   4. Verdict — SURPLUS / TIGHT / DEFICIT. On a predicted DEFICIT it reaches out to Adam for a
 *      sourcing shortlist (with --dispatch), respecting a cooldown so it never spams.
 *
 * Read-only by default. Pass --dispatch to actually send the Adam source_work request when a deficit
 * is forecast (cooldown via .coord-capacity-source-last.json, default 30m, override --cooldown-min N).
 * Pure-ish: all side effects are the optional Adam dispatch + the cooldown stamp file.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
// Still used by countUnpromotedRoadmapItems below; the belt/session reads that also used it moved.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
// SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (FR-3): the capacity inputs — the claimable belt, the QF
// term, the live-worker classification and the ETA model — moved verbatim into a shared module so
// the drive-report sweep can build leg4's computeVerdict from the SAME derivation instead of a
// second one. Every belt-exclusion / claim-eligibility / stall predicate this file used to import
// directly now lives behind gatherCapacityInputs; the predicates themselves are unchanged.
import { gatherCapacityInputs, BELT_BUFFER } from './lib/capacity-inputs.mjs';
// The verdict ladder, extracted so producer and consumer share one spelling (FR-3).
import { computeBeltVerdict } from '../lib/drive-loop/belt-verdict.js';
// FR-2: the durable writer. It THROWS on a failed write by contract — see its header and the call
// site at the end of main(), which tolerates exactly one error class and rethrows the rest.
import { makeCapacityVerdictPersist, isTableAbsentError, CAPACITY_VERDICT_TABLE } from './lib/capacity-verdict-store.mjs';
// SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-3): per-tier claimable depth (not a single aggregate).
import { tierClaimableBreakdown } from '../lib/fleet/tier-claimable.cjs';
import { isTieringActive } from '../lib/fleet/tier-ladder.cjs';
// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): surface the sourcing-engine
// flag state + unpromoted roadmap depth so a belt-low/DEFICIT ping says "engine OFF, N unpromoted
// -> activate/distill" instead of only "source N candidates" (manual backfill is the anti-pattern).
import { readSourcingEngineFlagsFromDb, formatSourcingAwareness, classifyCorpusGatedDeficit } from './lib/sourcing-engine-awareness.mjs';
// SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001: prefer draining the un-materialized
// adam-prop proposal queue (proposed_sd_key NOT IN strategic_directives_v2) over pinging Adam for more.
import { scanPendingProposals, drainPendingProposals, shouldMaterializeBeforeSource, formatPendingSummary } from '../lib/coordinator/pending-proposals-gauge.mjs';
// SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001: stall detection is DELEGATED to the canonical
// detectStalledLoop SSOT (lib/coordinator/detectors.cjs), the same detector coordinator-audit.mjs uses.
// The forecast previously ran its own heartbeat-AGE rule (classifyIdleWorker, ttl 180s), but the worker
// fetch only admits sessions with a heartbeat within HEARTBEAT_LIVE_MS (5min), so an age-vs-low-ttl rule
// could only ever fire inside the 180–300s window — where a worker is still healthy (it re-polls every
// 600–1200s) — making it a pure false-positive generator that could never see a genuinely dead loop
// (those age past the live window). detectStalledLoop uses the correct model: loop_state==='active' +
// no claim + fresh heartbeat + claimable work waiting, while EXCLUDING legitimately-parked workers
// (loop_state 'awaiting_tick' or a future expected_silence_until) — so a healthy idle worker between
// ticks is never flagged. (Belt-empty FP from SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001
// is preserved: detectStalledLoop returns no_unclaimed_work when the belt is empty.)

const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');

// SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001: RE-EXPORTED, not re-implemented. These moved into
// scripts/lib/capacity-inputs.mjs with the rest of the ETA model, and
// tests/unit/coordinator/capacity-forecast-eta-seam.test.js imports them from HERE. Re-exporting
// keeps that seam's import path valid rather than editing a test to chase a file move.
export { PHASE_MIN_STATIC, etaMinForClaim, computePhaseMinsFromActuals } from './lib/capacity-inputs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COOLDOWN_FILE = join(REPO_ROOT, '.coord-capacity-source-last.json');
// SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: separate cooldown stamp for the masked-stall escalation
// so it does not conflate with the Adam belt-low source_work cooldown.
const MASKED_STALL_COOLDOWN_FILE = join(REPO_ROOT, '.coord-masked-stall-last.json');


const argv = process.argv.slice(2);
const DISPATCH = argv.includes('--dispatch');
const cooldownMin = (() => {
  const i = argv.indexOf('--cooldown-min');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 30;
})();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);


async function main() {
  // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (FR-3): ONE derivation of the capacity inputs, shared
  // with the drive-report sweep so leg4 can inject the SAME computeVerdict this forecast reads.
  // Extracted verbatim to scripts/lib/capacity-inputs.mjs — no arithmetic, predicate or query
  // changed. Its header records why re-deriving them at the sweep was the wrong half of the choice.
  const inputs = await gatherCapacityInputs(sb, { now: Date.now() });
  const {
    idleNow, freeingSoon, building, stalled,
    claimableCount, openQfCount, claimable, rows, workers, maskedIds,
    // SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001 (FR-3): the named extent + raw-vs-dispatchable split.
    beltExtent, rawUnclaimed, dispatchableCount,
    // SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001: the four-bucket engagement gauge — computed inside
    // gatherCapacityInputs (fail-soft, FR-4), merged into detail below.
    engagement,
  } = inputs;

  // THE LADDER IS NO LONGER SPELLED HERE. computeBeltVerdict owns it, and drive-report-sweep.mjs
  // injects that same function into leg4 — so the two ends cannot drift into two ladders that
  // merely agree today. capacity.verdict is the FROZEN-DOMAIN reading; the `verdict` binding below
  // may be rewritten by the corpus gate, which speaks a DIFFERENT vocabulary. See the persist.
  const capacity = computeBeltVerdict({ idleNow, freeingSoon, claimableCount, openQfCount, buffer: BELT_BUFFER });
  const { beltDepth, demandSoon, deficit } = capacity;
  let verdict = capacity.verdict;

  // ── render ──
  const ts = new Date().toISOString();
  console.log(`[CAPACITY-FORECAST] ${ts}`);
  console.log(`  workers: ${workers.length} live  |  building ${building}  |  idle ${idleNow}${stalled ? ` (${stalled} STALLED)` : ''}  |  freeing-soon ${freeingSoon}`);
  for (const r of rows) {
    console.log(`    ${r.sess} ${String(r.callsign).padEnd(8)} ${r.state.padEnd(13)} ${r.eta.padEnd(18)} ${r.detail}`);
  }
  console.log(`  BELT: ${beltDepth} claimable [${beltExtent}: ${dispatchableCount} dispatchable of ${rawUnclaimed} raw-unclaimed] (${claimable.length} SD + ${openQfCount} QF)  |  DEMAND(soon): ${demandSoon} (idle ${idleNow} + freeing-soon ${freeingSoon})  |  buffer ${BELT_BUFFER}`);
  if (claimable.length) console.log(`        claimable SDs: ${claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ')}`);

  // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-3): TRUE per-tier claimable depth so a tier-specific
  // deficit (e.g. "tier-3 claimable: 0") is explicit, not masked by the aggregate above. `claimable` is
  // already base-eligible => preFiltered. The exact-rank partition (incl. unscored / above-top) sums to the
  // aggregate as a self-check; the cumulative is what a worker AT that rung can actually claim. Fail-open
  // (non-blocking) so a tier-rollup fault never breaks the forecast. Counts SDs only (QFs are tier-agnostic).
  try {
    const tieringActive = await isTieringActive(sb);
    const bd = tierClaimableBreakdown(claimable, { tieringActive, preFiltered: true });
    const exactStr = Object.keys(bd.exact).map((r) => `T${r}:${bd.exact[r]}`).join(' ');
    const cumStr = Object.keys(bd.cumulative).map((r) => `≤T${r}:${bd.cumulative[r]}`).join(' ');
    console.log(`  BELT-BY-TIER: ${tieringActive ? 'tiering ON' : 'tiering OFF (degrade-to-1: every rung sees the full aggregate)'}`);
    console.log(`        exact-rank partition: ${exactStr}${bd.unscored ? ` unscored:${bd.unscored}` : ''}${bd.aboveTop ? ` above-top:${bd.aboveTop}` : ''}  (sum=${bd.aggregate}${bd.partitionSumsToAggregate ? ' ✓' : ' ✗DRIFT'})`);
    console.log(`        claimable-to-tier (cumulative): ${cumStr}`);
    if (tieringActive) {
      const zeroTiers = Object.keys(bd.cumulative).filter((r) => bd.cumulative[r] === 0);
      if (zeroTiers.length && bd.aggregate > 0) {
        console.log(`        ⚠ tier deficit: rung(s) ${zeroTiers.map((r) => `T${r}`).join(', ')} have 0 claimable — a worker at that rung idles while belt shows ${bd.aggregate}`);
      }
    }
  } catch (e) {
    console.log(`  BELT-BY-TIER: unavailable (non-blocking): ${e?.message || e}`);
  }

  // SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): sourcing-engine awareness — flag
  // state + unpromoted roadmap depth so belt-low is read as "activate/distill" before "hand-ask Adam".
  // SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): derive arm state from the DB
  // source-of-truth (the actual deployment), not the coordinator's local process.env — which is
  // blind to the GitHub-Actions job-scoped sourcing flags. The reader fails open to env on error.
  const sourcingFlags = await readSourcingEngineFlagsFromDb(sb, process.env);
  const unpromotedCount = await countUnpromotedRoadmapItems(sb);
  const awareness = formatSourcingAwareness({ flags: sourcingFlags, unpromotedCount });
  console.log(`  SOURCING: ${awareness.line}`);

  // SD-LEO-INFRA-FORECASTER-DISTILL-GATE-AWARENESS-001 (FR-1/FR-2): when the auto-refill arm is
  // intentionally OFF, a corpus-thin belt-low is the CORRECT state — NOT a fillable deficit. Reframe the
  // recommendation (advise NEITHER distill NOR activate) and downgrade the verdict so the deficit-driven
  // Adam reach-out below (gated on verdict.startsWith('DEFICIT')) does not stale-re-fire every tick. A
  // genuine non-corpus shortfall (no unpromoted corpus, or auto-refill ON) is left as a real DEFICIT.
  const autoRefillOn = sourcingFlags.find((f) => f.label === 'auto-refill')?.enabled === true;
  const corpusGate = classifyCorpusGatedDeficit({ verdict, autoRefillOn, unpromotedCount, baseRecommendation: awareness.recommendation });
  if (corpusGate.corpusGated) {
    console.log(`  CORPUS-GATED: ${corpusGate.recommendation}`);
  }
  verdict = corpusGate.verdict;
  const recommendation = corpusGate.recommendation;

  // SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001 (FR-1): gauge the un-materialized
  // Adam proposal queue at the same awareness seam. If belt-low supply already exists un-materialized,
  // prefer MATERIALIZE over a fresh source_request (closes the false-DEFICIT ping loop).
  let pendingScan = { pendingCount: 0, freshKeys: [], staleKeys: [], scanned: 0, freshProposals: [] };
  try {
    pendingScan = await scanPendingProposals({ supabase: sb });
  } catch (e) {
    console.log(`  PENDING: scan failed (non-blocking): ${e?.message || e}`);
  }
  console.log(`  PENDING: ${formatPendingSummary(pendingScan)}`);

  console.log(`  VERDICT: ${verdict}` + (deficit > 0 ? `  → belt short by ${deficit} — ${recommendation}` : ''));

  // ── proactive Adam reach-out on a forecast deficit ──
  if (verdict.startsWith('DEFICIT')) {
    // SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001 (FR-1/FR-2): drain BEFORE source.
    // When un-materialized FRESH proposals already exist, materialize them via the canonical
    // idempotent --from-proposal path and SUPPRESS the Adam ping (Adam already produced the supply;
    // asking for more is the false-DEFICIT loop). Stale proposals are skipped, not mass-materialized.
    if (shouldMaterializeBeforeSource(pendingScan)) {
      if (!DISPATCH) {
        console.log(`  ACTION: deficit, but ${pendingScan.freshKeys.length} FRESH un-materialized proposal(s) exist — run with --dispatch to MATERIALIZE the queue instead of pinging Adam (stale ${pendingScan.staleKeys.length} skipped).`);
      } else {
        const drain = await drainPendingProposals({ freshProposals: pendingScan.freshProposals });
        console.log(`  ACTION: ✅ MATERIALIZE-before-source — drained pending queue: materialized ${drain.materialized}, skipped-existing ${drain.skippedExisting}, skipped-stale ${pendingScan.staleKeys.length}, failed ${drain.failed}. Adam ping SUPPRESSED; re-assess next tick.`);
      }
    } else {
    const cd = readCooldown();
    const since = cd ? (Date.now() - cd.at) / 60000 : Infinity;
    // SD-REFILL-00G39SZT: fingerprint the belt-dry state so an UNCHANGED deficit self-suppresses
    // (saturation-ack) until a supply-change signal, instead of re-pinging Adam every cooldown.
    const currentFp = deficitFingerprint({ verdict, beltDepth, deficit, claimable });
    const decision = shouldPingAdam({ cd, sinceMin: since, cooldownMin, currentFp });
    if (!DISPATCH) {
      console.log(`  ACTION: deficit forecast — run with --dispatch to auto-request a sourcing shortlist from Adam (cooldown ${cooldownMin}m; last ${cd ? since.toFixed(0) + 'm ago' : 'never'}).`);
    } else if (decision.reason === 'cooldown') {
      console.log(`  ACTION: deficit, but Adam was pinged ${since.toFixed(0)}m ago (< ${cooldownMin}m cooldown) — holding.`);
    } else if (decision.reason === 'saturation-unchanged') {
      console.log(`  ACTION: deficit unchanged since last ping (same belt-dry state, no supply change) — suppressing duplicate Adam ping until supply changes.`);
    } else {
      const sent = await reachAdam({ verdict, beltDepth, demandSoon, idleNow, freeingSoon, deficit, claimable, rows, awareness });
      if (sent) { writeCooldown(currentFp); console.log('  ACTION: ✅ sourcing request dispatched to Adam (cooldown started).'); }
      else console.log('  ACTION: ⚠ no live Adam session found to reach — surface to operator.');
    }
    } // end else (no fresh pending proposals → normal Adam-ping path)
  }

  // ── SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: masked-stall escalation ──
  // A CONFIRMED dead loop (fresh parent, dead tick) holding no claim while ranked work waits cannot
  // self-revive, and the coordinator cannot re-arm a worker's /loop — only the operator can re-paste.
  // Turn the previously stdout-only advisory into a DURABLE, cooldowned escalation so the operator is
  // actually alerted. Read-only by default; emit gated behind --dispatch (mirrors the Adam reach-out).
  if (maskedIds.size > 0 && beltDepth > 0) {
    const maskedRows = rows.filter(r => r.state.startsWith('MASKED-STALL'));
    const who = maskedRows.map(r => `${r.callsign}/${r.sess}`).join(', ');
    const cd = readMaskedCooldown();
    const since = cd ? (Date.now() - cd.at) / 60000 : Infinity;
    if (!DISPATCH) {
      console.log(`  ACTION: ${maskedIds.size} MASKED-STALL worker(s) [${who}] — confirmed dead loop holding no claim while ${beltDepth} ranked item(s) wait. Run with --dispatch to emit a durable operator re-paste escalation (cooldown ${cooldownMin}m; last ${cd ? since.toFixed(0) + 'm ago' : 'never'}).`);
    } else if (since < cooldownMin) {
      console.log(`  ACTION: ${maskedIds.size} MASKED-STALL worker(s), but escalation was emitted ${since.toFixed(0)}m ago (< ${cooldownMin}m cooldown) — holding.`);
    } else {
      const emitted = await emitMaskedStallEscalation({ who, count: maskedIds.size, beltDepth, claimable });
      if (emitted) { writeMaskedCooldown(); console.log('  ACTION: ✅ masked-stall operator escalation emitted (cooldown started).'); }
      else console.log('  ACTION: ⚠ masked-stall escalation emit failed — surface to operator.');
    }
  }

  // machine-readable last line for the cron/log (+ sourcing-engine awareness fields, FR-2)
  console.log(`  GAUGE belt=${beltDepth} belt_extent=${beltExtent} dispatchable=${dispatchableCount} raw_unclaimed=${rawUnclaimed} idle=${idleNow} freeing_soon=${freeingSoon} demand=${demandSoon} deficit=${Math.max(0, deficit)} verdict=${verdict} masked_stall=${maskedIds.size} engine_on=${awareness.anyOn} unpromoted=${awareness.countStr}`);

  try {
    await stampLastFired(sb, 'standard_loop:capacity-forecast');
  } catch (err) {
    console.error(`[capacity-forecast] stampLastFired failed (non-fatal): ${err.message}`);
  }

  // ── FR-2: PERSIST THE VERDICT THIS RUN REACHED ─────────────────────────────────────────────
  // This value used to be computed a hundred lines up and thrown away — the file contained no
  // insert and no upsert anywhere — so "how long has the belt been in DEFICIT" was unanswerable
  // for want of anybody writing the number down. That is the whole defect this SD closes.
  //
  // IT WRITES capacity.verdict, NOT verdict, AND THE DIFFERENCE IS LOAD-BEARING. The `verdict`
  // binding above may have been rewritten to 'OK-CORPUS-GATED' by classifyCorpusGatedDeficit —
  // a POLICY overlay answering "is this deficit fillable", on a DIFFERENT vocabulary from the
  // capacity ladder. It is outside leg4's frozen four (lib/drive-loop/score/leg4-capacity.js:38),
  // so persisting it would write a row the reader that cites it throws on at :66. Found by reading
  // the gate's OUTPUT DOMAIN rather than trusting that one variable named verdict holds one kind
  // of thing. Both readings go into the row, so the overlay is recorded and nothing is lost.
  //
  // PLACED LAST, DELIBERATELY: everything this forecast already did — the render, the Adam
  // reach-out, the liveness stamp — has completed by now, so a throw here costs no prior work and
  // stays loud. It is the new durable write, and it is allowed to be the thing that fails.
  try {
    await makeCapacityVerdictPersist(sb)({
      run_id: null,
      verdict: capacity.verdict,
      belt_depth: beltDepth,
      demand_soon: demandSoon,
      deficit,
      detail: {
        source: 'coordinator-capacity-forecast',
        corpus_gated: corpusGate.corpusGated === true,
        rendered_verdict: verdict,
        // The gate's INPUTS, not just the fact that it fired. Recording only corpus_gated tells an
        // auditor THAT the deficit was reclassified and nothing about WHY, which is the half that
        // matters when someone later asks whether a quiet stretch was a healthy belt or a
        // suppressed one.
        auto_refill_on: autoRefillOn,
        unpromoted_count: unpromotedCount,
        // SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001 (FR-3): the extent belt_depth spans, recorded so a
        // reader of belt_capacity_verdicts can never mistake raw-unclaimed for the dispatchable-leaf belt.
        belt_extent: beltExtent,
        dispatchable_count: dispatchableCount,
        raw_unclaimed: rawUnclaimed,
        // SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 (FR-4): additive, namespaced, and already
        // fail-soft from gatherCapacityInputs — `engagement` degrades to {unmeasured:true} on
        // any internal fault or when ENGAGEMENT_GAUGE_ENABLED=false, never throws, and can never
        // block the belt_depth/demand_soon/deficit/verdict fields above from persisting.
        engagement_engaged: engagement.engaged ?? null,
        engagement_tail: engagement.tail ?? null,
        engagement_zombie: engagement.zombie ?? null,
        engagement_idle: engagement.idle ?? null,
        engagement_unknown: engagement.unknown ?? null,
        engagement_population: engagement.population ?? null,
        engagement_population_extent: engagement.populationExtent ?? null,
        engagement_unmeasured: engagement.unmeasured === true,
      },
    });
  } catch (err) {
    // TABLE-ABSENT IS THE EXPECTED STATE BETWEEN MERGE AND THE CHAIRMAN CEREMONY (FR-5), and it is
    // the ONLY error tolerated here. It is classified by ERROR CODE — never by a null row count,
    // which a missing relation and an empty one both produce.
    //
    // EVERY OTHER ERROR RETHROWS. Softening this catch into a log line is risk #1 on this SD's own
    // register: it would read as defensive programming, make every run look healthier, and rebuild
    // the exact defect being closed one layer down — a verdict that nobody can prove was recorded.
    if (!isTableAbsentError(err)) throw err;
    console.log(`  VERDICT-PERSIST: skipped — ${CAPACITY_VERDICT_TABLE} is staged but not applied (chairman-gated). Nothing is trending yet, and drive_score leg4 stays unavailable until the ceremony runs.`);
  }
}

function readMaskedCooldown() {
  try { return existsSync(MASKED_STALL_COOLDOWN_FILE) ? JSON.parse(readFileSync(MASKED_STALL_COOLDOWN_FILE, 'utf8')) : null; }
  catch { return null; }
}
function writeMaskedCooldown() {
  try { writeFileSync(MASKED_STALL_COOLDOWN_FILE, JSON.stringify({ at: Date.now(), iso: new Date().toISOString() })); } catch {}
}

// Emit ONE durable escalation row for confirmed masked-stalled workers, TARGETED AT ADAM — the
// escalation aggregation point + designated HITL who triages what reaches the chairman/operator (a
// worker cannot self-revive and the coordinator cannot re-arm a /loop, so a human must re-paste).
// insertCoordinationRow requires a valid full-UUID target, so we resolve the live Adam session.
// Fail-soft: no Adam session / any error returns false (the forecast never throws on this path).
async function emitMaskedStallEscalation(f) {
  try {
    // Canonical fresh-Adam election (freshness floor included) — never target a stale/dead Adam inbox.
    const adamId = await getActiveAdamId(sb);
    if (!adamId) return false; // no live Adam → caller logs "surface to operator"
    const correlation_id = `masked-stall-${Date.now()}`;
    const body = [
      `[COORD->ADAM] MASKED-STALL: ${f.count} worker(s) [${f.who}] have a CONFIRMED dead /loop — fresh heartbeat (parent alive) but a dead session-tick (process_alive_at stale), holding NO claim while ${f.beltDepth} ranked item(s) wait.`,
      `These workers cannot self-revive and the coordinator cannot re-arm a /loop. ACTION: surface to the operator to re-paste the /loop (or /checkin) wake prompt into those windows, or let the staleness sweep recycle them.`,
      `Claimable now: ${f.claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ') || 'NONE'}.`,
    ].join('\n');
    const res = await insertCoordinationRow(sb, {
      message_type: 'INFO',
      sender_session: process.env.CLAUDE_SESSION_ID,
      target_session: adamId,
      subject: `[COORD->ADAM] MASKED-STALL — ${f.count} dead loop(s) blocking ${f.beltDepth} ranked item(s)`,
      payload: { kind: 'coordinator_alert', topic: 'masked_stall', correlation_id, body, masked_count: f.count, belt_depth: f.beltDepth },
    });
    return !res.error;
  } catch {
    return false;
  }
}

// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): unpromoted roadmap depth.
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from an unscoped
// roadmap_wave_items count (which aggregated ALL wave generations, including dead
// proposed/archived ones) to v_plan_of_record_remainder (approved-wave-only, stamped
// remainder_state). "Unpromoted" here now means the true remainder — promotable_now |
// gated_on_chairman | in_flight_or_sequence_blocked — excluding satisfied_elsewhere/void.
// A column-select (not count/head) is used deliberately: PostgREST HEAD/count queries
// return error=null even for a nonexistent view, which would have silently reported 0
// instead of failing loud. fetchAllPaginated range-pages the read so the count itself
// never silently truncates at PostgREST's 1000-row cap either -- the exact live incident
// this SD exists to fix (a gauge read "1000" while the true count was 1495).
// Fail-soft: any error (view absent/unreadable) → null ("unknown"), never throws or blocks the forecast.
async function countUnpromotedRoadmapItems(client) {
  try {
    const rows = await fetchAllPaginated(() =>
      client
        .from('v_plan_of_record_remainder')
        .select('id, remainder_state')
        .in('remainder_state', ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked']));
    return rows.length;
  } catch {
    return null;
  }
}

function readCooldown() {
  try { return existsSync(COOLDOWN_FILE) ? JSON.parse(readFileSync(COOLDOWN_FILE, 'utf8')) : null; }
  catch { return null; }
}
function writeCooldown(fingerprint) {
  try { writeFileSync(COOLDOWN_FILE, JSON.stringify({ at: Date.now(), iso: new Date().toISOString(), fingerprint: fingerprint ?? null })); } catch {}
}

// SD-REFILL-00G39SZT: saturation-ack suppression. The time cooldown alone re-pings Adam with the
// SAME deficit on an unchanged belt-dry state once it lapses (6+ pings in ~2h after Adam reports
// saturation). A deficit fingerprint identifies the belt-dry STATE — verdict + belt depth + deficit
// magnitude + the (sorted) claimable sd_key set — so the forecaster can self-suppress re-pinging an
// identical deficit until the fingerprint changes (a supply-change signal). Pure (no IO).
export function deficitFingerprint({ verdict, beltDepth, deficit, claimable }) {
  const keys = Array.isArray(claimable)
    ? claimable.map((c) => (c && (c.sd_key || c.sd_id || c.key)) || '').filter(Boolean).sort()
    : [];
  return `${verdict}|belt=${beltDepth}|deficit=${Math.max(0, deficit)}|items=${keys.join(',')}`;
}

// Pure decision for the proactive Adam reach-out. Order: (a) inside the time cooldown -> hold;
// (b) cooldown lapsed but the fingerprint is unchanged from the last ping -> SUPPRESS (saturation:
// same deficit, no supply change); (c) otherwise -> ping. A legacy stamp without a fingerprint is
// treated as changed (one ping re-stamps it). Returns { ping, reason }.
export function shouldPingAdam({ cd, sinceMin, cooldownMin, currentFp }) {
  if (sinceMin < cooldownMin) return { ping: false, reason: 'cooldown' };
  if (cd && cd.fingerprint != null && cd.fingerprint === currentFp) {
    return { ping: false, reason: 'saturation-unchanged' };
  }
  return { ping: true, reason: 'state-changed-or-first' };
}

async function reachAdam(f) {
  const { data: adam } = await sb.from('claude_sessions')
    .select('session_id')
    .filter('metadata->>role', 'eq', 'adam')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  const adamId = adam && adam[0] && adam[0].session_id;
  if (!adamId) return false;
  const correlation_id = `cap-${Date.now()}`;
  const idleList = f.rows.filter(r => r.state.startsWith('IDLE')).map(r => r.callsign + '/' + r.sess).join(', ') || 'none';
  // SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C (FR-3): feed rung progress into the Adam
  // sourcing rank — name the active build rung so Adam ranks candidates active-rung-first / highest-
  // impact-on-rung-completion-first. Best-effort: omit the line if the active rung can't be resolved.
  let activeRungKey = null;
  try {
    const r = await sb.from('vision_ladder_rungs').select('rung_key').eq('is_active', true).maybeSingle();
    activeRungKey = r && r.data ? r.data.rung_key : null;
  } catch { activeRungKey = null; }
  const body = [
    `[COORD->ADAM] PREDICTIVE belt-low (capacity forecaster). Verdict=${f.verdict}.`,
    `Belt=${f.beltDepth} claimable vs demand(soon)=${f.demandSoon} (idle ${f.idleNow} + freeing-soon ${f.freeingSoon}) → short by ${f.deficit}.`,
    `Claimable now: ${f.claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ') || 'NONE'}. Idle/at-risk workers: ${idleList}.`,
    // SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): surface the engine state FIRST so
    // the ask is "activate/distill the engine/roadmap" when it's dormant-with-backlog, NOT perpetual
    // manual sourcing (the anti-pattern). The engine (10/10 children) + roadmap_wave_items are the SSOT.
    f.awareness ? `SOURCING ENGINE FIRST-CHECK: ${f.awareness.line}` : '',
    // SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001 (FR-3): retarget the belt-low ask at the
    // VISION-ALIGNED weakest capabilities (read the per-capability gauge + mine the dispositioned
    // estate) instead of generic harness-backlog grooming.
    `If the engine is dormant while the roadmap is rich, the remediation is to PROPOSE/co-sponsor ACTIVATION (flip the SOURCING_* flags + apply dormant migrations) and/or Wave-0 distillation, escalating to the chairman — before any manual backfill. Otherwise: READ the per-capability vision gauge + MINE the dispositioned estate for the WEAKEST capabilities, then propose a shortlist of CONFLICT-FREE, non-gated, draft-ready SD candidates that move those weakest capabilities forward (NOT generic harness-backlog grooming), propose-only; I'll dispatch. Dedup vs in-flight + SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001.`,
    // FR-3 needle-movement: rank the sourcing shortlist by which rung it moves.
    `NEEDLE-MOVEMENT RANK: order the shortlist ACTIVE-RUNG-FIRST${activeRungKey ? ` (active build rung = ${activeRungKey})` : ''}, then highest-impact-on-rung-completion-first — candidates that advance the active rung's weakest capabilities top the list; future-rung work ranks below.`,
    `Reply via adam-advisory (correlation ${correlation_id}).`,
  ].filter(Boolean).join('\n');
  const res = await insertCoordinationRow(sb, {
    message_type: 'INFO',
    sender_session: process.env.CLAUDE_SESSION_ID,
    target_session: adamId,
    subject: `[COORD->ADAM] PREDICTIVE source_work — belt short by ${f.deficit} (${f.verdict})`,
    payload: { kind: 'coordinator_request', topic: 'source_work', expects_reply: true, correlation_id, body, forecast: { belt: f.beltDepth, demand: f.demandSoon, deficit: f.deficit, verdict: f.verdict, sourcing_engine_on: f.awareness ? f.awareness.anyOn : null, unpromoted_roadmap_items: f.awareness ? f.awareness.countStr : null } },
  });
  return !res.error;
}

// SD-REFILL-00G39SZT: guard the entrypoint so importing this module (e.g. unit tests of the pure
// helpers) does not run the DB-touching main(). Only run when invoked directly as the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
    .catch(e => {
      console.error('[CAPACITY-FORECAST] error:', e.message);
      // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001: SET THE EXIT CODE. This catch was harmless before
      // the verdict persist existed — main() had no deliberate throw path, so logging and exiting 0
      // lost nothing. It is now the TERMINUS of this SD's primary guarantee: the writer throws, the
      // call site rethrows everything that is not table-absent, and then this swallowed it into a
      // green tick. Three individually reasonable layers composing into silence is exactly the
      // failure the throw was written to prevent, arriving one layer above it.
      // exitCode (not process.exit) so the natural drain is preserved on Windows.
      process.exitCode = 1;
    });
}
