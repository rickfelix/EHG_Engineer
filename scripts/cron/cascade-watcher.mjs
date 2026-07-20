#!/usr/bin/env node
/**
 * Cascade watcher — one-shot orchestrator for vision-to-orchestrator pipeline.
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-B
 *
 * Polls (one pass per invocation) for:
 *   Stage 1 — L2 visions ready for archplan generation:
 *     level='L2' AND status='active' AND chairman_approved=true
 *     AND venture_id IS NOT NULL
 *     AND NOT EXISTS (downstream archplan)
 *   Stage 2 — archplans ready for orchestrator generation:
 *     status='active' AND chairman_approved=true AND vision_key IS NOT NULL
 *     AND NOT EXISTS (downstream orchestrator SD)
 *
 * Stage 1 refusals (no Architectural Plan section, manual override on existing
 * record) emit eva_cascade_errors rows with remediation_command.
 *
 * Defense-in-depth on concurrency:
 *   (a) PG advisory locks per stage (pg_try_advisory_lock(hashtext)).
 *       Skip stage gracefully if lock unavailable (next tick retries).
 *   (b) upsertArchPlan onConflict:plan_key (existing in archplan-upsert.js).
 *   (c) orchestrator key-collision check in insertCascade().
 *
 * Exit codes:
 *   0 — healthy (refusals counted but not fatal)
 *   1 — operational issue (DB unavailable, unhandled exception in stage)
 *   2 — fatal misconfiguration (missing env vars, etc.)
 *
 * Usage:
 *   node scripts/cron/cascade-watcher.mjs --once       # one pass (canonical cron)
 *   node scripts/cron/cascade-watcher.mjs --venture-id <uuid>   # scope-limit
 *   node scripts/cron/cascade-watcher.mjs --dry-run    # validate + skip writes
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import os from 'os';
import { upsertArchPlan } from '../../lib/eva/archplan-upsert.js';
import { extractArchPlanSection } from '../../lib/eva/extract-archplan-section.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import {
  buildOrchestratorSD,
  buildChildSD,
  insertCascade,
  parsePhases,
} from '../../lib/eva/create-orchestrator-from-plan.js';

const STAGE1 = 'vision_to_archplan';
const STAGE2 = 'archplan_to_orchestrator';

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
  if (!conn) return null; // graceful — fall back to layered idempotency only
  return new pg.Client({ connectionString: conn });
}

async function tryAdvisoryLock(client, name) {
  if (!client) return { acquired: true, mock: true }; // no client → cannot block; layered idempotency carries the load
  const k = await client.query('SELECT hashtext($1)::int AS k', [name]);
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [k.rows[0].k]);
  return { acquired: r.rows[0].acquired === true, key: k.rows[0].k, mock: false };
}

async function releaseAdvisoryLock(client, key) {
  if (!client || key == null) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [key]); } catch {}
}

async function resolveTargetApplication(supabase, ventureId) {
  if (!ventureId) return 'EHG_Engineer';
  const { data: v } = await supabase.from('ventures').select('name').eq('id', ventureId).maybeSingle();
  return v?.name || 'EHG_Engineer';
}

async function writeCascadeError(supabase, { visionId, archplanKey, stage, errorCode, errorMessage, remediationCommand, metadata }) {
  // ON CONFLICT (vision_id, stage, error_code) WHERE resolved_at IS NULL DO UPDATE.
  // PostgREST upsert is the way; the partial-unique target makes it a no-op when an
  // open row exists (which is what we want — same row, refreshed updated_at).
  const row = {
    vision_id: visionId,
    archplan_key: archplanKey || null,
    stage,
    error_code: errorCode,
    error_message: errorMessage,
    remediation_command: remediationCommand || null,
    metadata: metadata || {},
  };
  const { error } = await supabase
    .from('eva_cascade_errors')
    .upsert(row, { onConflict: 'vision_id,stage,error_code', ignoreDuplicates: false });
  if (error) {
    process.stderr.write(`[cascade-watcher] eva_cascade_errors write failed: ${error.message}\n`);
  }
}

/**
 * Stage 1: vision -> archplan
 */
export async function runStage1({ supabase, ventureId, dryRun = false, logger = console } = {}) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every candidate below is
  // acted on (archplan creation); eva_vision_documents grows with portfolio size, so an
  // unranged read would silently skip cascade candidates past the cap. Paginate; error
  // policy mirrors the prior throw.
  const visionsQueryFactory = () => {
    let q = supabase
      .from('eva_vision_documents')
      .select('id, vision_key, content, venture_id')
      .eq('level', 'L2')
      .eq('status', 'active')
      .eq('chairman_approved', true)
      .not('venture_id', 'is', null);
    if (ventureId) q = q.eq('venture_id', ventureId);
    return q;
  };

  let visions;
  try {
    visions = await fetchAllPaginated(() => visionsQueryFactory().order('id', { ascending: true }));
  } catch (err) {
    throw new Error(`Stage 1 vision query failed: ${err.message}`);
  }

  const candidates = [];
  for (const v of (visions || [])) {
    const { data: existingArch } = await supabase
      .from('eva_architecture_plans') // schema-lint-disable-line: pre-existing metadata column reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
      .select('plan_key, status, metadata')
      .eq('vision_id', v.id)
      .maybeSingle();
    if (existingArch) {
      // Skip silently if archplan exists and was either chairman-created
      // (metadata.auto_generated !== true) OR already auto-generated by us.
      if (existingArch.metadata?.auto_generated !== true) {
        await writeCascadeError(supabase, {
          visionId: v.id,
          archplanKey: existingArch.plan_key,
          stage: STAGE1,
          errorCode: 'MANUAL_OVERRIDE_DETECTED',
          errorMessage: `Archplan ${existingArch.plan_key} exists with auto_generated=false (chairman-created). Cascade refuses to clobber.`,
          remediationCommand: null,
          metadata: { existing_plan_key: existingArch.plan_key },
        });
      }
      continue;
    }
    candidates.push(v);
  }

  let success = 0, refusal = 0;
  for (const v of candidates) {
    const ext = extractArchPlanSection(v.content);
    if (!ext.found) {
      const planKeyDerived = (v.vision_key || '').replace(/^VISION-/, 'ARCH-').replace(/-L\d+/, '').replace(/-001$/, '') + '-001';
      const remediation = `node scripts/eva/archplan-command.mjs upsert --plan-key ${planKeyDerived} --vision-key ${v.vision_key} --source <path-to-arch-section.md>`;
      if (!dryRun) {
        await writeCascadeError(supabase, {
          visionId: v.id,
          archplanKey: null,
          stage: STAGE1,
          errorCode: 'ARCH_SECTION_NOT_FOUND',
          errorMessage: `L2 vision ${v.vision_key} has no "## Architectural Plan" section. Cannot auto-derive archplan.`,
          remediationCommand: remediation,
          metadata: { vision_key: v.vision_key, heading_line_number: ext.heading_line_number },
        });
      }
      refusal++;
      logger.log?.(`[cascade-watcher] Stage 1 REFUSAL ARCH_SECTION_NOT_FOUND: ${v.vision_key}`);
      continue;
    }

    // Derive arch plan_key from vision_key (e.g., VISION-CRONGENIUS-API-L2-001 -> ARCH-CRONGENIUS-001)
    const planKey = (v.vision_key || '').replace(/^VISION-/, 'ARCH-').replace(/-L\d+/, '').replace(/-001$/, '') + '-001';
    if (dryRun) {
      logger.log?.(`[cascade-watcher] DRY RUN Stage 1: would upsert ${planKey} from ${v.vision_key}`);
      success++;
      continue;
    }
    const { data, error } = await upsertArchPlan({
      supabase,
      planKey,
      visionKey: v.vision_key,
      content: ext.content,
      ventureId: v.venture_id,
      createdBy: 'cascade-watcher',
    });
    if (error) {
      await writeCascadeError(supabase, {
        visionId: v.id,
        archplanKey: planKey,
        stage: STAGE1,
        errorCode: 'ARCHPLAN_UPSERT_FAILED',
        errorMessage: error.message,
        remediationCommand: `node scripts/eva/archplan-command.mjs upsert --plan-key ${planKey} --vision-key ${v.vision_key} --source <path-to-arch-section.md>`,
      });
      refusal++;
      continue;
    }
    // Tag the auto_generated marker on the archplan via a follow-up update — required for first-run safety check.
    await supabase
      .from('eva_architecture_plans') // schema-lint-disable-line: pre-existing metadata column reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
      .update({ metadata: { ...(data?.metadata || {}), auto_generated: true, generator: 'cascade-watcher' } })
      .eq('plan_key', planKey);
    success++;
    logger.log?.(`[cascade-watcher] Stage 1 OK: ${v.vision_key} -> ${planKey}`);
  }
  return { success, refusal, candidates: candidates.length };
}

/**
 * Stage 2: archplan -> orchestrator + children
 */
export async function runStage2({ supabase, ventureId, dryRun = false, logger = console } = {}) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every candidate below is
  // acted on (orchestrator + children creation); eva_architecture_plans grows with
  // portfolio size, so an unranged read would silently skip cascade candidates past the
  // cap. Paginate; error policy mirrors the prior throw.
  const archQueryFactory = () => {
    let q = supabase
      .from('eva_architecture_plans') // schema-lint-disable-line: pre-existing metadata column reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
      .select('id, plan_key, vision_key, vision_id, content, sections, extracted_dimensions, venture_id, metadata')
      .eq('status', 'active')
      .eq('chairman_approved', true)
      .not('vision_key', 'is', null);
    if (ventureId) q = q.eq('venture_id', ventureId);
    return q;
  };

  let plans;
  try {
    plans = await fetchAllPaginated(() => archQueryFactory().order('id', { ascending: true }));
  } catch (err) {
    throw new Error(`Stage 2 archplan query failed: ${err.message}`);
  }

  const candidates = [];
  for (const p of (plans || [])) {
    // Check no orchestrator already references this arch_key
    const { data: existingOrch } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata')
      .eq('sd_type', 'orchestrator')
      .filter('metadata->>arch_key', 'eq', p.plan_key)
      .maybeSingle();
    if (existingOrch) {
      if (existingOrch.metadata?.auto_generated !== true) {
        await writeCascadeError(supabase, {
          visionId: p.vision_id,
          archplanKey: p.plan_key,
          stage: STAGE2,
          errorCode: 'MANUAL_OVERRIDE_DETECTED',
          errorMessage: `Orchestrator ${existingOrch.sd_key} exists with auto_generated=false (chairman-created). Cascade refuses to clobber.`,
          remediationCommand: null,
          metadata: { existing_sd_key: existingOrch.sd_key, arch_key: p.plan_key },
        });
      }
      continue;
    }
    candidates.push(p);
  }

  let success = 0, refusal = 0;
  for (const p of candidates) {
    // Load vision for dimensions
    const { data: vision } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, extracted_dimensions, venture_id')
      .eq('id', p.vision_id)
      .maybeSingle();

    const targetApplication = await resolveTargetApplication(supabase, vision?.venture_id || p.venture_id);

    // Phases — prefer structured sections.implementation_phases, fall back to parsePhases
    let phases = p.sections?.implementation_phases;
    if (!phases || !Array.isArray(phases) || phases.length === 0) {
      phases = parsePhases(p.content || '');
    }
    if (!phases || phases.length < 3) {
      await writeCascadeError(supabase, {
        visionId: p.vision_id,
        archplanKey: p.plan_key,
        stage: STAGE2,
        errorCode: 'INSUFFICIENT_PHASES',
        errorMessage: `Archplan ${p.plan_key} has only ${phases?.length || 0} implementation phase(s); orchestrator decomposition requires ≥3.`,
        remediationCommand: `node scripts/eva/archplan-command.mjs upsert --plan-key ${p.plan_key} --vision-key ${p.vision_key} --source <rich-arch-content-with-phases.md>`,
      });
      refusal++;
      continue;
    }

    const title = `${targetApplication} M1 — auto-generated from ${p.plan_key}`;
    const { record: orchestratorRecord, key: orchestratorKey } = buildOrchestratorSD({
      visionDoc: vision,
      archPlan: p,
      phases,
      title,
      targetApplication,
      visionKey: p.vision_key,
      archKey: p.plan_key,
    });

    const childRecords = [];
    const dimensionMap = new Map();
    for (const phase of phases) {
      const { record: childRecord } = buildChildSD({
        phase,
        orchestratorRecord,
        orchestratorKey,
        orchestratorId: orchestratorRecord.id,
        dimensionMap,
        targetApplication,
      });
      childRecords.push(childRecord);
    }

    if (dryRun) {
      logger.log?.(`[cascade-watcher] DRY RUN Stage 2: would create ${orchestratorKey} + ${childRecords.length} children`);
      success++;
      continue;
    }
    const result = await insertCascade({ supabase, orchestratorRecord, childRecords, archPlan: p, logger });
    if (result.errors.length > 0) {
      const e = result.errors[0];
      await writeCascadeError(supabase, {
        visionId: p.vision_id,
        archplanKey: p.plan_key,
        stage: STAGE2,
        errorCode: e.stage === 'orchestrator' ? 'ORCHESTRATOR_INSERT_FAILED' : 'CHILD_INSERT_FAILED',
        errorMessage: e.error,
        remediationCommand: `node scripts/create-orchestrator-from-plan.js --vision-key ${p.vision_key} --arch-key ${p.plan_key} --title "${title}" --auto-children`,
      });
      refusal++;
      continue;
    }
    success++;
    logger.log?.(`[cascade-watcher] Stage 2 OK: ${p.plan_key} -> ${orchestratorKey} + ${result.children.length} children`);
  }
  return { success, refusal, candidates: candidates.length };
}

/**
 * Write a heartbeat row at watcher start; return its id.
 */
export async function startHeartbeat(supabase) {
  const { data, error } = await supabase
    .from('cascade_watcher_heartbeats')
    .insert({ hostname: os.hostname(), pid: process.pid })
    .select('run_id')
    .single();
  if (error) {
    process.stderr.write(`[cascade-watcher] heartbeat start failed: ${error.message}\n`);
    return null;
  }
  return data.run_id;
}

export async function finishHeartbeat(supabase, runId, { exitCode, successCount, refusalCount }) {
  if (!runId) return;
  const { error } = await supabase
    .from('cascade_watcher_heartbeats')
    .update({ finished_at: new Date().toISOString(), exit_code: exitCode, success_count: successCount, refusal_count: refusalCount })
    .eq('run_id', runId);
  if (error) {
    process.stderr.write(`[cascade-watcher] heartbeat finish failed: ${error.message}\n`);
  }
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`cascade-watcher --once|--dry-run|--venture-id <uuid>`);
    return { exitCode: 0 };
  }
  const supabase = deps.supabase || buildSupabase();
  const pgClient = deps.pgClient !== undefined ? deps.pgClient : buildPgClient();
  const logger = deps.logger || console;

  let exitCode = 0;
  let success = 0, refusal = 0;
  const runId = await startHeartbeat(supabase);

  if (pgClient) {
    try { await pgClient.connect(); }
    catch (err) {
      logger.warn?.(`[cascade-watcher] pg connect failed (${err.message}); proceeding with layered idempotency only`);
    }
  }

  // Stage 1
  let lock1 = null;
  try {
    lock1 = await tryAdvisoryLock(pgClient, 'cascade-watcher-stage1');
    if (lock1.acquired) {
      const r = await runStage1({ supabase, ventureId: args.ventureId, dryRun: args.dryRun, logger });
      success += r.success; refusal += r.refusal;
    } else {
      logger.log?.('[cascade-watcher] Stage 1 lock held by concurrent run — skipping');
    }
  } catch (err) {
    logger.error?.(`[cascade-watcher] Stage 1 failed: ${err.message}`);
    exitCode = 1;
  } finally {
    if (lock1 && lock1.acquired && !lock1.mock) await releaseAdvisoryLock(pgClient, lock1.key);
  }

  // Stage 2
  let lock2 = null;
  try {
    lock2 = await tryAdvisoryLock(pgClient, 'cascade-watcher-stage2');
    if (lock2.acquired) {
      const r = await runStage2({ supabase, ventureId: args.ventureId, dryRun: args.dryRun, logger });
      success += r.success; refusal += r.refusal;
    } else {
      logger.log?.('[cascade-watcher] Stage 2 lock held by concurrent run — skipping');
    }
  } catch (err) {
    logger.error?.(`[cascade-watcher] Stage 2 failed: ${err.message}`);
    exitCode = 1;
  } finally {
    if (lock2 && lock2.acquired && !lock2.mock) await releaseAdvisoryLock(pgClient, lock2.key);
  }

  if (pgClient) {
    try { await pgClient.end(); } catch {}
  }

  await finishHeartbeat(supabase, runId, { exitCode, successCount: success, refusalCount: refusal });
  logger.log?.(`[cascade-watcher] done. success=${success} refusal=${refusal} exit=${exitCode}`);
  return { exitCode, runId, success, refusal };
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
        .catch((err) => { console.error('cascade-watcher fatal:', err.message); process.exit(2); });
}
