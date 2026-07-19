// Fleet Dashboard — Modular status display for the coordinator session
// Usage: node scripts/fleet-dashboard.cjs [workers|orchestrator|available|coordination|health|qa|forecast|team|all]

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const { spawnSync } = require('child_process');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
// SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 (FR-2): the read-time liveness SSOT — the gauge reconcile
// wraps isSessionAlive so the P(alive) override and the authoritative-liveness definition can never diverge.
const { isSessionAlive } = require('../lib/fleet/session-liveness.cjs');

// Idle-fleet diff suppression — coordinator was generating ~120 identical
// dashboard renders overnight. After N consecutive identical renders, emit a
// one-liner instead. Set FLEET_DASH_SUPPRESS=false to force full render.
const DASH_STATE_FILE = path.resolve(__dirname, '../.claude/fleet-dashboard-state.json');
const SUPPRESS_AFTER = parseInt(process.env.FLEET_DASH_SUPPRESS_AFTER || '3', 10);
function loadDashState() { try { return JSON.parse(fs.readFileSync(DASH_STATE_FILE, 'utf8')); } catch { return { hash: null, count: 0 }; } }
function saveDashState(s) { try { fs.mkdirSync(path.dirname(DASH_STATE_FILE), { recursive: true }); fs.writeFileSync(DASH_STATE_FILE, JSON.stringify(s)); } catch {} }
function normalizeRender(s) {
  return s.replace(/\[[0-9;]*m/g, '').replace(/\d+s ago/g, '_s_').replace(/\d+m ago/g, '_m_')
    .replace(/\d+:\d+:\d+ [AP]M/g, '_T_').replace(/\d+:\d+ [AP]M/g, '_t_').replace(/uptime \d+h\d+m/gi, '_U_')
    .replace(/[\d.]+h ago/g, '_H_').replace(/\d{4,}m/g, '_W_')
    // SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-3): working_context age indicators tick every
    // minute ("STALE (98m old …)" / "fresh (1m)") — normalize them so the steady-state suppress hash
    // does not change every minute and the dashboard can still reach its identical-render threshold.
    .replace(/-?\d+m old/g, '_m_old').replace(/\(-?\d+m\)/g, '(_m_)');
}
// SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2)
const teamBanner = require('../lib/execute/team-banner.cjs');
const { parseSdDependencies } = require('../lib/utils/parse-sd-dependencies.cjs'); // QF-20260525-542
// SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-004): subprocess-invoke the MC
// engine to enrich workers with P(alive). Failures fall back to existing
// binary display, preserving pre-MC behavior.
const FLEET_MC_ENABLED = (process.env.FLEET_MC_ENABLED ?? 'true').toLowerCase() !== 'false';

const supabase = createSupabaseServiceClient();

// SD-REFILL-00IO6NQJ: PID-liveness now lives in a shared SSOT module so the
// coordinator standing-report (fleet-quiescence) and this dashboard read it from
// one source. Behavior-identical to the prior local copies.
const { isProcessRunning, getMarkerSessionIds, getAliveCcPids } = require('../lib/fleet/cc-pid-liveness.cjs');
// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2): surface which Claude account this dashboard's
// session is running under in the WORKERS header line.
const { getAccountIdentity } = require('../lib/fleet/account-identity.cjs');

const STALE_THRESHOLD = parseInt(process.env.STALE_SESSION_THRESHOLD_SECONDS, 10) || 300;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 — display policy: WARN, don't crash.
// A dashboard read returning exactly the PostgREST cap (1000; canonical constant
// POSTGREST_MAX_ROWS in lib/db/fetch-all-paginated.mjs — ESM, not require()-able here)
// is presumed silently truncated. Genuinely-unbounded reads paginate via fapPaginate();
// small-set reads keep their single fetch but pass through this tripwire.
function warnIfCapTruncated(rows, site) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 1000) {
    console.warn(`⚠️  [count-discipline] ${site}: fetch returned exactly 1000 rows (PostgREST cap) — list/count below may be truncated`);
  }
  return list;
}
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

// ── Helpers ──

function bar(pct, width = 20) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function pad(str, len) {
  return (str || '').substring(0, len).padEnd(len);
}

// SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-004)
// Invoke fleet-liveness-mc.cjs as a subprocess and return parsed JSON. On any
// failure — spawn error, non-zero exit, shape mismatch — return null so the
// caller can fall back to the pre-MC display without crashing the dashboard.
function fetchMcEstimates(sessionIdFilter) {
  if (!FLEET_MC_ENABLED) return null;
  const script = path.resolve(__dirname, 'fleet-liveness-mc.cjs');
  if (!fs.existsSync(script)) return null;
  const args = ['--json'];
  if (Array.isArray(sessionIdFilter) && sessionIdFilter.length > 0) {
    args.push('--workers', sessionIdFilter.join(','));
  }
  try {
    const res = spawnSync('node', [script, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (res.status !== 0) return null;
    const parsed = JSON.parse(res.stdout || '{}');
    if (!Array.isArray(parsed.workers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function pBar(p, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((p || 0) * width)));
  return '\u2593'.repeat(filled) + '\u2591'.repeat(width - filled);
}

/**
 * SD-REFILL-005M4BN9: the Monte-Carlo P(alive) gauge is computed from raw heartbeat-age only,
 * so a worker in a legitimate armed-silence window (expected_silence_until in the future,
 * running a long sub-agent op) or with a live PID shows P(alive)=0.00 \u2014 while the AUTHORITATIVE
 * checks (stale-session-sweep PID/armed-silence + charter-audit DUTY-2) correctly count it ALIVE.
 * That false 'dying worker' reading lures the coordinator into force-releasing a mid-operation
 * worker. Reconcile the gauge with the SAME authoritative signals: short-circuit P(alive) to 1.0
 * when PID-alive, a fresh process-tick, or within an armed-silence window. The override only ever
 * RAISES a false-low reading for an authoritatively-alive worker \u2014 it never masks a real death
 * (no authoritative signal => the raw MC estimate is preserved). Stamped + reasoned (auditable,
 * not a silent fabrication). Pure/total: returns a NEW object, never mutates; null-safe.
 *
 * @param {{session_id?:string, p_alive?:number}|null} mcWorker
 * @param {{pidAlive?:boolean, tickAlive?:boolean, silenceArmed?:boolean}} signals
 * @returns {object|null}
 */
// SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 (FR-2): thin wrapper over the shared isSessionAlive SSOT.
// Upgrades the raw-heartbeat MC P(alive) to 1.0 (stamped + reasoned) when the SESSION is alive by any
// authoritative signal — one-directional (never downgrades). Delegating to isSessionAlive means the
// gauge override and the fleet-wide liveness definition can never drift apart (no 'three local copies').
function reconcilePAliveWithLiveness(mcWorker, session, { nowMs = Date.now(), aliveCcPids = null } = {}) {
  if (!mcWorker || typeof mcWorker !== 'object') return mcWorker;
  const { alive, reason } = isSessionAlive(session || {}, { nowMs, aliveCcPids });
  // A raw-heartbeat-fresh worker already reads a high p_alive from the MC engine; only stamp an
  // override when liveness comes from a PARKED-alive authoritative signal (the false-DORMANT case).
  if (!alive || reason === 'raw_is_alive' || reason === 'fresh_heartbeat') return mcWorker;
  return { ...mcWorker, p_alive: 1, p_alive_authoritative_override: true, p_alive_override_reason: reason };
}

function formatEtaTime(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

// ── Data Loading ──

async function loadData() {
  const [sessRes, allSessRes, childRes, coordRes, rawSessRes, drainRes] = await Promise.all([
    supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, tty, pid, track, terminal_id, loop_state')
      .not('sd_key', 'is', null)
      .order('heartbeat_age_seconds', { ascending: true }),
    supabase
      .from('v_active_sessions')
      // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: + metadata so the idle filter can apply
      // isDispatchableFleetMember (excludes coordinator/adam/non_fleet/fixture).
      .select('session_id, sd_key, computed_status, metadata, tty, heartbeat_age_seconds, heartbeat_age_human')
      .order('heartbeat_age_seconds', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, completion_date, created_at, dependencies')
      .like('sd_key', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      .order('sd_key', { ascending: true }),
    supabase
      .from('session_coordination')
      // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: + payload so printCoordination can
      // exclude rows answered by a correlated reply from its pending-acknowledgment count.
      .select('id, target_session, target_sd, message_type, subject, payload, read_at, acknowledged_at, created_at')
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('claude_sessions')
      .select('session_id, sd_key, tty, status, heartbeat_at, pid')
      .not('sd_key', 'is', null)
      .order('heartbeat_at', { ascending: false })
      .limit(30),
    // Drain agent sessions (virtual sessions with parent)
    supabase
      .from('claude_sessions')
      .select('session_id, sd_key, status, heartbeat_at, is_virtual, parent_session_id, agent_slot, last_progress_at')
      .eq('is_virtual', true)
      .in('status', ['active', 'idle'])
      .order('agent_slot', { ascending: true })
  ]);

  // SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001: pending worker_spawn_requests
  // Separate query (added after main Promise.all) — graceful degradation if table doesn't exist.
  let revivalPending = [];
  try {
    const { data: rpData } = await supabase
      .from('worker_spawn_requests')
      .select('id, requested_callsign, requested_by_session_id, requested_at, expires_at')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('requested_at', { ascending: true });
    revivalPending = rpData || [];
  } catch (e) {
    // Pre-migration clones don't have the table — silently empty.
  }

  // QF-20260704-051: the "AVAILABLE FOR CLAIM" headline previously used a naive
  // status-only filter, so requires_human_action / dependency-blocked / orchestrator-parent
  // SDs counted as available even though the coordinator's own ranker would never dispatch
  // them (live specimen: dashboard showed 15, true claimable depth was 0). Reuse the SAME
  // SSOT predicate the ranker uses (classifyDispatchIneligibility + dependency + parent-LEAD
  // gating) so the two can never diverge. Fail-soft: an error degrades to an empty list
  // rather than crashing the dashboard.
  let claimableLeaves = [];
  // QF-20260704-193: held-SD provenance from the SAME ranker pass — the dashboard
  // previously printed NOTHING for rha-held SDs, so a 3 AM operator could not tell
  // deliberate parking from an accidental freeze without hand-querying metadata.
  let humanActionHolds = [];
  try {
    const { computeClaimableLeaves } = await import('./coordinator-backlog-rank.mjs');
    const result = await computeClaimableLeaves(supabase, { quiet: true });
    claimableLeaves = result.claimable || [];
    humanActionHolds = result.humanActionHolds || [];
  } catch (e) {
    // degrade-safe: empty claimable list, dashboard still renders
  }

  const sessions = warnIfCapTruncated(sessRes.data, 'v_active_sessions (claimed)');
  const allSessions = warnIfCapTruncated(allSessRes.data, 'v_active_sessions (all)');
  const drainAgents = warnIfCapTruncated(drainRes.data, 'claude_sessions (drain agents)');
  const children = warnIfCapTruncated(childRes.data, 'orchestrator children');
  // QF-20260704-051: orchestrator children are tracked separately (above) — exclude their
  // prefix here so a claimable child SD is never double-counted in both sections.
  const workable = claimableLeaves.filter(sd => !sd.sd_key.startsWith('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001'));
  const coordMessages = coordRes.data || [];
  const rawSessions = rawSessRes.data || [];

  // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (bug 623eb17d): the idle "available worker" list (and the
  // belt-countdown capacity math fed from it) must exclude role/identity polluters. Load the shared
  // predicate + active coordinator id once so the idle filter below drops adam/non_fleet/coordinator/
  // fixture sessions. isDispatchableFleetMember (NOT isGenuineCountableWorker) is used on purpose: a
  // just-finished worker is released with claimed_at nulled, so an everClaimed-based predicate would
  // under-count real idle capacity. Dynamic import: this is a .cjs reading an .mjs SoT.
  const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
  const { isDispatchableFleetMember } = await import('../lib/fleet/session-predicates.mjs');
  let _dashCoordinatorId = null;
  try { _dashCoordinatorId = await getActiveCoordinatorId(supabase); } catch { _dashCoordinatorId = null; }

  const claimedSdIds = new Set(sessions.map(s => s.sd_key));
  // Cross-reference heartbeat age with PID marker liveness:
  // A session with stale heartbeat but living CC PID is loading context or between tool calls.
  // terminal_id format: "win-cc-{port}-{ccPid}" — extract ccPid and check marker files.
  const aliveCcPids = getAliveCcPids();
  const hasPidAlive = (s) => {
    if (!s.terminal_id) return false;
    const parts = s.terminal_id.split('-');
    return aliveCcPids.has(parts[parts.length - 1]);
  };
  // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: source-side telemetry merge ──
  const telemetryById = new Map();
  try {
    const ids = sessions.map(s => s.session_id).filter(Boolean);
    if (ids.length > 0) {
      // QF-20260704-737: v_active_sessions never exposed current_phase/handoff_fail_count (and its
      // has_uncommitted_changes wasn't in sessRes's own select) — Progress/Phase/Fails/WIP rendered
      // '?'/'-' for every worker despite the data existing on claude_sessions the whole time. Pull them
      // through this SAME already-working telemetry-merge seam instead of a new query.
      const { data: teleRows } = await supabase
        .from('claude_sessions')
        .select('session_id,current_tool,current_tool_expected_end_at,expected_silence_until,process_alive_at,last_activity_kind,commits_since_claim,files_modified_since_claim,current_phase,handoff_fail_count,has_uncommitted_changes')
        .in('session_id', ids);
      for (const row of teleRows || []) telemetryById.set(row.session_id, row);
    }
  } catch (e) {
    // Graceful — pre-migration clones have no telemetry columns.
  }
  for (const s of sessions) {
    const t = telemetryById.get(s.session_id);
    if (t) Object.assign(s, {
      current_tool: t.current_tool,
      current_tool_expected_end_at: t.current_tool_expected_end_at,
      expected_silence_until: t.expected_silence_until,
      process_alive_at: t.process_alive_at,
      last_activity_kind: t.last_activity_kind,
      commits_since_claim: t.commits_since_claim,
      files_modified_since_claim: t.files_modified_since_claim,
      current_phase: t.current_phase,
      handoff_fail_count: t.handoff_fail_count,
      has_uncommitted_changes: t.has_uncommitted_changes,
    });
  }
  const hasTickAlive = (s) => {
    if (!s.process_alive_at) return false;
    const age = Date.now() - Date.parse(s.process_alive_at);
    return Number.isFinite(age) && age >= 0 && age <= 90 * 1000;
  };
  const hasExpectedSilence = (s) => {
    if (!s.expected_silence_until) return false;
    const delta = Date.parse(s.expected_silence_until) - Date.now();
    return Number.isFinite(delta) && delta > 0 && delta <= 30 * 60 * 1000;
  };

  const activeSessions = sessions.filter(s =>
    s.heartbeat_age_seconds < STALE_THRESHOLD ||
    hasPidAlive(s) ||
    hasTickAlive(s) ||
    hasExpectedSilence(s)
  );
  const staleSessions = sessions.filter(s =>
    s.heartbeat_age_seconds >= STALE_THRESHOLD &&
    !hasPidAlive(s) &&
    !hasTickAlive(s) &&
    !hasExpectedSilence(s)
  );
  const DEAD_THRESHOLD = STALE_THRESHOLD * 3; // 15min
  // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: only dispatchable fleet MEMBERS count as idle/available —
  // exclude adam/non_fleet/coordinator/fixture (isDispatchableFleetMember fails toward "member" on
  // garbage, so a classification quirk never hides a true idle worker).
  const idleSessions = allSessions.filter(s =>
    !s.sd_key &&
    s.heartbeat_age_seconds < DEAD_THRESHOLD &&
    isDispatchableFleetMember(s, _dashCoordinatorId)
  );

  const completedChildren = children.filter(c => c.status === 'completed').length;
  const totalChildren = children.length;
  const orchPct = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;

  const unclaimedChildren = children.filter(c => c.status !== 'completed' && !claimedSdIds.has(c.sd_key));
  const unclaimedStandalone = workable.filter(sd => !claimedSdIds.has(sd.sd_key));

  // Build SD status map for QA checks (includes all SDs, not just orchestrator children)
  const allSdKeys = [...new Set(rawSessions.map(s => s.sd_key).filter(Boolean))];
  let sdStatusMap = {};
  children.forEach(c => { sdStatusMap[c.sd_key] = c; });
  // Fetch any non-child SDs that workers are claiming
  const missingKeys = allSdKeys.filter(k => !sdStatusMap[k]);
  if (missingKeys.length > 0) {
    const { data: extraSds } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, progress_percentage, completion_date, current_phase')
      .in('sd_key', missingKeys);
    (extraSds || []).forEach(sd => { sdStatusMap[sd.sd_key] = sd; });
  }

  // Detect bare-shell SDs: title == description, no real scope, not child stubs
  const pendingKeys = workable.map(sd => sd.sd_key);
  let bareShells = [];
  if (pendingKeys.length > 0) {
    const { data: descData } = await supabase.from('strategic_directives_v2')
      .select('sd_key, title, description, scope').in('sd_key', pendingKeys);
    bareShells = (descData || []).filter(sd => {
      if (sd.description && sd.description.startsWith('Child SD of')) return false;
      const thin = !sd.description || sd.description === sd.title || (sd.description.length < 100 && sd.scope === sd.title);
      return thin;
    });
  }

  // SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2)
  // Load active execute_teams + their virtual claude_sessions for /coordinator team
  const executeTeams = await teamBanner.loadExecuteTeams(supabase);

  // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-004): enrich workers with P(alive).
  // Failure returns null → downstream renderers detect `mc == null` and fall
  // back to existing binary display. Also show a warning banner once.
  const mc = fetchMcEstimates(sessions.map(s => s.session_id));
  const mcByWorker = {};
  if (mc && Array.isArray(mc.workers)) {
    for (const w of mc.workers) mcByWorker[w.session_id] = w;
    // SD-REFILL-005M4BN9: reconcile the raw-heartbeat P(alive) gauge with the SAME authoritative
    // liveness signals the active/stale split uses, so an armed-silence / PID-alive worker is not
    // shown as a false 'dying worker' (P(alive)=0.00) that lures a force-release.
    const _gaugeNowMs = Date.now();
    for (const s of sessions) {
      const w = mcByWorker[s.session_id];
      if (!w) continue;
      // FR-2: reconcile via the shared SSOT (session-based), passing the already-loaded aliveCcPids Set.
      mcByWorker[s.session_id] = reconcilePAliveWithLiveness(w, s, { nowMs: _gaugeNowMs, aliveCcPids });
    }
  }

  // QF-20260525-836: surface open/in_progress QFs (aging ones went unseen). Degrade-safe.
  let quickFixes = [];
  try {
    const { data: qfRows } = await supabase
      .from('quick_fixes')
      // owner/release_condition: SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001 — the main list
      // must MARK gated rows (adversarial-review fix, PR #6178), not render them as
      // ordinary claimable open work while only the dedicated section knows better.
      .select('id, title, status, claiming_session_id, created_at, owner, release_condition')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: true });
    // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: fixture-titled QFs (ZZZ_/dunder residue)
    // must not inflate the QUICK FIXES (N) count or render as real open work.
    // Filter availability degrades to UNFILTERED rows (adversarial-review fix, PR #6186):
    // if require(esm) is unavailable on an older runtime, showing fixtures beats hiding
    // ALL open work behind the outer catch's empty section.
    let isFixtureQf = () => false;
    try { ({ isFixtureQf } = require('../lib/governance/fixture-exclusion.mjs')); } catch { /* unfiltered fallback */ }
    quickFixes = warnIfCapTruncated(qfRows, 'quick_fixes (open/in_progress)').filter((qf) => !isFixtureQf(qf));
  } catch { /* degrade-safe: empty QF section */ }

  return {
    sessions, allSessions, children, workable, coordMessages, rawSessions, sdStatusMap,
    claimedSdIds, activeSessions, staleSessions, idleSessions,
    completedChildren, totalChildren, orchPct,
    unclaimedChildren, unclaimedStandalone, bareShellSDs: bareShells,
    humanActionHolds,
    drainAgents,
    mc, mcByWorker,
    executeTeams,
    quickFixes, // QF-20260525-836
    revivalPending // SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001
  };
}

// ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: activity formatters ────────────────
function formatActivity(s) {
  const tool = s.current_tool;
  const kind = s.last_activity_kind;
  const endAtIso = s.current_tool_expected_end_at;

  if (tool) {
    if (endAtIso) {
      const now = Date.now();
      const endMs = Date.parse(endAtIso);
      if (Number.isFinite(endMs) && endMs > now) {
        const remainMin = Math.round((endMs - now) / 60000);
        return String(tool) + ' ' + remainMin + 'm';
      }
    }
    return String(tool);
  }
  if (kind === 'thinking') return 'thinking';
  if (kind === 'idle') return 'idle';
  if (kind === 'exiting') return 'exiting';
  return '';
}

function formatSilentUntil(s) {
  if (!s.expected_silence_until) return '';
  const endMs = Date.parse(s.expected_silence_until);
  if (!Number.isFinite(endMs)) return '';
  const deltaMin = Math.round((endMs - Date.now()) / 60000);
  if (deltaMin <= 0) return '';
  return '+' + deltaMin + 'm';
}

// ── Section: Workers ──
function printWorkers(d) {
  const now = new Date();
  const markerIds = getMarkerSessionIds();

  // Detect terminal_id collisions among active workers
  const ttyCount = {};
  for (const s of d.activeSessions) { ttyCount[s.tty] = (ttyCount[s.tty] || 0) + 1; }
  const hasCollision = Object.values(ttyCount).some(c => c > 1);

  // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-004): header switches from
  // "Active: M" to "Effective: X.Y / N assigned" (sum of P(alive)).
  const mcOk = d.mc && d.mcByWorker;
  const assigned = d.activeSessions.length;
  let headerSuffix = '';
  if (mcOk && assigned > 0) {
    const sumP = d.activeSessions.reduce((acc, s) => {
      const w = d.mcByWorker[s.session_id];
      return acc + (w ? Number(w.p_alive) || 0 : 0);
    }, 0);
    headerSuffix = `  Effective: ${sumP.toFixed(1)} / ${assigned} assigned`;
  } else if (!mcOk && FLEET_MC_ENABLED && assigned > 0) {
    headerSuffix = '  [MC unavailable — falling back to binary classification]';
  }

  // SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2): fail-safe — null/unavailable prints
  // 'unknown' rather than crashing the dashboard render.
  const identity = getAccountIdentity();
  const acctLabel = (identity && identity.email) || 'unknown';

  console.log('');
  console.log('WORKERS [' + now.toLocaleTimeString() + ']' + headerSuffix + '  acct=' + acctLabel);
  console.log('─'.repeat(hasCollision ? 100 : 88));

  if (d.activeSessions.length === 0) {
    console.log('  (no active workers)');
  } else {
    const csidHeader = hasCollision ? pad('CSID', 12) : '';
    const mcHeader = mcOk ? pad('P(alive)', 16) : '';
    console.log('  ' + pad('Terminal', 12) + csidHeader + pad('SD', 10) + pad('Progress', 26) + pad('Phase', 8) + pad('Fails', 6) + pad('WIP', 5) + pad('LoopState', 14) + pad('Activity', 18) + pad('Silent until', 14) + mcHeader + 'Heartbeat');
    // SD-LEO-INFRA-LOOP-STATE-SIGNAL-001: LoopState column (14 chars) added between WIP and Activity → 14-char wider separator.
    console.log('  ' + '─'.repeat(hasCollision ? (mcOk ? 150 : 134) : (mcOk ? 138 : 122)));
    for (const s of d.activeSessions) {
      // QF-20260704-737: d.children is scoped to ONE orchestrator's children — every other worker's
      // Progress always read as 0. d.sdStatusMap already covers any sd_key a worker is claiming.
      const child = d.sdStatusMap[s.sd_key];
      const pct = child ? child.progress_percentage : 0;
      const phase = s.current_phase || (child ? child.current_phase : '?');
      const shortSd = s.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      const fails = s.handoff_fail_count != null ? String(s.handoff_fail_count) : '-';
      const wip = s.has_uncommitted_changes === true ? 'Y' : s.has_uncommitted_changes === false ? 'N' : '-';
      const struggleTag = (s.handoff_fail_count || 0) > 3 ? ' [STRUGGLING]' : '';
      // markerIds[id] is { claude_session_id, pid, alive } per getMarkerSessionIds(); read property before substring
      const markerEntry = markerIds[s.session_id];
      const csid = hasCollision ? pad((markerEntry?.claude_session_id || '').substring(0, 10), 12) : '';
      const activity = formatActivity(s);
      const silent = formatSilentUntil(s);
      const mcRow = d.mcByWorker && d.mcByWorker[s.session_id];
      const mcCell = mcOk
        ? pad((mcRow ? pBar(mcRow.p_alive, 10) + ' ' + mcRow.p_alive.toFixed(2) : pad('-', 15)), 16)
        : '';
      // SD-LEO-INFRA-LOOP-STATE-SIGNAL-001: render loop_state; NULL or `unknown` collapses to `--`.
      const loopRaw = s.loop_state;
      const loopCell = (!loopRaw || loopRaw === 'unknown') ? '--' : String(loopRaw);
      console.log('  ' + pad(s.tty, 12) + csid + pad(shortSd, 10) + bar(pct) + ' ' + pad(pct + '%', 5) + pad(phase, 8) + pad(fails, 6) + pad(wip, 5) + pad(loopCell, 14) + pad(activity, 18) + pad(silent, 14) + mcCell + s.heartbeat_age_human + struggleTag);
    }
  }

  if (d.staleSessions.length > 0) {
    console.log('');
    console.log('  Stale (' + d.staleSessions.length + '):');
    for (const s of d.staleSessions) {
      const shortSd = s.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      console.log('  ' + pad(s.tty, 12) + pad(shortSd, 10) + s.heartbeat_age_human);
    }
  }

  if (d.idleSessions.length > 0) {
    console.log('');
    console.log('  Idle — No Claim (' + d.idleSessions.length + '):');
    for (const s of d.idleSessions) {
      const age = s.heartbeat_age_human || (s.heartbeat_age_seconds < 60 ? s.heartbeat_age_seconds + 's ago' : Math.round(s.heartbeat_age_seconds / 60) + 'm ago');
      const staleTag = s.heartbeat_age_seconds >= STALE_THRESHOLD ? ' [STALE]' : '';
      console.log('  ' + pad(s.tty, 12) + pad('—', 10) + pad('', 26) + pad('idle', 14) + age + staleTag);
    }
  }

  console.log('');
}

// ── Section: Drain Agents ──
function printDrainAgents(d) {
  if (!d.drainAgents || d.drainAgents.length === 0) return;

  console.log('');
  console.log('DRAIN AGENTS [virtual sessions]');
  console.log('─'.repeat(72));
  console.log('  ' + pad('Slot', 6) + pad('SD', 35) + pad('Status', 10) + pad('Progress', 12) + 'Heartbeat');
  console.log('  ' + '─'.repeat(72));

  // Group by parent_session_id
  const byParent = {};
  for (const a of d.drainAgents) {
    const parent = a.parent_session_id || 'unknown';
    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(a);
  }

  for (const [parentId, agents] of Object.entries(byParent)) {
    const shortParent = parentId.substring(0, 12);
    console.log('  Parent: ' + shortParent + '...');
    for (const a of agents) {
      const slotLabel = a.agent_slot != null ? String(a.agent_slot) : '?';
      const sd = a.sd_id || '(idle)';
      const shortSd = sd.length > 33 ? sd.replace(/^SD-.*?-/, '').substring(0, 33) : sd;
      const progressAge = a.last_progress_at
        ? Math.round((Date.now() - new Date(a.last_progress_at).getTime()) / 1000) + 's ago'
        : 'none';
      const hbAge = a.heartbeat_at
        ? Math.round((Date.now() - new Date(a.heartbeat_at).getTime()) / 1000) + 's ago'
        : '?';
      console.log('  ' + pad(slotLabel, 6) + pad(shortSd, 35) + pad(a.status, 10) + pad(progressAge, 12) + hbAge);
    }
  }
  console.log('');
}

// ── Section: Execute Team Banner (Mockup A) ──
// SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2 of /execute)
// Pure helpers + loader live in lib/execute/team-banner.cjs (testable).
function printTeam(d) {
  teamBanner.printTeam(d.executeTeams || [], bar);
}

// ── Section: Orchestrator ──

function printOrchestrator(d) {
  console.log('ORCHESTRATOR ' + bar(d.orchPct, 25) + ' ' + d.completedChildren + '/' + d.totalChildren + ' (' + d.orchPct + '%)');
  console.log('─'.repeat(72));

  for (const c of d.children) {
    const letter = c.sd_key.slice(-1);
    const pct = c.progress_percentage || 0;
    const isClaimed = d.claimedSdIds.has(c.sd_key);
    const icon = c.status === 'completed' ? '\u2705' : isClaimed ? '\uD83D\uDD12' : '\uD83D\uDCCB';
    const phase = c.status === 'completed' ? 'DONE' : c.current_phase;
    console.log('  ' + letter + '  ' + bar(pct, 15) + ' ' + pad(pct + '%', 5) + ' ' + icon + ' ' + pad(phase, 12) + c.title.substring(0, 38));
  }

  console.log('');
}

// ── Section: Available ──
function printAvailable(d) {
  const total = d.unclaimedChildren.length + d.unclaimedStandalone.length;
  console.log('AVAILABLE FOR CLAIM (' + total + ')');
  console.log('─'.repeat(72));

  // QF-20260704-193 (adversarial-review C1): the all-held/zero-claimable state is EXACTLY
  // the motivating scenario (47 rha-frozen children, zero claimable) — the early return
  // must not swallow the hold-provenance block, and the empty-state text must not claim
  // "all claimed or completed" while SDs sit deliberately parked.
  const holds = d.humanActionHolds || [];
  if (total === 0 && holds.length === 0) {
    console.log('  (all SDs claimed or completed)');
    console.log('');
    return;
  }
  if (total === 0) {
    console.log('  (no claimable SDs — all remaining are held for human action, see below)');
  }

  if (d.unclaimedChildren.length > 0) {
    console.log('  Orchestrator Children:');
    for (const c of d.unclaimedChildren) {
      const letter = c.sd_key.slice(-1);
      console.log('    Child ' + letter + '  ' + pad(c.title, 48) + c.status);
    }
  }

  if (d.unclaimedStandalone.length > 0) {
    console.log('  Standalone SDs:');
    // QF-20260704-051: the headline count above is the TRUE claimable depth (no longer capped
    // at the query level) — cap only the printed rows so a large backlog stays readable.
    const DISPLAY_CAP = 15;
    const displayed = d.unclaimedStandalone.slice(0, DISPLAY_CAP);
    for (const sd of displayed) {
      const shortKey = sd.sd_key.replace('SD-LEO-', '').replace('SD-', '').substring(0, 22);
      const prio = sd.priority === 'high' ? 'HIGH' : 'MED';
      console.log('    ' + pad(shortKey, 24) + pad(sd.title.substring(0, 38), 40) + prio);
    }
    if (d.unclaimedStandalone.length > displayed.length) {
      console.log('    … and ' + (d.unclaimedStandalone.length - displayed.length) + ' more');
    }
  }

  // QF-20260704-193: hold PROVENANCE for rha-held SDs — deliberate-vs-accidental at a
  // glance. Compact: reasons grouped, capped, never a bare count with no explanation.
  // NB the count is "held AND idle": a held SD that is also claimed/in-flight is being
  // worked and is intentionally absent (claimableDbFreeReason short-circuits earlier).
  if (holds.length > 0) {
    console.log('  On hold (requires human action) — ' + holds.length + ':');
    const HOLD_CAP = 6;
    const byReason = new Map();
    for (const h of holds) {
      const key = h.provenance ? (h.provenance.reason + (h.provenance.set_by ? ' — by ' + h.provenance.set_by : '')) : 'no reason recorded (bare flag)';
      if (!byReason.has(key)) byReason.set(key, []);
      byReason.get(key).push(h.sd_key);
    }
    let printed = 0;
    for (const [reason, keys] of byReason) {
      if (printed >= HOLD_CAP) { console.log('    … and ' + (byReason.size - printed) + ' more reason group(s)'); break; }
      console.log('    [' + keys.length + '] ' + reason.substring(0, 80) + '  (' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? ', …' : '') + ')');
      printed++;
    }
  }

  console.log('');
}

// QF-20260525-836: open/in_progress QFs (age + holder). Dashboard had no QUICK
// FIXES section, so QFs aging with no PR went unseen. Display only.
function printQuickFixes(d) {
  const qfs = d.quickFixes || [];
  console.log('QUICK FIXES (' + qfs.length + ')');
  console.log('─'.repeat(72));
  if (qfs.length === 0) {
    console.log('  (no open quick-fixes)');
    console.log('');
    return;
  }
  const now = Date.now();
  console.log('  ' + pad('ID', 18) + pad('Status', 12) + pad('Age', 6) + pad('Holder', 10) + 'Title');
  for (const qf of qfs) {
    const ageH = qf.created_at ? Math.max(0, Math.round((now - Date.parse(qf.created_at)) / 3600000)) + 'h' : '?';
    const holder = qf.claiming_session_id ? String(qf.claiming_session_id).substring(0, 8) : '—';
    // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: gated rows are NOT claimable open work —
    // badge them here so the primary list agrees with the worker-lane exclusion.
    const { isChairmanGatedQF } = require('../lib/fleet/qf-gated-hold.cjs');
    const gatedBadge = isChairmanGatedQF(qf) ? ' ⛔CHAIRMAN-GATED' : '';
    console.log('  ' + pad(qf.id, 18) + pad(qf.status, 12) + pad(ageH, 6) + pad(holder, 10) + (qf.title || '').substring(0, 40) + gatedBadge);
  }
  console.log('');
}

// ── Section: Revival Pending (SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001) ──
function printRevivalPending(d) {
  const rows = d.revivalPending || [];
  if (rows.length === 0) return; // zero-noise default

  console.log('REVIVAL PENDING (' + rows.length + ')');
  console.log('─'.repeat(72));
  console.log('  ' + pad('Callsign', 12) + pad('Requested by', 24) + pad('Age', 12) + 'Expires in');
  console.log('  ' + '─'.repeat(68));

  const now = Date.now();
  function fmtAge(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm';
    return Math.round(m / 60) + 'h';
  }

  for (const r of rows) {
    const age = fmtAge(now - Date.parse(r.requested_at));
    const expIn = fmtAge(Date.parse(r.expires_at) - now);
    const reqBy = (r.requested_by_session_id || 'unknown').substring(0, 22);
    console.log('  ' + pad(r.requested_callsign, 12) + pad(reqBy, 24) + pad(age, 12) + expIn);
  }
  console.log('');
}

// ── Section: Coordination ──
function printCoordination(d) {
  console.log('COORDINATION MESSAGES');
  console.log('─'.repeat(72));

  if (d.coordMessages.length === 0) {
    console.log('  (no pending messages)');
    console.log('');
    return;
  }

  const unread = d.coordMessages.filter(m => !m.read_at).length;
  // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): a reply to a
  // coordination message routinely arrives as a fresh row (also ack-null, also in this
  // same query) rather than an update to the original's acknowledged_at — exclude it.
  const pending = d.coordMessages.filter(m => m.read_at && !m.acknowledged_at && !hasCorrelatedReply(m, d.coordMessages)).length;
  console.log('  ' + unread + ' unread, ' + pending + ' pending acknowledgment');
  console.log('');

  console.log('  ' + pad('Type', 20) + pad('Target', 16) + pad('Status', 10) + 'Subject');
  console.log('  ' + '─'.repeat(68));
  for (const m of d.coordMessages.slice(0, 10)) {
    const status = m.acknowledged_at ? 'ACKED' : m.read_at ? 'READ' : 'UNREAD';
    const target = (m.target_session || '').replace('session_', '').substring(0, 14);
    console.log('  ' + pad(m.message_type, 20) + pad(target, 16) + pad(status, 10) + (m.subject || '').substring(0, 30));
  }

  console.log('');
}

// ── Section: Coaching ──
async function printCoaching(d) {
  // Query recent coaching messages (last hour)
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: msgs } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, subject, payload, read_at, acknowledged_at, created_at')
    .eq('message_type', 'COACHING')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(30);

  const coaching = msgs || [];

  console.log('COACHING (last hour)');
  console.log('─'.repeat(72));

  if (coaching.length === 0) {
    console.log('  (no coaching messages sent recently)');
    console.log('');
    return;
  }

  const acked = coaching.filter(m => m.acknowledged_at).length;
  const read = coaching.filter(m => m.read_at && !m.acknowledged_at).length;
  const unread = coaching.filter(m => !m.read_at).length;
  console.log('  Sent: ' + coaching.length + '  |  Acked: ' + acked + '  |  Read: ' + read + '  |  Unread: ' + unread);
  console.log('');

  // Group by coaching_type
  const byType = {};
  for (const m of coaching) {
    const ct = m.payload?.coaching_type || 'UNKNOWN';
    if (!byType[ct]) byType[ct] = { count: 0, targets: new Set(), acked: 0 };
    byType[ct].count++;
    const tty = (m.target_session || '').replace('session_', '').substring(0, 14);
    byType[ct].targets.add(tty);
    if (m.acknowledged_at) byType[ct].acked++;
  }

  console.log('  ' + pad('Type', 28) + pad('Sent', 6) + pad('Acked', 7) + 'Workers');
  console.log('  ' + '─'.repeat(64));
  for (const [type, data] of Object.entries(byType).sort((a, b) => b[1].count - a[1].count)) {
    console.log('  ' + pad(type, 28) + pad(String(data.count), 6) + pad(String(data.acked), 7) + [...data.targets].join(', '));
  }

  console.log('');
}

// ── Section: Health ──
function printHealth(d) {
  const health = d.activeSessions.length >= 3 ? 'HEALTHY' : d.activeSessions.length >= 1 ? 'DEGRADED' : 'DOWN';
  const icon = health === 'HEALTHY' ? '[OK]' : health === 'DEGRADED' ? '[!!]' : '[XX]';

  console.log('FLEET HEALTH ' + icon);
  console.log('─'.repeat(72));
  console.log('  Active:  ' + d.activeSessions.length + ' workers');
  console.log('  Unclaimed: ' + d.idleSessions.length + ' sessions (no SD claim)');
  console.log('  Stale:   ' + d.staleSessions.length + ' sessions');
  console.log('  Orch:    ' + d.completedChildren + '/' + d.totalChildren + ' children complete (' + d.orchPct + '%)');
  console.log('  Status:  ' + health);

  // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: 4-section liveness breakdown ──
  const nowMs = Date.now();
  let confirmed = 0, recent = 0, silent = 0, unknown = 0;
  for (const s of d.activeSessions) {
    const tickMs = s.process_alive_at ? nowMs - Date.parse(s.process_alive_at) : Infinity;
    const silenceDelta = s.expected_silence_until
      ? Date.parse(s.expected_silence_until) - nowMs
      : -Infinity;
    const hbSec = s.heartbeat_age_seconds != null ? s.heartbeat_age_seconds : Infinity;

    if (Number.isFinite(tickMs) && tickMs >= 0 && tickMs <= 90 * 1000) {
      confirmed++;
    } else if (hbSec < 5 * 60) {
      recent++;
    } else if (silenceDelta > 0 && silenceDelta <= 30 * 60 * 1000) {
      silent++;
    } else {
      unknown++;
    }
  }
  if (d.activeSessions.length > 0) {
    console.log('  ──');
    console.log('  Confirmed alive (tick<90s): ' + confirmed);
    console.log('  Recent activity (hb<5m):    ' + recent);
    console.log('  Expected silent (≤30m):     ' + silent);
    console.log('  Unknown (no signals):       ' + unknown);
  }
  console.log('');
}

// ── Section: Periodic-Process Liveness (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001, FR-5) ──
async function printPeriodicLiveness() {
  const { data: rows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, display_name, process_type, currently_expected_active, last_fired_at, last_state, updated_at')
    .order('process_type', { ascending: true });

  console.log('PERIODIC-PROCESS LIVENESS');
  console.log('─'.repeat(72));

  if (error) {
    console.log('  (unable to load periodic_process_registry: ' + error.message + ')');
    console.log('');
    return;
  }
  if (!rows || rows.length === 0) {
    console.log('  (registry empty)');
    console.log('');
    return;
  }

  const self = rows.find((r) => r.process_key === '__watcher_self__');
  const watcherAgeSec = self?.last_fired_at ? Math.round((Date.now() - Date.parse(self.last_fired_at)) / 1000) : null;
  const watcherLine = watcherAgeSec == null
    ? '  Watcher last-run: NEVER RUN'
    : '  Watcher last-run: ' + watcherAgeSec + 's ago' + (watcherAgeSec > 3600 ? '  [STALE WATCHER]' : '');
  console.log(watcherLine);
  console.log('');

  // Render the watcher's own persisted last_state directly (scripts/periodic-liveness-watcher.mjs
  // is the single source of truth for state evaluation and writes last_state on every run,
  // regardless of outcome -- the dashboard renders that column, it does not re-implement the
  // 2+-signal logic or re-derive state from a flags lookback. A flags-table lookback was tried
  // first and rejected: an OVERDUE flag row does not expire when the process recovers, so
  // rendering "is there a flag" rather than "what is the CURRENT last_state" would keep showing
  // OVERDUE forever after a single episode (the same latch defect fixed in emitOverdueSignal,
  // adversarial review on PR #5562).
  const ageOfHours = (ts) => (ts ? Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 3600000)) + 'h' : '—');

  const others = rows.filter((r) => r.process_key !== '__watcher_self__');
  for (const r of others) {
    const state = !r.currently_expected_active
      ? 'INTENTIONALLY_DOWN'
      : (r.last_state || 'UNVERIFIED');
    console.log('  ' + pad(state, 20) + pad(r.process_type, 16) + pad(ageOfHours(r.last_fired_at), 8) + (r.display_name || r.process_key));
  }
  console.log('');
  console.log('  Run scripts/periodic-liveness-watcher.mjs to refresh state.');
  console.log('');
}

// ── Section: QA ──
function printQA(d) {
  const now = Date.now();
  const issues = [];

  // Filter raw sessions to recent (< 10 min heartbeat)
  const recentRaw = d.rawSessions.filter(s => {
    const age = (now - new Date(s.heartbeat_at).getTime()) / 1000;
    return age < 600;
  });

  // QA 1: Working on completed SD
  const onCompleted = recentRaw.filter(s => {
    const sd = d.sdStatusMap[s.sd_key];
    return sd && sd.status === 'completed';
  });
  onCompleted.forEach(s => {
    const sd = d.sdStatusMap[s.sd_key];
    const shortSd = s.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'COMPLETED_SD',
      msg: s.tty + ' working on ' + shortSd + ' — already completed' + (sd.completion_date ? ' at ' + new Date(sd.completion_date).toLocaleTimeString() : '')
    });
  });

  // QA 2: Duplicate claims
  const bySd = {};
  recentRaw.forEach(s => {
    if (!bySd[s.sd_key]) bySd[s.sd_key] = [];
    bySd[s.sd_key].push(s);
  });
  Object.entries(bySd).filter(([, arr]) => arr.length > 1).forEach(([sdId, claimants]) => {
    const shortSd = sdId.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'DUPLICATE',
      msg: shortSd + ' claimed by ' + claimants.length + ' sessions: ' + claimants.map(s => s.tty).join(', ')
    });
  });

  // QA 3: Orphaned claims (SD not in DB)
  recentRaw.filter(s => !d.sdStatusMap[s.sd_key]).forEach(s => {
    issues.push({
      severity: 'MED',
      check: 'ORPHAN',
      msg: s.tty + ' claims ' + s.sd_key.substring(0, 30) + '… — SD not found in DB'
    });
  });

  // QA 4: Claim with bad session status
  recentRaw.filter(s => s.sd_key && !['active', 'idle'].includes(s.status)).forEach(s => {
    const shortSd = s.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'LOW',
      check: 'BAD_STATUS',
      msg: s.tty + ' status=' + s.status + ' but claims ' + shortSd
    });
  });

  // QA 5: Progress 100% but not completed
  Object.values(d.sdStatusMap).filter(sd => sd.progress_percentage >= 100 && sd.status !== 'completed').forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'MED',
      check: 'STUCK_100',
      msg: shortSd + ' at 100% but status=' + sd.status + ' — not marked completed'
    });
  });

  // QA 6: SDs stuck in pending_approval with no active claiming session
  const pendingApproval = Object.values(d.sdStatusMap).filter(sd => sd.status === 'pending_approval');
  const activeClaimSdIds = new Set(recentRaw.map(s => s.sd_key).filter(Boolean));
  pendingApproval.filter(sd => !activeClaimSdIds.has(sd.sd_key)).forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'STUCK_APPROVAL',
      msg: shortSd + ' stuck in pending_approval — no session working on it (sweep will auto-reset to draft)'
    });
  });
  // QA 7: Bare-shell SDs — title repeated as description, no real scope
  (d.bareShellSDs || []).forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({ severity: 'MED', check: 'BARE_SHELL', msg: shortSd + ' has no real description — workers will waste cycles on LEAD setup' });
  });
  // Print
  const icon = issues.length === 0 ? '[PASS]' : '[' + issues.length + ' ISSUES]';
  console.log('QA CHECKS ' + icon);
  console.log('─'.repeat(72));

  if (issues.length === 0) {
    console.log('  All checks passed. Fleet is clean.');
  } else {
    const severityIcon = { HIGH: '!!', MED: '! ', LOW: '- ' };
    for (const issue of issues) {
      console.log('  ' + severityIcon[issue.severity] + ' [' + pad(issue.check, 12) + '] ' + issue.msg);
    }
  }

  console.log('');
}

// ── Section: Forecast ──
async function printForecast(d) {
  const now = new Date();
  console.log('FORECAST');
  console.log('─'.repeat(72));

  // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-004): MC-informed distribution
  // block. Shows p50/p80/p95 plus P(done by H:MM) probabilities for 30/60/90/120
  // minute horizons. Falls back silently if MC unavailable (pre-MC velocity
  // block below still renders).
  if (d.mc && d.mc.etaDistribution) {
    const eta = d.mc.etaDistribution;
    const probTable = Array.isArray(eta.probability_table) ? eta.probability_table : [];
    console.log('  MC DISTRIBUTION (prior: ' + (d.mc.prior_source || 'unknown') + ')');
    console.log('  p50 ' + formatEtaTime(eta.p50) + '   p80 ' + formatEtaTime(eta.p80) + '   p95 ' + formatEtaTime(eta.p95));
    if (probTable.length > 0) {
      const bits = probTable.map(row => {
        const pct = (Number(row.p_done) || 0) * 100;
        return row.horizon_min + 'm: ' + pct.toFixed(0) + '%';
      });
      console.log('  P(done by): ' + bits.join('  '));
    }
    console.log('');
  }

  const orchCompleted = d.children.filter(c => c.status === 'completed' && c.completion_date);
  const orchRemaining = d.children.filter(c => c.status !== 'completed');

  if (orchCompleted.length >= 2) {
    const sorted = orchCompleted
      .map(c => ({ ...c, completedAt: new Date(c.completion_date) }))
      .sort((a, b) => a.completedAt - b.completedAt);

    const firstCompletion = sorted[0].completedAt;
    const lastCompletion = sorted[sorted.length - 1].completedAt;
    const elapsedHours = (lastCompletion - firstCompletion) / (1000 * 60 * 60);
    const velocity = elapsedHours > 0 ? (sorted.length - 1) / elapsedHours : 0;

    let recentVelocity = velocity;
    if (sorted.length >= 3) {
      const recent = sorted.slice(-3);
      const recentElapsed = (recent[recent.length - 1].completedAt - recent[0].completedAt) / (1000 * 60 * 60);
      if (recentElapsed > 0) recentVelocity = (recent.length - 1) / recentElapsed;
    }

    const timeSinceLast = (now - lastCompletion) / (1000 * 60);
    const timeSinceStr = timeSinceLast < 60
      ? Math.round(timeSinceLast) + 'min ago'
      : Math.round(timeSinceLast / 60 * 10) / 10 + 'h ago';

    const effectiveVelocity = recentVelocity > 0 ? recentVelocity : velocity;
    const orchEtaHours = effectiveVelocity > 0 ? orchRemaining.length / effectiveVelocity : null;

    console.log('  ORCHESTRATOR (Stage Venture Workflow)');
    console.log('  ' + bar(d.orchPct, 25) + ' ' + orchCompleted.length + '/' + d.totalChildren + ' (' + d.orchPct + '%)');
    console.log('  Velocity:   ' + velocity.toFixed(1) + ' SDs/hr (overall)  ' + recentVelocity.toFixed(1) + ' SDs/hr (recent)');
    console.log('  Last finish: ' + timeSinceStr);

    if (orchRemaining.length === 0) {
      console.log('  Status:     COMPLETE');
    } else if (orchEtaHours !== null) {
      const etaTime = new Date(now.getTime() + orchEtaHours * 60 * 60 * 1000);
      const etaStr = orchEtaHours < 1
        ? Math.round(orchEtaHours * 60) + ' minutes'
        : Math.round(orchEtaHours * 10) / 10 + ' hours';
      console.log('  Remaining:  ' + orchRemaining.length + ' child(ren)  ETA: ~' + etaStr + ' (around ' + etaTime.toLocaleTimeString() + ')');
    }
  } else if (orchRemaining.length === 0) {
    console.log('  ORCHESTRATOR: COMPLETE (' + d.totalChildren + '/' + d.totalChildren + ')');
  } else {
    console.log('  ORCHESTRATOR: ' + orchCompleted.length + '/' + d.totalChildren + ' (need more data for velocity)');
  }

  console.log('');
  // Full Queue Forecast — all pending SDs across the entire queue. Paginated (FR-6):
  // the pending set can exceed the PostgREST cap, and a capped forecast silently
  // under-forecasts the whole queue.
  let allPending = [];
  try {
    allPending = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, priority, current_phase, progress_percentage, dependencies')
      .in('status', ['draft', 'in_progress', 'ready', 'planning', 'pending_approval'])
      .order('priority', { ascending: true }));
  } catch { allPending = []; } // fail-open to the prior data-null behavior

  const pending = allPending || [];
  const activeWorkers = d.activeSessions.length;

  // Categorize pending SDs
  const inProgress = pending.filter(sd => sd.status === 'in_progress' || (sd.progress_percentage || 0) > 0);
  const notStarted = pending.filter(sd => sd.status !== 'in_progress' && (sd.progress_percentage || 0) === 0);
  const highPrio = pending.filter(sd => sd.priority === 'high' || sd.priority === 'critical');

  console.log('  FULL QUEUE');
  console.log('  Pending SDs:   ' + pending.length + ' total');
  console.log('  In progress:   ' + inProgress.length);
  console.log('  Not started:   ' + notStarted.length);
  if (highPrio.length > 0) {
    console.log('  High priority:  ' + highPrio.length);
  }
  console.log('  Active workers: ' + activeWorkers);

  // Estimate full queue ETA reusing velocity from above
  if (orchCompleted.length >= 2 && pending.length > 0) {
    const s2 = orchCompleted.map(c => ({ ...c, completedAt: new Date(c.completion_date) })).sort((a, b) => a.completedAt - b.completedAt);
    const vel = ((s2[s2.length - 1].completedAt - s2[0].completedAt) / 3600000);
    const v = vel > 0 ? (s2.length - 1) / vel : 0;
    if (v > 0) {
      const h = pending.length / v;
      const etaStr = h < 1 ? Math.round(h * 60) + ' minutes' : h < 24 ? Math.round(h * 10) / 10 + ' hours' : Math.round(h / 24 * 10) / 10 + ' days';
      console.log('  Queue ETA:     ~' + etaStr + ' at current velocity (' + v.toFixed(1) + ' SDs/hr)');
    }
  }
  console.log('');
  console.log('  ' + '─'.repeat(66));

  if (orchRemaining.length === 0 && pending.length === 0) {
    console.log('  Queue is clear. All SDs complete. Nice work.');
  } else if (orchRemaining.length === 0) {
    console.log('  Orchestrator is done! ' + pending.length + ' standalone SDs remain in the queue.');
    console.log('  ' + (activeWorkers > 0 ? activeWorkers + ' worker(s) can roll into the next priority items.' : 'Spin up workers to start burning through the backlog.'));
  } else if (orchRemaining.length <= 2) {
    console.log('  Orchestrator almost done — ' + orchRemaining.length + ' child(ren) left. Then ' + pending.length + ' more.');
  } else {
    console.log('  ' + activeWorkers + ' workers active across ' + pending.length + ' pending SDs.' + (highPrio.length > 0 ? ' ' + highPrio.length + ' high-priority.' : ''));
  }

  console.log('');
}

// ── Section: Predictions ──
async function printPredictions(d) {
  const signals = [];

  // 1. Capacity — estimate real fleet size using heartbeat freshness
  // Sessions with heartbeat < 3min are likely real; >= 3min are likely ghosts (exited without cleanup)
  const ALIVE_THRESHOLD = 180; // 3 minutes
  const aliveIdle = d.idleSessions.filter(s => s.heartbeat_age_seconds < ALIVE_THRESHOLD);
  const ghostIdle = d.idleSessions.filter(s => s.heartbeat_age_seconds >= ALIVE_THRESHOLD);
  const availableCount = d.unclaimedStandalone.length + d.unclaimedChildren.length;
  // +1 for coordinator session (this session — not in fleet data since it has no SD claim)
  const estimatedFleet = d.activeSessions.length + aliveIdle.length + 1;
  const claimedCount = d.activeSessions.length;
  const utilPct = estimatedFleet > 0 ? Math.round((claimedCount / estimatedFleet) * 100) : 0;

  if (aliveIdle.length > 0 && availableCount > 0) {
    signals.push({
      icon: '!!',
      label: 'CAPACITY',
      msg: aliveIdle.length + ' idle / ' + availableCount + ' available — fleet ~' + estimatedFleet + ' sessions at ' + utilPct + '% utilization'
        + (ghostIdle.length > 0 ? ' (' + ghostIdle.length + ' ghost sessions excluded)' : '')
    });
  } else if (aliveIdle.length > 0 && availableCount === 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions — ' + aliveIdle.length + ' idle but 0 SDs available, waiting on completions/unblocks'
    });
  } else if (aliveIdle.length === 0 && availableCount > 0 && claimedCount > 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions, all claimed — ' + availableCount + ' SDs queued for next free worker'
        + (ghostIdle.length > 0 ? ' (' + ghostIdle.length + ' ghost sessions excluded)' : '')
    });
  } else if (aliveIdle.length === 0 && claimedCount > 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions, fully utilized'
    });
  }

  // 2. Dependency unlock forecast — what SDs will completing current work unblock?
  const completedKeys = new Set(d.children.filter(c => c.status === 'completed').map(c => c.sd_key));
  const claimedSdKeys = [...d.claimedSdIds];
  // Get all blocked SDs with their dependencies. Paginated (FR-6): a capped fetch
  // would silently drop blocked SDs from the dependency view.
  let allBlockedRaw = [];
  try {
    allBlockedRaw = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, dependencies, status')
      .in('status', ['draft', 'in_progress', 'ready', 'planning'])
      .not('dependencies', 'is', null));
  } catch { allBlockedRaw = []; }

  const blocked = (allBlockedRaw || []).filter(sd => {
    const deps = parseDeps(sd.dependencies);
    return deps.length > 0 && deps.some(dep => !completedKeys.has(dep));
  });

  // For each currently claimed SD, count how many blocked SDs it would unblock
  for (const claimedKey of claimedSdKeys) {
    const wouldUnblock = blocked.filter(sd => {
      const deps = parseDeps(sd.dependencies);
      const unresolvedDeps = deps.filter(dep => !completedKeys.has(dep));
      return unresolvedDeps.length === 1 && unresolvedDeps[0] === claimedKey;
    });
    if (wouldUnblock.length > 0) {
      const shortKey = claimedKey.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*?-/, '');
      const names = wouldUnblock.slice(0, 3).map(s => s.sd_key.replace('SD-LEO-ORCH-', '').replace(/^SD-.*?-/, '').substring(0, 20));
      signals.push({
        icon: '>>',
        label: 'UNLOCK',
        msg: 'When ' + shortKey + ' completes → unblocks ' + wouldUnblock.length + ' SD(s): ' + names.join(', ')
      });
    }
  }

  // 3. Heartbeat aging — workers approaching stale threshold (FIX #5: with coordination messages)
  const STALE_WARNING = STALE_THRESHOLD * 0.6; // 60% of 5min = 3min
  const agingWorkers = [];
  for (const s of d.activeSessions) {
    if (s.heartbeat_age_seconds >= STALE_WARNING) {
      const remaining = Math.round(STALE_THRESHOLD - s.heartbeat_age_seconds);
      const shortSd = s.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      signals.push({
        icon: '~~',
        label: 'AGING',
        msg: s.tty + ' on ' + shortSd + ' — heartbeat aging (' + s.heartbeat_age_human + '), stale in ~' + remaining + 's'
      });
      agingWorkers.push(s);
    }
  }

  // Send STALE_WARNING coordination messages for aging workers
  for (const s of agingWorkers) {
    // Check if we already sent a stale warning recently (avoid spam)
    const { data: existingWarn } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'STALE_WARNING')
      .is('acknowledged_at', null)
      .limit(1);

    if (existingWarn && existingWarn.length > 0) continue;

    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_key,
        message_type: 'STALE_WARNING',
        subject: 'Heartbeat aging on ' + s.sd_key.split('-').pop() + ' — approaching stale threshold',
        body: 'Your session on ' + s.sd_key + ' has not heartbeated in ' + s.heartbeat_age_human + '. If you are still working, send a heartbeat. If stuck, consider releasing the claim.',
        payload: { session_id: s.session_id, heartbeat_age: s.heartbeat_age_seconds, stale_threshold: STALE_THRESHOLD },
        sender_type: 'dashboard'
      }).then(() => {}).catch(() => {}); // Non-blocking
  }

  // Print
  console.log('PREDICTIONS');
  console.log('─'.repeat(72));
  if (signals.length === 0) {
    console.log('  Fleet nominal — no predictive signals.');
  } else {
    for (const sig of signals) {
      console.log('  ' + sig.icon + ' [' + pad(sig.label, 10) + '] ' + sig.msg);
    }
  }
  console.log('');
}

// QF-20260525-542: delegate to the canonical SD-key blocker rule (was divergent
// local logic that extracted sd_key/id and treated placeholders as available,
// contradicting the sweep). Both tools now agree via parse-sd-dependencies.cjs.
const parseDeps = parseSdDependencies;

// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a — top-level require so the
// wire-check call-graph builder (lib/static-analysis/call-graph-builder.js)
// can statically resolve the dependency on lib/coordinator/resolve.cjs.
const { getActiveCoordinatorId: _getActiveCoordinatorIdForInbox } = require('../lib/coordinator/resolve.cjs');
// SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): excludes rows
// answered by a correlated reply from ack-null-derived headline counts.
const { hasCorrelatedReply } = require('../lib/coordinator/reply-correlation.cjs');

// ── Section: Worker-Signal Inbox (FR-3a) ──
// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001
// CRITICAL: filter on payload->>signal_type IS NOT NULL — relying on message_type=INFO
// alone would surface 105+ unrelated INFO rows already in production.
// RECEIPT MODEL (RCA 2026-06-24, SD-LEO-INFRA-SIGNAL-INBOX-DRAIN-ON-DISPLAY-001): stamp
// read_at on render = DELIVERED, but gate the SELECT on acknowledged_at IS NULL = ACTIONED.
// A signal re-surfaces every render until the coordinator explicitly acks it via
// coordinator-ack-signal.cjs (stamps acknowledged_at). The prior code marked read_at on
// render AND queried read_at IS NULL — so one filtered/parked render silently lost the
// signal (high-sev consults were missed). Mirrors the Adam-lane fix (QF-20260621-174).
async function printInbox() {
  const getActiveCoordinatorId = _getActiveCoordinatorIdForInbox;

  console.log('WORKER-SIGNAL INBOX');
  console.log('─'.repeat(72));

  const coordinatorId = await getActiveCoordinatorId(supabase);
  if (!coordinatorId) {
    console.log('  (no active coordinator detected — run /coordinator start first)');
    console.log('');
    return;
  }

  // RCA 2026-06-24 (SD-LEO-INFRA-SIGNAL-INBOX-DRAIN-ON-DISPLAY-001): gate on the ACTIONED
  // marker (acknowledged_at IS NULL), NOT read_at — so a filtered/skimmed/parked-cron render
  // can no longer silently retire a signal; it re-surfaces until coordinator-ack-signal.cjs
  // stamps acknowledged_at. Mirrors the Adam-lane DELIVERED/ACTIONED decouple (QF-20260621-174).
  // The created_at recency window is a flood-guard against the pre-fix historical backlog
  // (hundreds of rows accumulated read-but-never-acked under the old drain-on-display bug).
  const signalSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, subject, body, payload, created_at')
    .eq('target_session', coordinatorId)
    .not('payload->>signal_type', 'is', null)
    .is('acknowledged_at', null)
    .gte('created_at', signalSince)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.log('  (inbox query failed: ' + error.message + ')');
    console.log('');
    return;
  }

  if (!signals || signals.length === 0) {
    console.log('  (no unread worker signals)');
    console.log('');
    return;
  }

  // QF-20260704-877: signals.length is capped by .limit(20) above, so it can never report
  // more than 20 even when the true unacknowledged backlog is larger — the label read "20
  // unread signal(s)" indefinitely regardless of triage progress. Query the true set (same
  // filters, no limit) so the display reflects real unread rows, not the window cap.
  // FR-6 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): "the true set" above must actually be
  // TRUE — the un-limited query was still bounded by the PostgREST 1000-row cap, recreating the
  // same stuck-label bug at 1000 that QF-20260704-877 fixed at 20. Paginate to completion.
  let allUnreadRows = null;
  let countError = null;
  try {
    allUnreadRows = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, payload')
      .eq('target_session', coordinatorId)
      .not('payload->>signal_type', 'is', null)
      .is('acknowledged_at', null)
      .gte('created_at', signalSince));
  } catch (e) { countError = e; }

  // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): a reply to a worker
  // signal is sent BY the coordinator (sender_session=coordinatorId), targeting the
  // ORIGINAL SENDER (never coordinatorId) and carrying no signal_type — it can never appear
  // in the query above, so the correlation window must be fetched separately.
  const { data: coordinatorReplies } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .eq('sender_session', coordinatorId)
    .gte('created_at', signalSince)
    .limit(400);
  const correlationRows = [...(allUnreadRows || []), ...(coordinatorReplies || [])];
  const uncorrelatedUnread = (allUnreadRows || []).filter((r) => !hasCorrelatedReply(r, correlationRows));
  const trueCount = countError || allUnreadRows == null ? signals.length : uncorrelatedUnread.length;
  console.log('  ' + trueCount + ' unread signal(s)' +
    (trueCount > signals.length ? ' (showing newest ' + signals.length + ')' : ''));
  if (trueCount > 0) {
    console.log('  Ack a signal: node scripts/coordinator-ack-signal.cjs --signal <id>');
  }
  console.log('');
  console.log('  ' + pad('Type', 16) + pad('Severity', 10) + pad('Callsign', 12) + pad('Age', 8) + 'Body');
  console.log('  ' + '─'.repeat(68));

  const ids = [];
  for (const s of signals) {
    const sigType = s.payload?.signal_type || '?';
    const severity = s.payload?.severity || 'medium';
    const callsign = s.payload?.sender_callsign || '(none)';
    const ageMin = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const bodyPreview = (s.body || s.payload?.body || '').replace(/\n/g, ' ').substring(0, 28);
    console.log('  ' + pad(sigType, 16) + pad(severity, 10) + pad(callsign, 12) + pad(ageStr, 8) + bodyPreview);
    ids.push(s.id);
  }

  // Stamp read_at = DELIVERED (transport-level "the coordinator rendered it"), but NEVER
  // acknowledged_at — the signal is retired ONLY by coordinator-ack-signal.cjs (ACTIONED).
  // So a filtered/skimmed/parked-cron render can no longer silently hide an unacked signal;
  // it re-surfaces (SELECT gates on acknowledged_at IS NULL) until explicitly acked.
  if (ids.length > 0) {
    await supabase
      .from('session_coordination')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids);
  }

  console.log('');
}

// ── Section: Worker-scoped inbox (SD-LEO-FIX-FLEET-WORKER-DIRECTIVE-001) ──
// The `inbox` subcommand used to render the COORDINATOR inbox unconditionally, so a
// WORKER following the fleet-loop fallback saw the coordinator's rows and its own
// WORK_ASSIGNMENTs sat unread (worker-verified: Charlie; reproduced by Bravo 2026-07-17).
// This renderer shows rows targeted at the CALLER's session. Read-only by design: it
// never stamps read_at/acknowledged_at — receipt semantics stay with the coordinator
// lane (coordinator-ack-signal.cjs) and /checkin.
async function printWorkerInbox(sessionId, client = supabase) {
  console.log('MY INBOX (session ' + sessionId.slice(0, 8) + '…)');
  console.log('─'.repeat(72));

  const { data: rows, error } = await client
    .from('session_coordination')
    .select('id, sender_session, subject, body, payload, message_type, created_at, read_at, acknowledged_at')
    .eq('target_session', sessionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.log('  (inbox query failed: ' + error.message + ')');
    console.log('');
    return;
  }
  if (!rows || rows.length === 0) {
    console.log('  (no messages directed at this session)');
    console.log('');
    return;
  }

  console.log('  ' + pad('Kind', 20) + pad('State', 8) + pad('Age', 8) + 'Subject / body');
  console.log('  ' + '─'.repeat(68));
  for (const r of rows) {
    const kind = r.payload?.kind || r.payload?.signal_type || r.message_type || '?';
    const state = r.acknowledged_at ? 'acked' : (r.read_at ? 'read' : 'UNREAD');
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const preview = ((r.subject ? r.subject + ' — ' : '') + (r.body || r.payload?.body || ''))
      .replace(/\n/g, ' ').substring(0, 60);
    console.log('  ' + pad(kind, 20) + pad(state, 8) + pad(ageStr, 8) + preview);
  }
  console.log('');
  console.log('  (read-only view — ack/receipt semantics live in /checkin and the coordinator lane)');
  console.log('');
}

// Decides which inbox the `inbox` subcommand renders (SD-LEO-FIX-FLEET-WORKER-DIRECTIVE-001).
// Coordinator view ONLY for the active coordinator itself or an explicit --coordinator flag;
// otherwise the caller's own session inbox. A caller with NO resolvable session gets an
// explicit diagnosis instead of the old silent coordinator fallback (that silence was the bug).
async function resolveInboxAudience({ argv = process.argv, env = process.env, client = supabase } = {}) {
  if (argv.includes('--coordinator')) return { mode: 'coordinator' };
  const callerId = env.CLAUDE_SESSION_ID || null;
  let coordinatorId = null;
  try { coordinatorId = await _getActiveCoordinatorIdForInbox(client); } catch { coordinatorId = null; }
  if (callerId && coordinatorId && callerId === coordinatorId) return { mode: 'coordinator' };
  if (callerId) return { mode: 'worker', sessionId: callerId };
  return { mode: 'unresolved' };
}

// ── Section: Review-held SDs (QF-20260704-742) ──
// The inbox tick covered the worker-signal lane (printInbox) and the Adam advisory lane
// (printAdamInbox), but had no surface at all for SDs parked with
// metadata.needs_coordinator_review=true (lib/fleet/claim-eligibility.cjs) — a third
// distinct intake surface the coordinator must drain (clearCoordinatorReview IS the
// dispatch authorization). Without this, a whole wave of held SDs can sit invisible
// while the coordinator reports belt-empty. Read-only: never mutates the flag.

// ── Section: Chairman-gated QFs (SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001) ──
// QFs whose APPLY is chairman-gated (owner='chairman' + release_condition — the
// QF-508/QF-970 class) are EXCLUDED from the worker-facing open-QF lane so idle workers
// stop burning claim/triage cycles on them. This surface keeps the hold AUDITABLE:
// every gated row renders here with age + condition until released via
// scripts/release-chairman-gated-qf.js — never silently lost.
async function printChairmanGatedQfs() {
  const { isChairmanGatedQF } = require('../lib/fleet/qf-gated-hold.cjs');
  // Adversarial-review fixes (PR #6178): owner filtered SERVER-side (ilike) so non-chairman
  // release_condition rows can't crowd chairman holds out of the limit window ("never
  // silently lost" contract); 'closed' is a real terminal status (auto-close migration) —
  // excluded so a superseded gated QF doesn't display as an active hold forever.
  const { data: rows, error } = await supabase
    .from('quick_fixes')
    .select('id, title, status, owner, release_condition, created_at')
    // '%chairman%' (not exact): the canonical predicate is trim-tolerant and defer-quick-fix
    // writes owner verbatim, so a padded ' chairman ' must still reach this surface (round-2
    // adversarial finding — exact ilike silently lost it). Overmatches like 'vice-chairman'
    // are rejected by the client-side isChairmanGatedQF re-check below (exact after trim).
    .not('release_condition', 'is', null)
    .ilike('owner', '%chairman%')
    .not('status', 'in', '(completed,cancelled,closed)')
    .order('created_at', { ascending: true })
    .limit(30);
  if (error) { return; } // additive surface — degrade silently, never break the dashboard
  const gated = (rows || []).filter(isChairmanGatedQF);
  if (gated.length === 0) return; // render nothing when no holds exist (no empty-section noise)
  console.log('CHAIRMAN-GATED QFS (excluded from worker lane until released)');
  console.log('─'.repeat(72));
  for (const qf of gated) {
    const ageDays = Math.floor((Date.now() - Date.parse(qf.created_at)) / 86_400_000);
    console.log('  ' + pad(qf.id, 20) + pad(qf.status, 12) + pad(ageDays + 'd', 6) + (qf.title || '').substring(0, 34));
    console.log('    condition: ' + String(qf.release_condition).replace(/\n/g, ' ').substring(0, 100));
  }
  console.log('  Release: node scripts/release-chairman-gated-qf.js <QF-ID> --reason "<why>"');
  console.log('');
}

async function printReviewHeldSds() {
  console.log('REVIEW-HELD SDS');
  console.log('─'.repeat(72));

  const { data: held, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, metadata')
    .eq('metadata->>needs_coordinator_review', 'true')
    .not('status', 'in', '(completed,cancelled)');

  if (error) {
    console.log('  (review-held query failed: ' + error.message + ')');
    console.log('');
    return;
  }

  warnIfCapTruncated(held, 'review-held SDs');
  if (!held || held.length === 0) {
    console.log('  (no SDs held for coordinator review)');
    console.log('');
    return;
  }

  // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-4): review order also prefers plan-linked work
  // at equal standing — same shared comparator as coordinator-backlog-rank.mjs's dispatch
  // sort (dynamic import: this file is CJS, the comparator lives in an ESM lib module).
  try {
    const { planLinkageCompare } = await import('../lib/roadmap/plan-linkage-comparator.js');
    held.sort(planLinkageCompare);
  } catch (cmpErr) {
    console.log('  (plan-linkage ordering unavailable, falling back to query order: ' + cmpErr.message + ')');
  }

  console.log('  ' + held.length + ' SD(s) held for review');
  console.log('');
  for (const sd of held) {
    console.log('  ' + pad(sd.sd_key, 44) + pad(sd.status, 12) + (sd.title || '').substring(0, 40));
  }
  console.log('  Clear a hold: node scripts/clear-coordinator-review.mjs <SD-KEY>');
  console.log('');
}

// ── Section: Adam advisory inbox (SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B) ──
// Surfaces Adam advisories (payload.kind=adam_advisory) in a SEPARATE section from
// the worker-friction inbox (printInbox). Adam advisories deliberately omit
// payload.signal_type, so printInbox's signal_type-NOT-NULL filter never shows them;
// this section is their dedicated render. The per-session coordination-inbox drainer
// skips adam_advisory so rows survive to be surfaced here.
async function printAdamInbox() {
  const getActiveCoordinatorId = _getActiveCoordinatorIdForInbox;

  console.log('ADAM ADVISORY INBOX');
  console.log('─'.repeat(72));

  const coordinatorId = await getActiveCoordinatorId(supabase);
  if (!coordinatorId) {
    console.log('  (no active coordinator detected — run /coordinator start first)');
    console.log('');
    return;
  }

  // SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR3): drive the SINGLE canonical consumer
  // selector instead of re-implementing the query here. selectUnactionedAdvisories is the
  // one place that defines "an unactioned advisory" (payload.kind=adam_advisory +
  // payload.actioned_at IS NULL, no expires_at filter — the row must physically survive,
  // which is why FR1 gives it a durable TTL). It also covers the broadcast-coordinator
  // sentinel, which this inline query previously MISSED. Unifying here removes a
  // writer/consumer-asymmetry drift surface (PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001).
  const { selectUnactionedAdvisories, isActionRequiredAdvisory } = require('../lib/coordinator/adam-advisory-store.cjs');
  // QF-20260621-174: fetch a wide window (was 20) so action-required asks are never buried
  // under the 80+ belt-countdown status relays; the render partitions + caps below.
  const { rows: advisories, error } = await selectUnactionedAdvisories(supabase, coordinatorId, { limit: 200 });

  if (error) {
    console.log('  (adam inbox query failed: ' + error.message + ')');
    console.log('');
    return;
  }

  if (!advisories || advisories.length === 0) {
    console.log('  (no unread Adam advisories)');
    console.log('');
    return;
  }

  // SD-LEO-FIX-SOLOMON-MULTI-PART-001: collapse a multi-part Solomon reply (split across
  // several rows, joined by subject-line "N/M" marker) into ONE rendered entry. A
  // marker-less advisory passes through as its own singleton group, byte-identical to
  // before. read_at below still stamps EVERY member row of every group (delivery tracking
  // stays per-row; only the human-facing render collapses).
  const { groupMultiPartAdvisories } = require('../lib/coordinator/multi-part-reply.cjs');
  const groups = groupMultiPartAdvisories(advisories);

  // QF-20260621-174: partition the lane so action-required advisories ALWAYS render
  // un-truncated; passive status relays (belt-countdowns) get a capped tail so they can
  // never crowd out an ask. Both subsets stamp read_at below (DELIVERED, not actioned).
  const isActionRequiredGroup = (g) => g.rows.some(isActionRequiredAdvisory);
  const actionRows = groups.filter(isActionRequiredGroup);
  const statusRows = groups.filter((g) => !isActionRequiredGroup(g));

  console.log('  ' + advisories.length + ' unactioned (' + actionRows.length +
    ' action-required, ' + statusRows.length + ' status relay(s))');
  console.log('');

  // SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-8) — ONE batched presence lookup for
  // all senders about to render, not a per-row query.
  const { getFleetPresence } = require('../lib/coordinator/presence-grounding-signals.cjs');
  const senderIds = [...new Set(advisories.map((a) => a.sender_session).filter(Boolean))];
  const presenceMap = await getFleetPresence(supabase, senderIds);
  const formatPresence = (p) => {
    if (!p) return '?';
    if (p.state === 'active_now') return 'active';
    if (p.state === 'parked') return `parked+${Math.round((p.expectationWindowMs || 0) / 60000)}m`;
    return 'away';
  };

  console.log('  ' + pad('Callsign', 12) + pad('Presence', 12) + pad('Reply?', 8) + pad('Age', 8) + 'Body');
  console.log('  ' + '─'.repeat(68));

  const ids = [];
  const renderRow = (g) => {
    const last = g.rows[g.rows.length - 1];
    const callsign = last.payload?.sender_callsign || '(none)';
    const presence = formatPresence(presenceMap.get(last.sender_session));
    const wantsReply = g.rows.some((a) => a.payload?.expects_reply) ? 'yes' : '-';
    const ageMin = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const partsSuffix = g.isMultiPart ? ` (${g.rows.length}${g.isComplete ? '' : '/' + g.total} parts)` : '';
    const bodyPreview = g.body.replace(/\n/g, ' ').substring(0, 32) + partsSuffix;
    console.log('  ' + pad(callsign, 12) + pad(presence, 12) + pad(wantsReply, 8) + pad(ageStr, 8) + bodyPreview);
    ids.push(...g.memberIds);
  };

  for (const g of actionRows) renderRow(g); // action-required: never truncated
  const STATUS_CAP = 15;
  for (const g of statusRows.slice(0, STATUS_CAP)) renderRow(g);
  if (statusRows.length > STATUS_CAP) {
    console.log('  … and ' + (statusRows.length - STATUS_CAP) + ' older status relay(s) hidden');
  }

  // FR-1: stamp read_at = DELIVERED (transport-level "the coordinator saw it on a render"),
  // but NEVER actioned_at — the advisory is retired ONLY by coordinator-ack-adam.cjs. So a
  // parked-cron render can no longer silently hide an unactioned advisory; it re-surfaces
  // (gate above is payload.actioned_at IS NULL) until the coordinator explicitly acks it.
  if (ids.length > 0) {
    await supabase
      .from('session_coordination')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids);
  }

  console.log('');
}

// ── Section: PENDING SOLOMON CONSULTS (SD-LEO-INFRA-SOLOMON-CONSULT-001F) ──
// Read-only dashboard surface for the Solomon oracle consult lane
// (payload.kind='solomon_consult'). Mirrors printAdamInbox's intent but is
// deliberately PURE-READ — it does NOT stamp read_at. Why: solomon-advisory.cjs
// drainInbox filters on `read_at IS NULL` and stamps read_at on delivery, so a
// dashboard render that stamped read_at would HIDE an unactioned consult from the
// oracle's own inbox drain (the parked-render-hides-consult bug class the Adam lane
// fixed by gating re-surfacing on actioned state, not read_at). We therefore gate
// on `acknowledged_at IS NULL` (the ACTIONED signal — a consult is retired only when
// the oracle answers it) so this view shows genuinely-pending consults regardless of
// delivery, and never perturbs the oracle's drain. Dormant-safe: when
// SOLOMON_CONSULT_V1 is off no solomon_consult rows are ever written, so this renders
// "(no pending Solomon consults)" silently.
async function printSolomonInbox() {
  console.log('PENDING SOLOMON CONSULTS');
  console.log('─'.repeat(72));

  let solomonId = null;
  try {
    const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
    solomonId = await getActiveSolomonId(supabase);
  } catch { solomonId = null; } // fail-open: identity resolver unavailable → buffer view only

  // Consults target the live Solomon when one is registered, else buffer to the
  // 'broadcast-solomon' sentinel (drained on /solomon register). Surface both.
  const targets = ['broadcast-solomon'];
  if (solomonId) targets.push(solomonId);

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, payload, body, sender_session, created_at')
      .in('target_session', targets)
      .eq('message_type', 'INFO')
      .is('acknowledged_at', null) // pending = not yet actioned/answered (survives the read_at stamp)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.log('  (solomon consult query failed: ' + error.message + ')');
      console.log('');
      return;
    }
    // payload.kind discriminates the consult lane from any other broadcast-solomon row.
    rows = (data || []).filter((r) => r.payload && r.payload.kind === 'solomon_consult');
  } catch (e) {
    console.log('  (solomon consult query failed: ' + (e && e.message ? e.message : e) + ')');
    console.log('');
    return;
  }

  if (rows.length === 0) {
    console.log('  (no pending Solomon consults)');
    console.log('');
    return;
  }

  // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): a consult's reply
  // is Solomon's own outbound row (sender_session in targets) correlated by payload.reply_to
  // /correlation_id, targeting the ORIGINAL REQUESTER — never visible in the targets-scoped
  // `rows` query above, so a separate read of Solomon's own sends is required. PURE READ.
  try {
    const { data: solomonReplies } = await supabase
      .from('session_coordination')
      .select('id, payload')
      .in('sender_session', targets)
      .order('created_at', { ascending: false })
      .limit(200);
    rows = rows.filter((r) => !hasCorrelatedReply(r, [...rows, ...(solomonReplies || [])]));
  } catch { /* fail-open: correlation lookup unavailable → fall back to uncorrelated rows */ }

  if (rows.length === 0) {
    console.log('  (no pending Solomon consults)');
    console.log('');
    return;
  }

  console.log('  ' + rows.length + ' pending consult(s)' +
    (solomonId ? '' : ' — no live Solomon (buffered to broadcast-solomon, drains on /solomon register)'));
  console.log('');

  // SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-8) — ONE batched presence lookup,
  // same helper printAdamInbox uses (no per-role reimplementation).
  const { getFleetPresence } = require('../lib/coordinator/presence-grounding-signals.cjs');
  const senderIds = [...new Set(rows.map((r) => r.sender_session).filter(Boolean))];
  const presenceMap = await getFleetPresence(supabase, senderIds);
  const formatPresence = (p) => {
    if (!p) return '?';
    if (p.state === 'active_now') return 'active';
    if (p.state === 'parked') return `parked+${Math.round((p.expectationWindowMs || 0) / 60000)}m`;
    return 'away';
  };

  console.log('  ' + pad('Callsign', 12) + pad('Presence', 12) + pad('Severity', 10) + pad('Age', 8) + 'Body');
  console.log('  ' + '─'.repeat(68));

  for (const r of rows) {
    const callsign = r.payload?.sender_callsign || '(none)';
    const presence = formatPresence(presenceMap.get(r.sender_session));
    const severity = r.payload?.severity || 'medium';
    const ageMin = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const bodyPreview = (r.body || r.payload?.body || '').replace(/\n/g, ' ').substring(0, 32);
    console.log('  ' + pad(callsign, 12) + pad(presence, 12) + pad(severity, 10) + pad(ageStr, 8) + bodyPreview);
  }
  // PURE READ — intentionally no read_at/acknowledged_at mutation here (see header).
  console.log('');
}

// ── Section: Solomon advice-outcome rollup (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001, FR-5;
//    pending-visibility extended QF-20260704-598 — decay was invisible until a decided row existed) ──
// Read-only accuracy + cost-per-accepted-proposal rollup over solomon_advice_outcome_ledger. Pending
// (undecided) rows are excluded from the accuracy denominator so an in-flight advisory never counts
// as a failure. Dormant-safe: an absent table or empty ledger renders "(no data yet)" rather than
// crashing or dividing by zero.
/**
 * Pure: compute the accuracy + cost-per-accepted-proposal rollup from raw ledger rows, plus
 * pending-count + oldest-pending-age (QF-20260704-598 — pending decay was archaeology-only before
 * this, since the old contract returned null whenever there were zero DECIDED rows, hiding an
 * all-pending ledger from the dashboard entirely). Returns null only when there are literally zero
 * ledger rows at all; an all-pending ledger now returns decidedCount=0 with pending fields populated
 * so decay is visible from day one. Exported for tests.
 */
function computeSolomonLedgerRollup(rows, nowMs = Date.now()) {
  const all = rows || [];
  if (all.length === 0) return null;

  const decided = all.filter((r) => r.decision && r.decision !== 'pending');
  const pending = all.filter((r) => !r.decision || r.decision === 'pending');
  const oldestPendingAgeMs = pending.length > 0
    ? Math.max(...pending.map((r) => nowMs - new Date(r.created_at).getTime()))
    : null;

  if (decided.length === 0) {
    return {
      decidedCount: 0,
      pendingCount: pending.length,
      oldestPendingAgeMs,
      acceptedShippedClean: 0,
      accuracyPct: null,
      acceptedCount: 0,
      costPerAccepted: null,
    };
  }

  const acceptedShippedClean = decided.filter((r) => r.decision === 'accepted' && r.outcome === 'shipped_clean').length;
  const accuracyPct = Math.round((acceptedShippedClean / decided.length) * 100);

  const accepted = decided.filter((r) => r.decision === 'accepted');
  const acceptedCostSum = accepted.reduce((sum, r) => sum + (Number.isFinite(r.cost_tokens) ? r.cost_tokens : 0), 0);
  const costPerAccepted = accepted.length > 0 ? Math.round(acceptedCostSum / accepted.length) : null;

  return {
    decidedCount: decided.length,
    pendingCount: pending.length,
    oldestPendingAgeMs,
    acceptedShippedClean,
    accuracyPct,
    acceptedCount: accepted.length,
    costPerAccepted,
  };
}

async function printSolomonLedgerRollup() {
  console.log('SOLOMON ADVICE-OUTCOME LEDGER');
  console.log('─'.repeat(72));

  let rows = [];
  try {
    // FR-6 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): .limit(5000) was silently clamped
    // to the PostgREST 1000-row cap — stats were computed over at most 1000 rows while
    // claiming a 5000-row sample. Paginate up to the declared 5000-row sampling cap.
    rows = await fapPaginate(() => supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .select('decision, outcome, cost_tokens, created_at'), { maxRows: 5000 });
  } catch (e) {
    console.log('  (ledger query failed: ' + (e && e.message ? e.message : e) + ')');
    console.log('');
    return;
  }

  const rollup = computeSolomonLedgerRollup(rows);
  if (!rollup) {
    console.log('  (no data yet)');
    console.log('');
    return;
  }

  const oldestPendingStr = rollup.oldestPendingAgeMs !== null
    ? Math.floor(rollup.oldestPendingAgeMs / (60 * 60 * 1000)) + 'h'
    : 'n/a';
  if (rollup.decidedCount === 0) {
    console.log('  0 decided proposal(s) yet (' + rollup.pendingCount + ' pending, oldest ' + oldestPendingStr + ')');
    console.log('');
    return;
  }

  console.log('  ' + rollup.decidedCount + ' decided proposal(s) (' + rollup.pendingCount + ' pending, oldest ' + oldestPendingStr + ')');
  console.log('  accuracy: ' + rollup.accuracyPct + '% (' + rollup.acceptedShippedClean + '/' + rollup.decidedCount + ' accepted+shipped_clean)');
  console.log('  cost-per-accepted-proposal: ' + (rollup.costPerAccepted !== null ? rollup.costPerAccepted + ' tokens' : 'n/a (0 accepted)'));
  console.log('');
}

// ── Section: Working context (FR-3, SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001) ──
// Dual-render of both operators' standing working_context (claude_sessions.metadata.working_context)
// so neither Adam nor the coordinator mistakes the other's heads-down silence for being ignored.
// waiting-on-the-other-party threads are highlighted (the highest-value signal) and a context older
// than the staleness threshold is flagged so a stale (misleading) context is never trusted blindly.
// Read-only — renders via the single-source formatWorkingContext; stamps nothing.
async function printWorkingContext() {
  const getActiveCoordinatorId = _getActiveCoordinatorIdForInbox;
  const store = require('../lib/coordinator/working-context-store.cjs');
  const wcLib = require('../lib/coordinator/working-context.cjs');
  let resolveAdamSessionId = null;
  try { ({ resolveAdamSessionId } = require('./read-adam-directives.cjs')); } catch { resolveAdamSessionId = null; }

  console.log('WORKING CONTEXT (Adam <-> Coordinator standing threads)');
  console.log('─'.repeat(72));

  let adamId = null, coordId = null;
  try { adamId = resolveAdamSessionId ? await resolveAdamSessionId(supabase) : null; } catch { adamId = null; }
  try { coordId = await getActiveCoordinatorId(supabase); } catch { coordId = null; }

  const adam = adamId ? await store.getWorkingContext(supabase, adamId) : null;
  const coord = coordId ? await store.getWorkingContext(supabase, coordId) : null;
  const em = (s) => '\x1b[33m' + s + '\x1b[0m'; // yellow = waiting-on-other / STALE

  console.log(wcLib.formatWorkingContext(adam, { label: 'Adam' + (adamId ? '' : ' (no session)'), em }));
  console.log('');
  console.log(wcLib.formatWorkingContext(coord, { label: 'Coordinator' + (coordId ? '' : ' (no session)'), em }));
  console.log('');
}

// ── Section: Undelivered outbound + dead letters (FR-2/FR-4, SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001) ──
// Receipt contract: read_at = DELIVERED, payload.actioned_at / acknowledged_at = ACTIONED.
// This section closes the SENDER-side gap: outbound rows sitting UNREAD at a LIVE target
// (live: GO messages sat unread 24-29 min while Adam was heartbeat-alive). Read-only —
// stamps NOTHING (stamping read_at here would forge a DELIVERED receipt).
async function printUndeliveredOutbound() {
  const { findUndelivered } = require('../lib/coordinator/receipts.cjs');

  console.log('UNDELIVERED OUTBOUND');
  console.log('─'.repeat(72));

  const coordinatorId = await _getActiveCoordinatorIdForInbox(supabase);
  if (!coordinatorId) {
    console.log('  (no active coordinator detected — run /coordinator start first)');
    console.log('');
    return;
  }

  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: outbound, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, subject, payload, created_at, read_at')
    .eq('sender_session', coordinatorId)
    .is('read_at', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    console.log('  (outbound query failed: ' + error.message + ')');
    console.log('');
    return;
  }

  const { data: sessions } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at')
    .gte('heartbeat_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(200);

  const undelivered = findUndelivered(outbound, sessions || []);
  if (undelivered.length === 0) {
    console.log('  (no undelivered outbound rows at live targets)');
    console.log('');
    return;
  }

  console.log('  ' + undelivered.length + ' outbound row(s) UNREAD at a LIVE target — consider re-sending or nudging:');
  for (const r of undelivered) {
    const kind = (r.payload && r.payload.kind) || r.message_type || '?';
    const ageMin = Math.floor(r.ageMs / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    console.log('  • [' + String(r.id).slice(0, 8) + '] → ' + String(r.target_session).slice(0, 8)
      + ' | ' + kind + ' | unread ' + ageStr + ' | ' + (r.subject || '').slice(0, 40));
  }
  console.log('');
}

// SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001: dead-channel banner + chairman-visible terminal
// marker for the chairman-escalation email channel. Pull-based (mirrors printUndeliveredOutbound()'s
// shape) -- reads the current row live on every render, no push/cache. Read-only + fail-open.
//
// DOCUMENTED DEVIATION (PLAN_VERIFICATION, VALIDATION sub-agent finding): the PRD named a
// separate ambient statusline marker as a 3rd surface distinct from this dashboard banner.
// Collapsed into one (this function) because no pluggable ambient-statusline mechanism exists
// anywhere in this codebase, and R4's own LEAD-phase risk analysis already concluded the active
// Todoist PUSH is the primary detection guarantee -- a second passive/pull surface is
// confirmatory, not load-bearing. See PRD FR-4 for the full rationale.
async function printChairmanEmailChannelHealth(d, deps = {}) {
  const sb = (deps && deps.supabase) || supabase; // injectable for tests; defaults to module client
  console.log('CHAIRMAN-EMAIL CHANNEL HEALTH');
  console.log('─'.repeat(72));

  const { data: row, error } = await sb
    .from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error) {
    console.log('  (channel-health query failed: ' + error.message + ')');
    console.log('');
    return;
  }
  if (!row) {
    console.log('  (no channel-health row yet — migration may be unapplied)');
    console.log('');
    return;
  }

  if (row.alarm_state === 'raised') {
    console.log('  🔴 ALARM: channel DOWN — consecutive_failures=' + row.consecutive_failures
      + ' last_error_class=' + (row.last_error_class || '?')
      + ' raised_at=' + (row.alarm_raised_at || '?'));
  } else if (row.alarm_state === 'cooldown') {
    console.log('  🟡 RECOVERING (cooldown) — cleared_at=' + (row.alarm_cleared_at || '?'));
  } else {
    console.log('  🟢 healthy — last_success_at=' + (row.last_success_at || 'never'));
  }
  console.log('  last_canary_verified_at=' + (row.last_canary_verified_at || 'never'));
  console.log('');
}

// SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 / FR-2: surface SDs stranded at
// pending_approval/LEAD_FINAL — one handoff from shipped but invisible to monitoring
// without this gauge. Read-only + fail-open (planStrandAgeGauge never throws).
async function printStrandAgeGauge() {
  const { planStrandAgeGauge, formatAge } = require('../lib/coordinator/strand-age-gauge.cjs');

  console.log('LEAD_FINAL STRAND-AGE GAUGE');
  console.log('─'.repeat(72));

  let gauge;
  try {
    gauge = await planStrandAgeGauge(supabase);
  } catch {
    console.log('  (gauge unavailable — non-fatal)');
    console.log('');
    return;
  }

  if (gauge.flagged.length === 0) {
    console.log('  (no SD stranded at pending_approval/LEAD_FINAL past the threshold)');
    console.log('');
    return;
  }

  console.log('  ' + gauge.flagged.length + ' SD(s) stranded at pending_approval/LEAD_FINAL:');
  for (const r of gauge.flagged) {
    console.log('  • ' + r.sd_key + ' — stranded ' + formatAge(r.ageMs) + ' (age source: ' + r.ageSource + ')');
  }
  console.log('');
}

// SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-3: surface the
// relay/decision/review drop gauge — mirrors printUndeliveredOutbound()'s shape. Read-only
// + fail-open (planRelayDrops never throws).
async function printRelayDropGauge() {
  const { planRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');

  console.log('RELAY/DECISION/REVIEW DROP GAUGE');
  console.log('─'.repeat(72));

  const gauge = await planRelayDrops(supabase);
  const flagged = gauge.decisions.filter((d) => d.action === 'flag');
  if (flagged.length === 0) {
    console.log('  (no unactioned relay/decision/review rows past the drop-detection window)');
    console.log('');
    return;
  }

  console.log('  ' + flagged.length + ' row(s) flagged — no matching outbound within the window:');
  for (const d of flagged) {
    const ageMin = Math.floor(d.ageMs / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    console.log('  • [' + String(d.id).slice(0, 8) + '] correlation=' + String(d.correlationId).slice(0, 8) + ' | unactioned ' + ageStr + ' | ' + d.reason);
  }
  console.log('');
}

// ── Section: Chairman-directive compliance lane (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1) ──
// Surfaces broadcast chairman_directive rows FIRST (a chairman baseline directive must never silently
// die at any role's last hop — the incident had Solomon run 2h non-compliant). This lane BYPASSES the
// printInbox signal_type gate (which filters .not('payload->>signal_type','is',null)): a chairman_directive
// carries NO signal_type, so printInbox would never show it. It reads the broadcast lane directly via the
// gauge's pure core, applies SUPERSEDES (latest issued_at per directive_id), and reports per-role
// OUTSTANDING vs ACKED so non-compliance is VISIBLE. READ-ONLY (never mutates target_session — the
// broadcast row must survive for every role).
async function printChairmanDirectives() {
  const { planChairmanDirectiveCompliance } = require('../lib/coordinator/chairman-directive-gauge.cjs');

  console.log('CHAIRMAN DIRECTIVE COMPLIANCE');
  console.log('─'.repeat(72));

  const gauge = await planChairmanDirectiveCompliance(supabase);
  if (gauge.rows.length === 0) {
    console.log('  (no chairman directives in the last 24h)');
    console.log('');
    return;
  }

  const outstanding = gauge.rows.filter((r) => r.status === 'outstanding');
  console.log('  ' + gauge.rows.length + ' (directive × role) tracked — ' + outstanding.length + ' OUTSTANDING, ' + gauge.acked + ' ACKED:');
  for (const r of gauge.rows) {
    const ageMin = Math.floor((r.ageMs || 0) / 60_000);
    const ageStr = ageMin < 60 ? ageMin + 'm' : Math.floor(ageMin / 60) + 'h';
    const mark = r.status === 'outstanding' ? '⚠ OUTSTANDING' : '✓ acked';
    console.log('  • [' + String(r.directiveId).slice(0, 16) + '] role=' + pad(r.role, 12) + mark + ' | issued ' + ageStr + ' ago');
  }
  console.log('');
}

// QF-20260704-493: feedback-consumption SLA gauge — actionable categories with no
// consumption deadline (adam_adherence_drift, completion_flag, coordinator_review,
// harness_backlog escalations) can rot unconsumed indefinitely. Recomputes fresh every
// render (primary-state check); the daily reminder itself lives in the cron-scheduled
// scripts/coordinator-feedback-sla-gauge.cjs, not here — this is read-only visibility.
async function printFeedbackSlaGauge() {
  const { planSlaBreaches } = require('../lib/coordinator/feedback-sla-gauge.cjs');

  console.log('FEEDBACK-CONSUMPTION SLA GAUGE');
  console.log('─'.repeat(72));

  const breaches = await planSlaBreaches(supabase);
  if (breaches.length === 0) {
    console.log('  (all actionable feedback categories consumed within SLA)');
    console.log('');
    return;
  }

  console.log('  ' + breaches.length + ' categor' + (breaches.length === 1 ? 'y' : 'ies') + ' breaching consumption SLA:');
  for (const b of breaches) {
    console.log('  • ' + pad(b.category, 22) + b.count + ' unconsumed, oldest ' + b.oldestAgeDays + 'd');
  }
  console.log('');
}

// SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-9): open-actionable count +
// oldest-actionable-age for category='harness_backlog' — the write-only-sink class
// (2,320+ rows, zero closures at audit time) is visible here if it ever re-forms.
// NO-DATA on query failure, per the established gauge convention.
async function printDrainGauge() {
  const { planDrainGauge } = require('../lib/coordinator/drain-gauge.cjs');

  console.log('HARNESS-BACKLOG DRAIN GAUGE');
  console.log('─'.repeat(72));

  const result = await planDrainGauge(supabase);
  if (result.noData) {
    console.log('  (NO-DATA: ' + result.reason + ')');
    console.log('');
    return;
  }

  if (result.openCount === 0) {
    console.log('  (0 open-actionable harness_backlog rows)');
    console.log('');
    return;
  }

  console.log('  ' + result.openCount + ' open-actionable, oldest ' + result.oldestAgeDays + 'd');
  console.log('');
}

// FR-4 surfacing: rows the stale-session sweep dead-lettered (payload.dead_letter=true)
// in the last 24h — undelivered traffic no longer vanishes tracelessly; the coordinator
// can re-send to the successor session. Read-only.
async function printDeadLetters() {
  const { selectRecentDeadLetters } = require('../lib/coordinator/receipts.cjs');

  console.log('DEAD-LETTERED (24h)');
  console.log('─'.repeat(72));

  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, subject, payload, created_at')
    .eq('payload->>dead_letter', 'true')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.log('  (dead-letter query failed: ' + error.message + ')');
    console.log('');
    return;
  }

  const recent = selectRecentDeadLetters(rows || []);
  if (recent.length === 0) {
    console.log('  (no dead-lettered coordination rows in the last 24h)');
    console.log('');
    return;
  }

  console.log('  ' + recent.length + ' row(s) dead-lettered (target dead/gone) — re-send if still relevant:');
  for (const r of recent) {
    const kind = (r.payload && r.payload.kind) || r.message_type || '?';
    const orig = (r.payload && r.payload.original_target) || r.target_session || '?';
    console.log('  • [' + String(r.id).slice(0, 8) + '] was → ' + String(orig).slice(0, 8)
      + ' | ' + kind + ' | ' + (r.subject || '').slice(0, 44));
  }
  console.log('');
}

// ── Section: Feedback work-store (SD-LEO-INFRA-COORDINATOR-DASHBOARD-SURFACES-001) ──
// READ-ONLY / additive: surfaces the feedback table (untriaged feedback + harness
// backlog) on the coordinator single-pane view so pending feedback work is never
// missed alongside the worker-signal inbox (printInbox) and the SD queue
// (printAvailable). Display only — performs NO routing, lifecycle, sweep,
// coordinator-election, or read_at mutation. Explicit columns + row limit on every
// query so the 500+ row feedback table cannot flood the dashboard.
async function printFeedback(d, deps = {}) {
  const sb = (deps && deps.supabase) || supabase; // injectable for tests; defaults to module client
  console.log('FEEDBACK');
  console.log('─'.repeat(72));

  // Untriaged feedback: pending rows not yet actioned, excluding harness backlog
  // (surfaced as its own subsection below) AND the write-time-terminal categories
  // (SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 FR-1 — completion_flag_witness /
  // telemetry_aggregate / informational_note are never actionable; a plain
  // .neq('category','harness_backlog') would let fresh witness rows leak back into
  // this "untriaged" view, VALIDATION finding at PLAN_VERIFICATION) to keep the
  // views disjoint.
  const { TERMINAL_CATEGORIES } = require('../lib/governance/feedback-terminal-categories.cjs');
  const { data: untriaged, error: uErr } = await sb
    .from('feedback')
    .select('id, priority, category, title, status, created_at')
    .not('status', 'in', '(resolved,cancelled,closed)')
    .not('category', 'in', `(harness_backlog,${TERMINAL_CATEGORIES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(15);

  // Harness backlog: deferred harness-hardening work captured during product sessions.
  const { data: backlog, error: bErr } = await sb
    .from('feedback')
    .select('id, title, status, created_at, metadata')
    .eq('category', 'harness_backlog')
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })
    .limit(100); // QF-20260609-703: fetch wider, then de-noise via sourceableBacklog before the 15-row display

  // Graceful degradation: a failed query prints a short notice and returns without
  // throwing, so the overall /coordinator all render never crashes (mirrors printInbox).
  if (uErr || bErr) {
    console.log('  (feedback query failed: ' + (uErr || bErr).message + ')');
    console.log('');
    return;
  }

  const uRows = untriaged || [];
  // QF-20260609-703: drop completion-flag / fleet-retro / coordinator-review AUTO-CAPTURE closure
  // artifacts (~90% of harness_backlog) so the dashboard shows genuine sourceable work only.
  const { sourceableBacklog } = await import('./lib/sourceable-backlog.mjs');
  const bRows = sourceableBacklog(backlog || []);

  if (uRows.length === 0 && bRows.length === 0) {
    console.log('  (no pending feedback or harness backlog)');
    console.log('');
    return;
  }

  const now = Date.now();
  const ageOf = (ts) => ts ? Math.max(0, Math.round((now - Date.parse(ts)) / 3600000)) + 'h' : '?';

  console.log('  Untriaged feedback (' + uRows.length + ')');
  if (uRows.length === 0) {
    console.log('    (none)');
  } else {
    for (const f of uRows) {
      console.log('    ' + pad(f.priority || '—', 5) + pad(f.category || '-', 18) + pad(ageOf(f.created_at), 6) + (f.title || '').substring(0, 38));
    }
  }

  console.log('  Harness backlog (' + bRows.length + ')');
  if (bRows.length === 0) {
    console.log('    (none)');
  } else {
    for (const b of bRows.slice(0, 15)) {
      console.log('    ' + pad(ageOf(b.created_at), 6) + (b.title || '').substring(0, 52));
    }
  }

  console.log('');
}

// ── Main ──

async function main() {
  const section = (process.argv[2] || 'all').toLowerCase();
  const suppressEnabled = section === 'all' && process.env.FLEET_DASH_SUPPRESS !== 'false';
  const buf = []; const origLog = console.log;
  if (suppressEnabled) console.log = (...a) => buf.push(util.format(...a));
  const d = await loadData();

  const sections = {
    workers:       () => printWorkers(d),
    orchestrator:  () => printOrchestrator(d),
    available:     () => printAvailable(d),
    quickfixes:    async () => { printQuickFixes(d); await printChairmanGatedQfs(); }, // QF-20260525-836 + SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001
    qf:            async () => { printQuickFixes(d); await printChairmanGatedQfs(); }, // QF-20260525-836 (alias)
    revival:       () => printRevivalPending(d),
    coordination:  () => printCoordination(d),
    coaching:      async () => await printCoaching(d),
    health:        () => printHealth(d),
    qa:            () => printQA(d),
    forecast:      async () => await printForecast(d),
    predictions:   async () => await printPredictions(d),
    drain:         () => printDrainAgents(d),
    strand:        async () => await printStrandAgeGauge(), // SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-2)
    inbox:         async () => {
      // SD-LEO-FIX-FLEET-WORKER-DIRECTIVE-001: the coordinator view is no longer the
      // unconditional default — a worker invoking the fallback gets ITS OWN inbox.
      const audience = await resolveInboxAudience();
      if (audience.mode === 'worker') {
        await printWorkerInbox(audience.sessionId);
        return;
      }
      if (audience.mode === 'unresolved') {
        console.log('  (cannot resolve caller session — set CLAUDE_SESSION_ID for your own inbox, or pass --coordinator for the coordinator view)');
        return;
      }
      // FR-1 (SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B): chairman directives surface FIRST —
      // bypasses the printInbox signal_type gate (chairman_directive carries no signal_type).
      await printChairmanDirectives();
      await printInbox();
      // FR-2/FR-4 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): sender-side receipts.
      await printUndeliveredOutbound();
      await printDeadLetters();
      // QF-20260621-174: surface the Adam advisory lane on the suppression-immune */2 inbox
      // loop too — the ~5min 'all' loop is collapsed by FLEET_DASH_SUPPRESS during quiet
      // periods, so action-required advisories could otherwise sit unsurfaced for long stretches.
      await printAdamInbox();
      // QF-20260704-742: third intake surface — SDs held with metadata.needs_coordinator_review.
      await printReviewHeldSds();
      // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: fourth intake surface — chairman-gated QF holds.
      await printChairmanGatedQfs();
    },
    adam:          async () => await printAdamInbox(), // SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B
    solomon:       async () => { await printSolomonInbox(); await printSolomonLedgerRollup(); }, // SD-LEO-INFRA-SOLOMON-CONSULT-001F + SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001
    context:       async () => await printWorkingContext(), // SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-3)
    feedback:      async () => await printFeedback(d), // SD-LEO-INFRA-COORDINATOR-DASHBOARD-SURFACES-001
    slagauge:      async () => await printFeedbackSlaGauge(), // QF-20260704-493
    draingauge:    async () => await printDrainGauge(), // SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-9)
    team:          () => printTeam(d), // SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B
    chairmanemail: async () => await printChairmanEmailChannelHealth(), // SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001
    periodic:      async () => await printPeriodicLiveness(), // SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 (FR-5)
    all:           async () => {
      // Team banner appears at top of /coordinator all when active teams exist (otherwise no-op)
      if (d.executeTeams && d.executeTeams.length > 0) printTeam(d);
      printWorkers(d);
      printDrainAgents(d);
      printOrchestrator(d);
      printAvailable(d);
      printQuickFixes(d); // QF-20260525-836
      await printStrandAgeGauge(); // SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-2)
      printRevivalPending(d); // SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001
      printCoordination(d);
      await printChairmanDirectives(); // SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1 — chairman-directive compliance FIRST (bypasses the printInbox signal_type gate)
      await printInbox(); // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a
      await printUndeliveredOutbound(); // FR-2 SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001
      await printDeadLetters(); // FR-4 SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001
      await printRelayDropGauge(); // FR-3 SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001
      await printChairmanEmailChannelHealth(); // SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001
      await printFeedbackSlaGauge(); // SD-LEO-FIX-FEEDBACK-CONSUMPTION-SLA-001 (escalated from QF-20260704-493) — feedback-consumption SLA gauge
      await printDrainGauge(); // SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-9) — harness-backlog drain gauge
      await printAdamInbox(); // SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-B — Adam advisory lane
      await printReviewHeldSds(); // QF-20260704-742 — third intake surface: needs_coordinator_review holds
      await printChairmanGatedQfs(); // SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001 — auditable gated-QF holds
      await printSolomonInbox(); // SD-LEO-INFRA-SOLOMON-CONSULT-001F — Solomon oracle consult lane (dormant until SOLOMON_CONSULT_V1)
      await printSolomonLedgerRollup(); // SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-5) — accuracy + cost-per-accepted rollup
      await printWorkingContext(); // SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-3) — standing context dual-render
      await printFeedback(d); // SD-LEO-INFRA-COORDINATOR-DASHBOARD-SURFACES-001 — feedback work-store
      await printCoaching(d);
      printHealth(d);
      await printPeriodicLiveness(); // SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 (FR-5)
      printQA(d);
      await printForecast(d);
      await printPredictions(d);
    }
  };

  const fn = sections[section];
  if (!fn) {
    console.log('Usage: node scripts/fleet-dashboard.cjs [section]');
    console.log('Sections: workers, orchestrator, available, quickfixes, coordination, coaching, health, periodic, qa, forecast, predictions, inbox, adam, solomon, context, feedback, slagauge, draingauge, team, all');
    process.exit(1);
  }

  await fn();

  // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp the process_key matching
  // whichever mode actually ran -- 'all' backs standard_loop:dashboard, 'inbox' backs
  // standard_loop:inbox; other sections (workers, health, etc.) are not registered
  // periodic processes, so no-op there.
  if (section === 'all' || section === 'inbox') {
    try {
      const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
      await stampLastFired(supabase, section === 'all' ? 'standard_loop:dashboard' : 'standard_loop:inbox');
    } catch (err) {
      console.error(`[fleet-dashboard] stampLastFired failed (non-fatal): ${err.message}`);
    }
  }

  if (suppressEnabled) {
    console.log = origLog;
    const out = buf.join('\n');
    const hash = crypto.createHash('sha1').update(normalizeRender(out)).digest('hex');
    const st = loadDashState();
    if (st.hash === hash) st.count++; else { st.hash = hash; st.count = 1; }
    saveDashState(st);
    if (st.count > SUPPRESS_AFTER) {
      const tick = (out.match(/(\d+)s ago/) || [])[1] || '?';
      console.log(`(fleet steady-state — ${st.count} identical renders, last activity ~${tick}s ago. Force render: FLEET_DASH_SUPPRESS=false)`);
    } else {
      process.stdout.write(out + '\n');
    }
  }
}

// Export read-only renderers for unit testing (SD-LEO-INFRA-COORDINATOR-DASHBOARD-SURFACES-001).
module.exports = { printFeedback, reconcilePAliveWithLiveness, computeSolomonLedgerRollup, printWorkers, printChairmanEmailChannelHealth, printAvailable, printWorkerInbox, resolveInboxAudience };

// Only run the CLI when invoked directly, so requiring this module in a test does
// not execute main() against the live database.
if (require.main === module) {
  main().catch(err => {
    console.error('DASHBOARD ERROR:', err.message);
    process.exit(1);
  });
}
