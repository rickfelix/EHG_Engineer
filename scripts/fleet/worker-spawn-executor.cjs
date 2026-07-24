#!/usr/bin/env node
// SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 (FR-2/FR-3): the missing spawn-execution
// consumer for worker_spawn_requests. coordinator-revive.cjs WRITES revival requests but
// nothing CONSUMED them, so worker revival was inert (fulfilled_at stayed NULL) — a
// usage-limit outage that killed a worker's re-arming /loop turn left it dead with no
// external restart.
//
// SAFETY — STAGED / INERT BY DEFAULT:
//   The live deliverable spawns OS processes (fresh background claude CC workers), which is
//   high blast radius (duplicate/runaway sessions burn the shared usage quota). So the real
//   spawn is DEFAULT-OFF behind WORKER_SPAWN_EXECUTOR_LIVE. With the flag unset this daemon is
//   a DRY-RUN: it reads pending requests, logs the spawn command it WOULD run, and launches
//   NOTHING — leaving rows pending so the INERT_WORKER detector keeps surfacing them.
//
//   ⚠️ OPERATOR GATE (Stage 2, do NOT enable autonomously): before setting
//   WORKER_SPAWN_EXECUTOR_LIVE=true, an operator must HOST-VALIDATE buildSpawnInvocation()
//   below (the exact `claude` background-launch command for this host) AND register the
//   external scheduler (Windows Task / cron) that runs this daemon on a wall-clock cadence.
//   Those two steps are the keystone's activation and are intentionally out of scope here.

const { resolveSpawnDecisions } = require('../../lib/fleet/spawn-executor-core.cjs');

const PER_TICK_CAP_DEFAULT = 2;

/** Resolve the per-tick spawn cap from env (bounded, safe default). */
function resolvePerTickCap(env = process.env) {
  const n = parseInt(env.WORKER_SPAWN_EXECUTOR_PER_TICK_CAP, 10);
  return Number.isFinite(n) && n >= 0 ? n : PER_TICK_CAP_DEFAULT;
}

/** True only when the operator has explicitly enabled the live OS spawn. */
function isLiveEnabled(env = process.env) {
  return String(env.WORKER_SPAWN_EXECUTOR_LIVE || '').toLowerCase() === 'true';
}

/**
 * Build the host command that WOULD launch a fresh background claude CC worker seeded with
 * the fleet-worker /loop prompt. Returns a structured command; NEVER executes it here.
 * ⚠️ The exact program/args are HOST-SPECIFIC and must be operator-validated before the live
 * flag is flipped. This default is a best-effort, documented starting point only.
 */
// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-2): delegate to THE canonical buildSessionLaunch so worker
// revival uses the SAME launch contract as every other path — a PERSISTENT wt.exe session (NOT the
// old headless `claude -p`, which does not reliably register/persist in claude_sessions) with the full
// claude.cmd path + explicit repo-root cwd + fail-loud. The /loop startup prompt is carried in the
// child env (FLEET_WORKER_STARTUP_PROMPT) for the SessionStart hook to seed into the persistent session.
const { buildSessionLaunch } = require('../../lib/fleet/build-session-launch.cjs');
function buildSpawnInvocation(callsign, prompt) {
  return buildSessionLaunch({ callsign, startupPrompt: prompt });
}

/**
 * PURE-ish orchestration of one executor tick. All I/O is injected so this is unit-testable
 * with zero blast radius. Decides what to spawn (resolveSpawnDecisions), then either logs the
 * dry-run decision (live=false) or invokes the injected spawner + stamps fulfillment (live=true).
 *
 * @param {object} o
 * @param {Array} o.pendingRequests
 * @param {Set<string>} o.liveCallsigns
 * @param {number} o.nowMs
 * @param {number} o.perTickCap
 * @param {boolean} o.live
 * @param {(invocation:object, request:object)=>Promise<void>} o.spawner  invoked only when live
 * @param {(request:object)=>Promise<void>} o.stampFulfilled              invoked only after a live spawn succeeds
 * @param {string} o.prompt
 * @param {(msg:string)=>void} [o.log]
 * @returns {Promise<{dryRun:boolean, spawned:number, errors:number, skipped:number, decisions:object}>}
 */
async function runExecutor(o) {
  const log = o.log || (() => {});
  const decisions = resolveSpawnDecisions({
    pendingRequests: o.pendingRequests,
    liveCallsigns: o.liveCallsigns,
    nowMs: o.nowMs,
    perTickCap: o.perTickCap,
  });

  for (const s of decisions.skipped) {
    log(`[spawn-exec] skip ${s.request && s.request.requested_callsign} (${s.request && s.request.id}): ${s.reason}`);
  }

  let spawned = 0;
  let errors = 0;
  for (const req of decisions.toSpawn) {
    const invocation = buildSpawnInvocation(req.requested_callsign, o.prompt);
    if (!o.live) {
      log(`[spawn-exec] DRY-RUN would spawn ${req.requested_callsign} (${req.id}): ${invocation.program} ${(invocation.args || []).join(' ').slice(0, 40)}… — row left pending (set WORKER_SPAWN_EXECUTOR_LIVE=true after host-validation to enable)`);
      continue;
    }
    try {
      await o.spawner(invocation, req);
      await o.stampFulfilled(req);
      spawned++;
      log(`[spawn-exec] spawned + fulfilled ${req.requested_callsign} (${req.id})`);
    } catch (e) {
      errors++;
      log(`[spawn-exec] spawn FAILED for ${req.requested_callsign} (${req.id}): ${e && e.message} — row left pending`);
    }
  }

  return { dryRun: !o.live, spawned, errors, skipped: decisions.skipped.length, decisions };
}

// ── I/O helpers (best-effort; not unit-tested — the decision/spawn logic above is) ──

/** Pending, non-expired spawn requests, oldest first. */
async function loadPendingRequests(sb, nowIso) {
  const { data, error } = await sb
    .from('worker_spawn_requests')
    .select('id, requested_callsign, status, requested_at, expires_at, payload')
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('requested_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Callsigns already backed by a live session (from claude_sessions.metadata.fleet_identity.callsign). */
async function deriveLiveCallsigns(sb) {
  const { liveActiveSessionsView } = require('../../lib/fleet/live-fleet-sessions.cjs');
  const set = new Set();
  try {
    // ROWCAP-CANONICAL-001: bounded via the canonical view helper (freshest-first + .limit) so the
    // 1000-row cap can't hide live callsigns. The helper throws on error -> caught below (fail-soft).
    const data = await liveActiveSessionsView(sb, { columns: 'session_id, metadata, computed_status' });
    for (const s of data || []) {
      const cs = s && s.metadata && s.metadata.fleet_identity && s.metadata.fleet_identity.callsign;
      if (cs && s.computed_status === 'active') set.add(cs);
    }
  } catch { /* fail-soft: empty set (dry-run logs all; live is still bounded by cap + operator gate) */ }
  return set;
}

async function main() {
  const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
  const { FLEET_WORKER_STARTUP_PROMPT } = require('../../lib/coordinator/coordination-events.cjs');
  const { spawn } = require('child_process');
  const sb = createSupabaseServiceClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const [pendingRequests, liveCallsigns] = await Promise.all([
    loadPendingRequests(sb, nowIso),
    deriveLiveCallsigns(sb),
  ]);

  const live = isLiveEnabled();
  const result = await runExecutor({
    pendingRequests,
    liveCallsigns,
    nowMs,
    perTickCap: resolvePerTickCap(),
    live,
    prompt: FLEET_WORKER_STARTUP_PROMPT,
    log: (m) => console.log(m),
    // Real spawn — only ever reached when live=true (operator-gated).
    spawner: (invocation) => new Promise((resolve, reject) => {
      try {
        const child = spawn(invocation.program, invocation.args, {
          detached: true,
          stdio: 'ignore',
          // FR-2: start at the invocation's repo-root cwd (paired with new-tab -d) so the revived session registers in claude_sessions.
          cwd: invocation.cwd,
          env: { ...process.env, ...(invocation.env || {}) },
        });
        child.on('error', reject);
        child.unref();
        resolve();
      } catch (e) { reject(e); }
    }),
    stampFulfilled: async (req) => {
      await sb.from('worker_spawn_requests')
        .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by_session_id: process.env.CLAUDE_SESSION_ID || 'spawn-executor' })
        .eq('id', req.id);
    },
  });

  console.log(`[spawn-exec] tick done: dryRun=${result.dryRun} spawned=${result.spawned} errors=${result.errors} skipped=${result.skipped} pending=${pendingRequests.length}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[spawn-exec] fatal:', e && e.message); process.exit(1); });
}

module.exports = { runExecutor, buildSpawnInvocation, resolvePerTickCap, isLiveEnabled, loadPendingRequests, deriveLiveCallsigns };
