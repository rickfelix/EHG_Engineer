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
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: shared belt-exclusion predicate so test/UAT
// fixtures AND bare-shell stubs (neither can pass LEAD-TO-PLAN) never inflate belt depth —
// counting them as claimable over-reports capacity and suppresses the deficit/Adam alert.
import { isExcludedFromBelt } from '../lib/coordinator/sd-exclusion.mjs';
// SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: the pure live-worker predicate. It wraps the
// canonical isDispatchableFleetMember SSOT the dashboard uses (so the forecaster AGREES with
// fleet-dashboard.cjs on coordinator/adam/non_fleet/fixture exclusion) and ADDS a released-status
// guard (FR-2; the forecaster is deliberately stricter than the dashboard on status).
import { isLiveCountableWorker } from './lib/live-countable-worker.mjs';
// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): surface the sourcing-engine
// flag state + unpromoted roadmap depth so a belt-low/DEFICIT ping says "engine OFF, N unpromoted
// -> activate/distill" instead of only "source N candidates" (manual backfill is the anti-pattern).
import { readSourcingEngineFlags, formatSourcingAwareness } from './lib/sourcing-engine-awareness.mjs';
// SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001: an idle worker is STALLED only when
// its loop isn't claiming DESPITE available work — gate the stall label on belt depth, not heartbeat
// age alone, so an empty-belt idle worker isn't a false-positive STALLED.
import { classifyIdleWorker } from './lib/capacity-idle-classifier.mjs';

const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
// SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: resolve the active coordinator id so the
// shared isDispatchableFleetMember excludes the coordinator by id exactly like the dashboard does.
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
// SD-LEO-INFRA-FORECASTER-DEP-SENTINEL-BELTDEPTH-001: resolve dependency keys via the canonical
// blocker rule (lib/utils/parse-sd-dependencies.cjs, same SSOT coordinator-audit.mjs uses) instead of
// a hand-rolled resolver. parseSdDependencies counts ONLY /^SD-/ entries as real blockers, so the
// documented 'no dependencies' sentinel ({sd_key:'none'} / bare 'none') and free-text placeholders
// resolve to zero blockers — a freshly-sourced SD is no longer mis-counted out of belt depth.
const { parseSdDependencies } = require('../lib/utils/parse-sd-dependencies.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COOLDOWN_FILE = join(REPO_ROOT, '.coord-capacity-source-last.json');

// ── tunables ──
const HEARTBEAT_LIVE_MS = 5 * 60 * 1000;   // a session is "live" if it heartbeat within 5 min
const HORIZON_MIN = 20;                      // "freeing soon" = ETA-to-free within this window
const PROGRESS_SOON = 65;                    // ...or overall progress >= this
const BELT_BUFFER = 1;                       // keep at least this many claimable SDs beyond demand
// phase-median minutes (infrastructure-weighted; from coordinator.md fleet-eta reference table)
const PHASE_MIN = { LEAD: 3, PLAN: 12, EXEC: 30, FINAL: 5 };
const TOTAL_MIN = PHASE_MIN.LEAD + PHASE_MIN.PLAN + PHASE_MIN.EXEC; // ~45m fresh SD

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

function normPhase(p) {
  const u = String(p || '').toUpperCase();
  if (u.includes('EXEC')) return 'EXEC';
  if (u.includes('PLAN')) return 'PLAN';
  if (u.includes('FINAL') || u.includes('VERIF') || u.includes('APPROV')) return 'FINAL';
  return 'LEAD';
}
// ETA-to-free for a single claim: overall-progress-driven remaining of a ~TOTAL_MIN SD, floored.
function etaMinForClaim(progress, phase) {
  const ph = normPhase(phase);
  if (ph === 'FINAL') return Math.max(2, PHASE_MIN.FINAL * (1 - (progress || 0) / 100));
  const remaining = TOTAL_MIN * (1 - Math.min(99, progress || 0) / 100);
  return Math.max(2, Math.round(remaining));
}

async function main() {
  const liveCutoff = new Date(Date.now() - HEARTBEAT_LIVE_MS).toISOString();
  const [{ data: sessions }, { data: sds }, { data: openQfRows }] = await Promise.all([
    sb.from('claude_sessions')
      // SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: + status so released/terminal sessions
      // are not counted as available workers even with a recent heartbeat (FR-2).
      .select('session_id, terminal_id, sd_key, heartbeat_at, loop_state, metadata, status')
      .gte('heartbeat_at', liveCutoff),
    sb.from('strategic_directives_v2')
      // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + metadata (is_fixture marker) and
      // title/description (bare-shell detection) so excluded rows do not inflate belt depth.
      .select('sd_key, title, description, status, sd_type, current_phase, progress_percentage, claiming_session_id, dependencies, metadata')
      .not('status', 'in', '("completed","cancelled","deferred")'),
    // Open QFs are claimable belt too (a worker can claim a QF) — counting only SDs
    // under-reports belt depth and over-reports deficit (workers self-claim QFs).
    sb.from('quick_fixes').select('id').eq('status', 'open'),
  ]);
  const openQfCount = Array.isArray(openQfRows) ? openQfRows.length : 0;

  // ── resolve dependency statuses → claimable belt ──
  // parseSdDependencies handles the live shape mix ([{sd_id}], [{sd_key}], raw strings) AND drops the
  // 'none' sentinel + free-text non-SD placeholders, returning only real /^SD-/ blocker keys.
  const depKeys = new Set();
  (sds || []).forEach(d => parseSdDependencies(d.dependencies).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }
  const claimable = [];
  const claimsBySession = {};
  let beltExcludes = 0;
  for (const d of (sds || [])) {
    if (d.claiming_session_id) {
      (claimsBySession[d.claiming_session_id] ||= []).push(d);
      continue;
    }
    if (d.sd_type === 'orchestrator') continue; // parents auto-complete; never dispatch
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: fixtures and bare-shell stubs are not real
    // belt — neither can pass LEAD-TO-PLAN. Excluding them keeps beltDepth honest so a
    // forecast deficit (and the proactive Adam reach-out) is not masked by non-distributable rows.
    if (isExcludedFromBelt(d)) { beltExcludes++; continue; }
    const unmet = parseSdDependencies(d.dependencies).filter(k => depStatus[k] !== 'completed');
    if (unmet.length === 0) claimable.push(d);
  }
  if (beltExcludes) console.log(`[CAPACITY-FORECAST] ${beltExcludes} non-distributable SD(s) (fixture/bare-shell) excluded from belt depth`);

  // ── classify live workers (exclude coordinator + adam + non_fleet + fixtures + released) ──
  // SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: use the canonical isDispatchableFleetMember
  // SSOT (the dashboard's predicate) so a fixture/test session (FR-1) never counts as live idle/at-risk
  // demand; ALSO drop released/terminal sessions (FR-2) which are not available workers even with a
  // recent heartbeat. Keep the metadata.is_coordinator guard so a stale coordinator-marked session is
  // excluded even when it is not the CURRENTLY-active coordinator id.
  let coordinatorId = null;
  try { coordinatorId = await getActiveCoordinatorId(sb); } catch { coordinatorId = null; }
  const workers = (sessions || []).filter(s => isLiveCountableWorker(s, coordinatorId));

  const rows = [];
  let idleNow = 0, freeingSoon = 0, building = 0, stalled = 0;
  for (const w of workers) {
    const mine = claimsBySession[w.session_id] || [];
    const callsign = (w.metadata && w.metadata.callsign) || '—';
    if (mine.length) {
      building++;
      // multi-claim worker frees only after ALL its claims finish → sum remaining
      const eta = mine.reduce((sum, d) => sum + etaMinForClaim(d.progress_percentage, d.current_phase), 0);
      const soon = eta <= HORIZON_MIN || mine.some(d => (d.progress_percentage || 0) >= PROGRESS_SOON);
      if (soon) freeingSoon++;
      rows.push({
        sess: w.session_id.slice(0, 8), callsign, state: 'BUILDING',
        detail: mine.map(d => `${d.sd_key.replace('SD-LEO-INFRA-', '')}(${normPhase(d.current_phase)} ${d.progress_percentage || 0}%)`).join(' + '),
        eta: `~${eta}m to free${soon ? ' ⏰SOON' : ''}`,
      });
    } else {
      // idle: distinguish a healthy idle from a stalled loop (alive but never converting work)
      idleNow++;
      const hbAgeS = Math.round((Date.now() - new Date(w.heartbeat_at).getTime()) / 1000);
      // A stale heartbeat is only a STALL if there is claimable work the loop is failing to take.
      // beltDepth inputs are already populated before this loop (openQfCount + claimable[]); the
      // beltDepth re-derivation lower down is only for the verdict math.
      const { stalled: stalledFlag, state: idleState, detail: idleDetail } =
        classifyIdleWorker({ hbAgeS, beltDepth: claimable.length + openQfCount });
      if (stalledFlag) stalled++;
      rows.push({
        sess: w.session_id.slice(0, 8), callsign, state: idleState,
        detail: idleDetail,
        eta: `idle ${hbAgeS}s`,
      });
    }
  }

  const demandSoon = idleNow + freeingSoon;
  const beltDepth = claimable.length + openQfCount; // claimable SDs + open QFs (both worker-claimable)
  const deficit = (demandSoon + BELT_BUFFER) - beltDepth;
  let verdict;
  if (beltDepth === 0 && idleNow > 0) verdict = 'DEFICIT-URGENT';
  else if (deficit > 0) verdict = 'DEFICIT';
  else if (deficit === 0) verdict = 'TIGHT';
  else verdict = 'SURPLUS';

  // ── render ──
  const ts = new Date().toISOString();
  console.log(`[CAPACITY-FORECAST] ${ts}`);
  console.log(`  workers: ${workers.length} live  |  building ${building}  |  idle ${idleNow}${stalled ? ` (${stalled} STALLED)` : ''}  |  freeing-soon ${freeingSoon}`);
  for (const r of rows) {
    console.log(`    ${r.sess} ${String(r.callsign).padEnd(8)} ${r.state.padEnd(13)} ${r.eta.padEnd(18)} ${r.detail}`);
  }
  console.log(`  BELT: ${beltDepth} claimable (${claimable.length} SD + ${openQfCount} QF)  |  DEMAND(soon): ${demandSoon} (idle ${idleNow} + freeing-soon ${freeingSoon})  |  buffer ${BELT_BUFFER}`);
  if (claimable.length) console.log(`        claimable SDs: ${claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ')}`);

  // SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): sourcing-engine awareness — flag
  // state + unpromoted roadmap depth so belt-low is read as "activate/distill" before "hand-ask Adam".
  const sourcingFlags = readSourcingEngineFlags(process.env);
  const unpromotedCount = await countUnpromotedRoadmapItems(sb);
  const awareness = formatSourcingAwareness({ flags: sourcingFlags, unpromotedCount });
  console.log(`  SOURCING: ${awareness.line}`);

  console.log(`  VERDICT: ${verdict}` + (deficit > 0 ? `  → belt short by ${deficit} — ${awareness.recommendation}` : ''));

  // ── proactive Adam reach-out on a forecast deficit ──
  if (verdict.startsWith('DEFICIT')) {
    const cd = readCooldown();
    const since = cd ? (Date.now() - cd.at) / 60000 : Infinity;
    if (!DISPATCH) {
      console.log(`  ACTION: deficit forecast — run with --dispatch to auto-request a sourcing shortlist from Adam (cooldown ${cooldownMin}m; last ${cd ? since.toFixed(0) + 'm ago' : 'never'}).`);
    } else if (since < cooldownMin) {
      console.log(`  ACTION: deficit, but Adam was pinged ${since.toFixed(0)}m ago (< ${cooldownMin}m cooldown) — holding.`);
    } else {
      const sent = await reachAdam({ verdict, beltDepth, demandSoon, idleNow, freeingSoon, deficit, claimable, rows, awareness });
      if (sent) { writeCooldown(); console.log('  ACTION: ✅ sourcing request dispatched to Adam (cooldown started).'); }
      else console.log('  ACTION: ⚠ no live Adam session found to reach — surface to operator.');
    }
  }

  // machine-readable last line for the cron/log (+ sourcing-engine awareness fields, FR-2)
  console.log(`  GAUGE belt=${beltDepth} idle=${idleNow} freeing_soon=${freeingSoon} demand=${demandSoon} deficit=${Math.max(0, deficit)} verdict=${verdict} engine_on=${awareness.anyOn} unpromoted=${awareness.countStr}`);
}

// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): unpromoted roadmap depth.
// Unpromoted = roadmap_wave_items with promoted_to_sd_key IS NULL (mirrors scripts/roadmap-status.js).
// Fail-soft: any error (table absent/unreadable) → null ("unknown"), never throws or blocks the forecast.
async function countUnpromotedRoadmapItems(client) {
  try {
    const { count, error } = await client
      .from('roadmap_wave_items')
      .select('id', { count: 'exact', head: true })
      .is('promoted_to_sd_key', null);
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

function readCooldown() {
  try { return existsSync(COOLDOWN_FILE) ? JSON.parse(readFileSync(COOLDOWN_FILE, 'utf8')) : null; }
  catch { return null; }
}
function writeCooldown() {
  try { writeFileSync(COOLDOWN_FILE, JSON.stringify({ at: Date.now(), iso: new Date().toISOString() })); } catch {}
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

main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
  .catch(e => { console.error('[CAPACITY-FORECAST] error:', e.message); });
