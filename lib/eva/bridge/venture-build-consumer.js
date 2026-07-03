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
// SD-LEO-INFRA-CONTEXT-AWARE-DEPENDENCY-001: reuse the ONE canonical dependency normalizer the
// sd:next queue + AUTO-PROCEED already use (shape-tolerant: bare "SD-…" strings + { sd_id } objects).
import { parseDependencies } from '../../../scripts/modules/sd-next/dependency-resolver.js';
// SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-3): fail-closed venture-stack compliance scan.
import { scanArtifactsForStackCompliance } from '../standards/venture-stack-compliance.js';
// SD-LEO-INFRA-WIRE-PRE-BUILD-002 (FR-1): per-leaf enrichment introspection (--enrich-leaf --dry-run).
import { introspectLeafEnrichment } from './panel-driver.js';
// SD-LEO-FIX-STAGE-BUILD-CONSOLIDATE-001: post-build test consolidation needs fs/git + the canonical
// DB-first venture repo-path resolver (never hand-rolled). All filesystem/git access is injectable so
// the consolidation helpers stay headlessly unit-testable, matching this module's existing test design.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, relative, resolve as resolvePath, sep } from 'path';
import { resolveRepoPathDbFirst, normalizeAppName, ENGINEER_ROOT } from '../../repo-paths.js';
// SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001 (Ship-witness C): OBSERVE-ONLY merge-witness at leaf
// completion (done=SHIPPED). Fully injectable; NEVER alters control flow or advances a stage.
import { observeLeafMergeWitness } from './venture-build-merge-witness.js';

export const S19 = 19;
export const NON_TERMINAL = ['draft', 'active'];
export const TERMINAL = ['completed', 'cancelled', 'archived'];
const VENTURE_DEAD = ['killed', 'retired', 'cancelled', 'archived'];

export const DEFAULT_BOUNDS = Object.freeze({
  maxLeaves: 60,                     // per-venture start budget: max leaf drives per consume run
  wallClockMs: 6 * 60 * 60 * 1000,   // 6h wall-clock cap
  maxAttemptsPerLeaf: 2,             // per-leaf attempt cap (DISTINCT from the inner 50-iter children cap)
});

/**
 * SD-LEO-INFRA-CONTEXT-AWARE-DEPENDENCY-001 FR-3: feature flag for dependency-ordered execution.
 * Default ON; only an explicit false/0/off/no disables it (then selection is byte-identical legacy
 * deepest-first/sequence_rank order, with NO dependencyContext — a clean instant rollback).
 */
export function isDependencyOrderedExecutionEnabled() {
  const v = process.env.DEPENDENCY_ORDERED_EXECUTION;
  if (v === undefined || v === '') return true;
  const s = String(v).toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'off' && s !== 'no';
}

/**
 * SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001: kill-switch for the observe-only leaf merge-witness.
 * Default ON; ONLY an explicit VENTURE_BUILD_MERGE_WITNESS=off disables it (instant rollback of a
 * purely additive, observe-only telemetry path — the walk is byte-identical either way).
 */
export function isVentureBuildMergeWitnessEnabled() {
  return String(process.env.VENTURE_BUILD_MERGE_WITNESS || '').toLowerCase() !== 'off';
}

export function parseArgs(argv) {
  const args = { ventureId: null, dryRun: false, finalize: false, once: false, checkStack: false, help: false, enrichLeaf: null, bounds: { ...DEFAULT_BOUNDS } };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--venture-id' && argv[i + 1]) args.ventureId = argv[++i];
    else if (a === '--enrich-leaf' && argv[i + 1]) args.enrichLeaf = argv[++i]; // SD-LEO-INFRA-WIRE-PRE-BUILD-002 FR-1
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--finalize') args.finalize = true;
    else if (a === '--once') args.once = true;
    else if (a === '--check-venture' && argv[i + 1]) { args.ventureId = argv[++i]; args.checkStack = true; }
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

/**
 * SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-3): READ-ONLY venture-stack compliance check. Fetches
 * the venture's is_current artifacts and scans them against the canonical policy (Clerk / Replit-native;
 * never Supabase / Replit Auth). Makes ZERO writes; never touches the lifecycle stage, a governance
 * decision, or a vision row — it only reads venture_artifacts. Fail-closed: zero artifacts -> unscannable.
 */
export async function checkVentureStackCompliance(supabase, ventureId) {
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, lifecycle_stage, content, artifact_data')
    .eq('venture_id', ventureId)
    .eq('is_current', true);
  if (error) {
    // A query error is NOT "no artifacts exist" — surface it as a diagnosable unscannable reason
    // (still fail-closed/hold) rather than a silent, misleading over-block.
    return { compliant: false, unscannable: true, reason: `query_error: ${error.message}`, violations: [], missing: [] };
  }
  return scanArtifactsForStackCompliance(artifacts || []);
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
      .select('id, sd_key, status, sd_type, parent_sd_id, sequence_rank, dependencies, title')
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
 * The LEGACY workable LEAVES, deepest-first then by sequence_rank: a non-terminal, non-orchestrator
 * SD with NO non-terminal descendant of its own. Child-orchestrators are excluded (they bubble-complete
 * via checkAndCompleteParent once their grandchildren finish — they are never driven directly).
 * This is the dependency-UNAWARE order; selectWorkableLeaves (FR-1) gates it on build-order deps.
 */
export function legacyWorkableLeaves(descendants) {
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

/**
 * Index descendants by BOTH sd_key and id so a dependency reference (parseDependencies yields
 * { sd_id } from a bare "SD-…" string or a { sd_id } object) resolves whether it was stored as a
 * business key or a UUID.
 */
function indexByKeyOrId(descendants) {
  const m = new Map();
  for (const d of descendants) { m.set(d.sd_key, d); m.set(d.id, d); }
  return m;
}

/**
 * FR-1: the in-tree build-order dependencies of `leaf` that are NOT yet terminal. Reuses the canonical
 * parseDependencies (bare "SD-…" strings + { sd_id } objects; ignores {sd_key}-only / {predecessor}-only
 * / free-text / blocks_phase, consistent with the queue). Dependency sd_ids ABSENT from the in-tree
 * descendant set are ignored (treated satisfied) — cross-tree/dangling refs never block. Terminal-
 * tolerance uses the consumer's TERMINAL set (completed OR cancelled OR archived), NOT the queue
 * resolver's completed-only checkDependenciesResolved: a legitimately cancelled sibling must not deadlock.
 */
function blockingDeps(leaf, byKeyOrId) {
  const blocking = [];
  for (const { sd_id } of parseDependencies(leaf.dependencies)) {
    const dep = byKeyOrId.get(sd_id);
    if (dep && !TERMINAL.includes(dep.status)) blocking.push(dep);
  }
  return blocking;
}

/**
 * FR-1: dependency-ordered leaf selection with a deadlock fail-safe. Flag OFF → byte-identical legacy
 * order. Flag ON → only dependency-clean leaves (all in-tree build-order deps terminal); if NO leaf is
 * clean but the legacy frontier is non-empty (an in-tree cycle, or every leaf blocked by a non-terminal
 * sibling), FALL BACK to the full legacy order and flag fellBack — the venture must never freeze at
 * Stage 19 with a false no_workable_leaf hold. Returns { leaves, fellBack }.
 */
export function selectWorkableLeaves(descendants) {
  const legacy = legacyWorkableLeaves(descendants);
  if (!isDependencyOrderedExecutionEnabled()) return { leaves: legacy, fellBack: false };
  const byKeyOrId = indexByKeyOrId(descendants);
  const clean = legacy.filter((leaf) => blockingDeps(leaf, byKeyOrId).length === 0);
  if (clean.length > 0) return { leaves: clean, fellBack: false };
  return { leaves: legacy, fellBack: legacy.length > 0 };
}

/**
 * Backward-compatible array accessor (dry-run, external callers, tests). The drive loop uses
 * selectWorkableLeaves directly so it can observe the fail-safe fallback for one-per-stall signalling.
 */
export function computeWorkableLeaves(descendants) {
  return selectWorkableLeaves(descendants).leaves;
}

/**
 * FR-2: the context handed to driveLeaf for `leaf` — its COMPLETED in-tree sibling dependencies
 * (sd_key + title; cancelled deps produced no artifact so are excluded) plus the non-SD manifest
 * entries parseDependencies discards (existing_module paths, shared primitives, technical prereqs)
 * which the build agent still wants for grounding. Returns { completed, context_entries }.
 */
export function buildDependencyContext(leaf, descendants) {
  const byKeyOrId = indexByKeyOrId(descendants);
  const completed = [];
  for (const { sd_id } of parseDependencies(leaf.dependencies)) {
    const dep = byKeyOrId.get(sd_id);
    if (dep && dep.status === 'completed') completed.push({ sd_key: dep.sd_key, title: dep.title });
  }
  return { completed, context_entries: nonSdDependencyEntries(leaf.dependencies) };
}

/** FR-2: raw `dependencies` entries that are NOT SD references (the rich manifest parseDependencies drops). */
function nonSdDependencyEntries(dependencies) {
  let arr = dependencies;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  const isSdRef = (d) => typeof d === 'string'
    ? /^SD-[A-Z0-9-]+/.test(d)
    : !!(d && d.sd_id && /^SD-[A-Z0-9-]+/.test(String(d.sd_id)));
  return arr.filter((d) => d && typeof d === 'object' && !isSdRef(d));
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
export async function runConsume({ supabase, ventureId, driveLeaf, bounds = DEFAULT_BOUNDS, dryRun = false, logger = console, now = () => Date.now(), witness = observeLeafMergeWitness }) {
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

  // SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-3): fail-closed venture-stack compliance HOLD.
  // READ-ONLY pre-loop gate — mirrors the ventureEligibility early-return shape. A venture whose
  // is_current artifacts positively specify a forbidden stack (Supabase / the Agent-only auth provider /
  // CLI-as-product) is HELD here (skipped) and NEVER advanced. This adds no advance path; it only
  // reads artifacts and returns, honoring the never-advance invariant.
  const stackVerdict = await checkVentureStackCompliance(supabase, ventureId);
  if (!stackVerdict.compliant) {
    result.skipped = true;
    result.reason = 'stack_noncompliant';
    result.stackCompliance = stackVerdict;
    await emitEvent(supabase, 'LEO_BUILD_SKIPPED',
      { reason: 'stack_noncompliant', stack_reason: stackVerdict.reason, violations: stackVerdict.violations, missing: stackVerdict.missing },
      { ventureId, sdId: top.id, dryRun, logger });
    return result;
  }

  const start = now();
  const attemptsByLeaf = new Map();
  let leavesDriven = 0;
  let fallbackSignalled = false; // FR-1: emit dependency_fallback ONCE per contiguous frontier-stall

  while (true) {
    if (now() - start > bounds.wallClockMs) { result.held = true; result.reason = 'wall_clock_exceeded'; break; }
    if (leavesDriven >= bounds.maxLeaves) { result.held = true; result.reason = 'start_budget_exceeded'; break; }

    const descendants = await fetchDescendants(supabase, top.id);
    if (isTreeComplete(descendants)) { result.completed = true; break; }

    const { leaves, fellBack } = selectWorkableLeaves(descendants);
    if (!leaves.length) { result.held = true; result.reason = 'no_workable_leaf'; break; }
    if (fellBack) {
      if (!fallbackSignalled) {
        fallbackSignalled = true;
        await emitEvent(supabase, 'dependency_fallback', { workable: leaves.length }, { ventureId, sdId: top.id, dryRun, logger });
      }
    } else {
      fallbackSignalled = false;
    }

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
    // FR-2: build each leaf WITH context from its completed dependencies (flag-gated; omitted when OFF).
    const dependencyContext = isDependencyOrderedExecutionEnabled() ? buildDependencyContext(leaf, descendants) : undefined;
    try { driven = await driveLeaf(leaf, { attempt: prior + 1, supabase, logger, dependencyContext }); }
    catch (err) { logger.error?.(`[venture-build-consumer] driveLeaf threw for ${leaf.sd_key}: ${err.message}`); driven = { completed: false }; }
    leavesDriven++;

    const ok = !!(driven && driven.completed);
    result.drivenLeaves.push({ sd_key: leaf.sd_key, attempt: prior + 1, completed: ok });
    await emitEvent(supabase, ok ? 'LEO_BUILD_LEAF_DRIVEN' : 'LEO_BUILD_LEAF_ATTEMPT_FAILED', { leaf: leaf.sd_key, attempt: prior + 1 }, { ventureId, sdId: leaf.id, dryRun, logger });
    // SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001: OBSERVE-ONLY merge-witness at the leaf completion point
    // (done=SHIPPED := PR merged). Records telemetry only; MUST NOT alter ok / drivenLeaves / loop
    // termination and NEVER advances a stage. Wrapped defensively so even a misbehaving witness can
    // never perturb the walk (the default witness is itself fail-soft and never throws).
    if (ok && !dryRun && isVentureBuildMergeWitnessEnabled()) {
      try { await witness({ supabase, leaf, ventureId, dryRun, logger }); }
      catch (e) { logger.error?.(`[venture-build-consumer] merge-witness threw (non-fatal, observe-only): ${e?.message || e}`); }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// SD-LEO-FIX-STAGE-BUILD-CONSOLIDATE-001 — post-build test consolidation.
// After the venture build tree is complete, the generated tests live scattered in the
// per-child-SD EXEC worktrees (created INSIDE the venture clone) and never reach the
// shipped venture app — so every venture arrives at Stage-20 with "no tests". These
// helpers gather those tests into the venture's canonical test dir, wire a runnable
// `test` script (package-manager aware, no clobber), and commit ONLY those paths to the
// venture main branch. fs/git are INJECTABLE so the logic is headlessly unit-testable.
// Consolidation is invoked from finalizeConsume inside a try/catch and is best-effort.
// ─────────────────────────────────────────────────────────────────────────────

const defaultFs = { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync };
const defaultGit = (args, { cwd } = {}) => execFileSync('git', args, { cwd, encoding: 'utf8' });

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const CONSOLIDATE_IGNORE_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', '.next', 'coverage', '.turbo']);

/**
 * TR-2: deterministic package-manager detection. Precedence:
 *   package.json `packageManager` field > bun lockfile > pnpm-lock.yaml > yarn.lock >
 *   package-lock.json > npm (default). fs is injectable for headless tests.
 */
export function detectPackageManager(repoPath, { fs = defaultFs } = {}) {
  try {
    const pkgPath = join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const field = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0].trim().toLowerCase() : '';
      if (['npm', 'bun', 'pnpm', 'yarn'].includes(field)) return field;
    }
  } catch { /* fall through to lockfile sniffing */ }
  if (fs.existsSync(join(repoPath, 'bun.lockb')) || fs.existsSync(join(repoPath, 'bun.lock'))) return 'bun';
  if (fs.existsSync(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(join(repoPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(join(repoPath, 'package-lock.json'))) return 'npm';
  return 'npm';
}

/**
 * Resolve the venture's main repo local path from its UUID, reusing the canonical DB-first
 * resolver (applications.local_path, registry.json fallback). Returns null — so the caller
 * safely no-ops — when the venture has no name, resolves to a platform repo, or the clone is
 * absent. NEVER returns the EHG_Engineer root (defense-in-depth: we must never commit venture
 * tests into THIS repo). Pure read; never throws.
 */
export async function resolveVentureRepoPath(supabase, ventureId, { fs = defaultFs } = {}) {
  try {
    const { data } = await supabase.from('ventures').select('name').eq('id', ventureId).maybeSingle();
    const name = data?.name;
    if (!name || typeof name !== 'string' || !name.trim()) return null;
    const needle = normalizeAppName(name);
    if (!needle || needle === 'ehgengineer' || needle === 'ehg') return null; // never a platform repo
    const repoPath = await resolveRepoPathDbFirst(name, supabase);
    if (!repoPath) return null;
    if (resolvePath(repoPath) === resolvePath(ENGINEER_ROOT)) return null;    // hard guard: never this repo
    if (!fs.existsSync(join(repoPath, '.git'))) return null;
    return repoPath;
  } catch { return null; }
}

/**
 * Enumerate the per-child EXEC worktrees registered in the venture clone (excluding the main
 * worktree itself) via `git worktree list --porcelain` — naming-convention agnostic. git is
 * injectable; best-effort (returns [] on any failure).
 */
export function enumerateChildWorktrees(ventureRepoPath, { git = defaultGit } = {}) {
  try {
    const out = git(['worktree', 'list', '--porcelain'], { cwd: ventureRepoPath }) || '';
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
    const mainNorm = norm(ventureRepoPath);
    const paths = [];
    for (const line of String(out).split('\n')) {
      if (line.startsWith('worktree ')) {
        const p = line.slice('worktree '.length).trim();
        if (p && norm(p) !== mainNorm) paths.push(p);
      }
    }
    return paths;
  } catch { return []; }
}

/** Recursively list test files under `root` using the injectable fs (Dirent-based — no real-FS assumption). */
function listTestFiles(root, fs) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries || []) {
      const name = ent.name;
      const full = join(dir, name);
      const isDir = typeof ent.isDirectory === 'function' && ent.isDirectory();
      if (isDir) { if (!CONSOLIDATE_IGNORE_DIRS.has(name)) stack.push(full); }
      else if (TEST_FILE_RE.test(name)) out.push(full);
    }
  }
  return out;
}

/**
 * FR-1..FR-3 / FR-5: consolidate generated tests from the child-SD worktrees into the venture's
 * canonical test dir, wire a runnable `test` script (pm-aware, no clobber), and commit ONLY those
 * paths to the venture main branch (path-scoped add; no empty commit). De-duplicated by repo-relative
 * test path; idempotent (skips files already present). fs/git are injectable. Returns a summary for
 * the LEO_BUILD_CONSUMED event. MAY throw on a git failure — finalizeConsume's try/catch is the net (TS-6).
 */
export async function consolidateGeneratedTests({ ventureRepoPath, childWorktreePaths, fs = defaultFs, git = defaultGit, logger = console }) {
  // canonical venture test dir: prefer an existing tests/ or test/, else default tests/
  const testDirName = fs.existsSync(join(ventureRepoPath, 'tests')) ? 'tests'
    : fs.existsSync(join(ventureRepoPath, 'test')) ? 'test'
      : 'tests';
  const ventureTestDir = join(ventureRepoPath, testDirName);

  const seen = new Set();
  let copied = 0;
  for (const wt of (childWorktreePaths || [])) {
    for (const abs of listTestFiles(wt, fs)) {
      // worktree-relative path, with any leading tests/ or test/ stripped so we re-root cleanly
      const rel = relative(wt, abs).split(sep).join('/').replace(/^tests?\//, '');
      if (seen.has(rel)) continue;            // de-dupe identical relative paths across worktrees
      seen.add(rel);
      const dest = join(ventureTestDir, rel);
      if (fs.existsSync(dest)) continue;       // idempotent: already consolidated
      fs.mkdirSync(dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fs.readFileSync(abs));
      copied++;
    }
  }

  // wire a runnable `test` script (no clobber), package-manager aware
  const pkgPath = join(ventureRepoPath, 'package.json');
  let pm = 'npm';
  let testScriptWired = false;
  if (fs.existsSync(pkgPath)) {
    pm = detectPackageManager(ventureRepoPath, { fs });
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
    if (pkg && typeof pkg === 'object') {
      pkg.scripts = pkg.scripts || {};
      if (!pkg.scripts.test) {                 // never clobber an existing test script
        pkg.scripts.test = 'vitest run';        // EHG-standard runner; discovers *.test.* / *.spec.*
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        testScriptWired = true;
      }
    }
  }

  // commit ONLY the test dir + package.json (path-scoped; skip an empty commit)
  if (copied > 0 || testScriptWired) {
    git(['add', testDirName, 'package.json'], { cwd: ventureRepoPath });
    const staged = String(git(['diff', '--cached', '--name-only'], { cwd: ventureRepoPath }) || '').trim();
    if (staged) {
      const msg = `chore(build): consolidate ${copied} generated test file(s) + wire test script\n\n`
        + `Auto-consolidated by venture-build-consumer (SD-LEO-FIX-STAGE-BUILD-CONSOLIDATE-001). package_manager=${pm}.`;
      git(['commit', '-m', msg], { cwd: ventureRepoPath });
    }
  }

  logger.log?.(`[venture-build-consumer] consolidated ${copied} test file(s) into ${testDirName}/ — test_script_wired=${testScriptWired} pm=${pm}`);
  return { tests_consolidated: copied, test_script_wired: testScriptWired, package_manager: pm, skipped: false };
}

/**
 * FINALIZE (real writes, SAFE): only when the tree is genuinely complete, set the build_consumed_at
 * idempotency marker, optionally idle-nudge the worker, and consolidate the generated tests into the
 * venture app (SD-LEO-FIX-STAGE-BUILD-CONSOLIDATE-001). NEVER advances the venture. This is the step
 * the session-hosted skill runs after its drive loop reports the tree complete. Consolidation is
 * BEST-EFFORT — wrapped in try/catch so a fs/git error can NEVER break the build finalize.
 */
export async function finalizeConsume({ supabase, ventureId, logger = console, deps = {} }) {
  const top = await findTopOrchestrator(supabase, ventureId);
  if (!top) return { complete: false, consumed: false, idleNudged: false, reason: 'no_top_orchestrator' };
  const descendants = await fetchDescendants(supabase, top.id);
  if (!isTreeComplete(descendants)) return { complete: false, consumed: false, idleNudged: false, reason: 'tree_incomplete' };
  await markConsumed(supabase, top.id, {});
  const nudge = await maybeIdleNudge(supabase, ventureId, {});

  // FR-4: consolidate generated tests — runs ONLY after the tree is complete, guarded by repo
  // resolution + existence, and NEVER throws out of finalize (best-effort, mirrors the module's
  // existing fail-safe pattern). The summary feeds the coupled Stage-20 checker (FR-5).
  let consolidation = { tests_consolidated: 0, test_script_wired: false, package_manager: null, skipped: true, reason: 'not_run' };
  try {
    const resolveRepo = deps.resolveVentureRepoPath || resolveVentureRepoPath;
    const enumerate = deps.enumerateChildWorktrees || enumerateChildWorktrees;
    const consolidate = deps.consolidateGeneratedTests || consolidateGeneratedTests;
    const _fs = deps.fs || defaultFs;
    const _git = deps.git || defaultGit;
    const ventureRepoPath = await resolveRepo(supabase, ventureId, { fs: _fs });
    if (!ventureRepoPath) {
      consolidation = { tests_consolidated: 0, test_script_wired: false, package_manager: null, skipped: true, reason: 'venture_repo_unresolved' };
      logger.log?.('[venture-build-consumer] test consolidation skipped: venture repo path unresolved or absent');
    } else {
      const childWorktreePaths = enumerate(ventureRepoPath, { git: _git });
      consolidation = await consolidate({ ventureRepoPath, childWorktreePaths, fs: _fs, git: _git, logger });
    }
  } catch (err) {
    consolidation = { tests_consolidated: 0, test_script_wired: false, package_manager: null, skipped: true, error: err.message };
    logger.error?.(`[venture-build-consumer] consolidateGeneratedTests failed (non-fatal — finalize unaffected): ${err.message}`);
  }

  await emitEvent(supabase, 'LEO_BUILD_CONSUMED', {
    finalize: true,
    idle_nudged: !!nudge.nudged,
    tests_consolidated: consolidation.tests_consolidated,
    test_script_wired: consolidation.test_script_wired,
    package_manager: consolidation.package_manager,
  }, { ventureId, sdId: top.id, logger });
  return { complete: true, consumed: true, idleNudged: !!nudge.nudged, consolidation };
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('venture-build-consumer --venture-id <uuid> [--dry-run | --finalize] | --check-venture <uuid>   (a real per-leaf build is session-hosted via the /leo-build-venture skill)');
    return { exitCode: 0 };
  }
  const logger = deps.logger || console;
  if (!args.ventureId) { logger.error?.('[venture-build-consumer] --venture-id is required'); return { exitCode: 2 }; }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[venture-build-consumer] fatal misconfiguration: ${err.message}`); return { exitCode: 2 }; }

  // SD-LEO-INFRA-WIRE-PRE-BUILD-002 (FR-1): per-leaf enrichment.
  // Live enrichment is session-hosted (real LLM panel + DB writes); the CLI refuses to drive
  // headlessly (TS-5b). --dry-run introspects the resolved manifest with ZERO side effects (TS-5a).
  if (args.enrichLeaf) {
    if (!args.dryRun) {
      logger.log?.('[venture-build-consumer] live --enrich-leaf is session-hosted: set PREBUILD_PANEL_ENRICHMENT=1 and run it via the /leo-build-venture skill (a panel driver must be injected). CLI supports --enrich-leaf --dry-run (introspection) only.');
      return { exitCode: 2, enrichLeaf: args.enrichLeaf, sessionHosted: true, reason: 'live enrich is session-hosted; use --dry-run to introspect' };
    }
    const resolveLeafArtifactTypes = deps.resolveLeafArtifactTypes || (async () => ({}));
    const resolved = (await resolveLeafArtifactTypes(supabase, args.ventureId, args.enrichLeaf)) || {};
    const introspection = introspectLeafEnrichment({ artifactTypes: resolved.artifactTypes || [], criteriaOpts: resolved.criteriaOpts || {} });
    logger.log?.(`[venture-build-consumer] ENRICH-LEAF INTROSPECT leaf=${args.enrichLeaf} venture=${args.ventureId}`);
    logger.log?.(`  would-run: ${introspection.wouldRunAgents.join(' -> ') || '(none)'}`);
    logger.log?.(`  required:  ${introspection.requiredCodes.join(', ') || '(none)'}`);
    logger.log?.('  (introspection only — no driver dispatch, no DB writes)');
    return { exitCode: 0, enrichLeaf: args.enrichLeaf, introspection };
  }

  // SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-3): standalone read-only stack QA/QC check.
  if (args.checkStack) {
    const verdict = await checkVentureStackCompliance(supabase, args.ventureId);
    const status = verdict.compliant ? 'COMPLIANT' : (verdict.unscannable ? 'HELD (unscannable — no is_current artifacts)' : 'HELD (stack_noncompliant)');
    logger.log?.(`[venture-build-consumer] STACK CHECK venture=${args.ventureId} -> ${status}`);
    for (const v of (verdict.violations || [])) logger.log?.(`  x ${v.label}: "${v.token}" — ${v.why}`);
    if ((verdict.missing || []).length) logger.log?.(`  ! missing required: ${verdict.missing.join(', ')}`);
    return { exitCode: verdict.compliant ? 0 : 1, ...verdict };
  }

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
