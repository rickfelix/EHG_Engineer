#!/usr/bin/env node
'use strict';
/**
 * Coordinator cold-recovery routine — SD-LEO-INFRA-BOOTSTRAPPABLE-SURVIVOR-AGNOSTIC-001
 *
 * A fresh coordinator with ZERO surviving sessions reconstructs in-flight fleet state +
 * identity PURELY FROM THE DB, with no reliance on a session holding in-conversation context:
 *
 *   1. enumerate in-flight SDs (status active/in_progress, excluding completed) + their claims
 *   2. detect ORPHANED claims (claiming_session_id whose claude_sessions heartbeat is dead/absent/stale)
 *   3. release the orphaned claim + re-dispatch to RESUME (not restart) — current_phase/progress preserved
 *   4. re-establish coordinator identity from the DB (resolve.cjs election; survivor-agnostic)
 *
 * Idempotent (re-runs cause no duplicate resume dispatches) and fail-open (one SD's error does
 * not abort the sweep). Thin glue over confirmed-existing primitives — see lib/coordinator/dispatch.cjs,
 * lib/coordinator/resolve.cjs, the stale-claim sweep (cleanup_stale_sessions), and sd-next enumeration.
 *
 * CLI:  node scripts/coordinator-cold-recovery.cjs [--execute] [--ttl-min=15]
 *       (dry-run by default: enumerate/detect/identity only; --execute releases + re-dispatches)
 */

const DEFAULT_TTL_MINUTES = 15;
const RESUME_DISPATCH_WINDOW_MS = 10 * 60 * 1000; // idempotency window for resume re-dispatch
const IN_FLIGHT_STATUSES = ['active', 'in_progress'];
const DEAD_SESSION_STATUSES = ['released', 'stale', 'dead', 'terminated'];

/**
 * Pure: is the claiming session dead/absent/stale (i.e. the claim is orphaned)?
 * Orphaned when there is no session row, no heartbeat, the heartbeat is older than the TTL,
 * or the session is explicitly in a terminal status.
 */
function isSessionStale(sessionRow, nowMs, ttlMs) {
  if (!sessionRow) return true;
  if (sessionRow.status && DEAD_SESSION_STATUSES.includes(sessionRow.status)) return true;
  const hb = sessionRow.heartbeat_at ? new Date(sessionRow.heartbeat_at).getTime() : null;
  if (!hb || Number.isNaN(hb)) return true;
  return (nowMs - hb) > ttlMs;
}

/** Enumerate in-flight, claimed SDs purely from the DB (completed excluded). */
async function enumerateInFlight(supabase) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase, claiming_session_id, parent_sd_id, sd_type, progress_percentage')
    .in('status', IN_FLIGHT_STATUSES)
    .not('claiming_session_id', 'is', null);
  if (error) throw new Error(`enumerateInFlight failed: ${error.message}`);
  // Defensive: never re-dispatch a completed-but-unreleased claim.
  return (data || []).filter((sd) => sd.claiming_session_id && sd.status !== 'completed');
}

/** Classify which in-flight claims are orphaned (claiming session dead/absent/stale). */
async function detectOrphans(supabase, inflight, { nowMs, ttlMs }) {
  const orphans = [];
  for (const sd of inflight) {
    let sessionRow = null;
    try {
      const { data } = await supabase
        .from('claude_sessions')
        .select('session_id, heartbeat_at, status')
        .eq('session_id', sd.claiming_session_id)
        .maybeSingle();
      sessionRow = data || null;
    } catch (_) {
      sessionRow = null; // unreadable session => treat as orphaned (fail-open toward recovery)
    }
    if (isSessionStale(sessionRow, nowMs, ttlMs)) orphans.push(sd);
  }
  return orphans;
}

/** Idempotency guard: has this SD already been re-dispatched to resume within the window? */
async function alreadyRedispatched(supabase, sdKey, { nowMs }) {
  const sinceIso = new Date(nowMs - RESUME_DISPATCH_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('session_coordination')
    .select('id, created_at, payload, target_sd')
    .eq('target_sd', sdKey)
    .gte('created_at', sinceIso)
    .limit(20);
  return (data || []).some((r) => r && r.target_sd === sdKey && r.payload && r.payload.kind === 'resume');
}

/** Release an orphaned claim. PRESERVES current_phase + progress (resume, not restart). */
async function releaseClaim(supabase, sd) {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, is_working_on: false })
    .eq('id', sd.id);
  if (error) throw new Error(`releaseClaim failed for ${sd.sd_key}: ${error.message}`);
}

/** Broadcast a RESUME re-dispatch (no live worker to target on a cold start → sentinel). */
async function redispatchResume(supabase, sd, { coordinatorId, dispatch }) {
  const row = {
    target_session: 'broadcast',
    target_sd: sd.sd_key,
    sender_session: coordinatorId || 'cold-recovery',
    sender_type: 'orchestrator',
    message_type: 'WORK_ASSIGNMENT',
    subject: `Resume orphaned in-flight SD ${sd.sd_key}`,
    payload: {
      kind: 'resume',
      sd_key: sd.sd_key,
      current_phase: sd.current_phase,
      reason: 'cold-recovery: orphaned claim released; resume (not restart) — DB phase/progress preserved',
    },
  };
  await dispatch(supabase, row, { logger: console });
}

/**
 * Run the survivor-agnostic cold-recovery routine.
 * Dependencies are injectable so the routine is unit-testable network-free.
 * @returns {Promise<object>} structured recovery report
 */
async function coldRecover(opts = {}) {
  const {
    supabase,
    dispatch = require('../lib/coordinator/dispatch.cjs').insertCoordinationRow,
    resolveCoordinator = require('../lib/coordinator/resolve.cjs').getActiveCoordinatorId,
    ttlMinutes = DEFAULT_TTL_MINUTES,
    dryRun = true,
    nowMs = Date.now(),
  } = opts;
  if (!supabase) throw new Error('coldRecover requires a supabase client');
  const ttlMs = ttlMinutes * 60 * 1000;
  const report = {
    dryRun, ttlMinutes,
    reconstructed: 0, orphaned: [], released: [], redispatched: [], idempotentSkips: [],
    coordinator: null, errors: [],
  };

  // 1. Reconstruct in-flight state purely from the DB.
  const inflight = await enumerateInFlight(supabase);
  report.reconstructed = inflight.length;

  // 2. Detect orphaned claims.
  const orphans = await detectOrphans(supabase, inflight, { nowMs, ttlMs });
  report.orphaned = orphans.map((o) => o.sd_key);

  // 4. Re-establish identity from the DB (independent of orphans; fail-open).
  try {
    report.coordinator = await resolveCoordinator(supabase);
  } catch (e) {
    report.errors.push(`identity: ${e.message}`);
  }

  // 3. Release + re-dispatch each orphan to RESUME (fail-open per SD; idempotent).
  for (const sd of orphans) {
    try {
      if (await alreadyRedispatched(supabase, sd.sd_key, { nowMs })) {
        report.idempotentSkips.push(sd.sd_key);
        continue;
      }
      if (!dryRun) {
        await releaseClaim(supabase, sd);
        await redispatchResume(supabase, sd, { coordinatorId: report.coordinator, dispatch });
      }
      report.released.push(sd.sd_key);
      report.redispatched.push(sd.sd_key);
    } catch (e) {
      report.errors.push(`${sd.sd_key}: ${e.message}`);
    }
  }
  return report;
}

module.exports = {
  coldRecover,
  enumerateInFlight,
  detectOrphans,
  isSessionStale,
  alreadyRedispatched,
  releaseClaim,
  redispatchResume,
  DEFAULT_TTL_MINUTES,
  RESUME_DISPATCH_WINDOW_MS,
  IN_FLIGHT_STATUSES,
  DEAD_SESSION_STATUSES,
};

// CLI entry — survivor-agnostic, fail-open, dry-run by default.
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--execute');
    const ttlArg = args.find((a) => a.startsWith('--ttl-min='));
    const ttlMinutes = ttlArg ? Number(ttlArg.split('=')[1]) : DEFAULT_TTL_MINUTES;
    const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient();
    const report = await coldRecover({ supabase, dryRun, ttlMinutes });
    console.log(JSON.stringify(report, null, 2));
    if (dryRun) {
      console.log('\n(dry-run — no claims released. Re-run with --execute to release + re-dispatch orphans to resume.)');
    }
  })().catch((e) => {
    console.error('[cold-recovery] FATAL', e && e.message ? e.message : e);
    process.exit(1);
  });
}
