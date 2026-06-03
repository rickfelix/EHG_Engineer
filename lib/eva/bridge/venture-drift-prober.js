#!/usr/bin/env node
/**
 * venture-drift-prober — the GATHER + STORE half of the Stage-19 vision-DRIFT gate (the PRODUCER).
 *
 * SD: SD-LEO-INFRA-STAGE-VISION-DRIFT-001 (PR-2 / FR-3 of STAGE-VISION-ARTIFACT). PR-1
 * (SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001, PR #4193) shipped the dormant pure DECISION layer
 * `lib/eva/bridge/vision-drift-gate.js` (classifyVisionDrift / shouldHoldForVisionDrift) and the
 * worker seam `_evaluateVisionDriftHold`. This module is the missing PRODUCER: it records the verdict
 * the gate classifies, mirroring `venture-vision-verifier.js` (the OUTPUT-side acceptance producer).
 *
 * INPUT-side / pre-tree: this fires BEFORE the venture's SD tree is generated, judging whether the
 * chairman-approved L2 vision has materially DRIFTED from the venture's S13-S18 blueprint artifacts +
 * the S19 sprint plan. The per-venture JUDGMENT needs a live Claude session, so — exactly like the
 * acceptance verifier's runVerify({ verifyVenture }) seam — the judge is INJECTED:
 * runDriftProbe({ driftProbe }). The production judge is the `.claude/commands/leo-drift-probe` skill.
 * The CLI here supports only `--dry-run` introspection and `--record <file>` (it refuses to judge headlessly).
 *
 * The recorded verdict lives at venture_stage_work.advisory_data.vision_drift_verdict (lifecycle_stage=19)
 * and is set-only-one-key (read-merge-write spread; never clobbers a sibling vision_acceptance_verdict).
 * No schema change — advisory_data is an existing JSONB column. The verdict shape is pinned to the
 * vision-drift-gate.js contract: exactly one of { material_drift:boolean | board_unavailable:true |
 * packet_incomplete:true }. The 4-dimension judge output is REDUCED to that contract by
 * normalizeDriftVerdict BEFORE storing — storing raw per-dimension scores would make classifyVisionDrift
 * return NOT_EVALUATED on every verdict and the gate a permanent no-op.
 *
 * NEVER-ADVANCE invariant (RCA a14ff998 — the S19 gate-bypass incident). This module:
 *   - NEVER advances the venture, adds an advance path, or writes the venture lifecycle stage column
 *   - NEVER creates/approves a governance decision and NEVER approves a vision
 *   - performs PURE database reads when gathering; the only write is advisory_data.vision_drift_verdict.
 * An executable static-source guardrail test enforces this invariant AND forbids any background
 * timer/cron entrypoint (the producer is session-hosted, never a daemon).
 *
 * Usage:
 *   node lib/eva/bridge/venture-drift-prober.js --venture-id <uuid> --dry-run   # introspect, ZERO writes
 *   (a real drift-probe is session-hosted: invoke the /leo-drift-probe skill in a live Claude session)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { summarizeArtifacts } from '../artifact-enrichment-pipeline.js';
import { ARTIFACT_TYPES } from '../artifact-types.js';

export const S19 = 19;
/** S13 is the first Blueprint stage; the drift corpus is the S13-S19 is_current artifacts. */
export const BLUEPRINT_STAGE_MIN = 13;

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

function buildPgClient() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) return null; // graceful — no PG conn → marker/last-writer semantics (still read-merge-write)
  return new pg.Client({ connectionString: conn });
}

async function tryAdvisoryLock(client, name) {
  if (!client) return { acquired: true, mock: true }; // no client → no real lock; read-merge-write still applies
  const k = await client.query('SELECT hashtext($1)::int AS k', [name]);
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [k.rows[0].k]);
  return { acquired: r.rows[0].acquired === true, key: k.rows[0].k, mock: false };
}

async function releaseAdvisoryLock(client, key) {
  if (!client || key == null) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [key]); } catch { /* best-effort */ }
}

/**
 * PURE read-only gather of the drift-probe inputs: the chairman-approved L2 vision dimensions plus the
 * venture's S13-S19 is_current blueprint artifacts (incl. the S19 sprint plan). Never mutates; never
 * executes repo/deployment code. The LLM-backed `summarize` is INJECTED (default summarizeArtifacts) so
 * the gather stays unit-testable and the dry-run path can skip summarization entirely.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {{summarize?: Function|null, logger?: object}} [opts]
 * @returns {Promise<object>} inputs for the judge
 */
export async function gatherDriftInputs(supabase, ventureId, { summarize, logger = console } = {}) {
  // Chairman-approved L2 vision — the drift baseline (extracted_dimensions are the "intended" venture).
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, version, content, updated_at, extracted_dimensions')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'active')
    .eq('chairman_approved', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: venture } = await supabase
    .from('ventures')
    .select('name')
    .eq('id', ventureId)
    .maybeSingle();

  // S13-S19 is_current artifacts — the venture's actual blueprint/sprint decisions to compare vs vision.
  const { data: artifactRows } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, lifecycle_stage, title, content, artifact_data, updated_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .gte('lifecycle_stage', BLUEPRINT_STAGE_MIN)
    .lte('lifecycle_stage', S19);
  const artifacts = artifactRows || [];
  const sprintPresent = artifacts.some((a) => a.artifact_type === ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN);

  // Optional LLM-backed compression of the artifact corpus for the judge (injectable; skipped on dry-run).
  let artifactSummaries = null;
  if (typeof summarize === 'function' && artifacts.length) {
    try {
      const map = await summarize(supabase, ventureId, artifacts, { logger });
      artifactSummaries = map instanceof Map ? Object.fromEntries(map) : (map || null);
    } catch (err) {
      logger?.warn?.(`[drift] summarizeArtifacts failed (non-fatal, judge falls back to raw): ${err.message}`);
    }
  }

  return {
    visionPresent: !!vision,
    visionDimensions: vision?.extracted_dimensions || [],
    visionKey: vision?.vision_key || null,
    visionContent: vision?.content || null,
    ventureName: venture?.name || null,
    sprintPresent,
    // Lightweight artifact descriptors (no heavy content) — the judge reads summaries or re-fetches.
    artifacts: artifacts.map((a) => ({ artifact_type: a.artifact_type, lifecycle_stage: a.lifecycle_stage, title: a.title || null })),
    artifactSummaries,
  };
}

async function readStageWork(supabase, ventureId) {
  const { data } = await supabase
    .from('venture_stage_work')
    .select('id, advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', S19)
    .maybeSingle();
  return data || null;
}

/**
 * Append-only audit row for a recorded drift verdict. system_events has NO event_data column — dual-write
 * to payload + details (mirrors _emitS19HardGateEvent). Best-effort + non-fatal.
 */
async function emitVerdictEvent(supabase, ventureId, verdict) {
  try {
    const stamp = verdict.evaluated_at || new Date().toISOString();
    const payload = {
      venture_id: ventureId, from_stage: S19, build_model: 'leo_bridge',
      material_drift: verdict.material_drift ?? null,
      board_unavailable: verdict.board_unavailable === true,
      packet_incomplete: verdict.packet_incomplete === true,
      evaluated_by: verdict.evaluated_by,
    };
    await supabase.from('system_events').insert({
      event_type: 'VISION_DRIFT_VERDICT',
      venture_id: ventureId,
      idempotency_key: `VISION_DRIFT_VERDICT:${ventureId}:${Date.parse(stamp)}`,
      payload,
      details: payload,
      created_at: stamp,
    });
  } catch { /* audit is best-effort, non-fatal */ }
}

/**
 * Read-merge-write the verdict into venture_stage_work.advisory_data.vision_drift_verdict — set ONLY the
 * verdict key, never clobber sibling S19 keys (vision_acceptance_verdict / reason / bridge_failed).
 * Guarded by a per-venture advisory lock `vision-drift:${ventureId}` (DISTINCT from the acceptance
 * verifier's `vision-verify:${ventureId}`) when a PG connection is available; marker/last-writer
 * otherwise. Plus the append-only system_events audit row.
 */
async function storeVerdict({ supabase, pgClient, ventureId, verdict, logger }) {
  const client = pgClient !== undefined ? pgClient : buildPgClient();
  let connected = false;
  let lockKey = null;
  try {
    if (client && typeof client.connect === 'function') {
      try { await client.connect(); connected = true; } catch { /* fall back to read-merge-write */ }
    }
    const lock = await tryAdvisoryLock(connected ? client : null, `vision-drift:${ventureId}`);
    lockKey = lock.key;

    const row = await readStageWork(supabase, ventureId);
    const merged = { ...(row?.advisory_data || {}), vision_drift_verdict: verdict };
    if (row?.id) {
      await supabase.from('venture_stage_work').update({ advisory_data: merged }).eq('id', row.id);
    } else {
      await supabase.from('venture_stage_work').insert({ venture_id: ventureId, lifecycle_stage: S19, advisory_data: merged });
    }
    await emitVerdictEvent(supabase, ventureId, verdict);
  } finally {
    if (connected) {
      await releaseAdvisoryLock(client, lockKey);
      try { await client.end(); } catch { /* best-effort */ }
    }
  }
  const tag = verdict.material_drift === true ? 'material_drift'
    : verdict.board_unavailable ? 'board_unavailable'
    : verdict.packet_incomplete ? 'packet_incomplete' : 'no_drift';
  logger?.log?.(`[drift] recorded vision_drift_verdict (${tag}) for venture ${ventureId}`);
}

/**
 * Coerce a raw judge verdict into the gate's contract shape — the single most load-bearing step (the
 * vision-drift-gate.js classifier reads ONLY material_drift / board_unavailable / packet_incomplete).
 *
 *   - Transient signals win FIRST: if the probe could not run cleanly ({ board_unavailable:true }) or
 *     the read-in packet was incomplete ({ packet_incomplete:true }), the per-dimension drift values are
 *     unreliable and must not be trusted — return the transient verdict.
 *   - Otherwise REDUCE the 4-dimension output to a single material_drift boolean: an explicit boolean
 *     wins; else material_drift = ANY dimension drifted (dimensions[].drift === true).
 *   - NEVER coerce an unknown/empty probe result to material_drift:false (the undefined-vs-false
 *     distinction is load-bearing — a silent false would advance an un-vetted vision). An unusable
 *     result degrades to board_unavailable (transient), never NO_DRIFT.
 *
 * @param {object|null|undefined} raw
 * @returns {{material_drift?:boolean, board_unavailable?:true, packet_incomplete?:true, dimensions:Array, evaluated_at:string, evaluated_by:string}}
 */
export function normalizeDriftVerdict(raw) {
  const base = {
    dimensions: Array.isArray(raw?.dimensions) ? raw.dimensions : [],
    evaluated_at: raw?.evaluated_at || new Date().toISOString(),
    evaluated_by: raw?.evaluated_by || 'leo-drift-probe',
  };
  if (raw?.board_unavailable === true) return { board_unavailable: true, ...base };
  if (raw?.packet_incomplete === true) return { packet_incomplete: true, ...base };

  let material;
  if (typeof raw?.material_drift === 'boolean') material = raw.material_drift;
  else if (base.dimensions.length) material = base.dimensions.some((d) => d?.drift === true);
  else material = undefined;

  if (typeof material !== 'boolean') return { board_unavailable: true, ...base }; // never silent-false
  return { material_drift: material, ...base };
}

/**
 * Gather the vision + S13-S19 artifacts, run the INJECTED judge, REDUCE its output to the contract
 * verdict, and record it.
 *
 *   - dryRun=true OR no driftProbe injected → introspect only (gather + read current verdict), ZERO
 *     writes, NEVER invokes the judge. This is the read-only CLI path (summarization is skipped).
 *   - no chairman-approved L2 vision → skip (defer to the existing VISION_MISSING gate); never record.
 *   - otherwise → judged = driftProbe(visionDimensions, packet); verdict = normalizeDriftVerdict(judged);
 *     read-merge-write store under the vision-drift advisory lock.
 *
 * The judge signature: driftProbe(visionDimensions, packet) ->
 *   { material_drift?:boolean, dimensions?:[{dimension, drift, evidence}], board_unavailable?, packet_incomplete?, evaluated_by? }.
 *
 * @param {{supabase:object, ventureId:string, driftProbe?:Function, dryRun?:boolean, logger?:object, pgClient?:any, summarize?:Function|null}} args
 */
export async function runDriftProbe({ supabase, ventureId, driftProbe, dryRun = false, logger = console, pgClient = undefined, summarize = summarizeArtifacts }) {
  if (!ventureId) throw new Error('runDriftProbe: ventureId required');

  // Skip the LLM summarizer on the read-only introspection path (keep dry-run cheap + side-effect-free).
  const inputs = await gatherDriftInputs(supabase, ventureId, { summarize: dryRun ? undefined : summarize, logger });
  const stageWork = await readStageWork(supabase, ventureId);
  const currentVerdict = stageWork?.advisory_data?.vision_drift_verdict ?? null;

  if (dryRun || typeof driftProbe !== 'function') {
    return { dryRun: true, wrote: false, ventureId, visionPresent: inputs.visionPresent, sprintPresent: inputs.sprintPresent, currentVerdict, inputs };
  }

  if (!inputs.visionPresent) {
    logger?.warn?.(`[drift] venture ${ventureId}: no chairman-approved L2 vision — skipping (defer to VISION_MISSING gate)`);
    return { dryRun: false, wrote: false, skipped: true, reason: 'no_approved_l2_vision', ventureId };
  }

  const judged = await driftProbe(inputs.visionDimensions, {
    visionKey: inputs.visionKey, visionContent: inputs.visionContent,
    artifacts: inputs.artifacts, artifactSummaries: inputs.artifactSummaries,
    sprintPresent: inputs.sprintPresent, ventureName: inputs.ventureName,
  });

  const verdict = normalizeDriftVerdict(judged);
  await storeVerdict({ supabase, pgClient, ventureId, verdict, logger });
  return { dryRun: false, wrote: true, ventureId, verdict };
}

/**
 * Persist a verdict the live judge (the /leo-drift-probe skill) has ALREADY produced — through the same
 * canonical read-merge-write store + audit + normalize as runDriftProbe. This is NOT headless judging
 * (no driftProbe is invoked); it only records the session-hosted judgment. Never advances/approves.
 * @param {{supabase:object, ventureId:string, verdict:object, pgClient?:any, logger?:object}} args
 */
export async function recordVerdict({ supabase, ventureId, verdict, pgClient = undefined, logger = console }) {
  if (!ventureId) throw new Error('recordVerdict: ventureId required');
  const normalized = normalizeDriftVerdict(verdict);
  await storeVerdict({ supabase, pgClient, ventureId, verdict: normalized, logger });
  return { wrote: true, ventureId, verdict: normalized };
}

function parseArgs(argv) {
  const a = { ventureId: null, dryRun: false, record: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--venture-id' && argv[i + 1]) a.ventureId = argv[++i];
    else if (x === '--dry-run') a.dryRun = true;
    else if (x === '--record' && argv[i + 1]) a.record = argv[++i];
    else if (x === '--help' || x === '-h') a.help = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.ventureId) {
    console.log('Usage: node lib/eva/bridge/venture-drift-prober.js --venture-id <uuid> [--dry-run | --record <verdict.json>]');
    console.log('  --dry-run         introspect the recorded vision_drift_verdict + gathered inputs (ZERO writes).');
    console.log('  --record <file>   persist a verdict the live /leo-drift-probe judge already produced (read-merge-write + audit).');
    console.log('  A real drift-probe is session-hosted: invoke the /leo-drift-probe skill in a live Claude session.');
    process.exit(args.ventureId ? 0 : 2);
  }
  const supabase = buildSupabase();
  if (args.record) {
    // Persist a verdict the live session-hosted judge already produced. RECORDS (read-merge-write +
    // audit) — does NOT judge headlessly (no driftProbe is invoked) and never advances/approves.
    const fs = await import('fs');
    const raw = JSON.parse(fs.readFileSync(args.record, 'utf8'));
    const res = await recordVerdict({ supabase, ventureId: args.ventureId, verdict: raw });
    const v = res.verdict;
    const tag = v.material_drift === true ? 'material_drift' : v.board_unavailable ? 'board_unavailable' : v.packet_incomplete ? 'packet_incomplete' : 'no_drift';
    console.log(`Recorded vision_drift_verdict (${tag}) for venture ${args.ventureId}`);
    process.exit(0);
  }
  if (!args.dryRun) {
    // The drift JUDGE is a live Claude session (the /leo-drift-probe skill); the CLI refuses to judge
    // headlessly (there is no headless judge). Only --dry-run introspection is supported.
    console.error('Refusing headless drift-probe: the live judge is session-hosted (/leo-drift-probe). Re-run with --dry-run to introspect.');
    process.exit(2);
  }
  const res = await runDriftProbe({ supabase, ventureId: args.ventureId, dryRun: true });
  console.log(JSON.stringify({
    ventureId: res.ventureId,
    visionPresent: res.visionPresent,
    sprintPresent: res.sprintPresent,
    currentVerdict: res.currentVerdict || '(none)',
    gatheredInputs: {
      visionDimensions: Array.isArray(res.inputs?.visionDimensions) ? res.inputs.visionDimensions.length : 0,
      artifacts: Array.isArray(res.inputs?.artifacts) ? res.inputs.artifacts.length : 0,
      sprintPresent: res.inputs?.sprintPresent || false,
    },
  }, null, 2));
  process.exit(0);
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('lib/eva/bridge/venture-drift-prober.js');
if (invokedDirectly) {
  main().catch((err) => { console.error(`[drift] fatal: ${err.message}`); process.exit(2); });
}
