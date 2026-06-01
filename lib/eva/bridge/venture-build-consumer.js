#!/usr/bin/env node
/**
 * venture-build-consumer — the CONSUMER half of the leo_bridge automatic venture-build pipeline.
 *
 * SD: SD-LEO-INFRA-AUTO-EXECUTE-LEO-002 (follow-on to the detector SD-LEO-INFRA-AUTO-EXECUTE-LEO-001).
 *
 * The detector (scripts/cron/leo-build-starter.mjs) signals a leo_bridge venture parked at Stage 19
 * with a generated-but-unstarted SD tree (orchestrator metadata.build_ready_at). NOTHING consumes
 * that signal today. This module is the OUTER TREE-WALKER that drives the venture's NESTED SD tree
 * to completion: it repeatedly selects the next workable LEAF and drives it through its full LEO
 * cycle to LEAD-FINAL-APPROVAL (via an injected driveLeaf — the live session spawns the
 * orchestrator-child-agent teammate), until no draft/active descendant remains. Parent
 * orchestrators auto-complete by bubble-up. It is bounded (start budget, wall-clock, per-leaf
 * attempt cap) and fail-closed (a stuck/failing leaf or a bound STOPS the walk and leaves the
 * venture in a safe Stage-19 HOLD).
 *
 * The pure introspection + bounded loop live here (headlessly testable); the per-leaf BUILD needs a
 * live Claude session (Task/TeamCreate via orchestrator-child-agent), so the production driver is
 * the .claude/commands/leo-build-venture skill, which hosts driveLeaf. The CLI here supports only
 * --dry-run introspection (it will NOT drive headlessly).
 *
 * NEVER-ADVANCE invariant (RCA a14ff998 — the S19 gate-bypass incident). This module:
 *   - NEVER advances the venture, adds an advance path, or writes the venture lifecycle stage column
 *   - NEVER creates or approves a governance decision, sets the vision-approved flag, or approves a vision
 *   - drives child SDs only; the existing stage-execution-worker advances Stage 19 to Stage 20 itself,
 *     via its existing exit-gated path, once every child reaches a terminal status.
 * The only venture write is the OPTIONAL orchestrator_state='idle' accelerator nudge (conditional on
 * a currently-blocked state, a no-op while the build is incomplete) which merely hands control back
 * to the authoritative worker a poll cycle sooner. An executable static-source guardrail test
 * enforces this invariant. Exit codes: 0 healthy / 1 operational issue / 2 fatal misconfiguration.
 *
 * Usage:
 *   node lib/eva/bridge/venture-build-consumer.js --venture-id <uuid> --dry-run   # introspect, ZERO writes
 *   (a real build is session-hosted: invoke the /leo-build-venture skill in a live Claude session)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

export const S19 = 19;
export const NON_TERMINAL = ['draft', 'active'];
export const TERMINAL = ['completed', 'cancelled', 'archived'];
const VENTURE_DEAD = ['killed', 'retired', 'cancelled', 'archived'];

export const DEFAULT_BOUNDS = Object.freeze({
  maxLeaves: 60,                     // per-venture start budget: max leaf drives per consume run
  wallClockMs: 6 * 60 * 60 * 1000,   // 6h wall-clock cap
  maxAttemptsPerLeaf: 2,             // per-leaf attempt cap (DISTINCT from the inner 50-iter children cap)
});

export function parseArgs(argv) {
  const args = { ventureId: null, dryRun: false, finalize: false, once: false, help: false, bounds: { ...DEFAULT_BOUNDS } };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--venture-id' && argv[i + 1]) args.ventureId = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--finalize') args.finalize = true;
    else if (a === '--once') args.once = true;
    else if (a === '--max-leaves' && argv[i + 1]) args.bounds.maxLeaves = Number(argv[++i]);
    else if (a === '--wall-clock-ms' && argv[i + 1]) args.bounds.wallClockMs = Number(argv[++i]);
    else if (a === '--max-attempts-per-leaf' && argv[i + 1]) args.bounds.maxAttemptsPerLeaf = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

function buildPgClient() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) return null; // graceful — fall back to the build_consumed_at marker for idempotency
  return new pg.Client({ connectionString: conn });
}

export async function tryAdvisoryLock(client, name) {
  if (!client) return { acquired: true, mock: true }; // no client → marker carries idempotency
  const k = await client.query('SELECT hashtext($1)::int AS k', [name]);
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [k.rows[0].k]);
  return { acquired: r.rows[0].acquired === true, key: k.rows[0].k, mock: false };
}

async function releaseAdvisoryLock(client, key) {
  if (!client || key == null) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [key]); } catch {}
}

/**
 * Read-only venture eligibility — mirrors the detector / the existing S19 gate's preconditions.
 * Never mutates. Returns { eligible, reason }.
 */
export async function ventureEligibility(supabase, ventureId) {
  const { data: v } = await supabase
    .from('ventures')
    .select('id, build_model, status, current_lifecycle_stage, deleted_at')
    .eq('id', ventureId)
    .maybeSingle();
  if (!v) return { eligible: false, reason: 'venture_not_found' };
  if (v.deleted_at) return { eligible: false, reason: 'tombstoned' };
  if (v.build_model !== 'leo_bridge') return { eligible: false, reason: `not_leo_bridge(${v.build_model})` };
  if (VENTURE_DEAD.includes(v.status)) return { eligible: false, reason: `venture_${v.status}` };
  if (v.current_lifecycle_stage !== S19) return { eligible: false, reason: `not_at_s19(${v.current_lifecycle_stage})` };
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('vision_key')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'active')
    .eq('chairman_approved', true)
    .limit(1)
    .maybeSingle();
  if (!vision) return { eligible: false, reason: 'no_approved_l2_vision' };
  return { eligible: true, reason: 'ok' };
}

/** The TOP orchestrator (parent_sd_id IS NULL) for the venture. Read-only. */
export async function findTopOrchestrator(supabase, ventureId) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata')
    .eq('venture_id', ventureId)
    .eq('sd_type', 'orchestrator')
    .is('parent_sd_id', null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Recursive plain-SELECT walk of all descendants under the top orchestrator (BFS by parent_sd_id).
 * Plain reads only — NEVER getNextReadyChild (whose stale-claim auto-release mutates state).
 */
export async function fetchDescendants(supabase, topId) {
  const all = [];
  const seen = new Set();
  let frontier = [topId];
  while (frontier.length) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, sd_type, parent_sd_id, sequence_rank')
      .in('parent_sd_id', frontier);
    const next = [];
    for (const k of (data || [])) {
      if (seen.has(k.id)) continue;
      seen.add(k.id); all.push(k); next.push(k.id);
    }
    frontier = next;
  }
  return all;
}

/** True when no descendant is still draft/active (aligns with the worker's terminal-tolerance). */
export function isTreeComplete(descendants) {
  return !descendants.some((d) => NON_TERMINAL.includes(d.status));
}

/**
 * The workable LEAVES to drive, deepest-first then by sequence_rank: a non-terminal, non-orchestrator
 * SD with NO non-terminal descendant of its own. Child-orchestrators are excluded (they bubble-complete
 * via checkAndCompleteParent once their grandchildren finish — they are never driven directly).
 */
export function computeWorkableLeaves(descendants) {
  const byId = new Map(descendants.map((d) => [d.id, d]));
  const byParent = new Map();
  for (const d of descendants) {
    if (!byParent.has(d.parent_sd_id)) byParent.set(d.parent_sd_id, []);
    byParent.get(d.parent_sd_id).push(d);
  }
  const hasNonTerminalDescendant = (id) => {
    for (const k of (byParent.get(id) || [])) {
      if (NON_TERMINAL.includes(k.status)) return true;
      if (hasNonTerminalDescendant(k.id)) return true;
    }
    return false;
  };
  const depthOf = (d) => {
    let n = 0, cur = d;
    while (cur && cur.parent_sd_id && byId.has(cur.parent_sd_id)) { n++; cur = byId.get(cur.parent_sd_id); }
    return n;
  };
  const leaves = descendants.filter((d) =>
    NON_TERMINAL.includes(d.status) &&
    d.sd_type !== 'orchestrator' &&
    !hasNonTerminalDescendant(d.id),
  );
  leaves.sort((a, b) => depthOf(b) - depthOf(a) || (a.sequence_rank ?? 0) - (b.sequence_rank ?? 0));
  return leaves;
}

/** Emit one observability row to system_events (payload column — there is no event_data column). */
export async function emitEvent(supabase, eventType, payload, { ventureId, sdId, dryRun, logger = console } = {}) {
  if (dryRun) { logger.log?.(`[venture-build-consumer] DRY: would emit ${eventType} ${JSON.stringify(payload)}`); return { emitted: false, dryRun: true }; }
  const { error } = await supabase.from('system_events').insert({ event_type: eventType, payload, venture_id: ventureId, sd_id: sdId });
  if (error) logger.warn?.(`[venture-build-consumer] system_events insert failed: ${error.message}`);
  return { emitted: !error };
}

/** Mark the tree consumed (idempotency marker) — only after the tree is fully terminal. */
export async function markConsumed(supabase, topId, { dryRun = false } = {}) {
  if (dryRun) return { marked: false, dryRun: true };
  const { data: fresh } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', topId).maybeSingle();
  const newMeta = { ...(fresh?.metadata || {}), build_consumed_at: new Date().toISOString(), build_consumed_by: 'venture-build-consumer' };
  const { error } = await supabase.from('strategic_directives_v2').update({ metadata: newMeta }).eq('id', topId);
  if (error) throw new Error(`build_consumed_at update failed: ${error.message}`);
  return { marked: true };
}

/**
 * OPTIONAL accelerator: conditionally flip orchestrator_state blocked->idle so the authoritative
 * worker re-polls and advances a poll cycle sooner. Conditional + count-checked: a no-op unless the
 * venture is currently blocked. This is NOT a stage write and NOT an advance — the worker still
 * re-applies the real S19 gate before advancing. Call ONLY after the tree is complete.
 */
export async function maybeIdleNudge(supabase, ventureId, { dryRun = false } = {}) {
  if (dryRun) return { nudged: false, dryRun: true };
  const { data, error } = await supabase
    .from('ventures')
    .update({ orchestrator_state: 'idle' })
    .eq('id', ventureId)
    .eq('orchestrator_state', 'blocked')
    .select('id');
  if (error) return { nudged: false, error: error.message };
  return { nudged: (data || []).length > 0 };
}

/**
 * The bounded, fail-closed OUTER TREE-WALKER. driveLeaf(leaf, ctx) => { completed: boolean } is
 * injected: the live-session skill spawns an orchestrator-child-agent teammate to take the leaf SD
 * through its full LEO cycle to LEAD-FINAL-APPROVAL; unit tests inject a mock. The consumer NEVER
 * advances the venture — the existing worker does that once the tree completes.
 */
export async function runConsume({ supabase, ventureId, driveLeaf, bounds = DEFAULT_BOUNDS, dryRun = false, logger = console, now = () => Date.now() }) {
  const result = { ventureId, drivenLeaves: [], completed: false, held: false, skipped: false, reason: null, dryRun };

  const elig = await ventureEligibility(supabase, ventureId);
  if (!elig.eligible) {
    result.skipped = true; result.reason = elig.reason;
    await emitEvent(supabase, 'LEO_BUILD_SKIPPED', { reason: elig.reason }, { ventureId, dryRun, logger });
    return result;
  }
  const top = await findTopOrchestrator(supabase, ventureId);
  if (!top) { result.skipped = true; result.reason = 'no_top_orchestrator'; return result; }
  if (top.metadata?.build_consumed_at) {
    result.skipped = true; result.reason = 'already_consumed';
    return result;
  }

  const start = now();
  const attemptsByLeaf = new Map();
  let leavesDriven = 0;

  while (true) {
    if (now() - start > bounds.wallClockMs) { result.held = true; result.reason = 'wall_clock_exceeded'; break; }
    if (leavesDriven >= bounds.maxLeaves) { result.held = true; result.reason = 'start_budget_exceeded'; break; }

    const descendants = await fetchDescendants(supabase, top.id);
    if (isTreeComplete(descendants)) { result.completed = true; break; }

    const leaves = computeWorkableLeaves(descendants);
    if (!leaves.length) { result.held = true; result.reason = 'no_workable_leaf'; break; }

    const leaf = leaves[0];
    const prior = attemptsByLeaf.get(leaf.sd_key) || 0;
    if (prior >= bounds.maxAttemptsPerLeaf) { result.held = true; result.reason = `leaf_attempt_cap:${leaf.sd_key}`; break; }

    if (dryRun) {
      result.dryRun = true; result.nextLeaf = leaf.sd_key; result.workableLeafCount = leaves.length;
      await emitEvent(supabase, 'LEO_BUILD_DRYRUN', { next_leaf: leaf.sd_key, workable_leaves: leaves.length }, { ventureId, sdId: top.id, dryRun: true, logger });
      break;
    }

    attemptsByLeaf.set(leaf.sd_key, prior + 1);
    let driven = null;
    try { driven = await driveLeaf(leaf, { attempt: prior + 1, supabase, logger }); }
    catch (err) { logger.error?.(`[venture-build-consumer] driveLeaf threw for ${leaf.sd_key}: ${err.message}`); driven = { completed: false }; }
    leavesDriven++;

    const ok = !!(driven && driven.completed);
    result.drivenLeaves.push({ sd_key: leaf.sd_key, attempt: prior + 1, completed: ok });
    await emitEvent(supabase, ok ? 'LEO_BUILD_LEAF_DRIVEN' : 'LEO_BUILD_LEAF_ATTEMPT_FAILED', { leaf: leaf.sd_key, attempt: prior + 1 }, { ventureId, sdId: leaf.id, dryRun, logger });
    // On failure the outer loop re-selects the same leaf until its attempt cap, then fail-closed HOLD.
  }

  if (result.completed) {
    await markConsumed(supabase, top.id, { dryRun });
    const nudge = await maybeIdleNudge(supabase, ventureId, { dryRun });
    await emitEvent(supabase, 'LEO_BUILD_CONSUMED', { driven: result.drivenLeaves.length, idle_nudged: !!nudge.nudged }, { ventureId, sdId: top.id, dryRun, logger });
  } else if (result.held) {
    await emitEvent(supabase, 'LEO_BUILD_HELD', { reason: result.reason, driven: result.drivenLeaves.length }, { ventureId, sdId: top.id, dryRun, logger });
  }
  return result;
}

/**
 * FINALIZE (real writes, SAFE): only when the tree is genuinely complete, set the build_consumed_at
 * idempotency marker and optionally idle-nudge the worker. NEVER advances the venture. This is the
 * step the session-hosted skill runs after its drive loop reports the tree complete.
 */
export async function finalizeConsume({ supabase, ventureId, logger = console }) {
  const top = await findTopOrchestrator(supabase, ventureId);
  if (!top) return { complete: false, consumed: false, idleNudged: false, reason: 'no_top_orchestrator' };
  const descendants = await fetchDescendants(supabase, top.id);
  if (!isTreeComplete(descendants)) return { complete: false, consumed: false, idleNudged: false, reason: 'tree_incomplete' };
  await markConsumed(supabase, top.id, {});
  const nudge = await maybeIdleNudge(supabase, ventureId, {});
  await emitEvent(supabase, 'LEO_BUILD_CONSUMED', { finalize: true, idle_nudged: !!nudge.nudged }, { ventureId, sdId: top.id, logger });
  return { complete: true, consumed: true, idleNudged: !!nudge.nudged };
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('venture-build-consumer --venture-id <uuid> [--dry-run | --finalize]   (a real per-leaf build is session-hosted via the /leo-build-venture skill)');
    return { exitCode: 0 };
  }
  const logger = deps.logger || console;
  if (!args.ventureId) { logger.error?.('[venture-build-consumer] --venture-id is required'); return { exitCode: 2 }; }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[venture-build-consumer] fatal misconfiguration: ${err.message}`); return { exitCode: 2 }; }

  if (!args.dryRun && !args.finalize) {
    // A real per-leaf build requires a live Claude session (orchestrator-child-agent teammates).
    // The CLI refuses to "drive" headlessly — it only introspects (--dry-run) or finalizes (--finalize).
    logger.log?.('[venture-build-consumer] real driving is session-hosted: invoke the /leo-build-venture skill in a live Claude session. CLI supports --dry-run and --finalize only.');
    return { exitCode: 0, sessionHosted: true };
  }

  const pgClient = deps.pgClient !== undefined ? deps.pgClient : buildPgClient();
  if (pgClient) { try { await pgClient.connect(); } catch (err) { logger.warn?.(`[venture-build-consumer] pg connect failed (${err.message}); marker idempotency only`); } }

  let exitCode = 0;
  let result = {};
  let lock = null;
  try {
    lock = await tryAdvisoryLock(pgClient, `venture-build-consumer:${args.ventureId}`);
    if (!lock.acquired) { logger.log?.('[venture-build-consumer] lock held by concurrent run — skipping'); return { exitCode: 0, lockHeld: true }; }
    if (args.dryRun) {
      result = await runConsume({ supabase, ventureId: args.ventureId, driveLeaf: async () => ({ completed: false }), bounds: args.bounds, dryRun: true, logger });
      logger.log?.(`[venture-build-consumer] DRY RUN venture=${args.ventureId} nextLeaf=${result.nextLeaf || '(none)'} workableLeaves=${result.workableLeafCount || 0} skipped=${result.skipped || false} reason=${result.reason || '-'}`);
    } else {
      result = await finalizeConsume({ supabase, ventureId: args.ventureId, logger });
      logger.log?.(`[venture-build-consumer] FINALIZE venture=${args.ventureId} complete=${result.complete} consumed=${result.consumed} idleNudged=${result.idleNudged} reason=${result.reason || '-'}`);
    }
  } catch (err) {
    logger.error?.(`[venture-build-consumer] failed: ${err.message}`); exitCode = 1;
  } finally {
    if (lock && lock.acquired && !lock.mock) await releaseAdvisoryLock(pgClient, lock.key);
    if (pgClient) { try { await pgClient.end(); } catch {} }
  }
  return { exitCode, ...result };
}

const isMain = (() => {
  try {
    const here = new URL(import.meta.url).pathname;
    const argv = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
    return here.endsWith(argv) || argv.endsWith(here);
  } catch { return false; }
})();

if (isMain) {
  main().then(({ exitCode }) => process.exit(exitCode))
        .catch((err) => { console.error('venture-build-consumer fatal:', err.message); process.exit(2); });
}
