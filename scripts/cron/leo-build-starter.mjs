#!/usr/bin/env node
/**
 * leo-build-starter — one-shot DETECTOR for the leo_bridge automatic venture-build pipeline.
 *
 * SD: SD-LEO-INFRA-AUTO-EXECUTE-LEO-001 (MVP — detector + idempotent work-ready signal)
 *
 * After the S19 bridge generates a venture's orchestrator+children SD tree (all draft) and the
 * existing S19 hard gate holds the venture, NOTHING surfaces that the tree is READY TO BE BUILT.
 * This detector finds leo_bridge ventures parked at Stage 19 with a generated-but-unstarted tree
 * and emits an IDEMPOTENT work-ready signal (an orchestrator metadata.build_ready_at marker +
 * ready_child_sd_key + a system_events row). A Claude orchestrator session (or the deferred
 * consumer SD-LEO-INFRA-AUTO-EXECUTE-LEO-CONSUMER-001, or the scripts/leo-continuous-loop.ps1
 * supervisor) consumes that signal to drive the children to completion via the EXISTING
 * orchestrator-child-agent teammates.
 *
 * ⚠️ STARTER-ONLY (RCA a14ff998 — the S19 gate-bypass incident). This detector:
 *   - NEVER advances the venture / adds an _advanceStage path / writes ventures.current_lifecycle_stage
 *   - NEVER creates or approves a chairman_decision / sets chairman_approved / auto-approves a vision
 *   - NEVER claims an SD (no sd-start; not getNextReadyChild, whose stale-claim auto-release mutates state)
 *   - NEVER spawns teammates (Task/TeamCreate) — the per-child BUILD needs a live Claude session (deferred)
 *   - NEVER touches kill gates (they stay manual)
 * The existing S19 hard gate (_isLeoBridgeBuildComplete) holds the venture and the existing
 * exit-gated worker advance (advance_venture_stage + build_mvp_build) moves it once children
 * complete — both UNTOUCHED. The detector only READS them and writes the two signal surfaces.
 *
 * Exit codes: 0 healthy / 1 operational issue / 2 fatal misconfiguration.
 *
 * Usage:
 *   node scripts/cron/leo-build-starter.mjs --once                 # one pass (canonical cron)
 *   node scripts/cron/leo-build-starter.mjs --venture-id <uuid>    # scope-limit to one venture
 *   node scripts/cron/leo-build-starter.mjs --dry-run              # validate + skip writes
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const S19 = 19;
const NON_TERMINAL = ['draft', 'active'];
const VENTURE_DEAD = ['killed', 'retired', 'cancelled', 'archived'];

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, ventureId: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--venture-id' && argv[i + 1]) { args.ventureId = argv[++i]; }
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
  if (!conn) return null; // graceful — fall back to layered idempotency (the marker) only
  return new pg.Client({ connectionString: conn });
}

async function tryAdvisoryLock(client, name) {
  if (!client) return { acquired: true, mock: true }; // no client → cannot block; the marker carries idempotency
  const k = await client.query('SELECT hashtext($1)::int AS k', [name]);
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [k.rows[0].k]);
  return { acquired: r.rows[0].acquired === true, key: k.rows[0].k, mock: false };
}

async function releaseAdvisoryLock(client, key) {
  if (!client || key == null) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [key]); } catch {}
}

/**
 * Read-only venture eligibility (mirrors the existing S19 gate's own preconditions, never mutates).
 * Returns { eligible, reason }.
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
  // A current chairman-approved ACTIVE L2 vision must exist (read-only; never approves one).
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
 * Plain children read (NO getNextReadyChild — that mutates claim state). Returns whether the tree
 * is incomplete (>=1 direct child non-terminal) and the first ready child's sd_key by sequence_rank.
 */
export async function readChildren(supabase, orchestratorId) {
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, sequence_rank')
    .eq('parent_sd_id', orchestratorId)
    .order('sequence_rank', { ascending: true });
  const kids = children || [];
  const firstReady = kids.find((c) => NON_TERMINAL.includes(c.status));
  return { hasChildren: kids.length > 0, readyChildKey: firstReady ? firstReady.sd_key : null };
}

/**
 * Emit the idempotent work-ready signal — the ONLY writes. A defensive re-read guards against a
 * marker set since the candidate SELECT (belt to the advisory-lock braces); a re-run is a no-op.
 */
export async function emitSignal(supabase, { orchestrator, ventureId, readyChildKey, dryRun, logger }) {
  if (dryRun) {
    logger.log?.(`[leo-build-starter] DRY RUN: would signal ${orchestrator.sd_key} (ready child ${readyChildKey})`);
    return { signalled: false, dryRun: true };
  }
  const { data: fresh } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', orchestrator.id)
    .maybeSingle();
  if (fresh?.metadata?.build_ready_at) {
    logger.log?.(`[leo-build-starter] ${orchestrator.sd_key} already signalled — skipping`);
    return { signalled: false, alreadySignalled: true };
  }
  const newMeta = {
    ...(fresh?.metadata || orchestrator.metadata || {}),
    build_ready_at: new Date().toISOString(),
    ready_child_sd_key: readyChildKey,
    build_ready_by: 'leo-build-starter',
  };
  const { error: upErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMeta })
    .eq('id', orchestrator.id);
  if (upErr) throw new Error(`signal marker update failed: ${upErr.message}`);

  const { error: evErr } = await supabase.from('system_events').insert({
    event_type: 'LEO_BUILD_READY_SIGNALLED',
    payload: { orchestrator_sd_key: orchestrator.sd_key, ready_child_sd_key: readyChildKey },
    venture_id: ventureId,
    sd_id: orchestrator.id,
  });
  if (evErr) logger.warn?.(`[leo-build-starter] system_events insert failed: ${evErr.message}`);

  logger.log?.(`[leo-build-starter] SIGNALLED ${orchestrator.sd_key} -> ready child ${readyChildKey}`);
  return { signalled: true };
}

/**
 * One detection pass: find top leo_bridge orchestrators parked at S19 with an unstarted tree and
 * signal each build-ready (idempotent). The leo_bridge discriminator is metadata.created_via=
 * 'lifecycle-sd-bridge' (NOT auto_generated, which is cascade-watcher's convention); parent_sd_id
 * IS NULL restricts to the TOP orchestrator (child-orchestrators share created_via + venture_id).
 */
export async function runDetect({ supabase, ventureId = null, dryRun = false, logger = console } = {}) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every candidate below is
  // acted on (build-ready signal emitted); this scans top-level orchestrators across the
  // whole venture portfolio, which grows, so an unranged read could silently skip candidates
  // past the cap. Paginate; error policy mirrors the prior throw.
  const qFactory = () => {
    let q = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, venture_id, metadata')
      .eq('sd_type', 'orchestrator')
      .is('parent_sd_id', null)
      .in('status', NON_TERMINAL)
      .not('venture_id', 'is', null)
      .filter('metadata->>created_via', 'eq', 'lifecycle-sd-bridge');
    if (ventureId) q = q.eq('venture_id', ventureId);
    return q;
  };

  let orchs;
  try {
    orchs = await fetchAllPaginated(() => qFactory().order('id', { ascending: true }));
  } catch (err) {
    throw new Error(`candidate query failed: ${err.message}`);
  }

  let signalled = 0, skipped = 0;
  for (const orch of (orchs || [])) {
    if (orch.metadata?.build_ready_at) { skipped++; continue; } // idempotency: already signalled
    const elig = await ventureEligibility(supabase, orch.venture_id);
    if (!elig.eligible) { logger.log?.(`[leo-build-starter] skip ${orch.sd_key}: ${elig.reason}`); skipped++; continue; }
    const { hasChildren, readyChildKey } = await readChildren(supabase, orch.id);
    if (!hasChildren || !readyChildKey) {
      logger.log?.(`[leo-build-starter] skip ${orch.sd_key}: ${hasChildren ? 'tree_complete' : 'no_children'}`);
      skipped++; continue;
    }
    const r = await emitSignal(supabase, { orchestrator: orch, ventureId: orch.venture_id, readyChildKey, dryRun, logger });
    if (r.signalled) signalled++; else skipped++;
  }
  return { signalled, skipped, candidates: (orchs || []).length };
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('leo-build-starter --once | --dry-run | --venture-id <uuid>');
    return { exitCode: 0 };
  }
  const logger = deps.logger || console;

  let supabase;
  try {
    supabase = deps.supabase || buildSupabase();
  } catch (err) {
    logger.error?.(`[leo-build-starter] fatal misconfiguration: ${err.message}`);
    return { exitCode: 2 };
  }
  const pgClient = deps.pgClient !== undefined ? deps.pgClient : buildPgClient();

  let exitCode = 0;
  let result = { signalled: 0, skipped: 0, candidates: 0 };

  if (pgClient) {
    try { await pgClient.connect(); }
    catch (err) { logger.warn?.(`[leo-build-starter] pg connect failed (${err.message}); layered idempotency only`); }
  }

  let lock = null;
  try {
    lock = await tryAdvisoryLock(pgClient, 'leo-build-starter');
    if (lock.acquired) {
      result = await runDetect({ supabase, ventureId: args.ventureId, dryRun: args.dryRun, logger });
    } else {
      logger.log?.('[leo-build-starter] lock held by concurrent run — skipping');
    }
  } catch (err) {
    logger.error?.(`[leo-build-starter] failed: ${err.message}`);
    exitCode = 1;
  } finally {
    if (lock && lock.acquired && !lock.mock) await releaseAdvisoryLock(pgClient, lock.key);
  }

  if (pgClient) { try { await pgClient.end(); } catch {} }

  logger.log?.(`[leo-build-starter] done. signalled=${result.signalled} skipped=${result.skipped} candidates=${result.candidates} exit=${exitCode}`);
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
        .catch((err) => { console.error('leo-build-starter fatal:', err.message); process.exit(2); });
}
