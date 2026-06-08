// coordinator-audit.mjs — recurring coordinator audit of the THREE work sources.
//   (1) Harness backlog  : feedback category=harness_backlog, open   → items to SOURCE into SDs
//   (2) SD queue         : non-terminal SDs (claimed / unclaimed / stuck)
//   (3) Coordinator inbox: unread worker /signal traffic
// Surfaces all three + flags whether to SOURCE backlog into DRAFT SDs. Sourcing rule: only when the
// queue would otherwise STARVE available workers (don't flood the queue when there's already surplus
// work — then the constraint is worker capacity, not work). See memory
// feedback-coordinator-delegate-and-keep-workers-busy.

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { countActiveWorktrees, MAX_WORKTREE_COUNT } from '../lib/worktree-quota.js';
import { liveFleetWorkers } from '../lib/fleet/genuine-worker.mjs';
import { getDbNowMs } from '../lib/fleet/db-clock.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
// SD-FDBK-INFRA-NODE-CLOCK-SKEW-001: use the DB server clock (not the node clock) as the
// age reference so node-clock skew can't make all workers/SDs read as stale. Every
// downstream age calc (liveFleetWorkers nowMs, SD aging, dep-stale aging) consumes `t`.
// Fail-open: getDbNowMs returns the node clock if the DB read fails (no worse than before).
const t = await getDbNowMs(db);
const OPEN = ['new', 'in_progress', 'open', 'triaged', 'snoozed'];
const TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
const termList = '(' + TERMINAL.join(',') + ')';

// SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (FR-003): pool-utilization threshold.
// Mirror the watchdog default (0.8) so the audit warns at the same point the
// watchdog acts. Override with WORKTREE_POOL_THRESHOLD.
const POOL_THRESHOLD = (() => {
  const n = parseFloat((process.env.WORKTREE_POOL_THRESHOLD || '').trim());
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8;
})();

// (1) harness backlog
const { data: hb } = await db.from('feedback').select('id,title,status,severity,created_at').eq('category', 'harness_backlog').in('status', OPEN).order('created_at', { ascending: false });
const backlog = hb || [];
const high = backlog.filter(r => ['high', 'critical'].includes((r.severity || '').toLowerCase()));

// (2) SD queue
const { data: sd } = await db.from('strategic_directives_v2').select('sd_key,status,current_phase,claiming_session_id,updated_at,dependencies').not('status', 'in', termList);
const sds = sd || [];
const unclaimed = sds.filter(s => !s.claiming_session_id);
const claimed = sds.length - unclaimed.length;
const stuck = unclaimed.filter(s => s.status === 'in_progress');

// workers — SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001: count GENUINE workers via the shared
// predicate (same one coordinator-email-summary.mjs uses, mirroring the dashboard) so the
// audit's FLOW/LIVENESS gauges stop over-counting Adam / non_fleet / released / never-claimed
// (ghost) sessions. Previously this only excluded `me` and any heartbeat <15m.
const { data: sessRaw } = await db.from('claude_sessions').select('session_id,heartbeat_at,sd_key,loop_state,status,metadata,claimed_at,worktree_path,continuous_sds_completed').order('heartbeat_at', { ascending: false }).limit(60);
const live = liveFleetWorkers(sessRaw, me, t);
const builders = live.filter(s => s.sd_key).length;
const liveIdle = live.filter(s => !s.sd_key).length;

// (3) inbox
const { data: sig } = await db.from('session_coordination').select('id').eq('target_session', me).is('read_at', null).not('payload->>signal_type', 'is', null);
const unread = (sig || []).length;

// (4) worktree pool utilization — silent 20/20 cap stalls the whole fleet.
// countActiveWorktrees never throws (returns [] on git failure → 0).
let poolUsed = 0;
let poolCap = MAX_WORKTREE_COUNT;
try { poolUsed = countActiveWorktrees(process.cwd()); } catch { poolUsed = 0; }
const poolUtil = poolCap > 0 ? poolUsed / poolCap : 0;
const poolPct = Math.round(poolUtil * 100);
const poolWarn = poolUtil >= POOL_THRESHOLD;

// sourcing decision: feed the fleet only if there is idle capacity AND the queue can't fill it
const capacity = builders + liveIdle;
const starving = backlog.length > 0 && liveIdle > 0 && unclaimed.length < capacity;
const toSource = starving ? Math.min(backlog.length, capacity - unclaimed.length) : 0;

console.log('[COORD-AUDIT] ' + new Date(t).toISOString());
console.log('  HARNESS BACKLOG : ' + backlog.length + ' open (' + high.length + ' high/critical)');
for (const r of backlog.slice(0, 10)) console.log('      [' + r.status + '/' + (r.severity || '-') + '] ' + String(r.title || '').slice(0, 78));
console.log('  SD QUEUE        : ' + sds.length + ' non-terminal | ' + claimed + ' claimed | ' + unclaimed.length + ' unclaimed | ' + stuck.length + ' stuck(in_progress,unclaimed)');
console.log('  WORKERS         : ' + builders + ' building, ' + liveIdle + ' live-idle');
console.log('  WORKTREE POOL   : ' + poolUsed + '/' + poolCap + ' (' + poolPct + '%)' +
  (poolWarn ? '  ⚠️  WARNING ≥' + Math.round(POOL_THRESHOLD * 100) + '% — run worktree reaper Stage-0 (terminal-SD reclaim) to avoid a 20/20 cap stall' : ''));
console.log('  INBOX           : ' + unread + ' unread signals');
console.log('  SOURCE BACKLOG? : ' + (starving
  ? 'YES — source ' + toSource + ' high-priority backlog item(s) into DRAFT SDs (idle capacity + thin queue)'
  : 'no — ' + (backlog.length === 0 ? 'backlog empty'
    : liveIdle === 0 ? 'no idle workers to feed'
    : 'queue has surplus (' + unclaimed.length + ' unclaimed ≥ ' + capacity + ' capacity) → worker-bound, wake workers instead')));

// ─────────────────────────────────────────────────────────────────────────
// SRE CHARTER GAUGES (SD-MAN-INFRA-CODIFY-SRE-STYLE-001)
// Read-only, fail-open. Surfaces resource-pool / liveness / flow / dependency
// signals so the coordinator can act BEFORE silent exhaustion stalls the line.
const DAY = 86400000;
const ageStr = (ms) => ms >= DAY ? (ms / DAY).toFixed(1) + 'd' : Math.round(ms / 3600000) + 'h';

// (a) RESOURCE-POOL — worktree pool utilization (own finite pools; reclaim before exhaustion)
let wtLine;
try {
  const wt = countActiveWorktrees(repoRoot);
  const pct = Math.round((wt / MAX_WORKTREE_COUNT) * 100);
  const flag = wt >= MAX_WORKTREE_COUNT ? ' ⛔ SATURATED — reclaim before dispatch stalls'
    : pct >= 85 ? ' ⚠ near cap' : '';
  wtLine = wt + '/' + MAX_WORKTREE_COUNT + ' (' + pct + '%)' + flag;
} catch (e) { wtLine = 'unavailable (' + e.message + ')'; }

// (b) FLOW — stuck-SD aging (non-terminal SDs by time in current phase)
let agingLine, agingTop = [];
try {
  const aged = sds.filter(s => s.updated_at)
    .map(s => ({ k: s.sd_key, ph: s.current_phase || '-', age: Math.max(0, t - new Date(s.updated_at).getTime()) }))
    .sort((a, b) => b.age - a.age);
  agingTop = aged.slice(0, 3);
  agingLine = aged.filter(s => s.age >= DAY).length + ' SD(s) >1d in-phase (of ' + sds.length + ' non-terminal)';
} catch (e) { agingLine = 'unavailable (' + e.message + ')'; }

// (c) FLOW — idle-with-work workers (live-idle while claimable work exists → wake/assign)
const idleWithWork = (liveIdle > 0 && unclaimed.length > 0) ? liveIdle : 0;
const idleWorkLine = idleWithWork > 0
  ? idleWithWork + ' live-idle worker(s) while ' + unclaimed.length + ' SD(s) unclaimed ⚠ wake/assign them'
  : 'none (' + liveIdle + ' idle, ' + unclaimed.length + ' unclaimed)';

// (d) LIVENESS — loop_state distribution across live workers (self-sustaining loops?)
let loopLine;
try {
  const dist = { active: 0, awaiting_tick: 0, exited: 0, null: 0, other: 0 };
  for (const s of live) {
    const ls = s.loop_state;
    if (ls == null) dist.null++; else if (ls in dist) dist[ls]++; else dist.other++;
  }
  loopLine = 'active=' + dist.active + ' awaiting_tick=' + dist.awaiting_tick + ' exited=' + dist.exited + ' null=' + dist.null + (dist.other ? ' other=' + dist.other : '');
} catch (e) { loopLine = 'unavailable (' + e.message + ')'; }

// (e) DEPENDENCY / CRITICAL-PATH — blocked vs ready, plus stale-blocked anomalies
let depLine, depStale = [];
try {
  const depOf = (s) => Array.isArray(s.dependencies) ? s.dependencies.map(d => d && (d.sd_id || d.sd_key || d)).filter(Boolean) : [];
  const depKeys = [...new Set(sds.flatMap(depOf))];
  const statusByKey = {};
  if (depKeys.length) {
    const { data: depRows } = await db.from('strategic_directives_v2').select('sd_key,status').in('sd_key', depKeys);
    for (const r of (depRows || [])) statusByKey[r.sd_key] = r.status;
  }
  const isTerminal = (st) => TERMINAL.includes(st); // unknown/missing dep also counts as unmet
  let blocked = 0, ready = 0;
  for (const s of sds) {
    const deps = depOf(s);
    if (!deps.length) continue;
    if (deps.some(k => !isTerminal(statusByKey[k]))) { blocked++; continue; }
    ready++; // all deps terminal/satisfied
    if (!s.claiming_session_id && s.updated_at && (t - new Date(s.updated_at).getTime()) >= DAY) depStale.push(s.sd_key);
  }
  depLine = blocked + ' blocked (unmet deps) | ' + ready + ' dep-satisfied | ' + depStale.length + ' stale-blocked (deps done, idle >1d)';
} catch (e) { depLine = 'unavailable (' + e.message + ')'; }

console.log('  ── SRE GAUGES ─────────────────────────────────────────');
console.log('  RESOURCE-POOL   : worktrees ' + wtLine);
console.log('  FLOW (aging)    : ' + agingLine);
for (const a of agingTop) console.log('      ' + a.k + '  [' + a.ph + ']  ' + ageStr(a.age));
console.log('  FLOW (idle/work): ' + idleWorkLine);
console.log('  LIVENESS (loop) : ' + loopLine + '  (live workers)');
console.log('  DEPENDENCY      : ' + depLine);
for (const k of depStale.slice(0, 5)) console.log('      stale-blocked: ' + k);
