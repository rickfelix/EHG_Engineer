#!/usr/bin/env node
// SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001 — durable, READ-ONLY coordinator charter-compliance self-audit.
//
// Hardens the inline operational self-audit (the SRE-gauges in coordinator-audit.mjs + the lost session-only
// CronCreate) into a dedicated durable mechanism. It is DETECTION ONLY — it never writes; each violation NAMES
// a concrete remediation ACTION the coordinator agent performs. Wired into STANDARD_LOOPS (coordinator-startup-
// check.mjs) so it survives a coordinator session restart, with a cron prompt that compels REMEDIATE-THEN-VERIFY.
//
// HARDENING over the inline version:
//   - AUTHORITATIVE liveness: heartbeat OR in-window armed-silence OR a live PID => ALIVE (a long-EXEC / armed-
//     silence worker with a stale heartbeat is NOT miscounted idle/dead — reuses the sweep PID resolver).
//   - FAIL-LOUD: the foundational SD + session queries emit a QUERY_ERROR marker + exit 1 on error (never the
//     silent empty-array / false all-clean the inline version produced on a column error).
//   - Bug-correct: completed-dep is NOT counted BLOCKED (unknown dep key -> dep-resolver ANOMALY); a worker with
//     a pending unread WORK_ASSIGNMENT is excluded from idle-with-work (no duplicate-assignment spray).
//   - New duty checks: resource-pool (worktrees N/20, fail-loud), backlog-rank staleness, QUIET-TICK committed-action.
//
// npm: coordinator:charter-audit. The gauge logic is pure + exported in lib/coordinator/charter-audit-detectors.mjs.

import 'dotenv/config';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getDbNowMs } from '../lib/fleet/db-clock.mjs';
import { isProcessRunning } from '../lib/heartbeat-manager.mjs';
import { countActiveWorktrees, MAX_WORKTREE_COUNT, countFilesystemWorktreeDirs } from '../lib/worktree-quota.js';
// SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: advisory, fail-open checkout-freshness dimension.
import { checkoutFreshness, freshnessBadge } from '../lib/governance/checkout-freshness.js';
import {
  classifyLiveness, detectIdleWithWork, detectDependencyHealth, detectWorktreePool,
  detectBacklogRankStaleness, detectQuietTickUnverified, foundationalQueryError, summarizeViolations,
  extractDepKey, resolveWorktreeCount, computeDispatchBelt, detectProgressStall, detectCrossRepoStarvation,
  // SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 (FR-3): coordinator mirror detectors.
  detectSourceToCapacity, detectCoordinatorWithoutAdam,
  // SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E: auto-refill awareness advisory.
  detectAutoRefillBacklog,
  // SD-REFILL-00R7REXL: DUTY-3b — in_progress + unclaimed orphans (invisible to DUTY-2/3/4/5/7/8/9).
  detectInProgressOrphans,
} from '../lib/coordinator/charter-audit-detectors.mjs';
// SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E: the -B dry-run verifier supplies the promotable count.
import { verifyStagedCandidates } from '../lib/sourcing-engine/refill-dry-run-verifier.js';
// SD-LEO-INFRA-SILENT-STALL-PREVENTION-001: DUTY-7 silent-stall detector (drafts stranded with null vision_score).
import { findStalledDrafts } from '../lib/coordinator/draft-stall-detector.mjs';
// SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001: DUTY-9 LEAD-aging detector (scored, unclaimed Adam-sourced vision drafts
// aging at current_phase='LEAD' — the dispatch gap; DISJOINT from DUTY-7 (unscored) and DUTY-8 (claimed)).
import { findLeadAgingDrafts } from '../lib/coordinator/lead-aging-detector.mjs';
// DUTY-3/8 worker-set fix: reuse the CANONICAL fleet-membership predicate (the same one coordinator-audit.mjs uses
// via liveFleetWorkers) so the coordinator's OWN session + Adam (role=adam) / non_fleet / fixtures are never
// miscounted as idle WORKERS. detectIdleWithWork only knows "no sd_key" → without this, the coordinator + Adam —
// which legitimately never hold an SD claim — read as idle workers (a false DUTY-3 no WORK_ASSIGNMENT can clear).
import { isDispatchableFleetMember } from '../lib/fleet/session-predicates.mjs';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const require = createRequire(import.meta.url);
// SD-LEO-INFRA-FLEET-HIBERNATION-001 FR-2/FR-3: the SINGLE 'line stopped' signal, consumed here so the
// charter-audit does not register a belt-low source-to-capacity violation while the fleet is quiesced.
const { assessFleetActivity } = require('../lib/coordinator/fleet-quiescence.cjs');
const { isWithinArmedSilenceWindow } = require('../lib/fleet/silence-cap.cjs');
const { classifyDispatchIneligibility } = require('../lib/fleet/claim-eligibility.cjs');
// SD-FDBK-INFRA-FLEET-SELF-CLAIM-001: appOfCwd derives a checkout's repo-app (it already strips a
// /.worktrees/<sd> suffix) — used to map each live worker's worktree_path -> the app it can build.
const { appOfCwd } = require('../lib/fleet/sd-executable-here.cjs');
// SD-LEO-INFRA-PROGRESS-STALL-DETECTION-001: reuse the CANONICAL stuck-worker staleness predicate for DUTY-8
// (no re-derived staleness math → no drift with the stale-session-sweep). GUARDED like the PID resolver above:
// a missing/broken detectors.cjs degrades detectStuckWorker to null → detectProgressStall fail-opens to a
// no-violation no-op (DUTY-8 is strictly additive and must never crash the audit at import time).
let detectStuckWorker = null;
try { ({ detectStuckWorker } = require('../lib/coordinator/detectors.cjs')); } catch { /* DUTY-8 fail-open if unavailable */ }
// Reuse the sweep's authoritative PID resolver (import-safe — main() is require.main-guarded). Optional: a
// failed import degrades the PID signal to a no-op (armed-silence + heartbeat still drive liveness).
let resolveCcPidFromTerminalId = () => null;
try { ({ resolveCcPidFromTerminalId } = require('./stale-session-sweep.cjs')); } catch { /* PID reuse optional */ }

const STALE_MS = Number(process.env.COORD_STALE_THRESHOLD_MS) || 5 * 60 * 1000;
const DISPATCH_RANK_TTL_MS = 60 * 60 * 1000; // mirrors worker-checkin.cjs DISPATCH_RANK_TTL_MS
// SILENT-STALL-PREVENTION-001 — honor an explicit 0 (Number()||7 would silently swallow it); fall back to 7
// only on NaN/empty/negative.
const _draftStallDays = Number(process.env.DRAFT_STALL_DAYS_THRESHOLD);
const DRAFT_STALL_MS = (Number.isFinite(_draftStallDays) && _draftStallDays >= 0 ? _draftStallDays : 7) * 86400000;
// SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001 — DUTY-9 threshold: a SCORED, UNCLAIMED Adam-sourced vision draft aging
// at current_phase='LEAD' beyond this is the dispatch gap (no worker advanced it). Honor an explicit 0; default 7d.
const _leadAgingDays = Number(process.env.LEAD_AGING_DAYS_THRESHOLD);
const LEAD_AGING_MS = (Number.isFinite(_leadAgingDays) && _leadAgingDays >= 0 ? _leadAgingDays : 7) * 86400000;
// SD-LEO-INFRA-PROGRESS-STALL-DETECTION-001 — DUTY-8 threshold: a claimed SD whose updated_at is stale beyond
// this (while the worker is fresh-heartbeating + NOT in armed-silence) is a progress-stall. Honor an explicit 0.
// Default 4h is DELIBERATELY conservative and is the PRIMARY false-positive guard: strategic_directives_v2.updated_at
// only advances on an actual SD-row UPDATE (handoffs / phase writes / progress-tick), NOT during ordinary EXEC work
// (editing code, running tests). A worker can also only arm an expected_silence_until window for ~30min (silence
// hard cap, well below this threshold), so armed-silence is merely a secondary early-out for an explicitly-parked
// worker — the 4h threshold (far longer than any normal phase) is what keeps DUTY-8 a rare, high-signal advisory
// rather than nagging every healthy long-EXEC worker. Env-tunable via PROGRESS_STALL_HOURS_THRESHOLD.
const _progressStallHrs = Number(process.env.PROGRESS_STALL_HOURS_THRESHOLD);
const PROGRESS_STALL_MS = (Number.isFinite(_progressStallHrs) && _progressStallHrs >= 0 ? _progressStallHrs : 4) * 3600000;
// SD-REFILL-00R7REXL — DUTY-3b threshold: an in_progress + UNCLAIMED SD with no live worker is only flagged an
// orphan once its updated_at is older than this, so a claim just hard-cap-released (the worker is about to
// self-resume, or the 15min orphan-adoption window hasn't elapsed) is not mis-flagged. Honor an explicit 0; default 10min.
const _orphanMinAgeMin = Number(process.env.ORPHAN_MIN_AGE_MINUTES);
const ORPHAN_MIN_AGE_MS = (Number.isFinite(_orphanMinAgeMin) && _orphanMinAgeMin >= 0 ? _orphanMinAgeMin : 10) * 60000;
const TERMINAL = new Set(['completed', 'cancelled', 'archived', 'deferred']);
const depKeysOf = (s) => (Array.isArray(s.dependencies) ? s.dependencies.map(extractDepKey).filter(Boolean) : []);

async function main() {
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const nowMs = await getDbNowMs(db);
  console.log('[COORD-CHARTER-AUDIT] ' + new Date(nowMs).toISOString());

  // ── FOUNDATIONAL queries — FAIL LOUD (never silent-empty / false all-clean) ──
  const { data: sdRows, error: sdErr } = await db.from('strategic_directives_v2')
    .select('sd_key,status,current_phase,claiming_session_id,updated_at,created_at,vision_score,dependencies,parent_sd_id,metadata,sd_type,target_application')
    .not('status', 'in', '(' + [...TERMINAL].join(',') + ')');
  const sdMarker = foundationalQueryError(sdErr, 'strategic_directives_v2');
  if (sdMarker) { console.error(sdMarker); process.exit(1); }
  const sds = sdRows || [];

  // Defense-in-depth: exclude lifecycle-terminated sessions server-side (classifyLiveness also guards this).
  const { data: sessRows, error: sessErr } = await db.from('claude_sessions')
    .select('session_id,terminal_id,heartbeat_at,sd_key,loop_state,expected_silence_until,status,metadata,worktree_path,claimed_at,continuous_sds_completed')
    .not('status', 'in', '(released,stale,ended)')
    .order('heartbeat_at', { ascending: false }).limit(80);
  const sessMarker = foundationalQueryError(sessErr, 'claude_sessions');
  if (sessMarker) { console.error(sessMarker); process.exit(1); }
  const sessions = sessRows || [];

  // ── AUTHORITATIVE liveness (heartbeat | armed-silence | live PID) ──
  const isPidAlive = (s) => { const pid = resolveCcPidFromTerminalId(s.terminal_id, s.session_id); return pid != null && isProcessRunning(pid); };
  const live = sessions.filter((s) => classifyLiveness(s, { nowMs, staleThresholdMs: STALE_MS, isWithinArmedSilence: isWithinArmedSilenceWindow, isPidAlive }).alive);
  // DUTY-3/8 operate on genuine WORKERS only: exclude the coordinator's own session + Adam + non_fleet + fixtures
  // via the canonical predicate. detectIdleWithWork/detectProgressStall only check "no sd_key", so without this the
  // coordinator and Adam (which never hold an SD claim) are counted as idle workers — a false DUTY-3 no
  // WORK_ASSIGNMENT can ever clear. coordinatorId is resolved from the live set (is_coordinator), with an env
  // fallback + a belt-and-suspenders is_coordinator filter in case the predicate's coordinatorId arg is unset.
  const coordinatorId = (sessions.find((s) => s.metadata && s.metadata.is_coordinator === true) || {}).session_id
    || process.env.CLAUDE_SESSION_ID || null;
  const liveWorkers = live.filter((s) => !(s.metadata && s.metadata.is_coordinator === true) && isDispatchableFleetMember(s, coordinatorId));
  // SD-FDBK-INFRA-FLEET-SELF-CLAIM-001: the set of repo-apps the live fleet can build (from each live
  // worker's worktree_path checkout). A cross-repo SD whose target_application is absent from this set
  // cannot be self-claimed by anyone → it starves until explicitly dispatched. Idle workers (no worktree)
  // contribute no app; with zero apps the detector's GUARD declines to flag (no-fleet != cross-repo starve).
  const liveSessionApps = Array.from(new Set((liveWorkers || []).map((s) => appOfCwd(s.worktree_path)).filter(Boolean)));

  // pending WORK_ASSIGNMENTs (unread => still pending; read_at-stamped => drained by the sweep, NOT pending)
  let pendingAssignmentSessionIds = new Set();
  const { data: waRows, error: waErr } = await db.from('session_coordination')
    .select('target_session,read_at').eq('message_type', 'WORK_ASSIGNMENT').is('read_at', null);
  if (waErr) console.error('[COORD-CHARTER-AUDIT] WARN: WORK_ASSIGNMENT query failed (fail-open): ' + waErr.message);
  else pendingAssignmentSessionIds = new Set((waRows || []).map((r) => r.target_session));

  // dep status map (missing key => ANOMALY, not BLOCKED)
  const depKeys = [...new Set(sds.flatMap(depKeysOf))];
  const statusByKey = {};
  if (depKeys.length) {
    const { data: depRows, error: depErr } = await db.from('strategic_directives_v2').select('sd_key,status').in('sd_key', depKeys);
    if (depErr) console.error('[COORD-CHARTER-AUDIT] WARN: dep-status query failed (fail-open): ' + depErr.message);
    for (const r of (depRows || [])) statusByKey[r.sd_key] = r.status;
  }

  // resource-pool — fail-loud on a git error. countActiveWorktrees SWALLOWS git-CLI failures (returns 0, never
  // throws), so compare it to the filesystem worktree-dir count: git=0 while the fs shows dirs => git failed => -1.
  let wtCount = -1;
  try {
    const gitCount = countActiveWorktrees(process.cwd());
    const fsDirCount = countFilesystemWorktreeDirs(join(process.cwd(), '.worktrees'));
    wtCount = resolveWorktreeCount({ gitCount, fsDirCount });
  } catch (e) { console.error('[COORD-CHARTER-AUDIT] WARN: worktree count failed: ' + e.message); wtCount = -1; }

  // dispatch belt via the CANONICAL classifyDispatchIneligibility (excludes orchestrator parents / fixtures /
  // human-action SDs) — so the audit never recommends dispatching an unclaimable PARENT to an idle worker.
  const { unclaimed, claimable } = computeDispatchBelt({ sds, statusByKey, terminalSet: TERMINAL, classifyIneligibility: classifyDispatchIneligibility });

  // SILENT-STALL-PREVENTION-001 (DSD-1): the AUTHORITATIVE scored-signal is an eva_vision_scores row (the same
  // fallback the hard vision-score gate uses), NOT the strategic_directives_v2.vision_score column (which is
  // essentially never populated on a successful conception-time score). Build the set of candidate-draft sd_keys
  // that DO have an eva_vision_scores row so a successfully-scored draft is NOT mislabelled a silent stall. Pure
  // fail-OPEN: on any error the set stays empty → the detector degrades to the column-only check (current safe
  // behavior). Bounded: queried only for the unscored-draft candidate keys, not the whole table.
  const candidateDraftKeys = sds.filter((s) => s.status === 'draft' && (s.vision_score === null || s.vision_score === undefined)).map((s) => s.sd_key);
  let scoredDraftKeys = new Set();
  if (candidateDraftKeys.length) {
    const { data: evaRows, error: evaErr } = await db.from('eva_vision_scores').select('sd_id').in('sd_id', candidateDraftKeys);
    if (evaErr) console.error('[COORD-CHARTER-AUDIT] WARN: eva_vision_scores query failed (fail-open, column-only): ' + evaErr.message);
    else scoredDraftKeys = new Set((evaRows || []).map((r) => r.sd_id));
  }

  // QUIET-TICK coordinator_review history (latest 2)
  const { data: reviews, error: revErr } = await db.from('feedback')
    .select('metadata,created_at').eq('category', 'coordinator_review').order('created_at', { ascending: false }).limit(2);
  if (revErr) console.error('[COORD-CHARTER-AUDIT] WARN: coordinator_review query failed (fail-open): ' + revErr.message);

  // SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 (FR-3): resolve facts for the coordinator
  // mirror detectors. Best-effort + skip-on-error (a transient query failure SKIPS the detector this
  // run rather than passing null → a fail-loud violation, so we never spam violations on a DB hiccup).
  const idleWorkerCount = (liveWorkers || []).filter((s) => s && !s.sd_key).length;
  let adamAlive = null;       // null ⇒ unresolved ⇒ skip the D3-lean detector this run
  let sourceReqRecently = null; // null ⇒ unresolved ⇒ skip the source-to-capacity detector this run
  try {
    const { data: recent, error: e } = await db.from('claude_sessions')
      .select('session_id, metadata, heartbeat_at')
      .gte('heartbeat_at', new Date(nowMs - 15 * 60 * 1000).toISOString());
    if (!e) {
      // Adam's canonical marker is metadata.role === 'adam' (lib/fleet/genuine-worker.mjs).
      adamAlive = (recent || []).some((s) => String(s?.metadata?.role || '').toLowerCase() === 'adam');
    }
  } catch { /* leave adamAlive null → skip */ }
  try {
    // A recent coordinator→Adam sourcing handshake (belt-low source request). Best-effort proxy:
    // a recent adam_advisory / coordinator sourcing ping in session_coordination within 30 min.
    const { data: src, error: e } = await db.from('session_coordination')
      .select('id, message_type, payload, created_at')
      .gte('created_at', new Date(nowMs - 30 * 60 * 1000).toISOString())
      .limit(200);
    if (!e) {
      sourceReqRecently = (src || []).some((m) => {
        const blob = JSON.stringify(m || {}).toLowerCase();
        return /source|sourcing|belt[-_ ]?low|capacity|gap[-_ ]?clos/.test(blob);
      });
    }
  } catch { /* leave sourceReqRecently null → skip */ }

  // SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E: count valid auto-promote candidates in the staged
  // corpus (read-only) via the -B dry-run verifier + -A predicate, so the coordinator is AWARE the belt
  // can be refilled. Best-effort / fail-open: any error leaves promotableCount=0 (no advisory).
  let promotableCount = 0;
  try {
    // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from an unscoped
    // roadmap_wave_items read (all wave generations, including dead proposed/archived
    // ones) to v_plan_of_record_remainder (approved-wave-only, stamped remainder_state).
    // "Promotable" candidates are remainder_state='promotable_now' -- items already
    // classified void/satisfied_elsewhere/gated/blocked are excluded up front rather
    // than relying on this advisory's own item_disposition/promoted_to_sd_key filter.
    // QF-20260622-620: select metadata so promotableCount reflects recovered descriptions
    // (hasRecoveredSubstance reads item.metadata.description). 3rd/last blind site after PR #5030
    // fixed refill-cron.mjs + refill-verify.mjs; without it this advisory under-counts the belt.
    const { data: staged, error: se } = await db.from('v_plan_of_record_remainder')
      .select('id, title, source_type, source_id, item_disposition, promoted_to_sd_key, lane, metadata')
      .eq('remainder_state', 'promotable_now').limit(2000);
    if (!se) promotableCount = verifyStagedCandidates(staged || []).validCount;
  } catch { /* fail-open → promotableCount stays 0, no advisory */ }

  // SD-LEO-INFRA-FLEET-HIBERNATION-001 FR-2/FR-3: assess fleet quiescence (the shared 'line stopped'
  // gate). Fails OPEN to active on any error (never silences the fleet), so an assessment hiccup keeps
  // the belt-low detector live. When quiescent, the source-to-capacity detector is suppressed below.
  let fleetQuiescent = false;
  try {
    const q = await assessFleetActivity(db, { now: nowMs });
    fleetQuiescent = q.quiescent === true;
    console.log(`[COORD-CHARTER-AUDIT] fleet quiescence: ${q.reason}`);
  } catch (e) {
    console.error('[COORD-CHARTER-AUDIT] WARN: quiescence assessment failed (fail-active): ' + e.message);
  }

  // ── run the pure detectors ──
  const D = {
    pool: detectWorktreePool({ count: wtCount, max: MAX_WORKTREE_COUNT }),
    idle: detectIdleWithWork({ liveSessions: liveWorkers, unclaimedCount: unclaimed.length, pendingAssignmentSessionIds, nowMs, isWithinArmedSilence: isWithinArmedSilenceWindow }),
    dep: detectDependencyHealth({ sds, statusByKey, terminalSet: TERMINAL, nowMs }),
    rank: detectBacklogRankStaleness({ claimableSds: claimable, nowMs, ttlMs: DISPATCH_RANK_TTL_MS }),
    // SD-FDBK-INFRA-FLEET-SELF-CLAIM-001: cross-repo SDs no live worker checkout can build (silent starvation).
    crossRepo: detectCrossRepoStarvation({ claimableSds: claimable, liveSessionApps, nowMs }),
    // SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E: belt CAN be refilled — promotable staged candidates
    // exist but auto-refill isn't draining them. Advisory; suppressed once AUTO_REFILL_CRON_LIVE=true.
    autoRefill: detectAutoRefillBacklog({ promotableCount, autoRefillLive: process.env.AUTO_REFILL_CRON_LIVE === 'true' }),
    quiet: detectQuietTickUnverified({ coordinatorReviews: reviews || [] }),
    // FR-3 coordinator mirror — added only when their facts resolved (skip-on-error, no spam).
    ...(adamAlive !== null ? { d3lean: detectCoordinatorWithoutAdam({ coordinatorAlive: true, adamAlive }) } : {}),
    ...(sourceReqRecently !== null ? { srcCap: detectSourceToCapacity({ claimableBelt: claimable.length, idleWorkers: idleWorkerCount, sourceRequestedRecently: sourceReqRecently, quiescent: fleetQuiescent }) } : {}),
    // SD-LEO-INFRA-SILENT-STALL-PREVENTION-001: drafts stranded with a null vision_score (silent stall).
    // Advisory remediation count only — summarizeViolations never drives a process.exit (foundational-query
    // failures are the ONLY hard exits), so a stalled draft surfaces a remediation action, never a hard fail.
    draft: findStalledDrafts(sds, nowMs, { thresholdMs: DRAFT_STALL_MS, scoredKeys: scoredDraftKeys }),
    // SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001: DUTY-9 — scored, UNCLAIMED Adam vision drafts aging at LEAD (dispatch
    // gap). Reuses the same scoredDraftKeys signal but flags the COMPLEMENT of DUTY-7 (scored, not unscored), and
    // requires UNCLAIMED (complement of DUTY-8's claimed) — so no SD is ever double-reported across the three.
    leadAging: findLeadAgingDrafts(sds, nowMs, { thresholdMs: LEAD_AGING_MS, scoredKeys: scoredDraftKeys }),
    // SD-LEO-INFRA-PROGRESS-STALL-DETECTION-001: DUTY-8 — claim-holders heartbeat-ALIVE but claimed SD FROZEN.
    // Reuses the canonical detectStuckWorker predicate (injected); advisory remediation count only (no new exit).
    progress: detectProgressStall({ liveSessions: liveWorkers, sds, nowMs, thresholdMs: PROGRESS_STALL_MS, isWithinArmedSilence: isWithinArmedSilenceWindow, detectStuck: detectStuckWorker }),
    // SD-REFILL-00R7REXL: DUTY-3b — in_progress + unclaimed orphan with no live worker. Liveness gate uses
    // the full `live` set (heartbeat|armed-silence|PID) NOT liveWorkers, so a long-Task worker whose claim
    // was transiently hard-cap-released (still heartbeating its sd_key) is never mis-flagged (c1df435f).
    orphan: detectInProgressOrphans({ sds, liveSessions: live, classifyIneligibility: classifyDispatchIneligibility, nowMs, minAgeMs: ORPHAN_MIN_AGE_MS }),
  };

  const flag = (r) => (r.remediation ? '  ⚠ ' + r.remediation : '');
  console.log('  DUTY-1 RESOURCE-POOL : ' + D.pool.detail + flag(D.pool));
  console.log('  DUTY-2 LIVENESS      : ' + live.length + ' alive of ' + sessions.length + ' sessions (heartbeat|armed-silence|PID — long-EXEC counted alive)');
  console.log('  DUTY-3 FLOW idle/work: ' + D.idle.detail + flag(D.idle));
  console.log('  DUTY-4 DEPENDENCY    : ' + D.dep.detail + flag(D.dep));
  for (const a of D.dep.anomalies.slice(0, 5)) console.log('      ANOMALY ' + a.sd + ' dep(s) not found: ' + a.unknownDeps.join(','));
  console.log('  DUTY-6 BACKLOG-RANK  : ' + D.rank.detail + flag(D.rank));
  console.log('  CROSS-REPO STARVATION: ' + D.crossRepo.detail + flag(D.crossRepo)); // FLEET-SELF-CLAIM-001
  console.log('  AUTO-REFILL BACKLOG  : ' + D.autoRefill.detail + flag(D.autoRefill)); // AUTO-REFILL-SELECTION-GATE-001-E
  console.log('  QUIET-TICK COMMITTED : ' + D.quiet.detail + flag(D.quiet));
  console.log('  DUTY-7 DRAFT-STALL   : ' + D.draft.detail + flag(D.draft)); // SILENT-STALL-PREVENTION-001
  console.log('  DUTY-8 PROGRESS-STALL: ' + D.progress.detail + flag(D.progress)); // PROGRESS-STALL-DETECTION-001
  console.log('  DUTY-9 LEAD-AGING    : ' + D.leadAging.detail + flag(D.leadAging)); // ADAM-VISION-SD-FLOW-001
  console.log('  DUTY-3b IN-PROG ORPHAN: ' + D.orphan.detail + flag(D.orphan)); // SD-REFILL-00R7REXL
  // SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 (FR-3) — coordinator mirror adherence.
  if (D.srcCap) console.log('  SOURCE-TO-CAPACITY   : ' + D.srcCap.detail + flag(D.srcCap));
  if (D.d3lean) console.log('  D3-LEAN (coord/Adam) : ' + D.d3lean.detail + flag(D.d3lean));

  // SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: ADVISORY freshness dimension — fail-open and deliberately
  // kept OUT of `D`/summarizeViolations, so a stale checkout surfaces a warning but never trips the
  // hard violation count / exit. STALE-CRITICAL (protocol drift) is the high-value advisory here.
  try {
    console.log('  DUTY-FRESHNESS CHECK : ' + freshnessBadge(checkoutFreshness(process.cwd(), { role: 'coordinator' })));
  } catch (e) {
    console.log('  DUTY-FRESHNESS CHECK : ✅ freshness check skipped (fail-open): ' + (e?.message || String(e)));
  }

  const summary = summarizeViolations(Object.values(D));
  if (summary.count > 0) {
    console.log('  ── VIOLATIONS: ' + summary.count + ' — REMEDIATE each named ACTION, then RE-RUN to confirm 0 ──');
    for (const v of summary.violations) console.log('      • ' + v.detail + ' → ' + (v.remediation || '(no action)'));
  } else {
    console.log('  ✓ CHARTER CLEAN — 0 violations');
  }
  console.log('CHARTER_AUDIT_VIOLATIONS=' + summary.count);

  try {
    await stampLastFired(db, 'standard_loop:charter-audit');
  } catch (err) {
    console.error(`[coordinator-charter-audit] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

main().catch((err) => { console.error('[COORD-CHARTER-AUDIT] FATAL: ' + ((err && err.message) || err)); process.exit(1); });
