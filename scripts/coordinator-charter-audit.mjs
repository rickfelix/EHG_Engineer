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
  extractDepKey, resolveWorktreeCount, computeDispatchBelt,
} from '../lib/coordinator/charter-audit-detectors.mjs';

const require = createRequire(import.meta.url);
const { isWithinArmedSilenceWindow } = require('../lib/fleet/silence-cap.cjs');
const { classifyDispatchIneligibility } = require('../lib/fleet/claim-eligibility.cjs');
// Reuse the sweep's authoritative PID resolver (import-safe — main() is require.main-guarded). Optional: a
// failed import degrades the PID signal to a no-op (armed-silence + heartbeat still drive liveness).
let resolveCcPidFromTerminalId = () => null;
try { ({ resolveCcPidFromTerminalId } = require('./stale-session-sweep.cjs')); } catch { /* PID reuse optional */ }

const STALE_MS = Number(process.env.COORD_STALE_THRESHOLD_MS) || 5 * 60 * 1000;
const DISPATCH_RANK_TTL_MS = 60 * 60 * 1000; // mirrors worker-checkin.cjs DISPATCH_RANK_TTL_MS
const TERMINAL = new Set(['completed', 'cancelled', 'archived', 'deferred']);
const depKeysOf = (s) => (Array.isArray(s.dependencies) ? s.dependencies.map(extractDepKey).filter(Boolean) : []);

async function main() {
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const nowMs = await getDbNowMs(db);
  console.log('[COORD-CHARTER-AUDIT] ' + new Date(nowMs).toISOString());

  // ── FOUNDATIONAL queries — FAIL LOUD (never silent-empty / false all-clean) ──
  const { data: sdRows, error: sdErr } = await db.from('strategic_directives_v2')
    .select('sd_key,status,current_phase,claiming_session_id,updated_at,dependencies,parent_sd_id,metadata,sd_type')
    .not('status', 'in', '(' + [...TERMINAL].join(',') + ')');
  const sdMarker = foundationalQueryError(sdErr, 'strategic_directives_v2');
  if (sdMarker) { console.error(sdMarker); process.exit(1); }
  const sds = sdRows || [];

  // Defense-in-depth: exclude lifecycle-terminated sessions server-side (classifyLiveness also guards this).
  const { data: sessRows, error: sessErr } = await db.from('claude_sessions')
    .select('session_id,terminal_id,heartbeat_at,sd_key,expected_silence_until,status')
    .not('status', 'in', '(released,stale,ended)')
    .order('heartbeat_at', { ascending: false }).limit(80);
  const sessMarker = foundationalQueryError(sessErr, 'claude_sessions');
  if (sessMarker) { console.error(sessMarker); process.exit(1); }
  const sessions = sessRows || [];

  // ── AUTHORITATIVE liveness (heartbeat | armed-silence | live PID) ──
  const isPidAlive = (s) => { const pid = resolveCcPidFromTerminalId(s.terminal_id, s.session_id); return pid != null && isProcessRunning(pid); };
  const live = sessions.filter((s) => classifyLiveness(s, { nowMs, staleThresholdMs: STALE_MS, isWithinArmedSilence: isWithinArmedSilenceWindow, isPidAlive }).alive);

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

  // QUIET-TICK coordinator_review history (latest 2)
  const { data: reviews, error: revErr } = await db.from('feedback')
    .select('metadata,created_at').eq('category', 'coordinator_review').order('created_at', { ascending: false }).limit(2);
  if (revErr) console.error('[COORD-CHARTER-AUDIT] WARN: coordinator_review query failed (fail-open): ' + revErr.message);

  // ── run the pure detectors ──
  const D = {
    pool: detectWorktreePool({ count: wtCount, max: MAX_WORKTREE_COUNT }),
    idle: detectIdleWithWork({ liveSessions: live, unclaimedCount: unclaimed.length, pendingAssignmentSessionIds }),
    dep: detectDependencyHealth({ sds, statusByKey, terminalSet: TERMINAL, nowMs }),
    rank: detectBacklogRankStaleness({ claimableSds: claimable, nowMs, ttlMs: DISPATCH_RANK_TTL_MS }),
    quiet: detectQuietTickUnverified({ coordinatorReviews: reviews || [] }),
  };

  const flag = (r) => (r.remediation ? '  ⚠ ' + r.remediation : '');
  console.log('  DUTY-1 RESOURCE-POOL : ' + D.pool.detail + flag(D.pool));
  console.log('  DUTY-2 LIVENESS      : ' + live.length + ' alive of ' + sessions.length + ' sessions (heartbeat|armed-silence|PID — long-EXEC counted alive)');
  console.log('  DUTY-3 FLOW idle/work: ' + D.idle.detail + flag(D.idle));
  console.log('  DUTY-4 DEPENDENCY    : ' + D.dep.detail + flag(D.dep));
  for (const a of D.dep.anomalies.slice(0, 5)) console.log('      ANOMALY ' + a.sd + ' dep(s) not found: ' + a.unknownDeps.join(','));
  console.log('  DUTY-6 BACKLOG-RANK  : ' + D.rank.detail + flag(D.rank));
  console.log('  QUIET-TICK COMMITTED : ' + D.quiet.detail + flag(D.quiet));

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
}

main().catch((err) => { console.error('[COORD-CHARTER-AUDIT] FATAL: ' + ((err && err.message) || err)); process.exit(1); });
