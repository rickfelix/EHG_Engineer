#!/usr/bin/env node
/**
 * venture-vision-verifier — the GATHER + STORE half of the vision-grounded acceptance gate.
 *
 * SD: SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-3). Campaign "intelligent-venture-build" #3 of 3.
 *
 * After the leo_bridge build consumer drives a venture's SD tree to completion at Stage 19, the
 * built venture must be VERIFIED against the chairman-approved vision's acceptance criteria before the
 * worker advances S19->S20. The per-venture JUDGMENT (reading the running venture vs the vision
 * dimensions) needs a live Claude session, so — exactly like venture-build-consumer's runConsume
 * ({driveLeaf}) seam — this module owns the headlessly-testable GATHER + STORE and the judge is
 * INJECTED: runVerify({ verifyVenture }). The production judge is the .claude/commands/leo-verify-venture
 * skill. The CLI here supports only --dry-run introspection (it refuses to "verify" headlessly).
 *
 * The recorded verdict lives at venture_stage_work.advisory_data.vision_acceptance_verdict
 * (lifecycle_stage=19); the worker S19 hold path (FR-2, vision-acceptance-gate.js) reads it and HOLDs
 * on a FAIL. No schema change — advisory_data is an existing JSONB column; the audit trail reuses the
 * existing system_events.payload/details columns.
 *
 * NEVER-ADVANCE / NEVER-APPROVE invariant (RCA a14ff998). This module:
 *   - NEVER advances the venture, adds an advance path, or writes the venture lifecycle stage column
 *   - NEVER creates or approves a governance decision and NEVER approves a vision
 *   - performs PURE filesystem/database reads when gathering the built-venture artifacts — it never
 *     spawns/exec/evals repo code and never fetches-and-runs the deployment URL (all live inspection
 *     happens inside the supervised /leo-verify-venture skill, never in this lib).
 * An executable static-source guardrail test enforces this invariant.
 *
 * Usage:
 *   node lib/eva/bridge/venture-vision-verifier.js --venture-id <uuid> --dry-run   # introspect, ZERO writes
 *   (a real verify is session-hosted: invoke the /leo-verify-venture skill in a live Claude session)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

export const S19 = 19;

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
 * PURE read-only gather of the verification inputs: the chairman-approved L2 vision dimensions plus
 * the built-venture artifacts. Never mutates; never executes repo/deployment code.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<object>} inputs for the judge
 */
export async function gatherVerificationInputs(supabase, ventureId) {
  // Chairman-approved L2 vision — select extracted_dimensions EXPLICITLY (assertVentureVisionReady
  // returns only vision_key/version/content/updated_at; the acceptance criteria are extracted_dimensions).
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

  // Built-venture repo + deployment — ventures is the SSOT (the venture_resources repo_url/deployment_url
  // columns were never applied to live; ERROR 42703).
  const { data: venture } = await supabase
    .from('ventures')
    .select('repo_url, deployment_url, name')
    .eq('id', ventureId)
    .maybeSingle();

  // build_mvp_build artifact — ground the built-state on artifact_data.verdict (FAIL = failed build),
  // mirroring verifyBuildMvpBuildPresent in lib/eva/lifecycle/exit-gate-verifiers.js.
  const { data: buildArtifact } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, content')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'build_mvp_build')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  const buildVerdict = buildArtifact?.artifact_data?.verdict ?? null;

  // Best-effort local clone path (the judge can also resolve the repo via repo_url). Tolerant: any
  // lookup error leaves localPath null rather than aborting the gather.
  let localPath = null;
  try {
    if (venture?.repo_url) {
      const { data: app } = await supabase
        .from('applications')
        .select('id, local_path, repo_url')
        .eq('repo_url', venture.repo_url)
        .limit(1)
        .maybeSingle();
      localPath = app?.local_path ?? null;
    }
  } catch { /* applications lookup is best-effort */ }

  return {
    visionPresent: !!vision,
    visionDimensions: vision?.extracted_dimensions || [],
    visionKey: vision?.vision_key || null,
    visionContent: vision?.content || null,
    ventureName: venture?.name || null,
    repoUrl: venture?.repo_url || null,
    deploymentUrl: venture?.deployment_url || null,
    buildVerdict,
    localPath,
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
 * Append-only audit row for a recorded verdict. system_events has NO event_data column — dual-write
 * to payload + details (mirrors _emitS19HardGateEvent). Best-effort + non-fatal.
 */
async function emitVerdictEvent(supabase, ventureId, verdict) {
  try {
    const stamp = verdict.evaluated_at || new Date().toISOString();
    const payload = {
      venture_id: ventureId, from_stage: S19, build_model: 'leo_bridge',
      verdict_pass: verdict.pass,
      gaps: Array.isArray(verdict.gaps) ? verdict.gaps.length : 0,
      corrective_sds: verdict.corrective_sds || [],
      evaluated_by: verdict.evaluated_by,
    };
    await supabase.from('system_events').insert({
      event_type: 'VISION_ACCEPTANCE_VERDICT',
      venture_id: ventureId,
      idempotency_key: `VISION_ACCEPTANCE_VERDICT:${ventureId}:${Date.parse(stamp)}`,
      payload,
      details: payload,
      created_at: stamp,
    });
  } catch { /* audit is best-effort, non-fatal */ }
}

/**
 * Read-merge-write the verdict into venture_stage_work.advisory_data.vision_acceptance_verdict — set
 * ONLY the verdict key, never clobber sibling S19 keys (reason / bridge_failed / chairman_override).
 * Guarded by a per-venture advisory lock when a PG connection is available (marker/last-writer
 * otherwise). Plus the append-only system_events audit row.
 */
async function storeVerdict({ supabase, pgClient, ventureId, verdict, logger }) {
  const client = pgClient !== undefined ? pgClient : buildPgClient();
  let connected = false;
  let lockKey = null;
  try {
    if (client && typeof client.connect === 'function') {
      try { await client.connect(); connected = true; } catch { /* fall back to read-merge-write */ }
    }
    const lock = await tryAdvisoryLock(connected ? client : null, `vision-verify:${ventureId}`);
    lockKey = lock.key;

    const row = await readStageWork(supabase, ventureId);
    const merged = { ...(row?.advisory_data || {}), vision_acceptance_verdict: verdict };
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
  logger?.log?.(`[verify] recorded vision_acceptance_verdict (pass=${verdict.pass}) for venture ${ventureId}`);
}

/**
 * Gather the vision + built-venture artifacts, run the INJECTED judge, and record the verdict.
 *
 *   - dryRun=true OR no verifyVenture injected → introspect only (gather + read current verdict),
 *     ZERO writes, NEVER invokes the judge. This is the read-only CLI path.
 *   - no chairman-approved L2 vision → skip (defer to the existing VISION_MISSING gate); never approve.
 *   - otherwise → verdict = verifyVenture(visionDimensions, ventureArtifacts); stamp + read-merge-write.
 *
 * The judge signature: verifyVenture(visionDimensions, ventureArtifacts) ->
 *   { pass:boolean, criteria_results?:[], gaps?:[], corrective_sds?:[], evaluated_by?:string }.
 *
 * @param {{supabase:object, ventureId:string, verifyVenture?:Function, dryRun?:boolean, logger?:object, pgClient?:any}} args
 */
export async function runVerify({ supabase, ventureId, verifyVenture, dryRun = false, logger = console, pgClient = undefined }) {
  if (!ventureId) throw new Error('runVerify: ventureId required');

  const inputs = await gatherVerificationInputs(supabase, ventureId);
  const stageWork = await readStageWork(supabase, ventureId);
  const currentVerdict = stageWork?.advisory_data?.vision_acceptance_verdict ?? null;

  // Read-only introspection: dry-run, or no live judge injected (the real judge is session-hosted).
  if (dryRun || typeof verifyVenture !== 'function') {
    return { dryRun: true, wrote: false, ventureId, visionPresent: inputs.visionPresent, currentVerdict, inputs };
  }

  if (!inputs.visionPresent) {
    logger?.warn?.(`[verify] venture ${ventureId}: no chairman-approved L2 vision — skipping (defer to VISION_MISSING gate)`);
    return { dryRun: false, wrote: false, skipped: true, reason: 'no_approved_l2_vision', ventureId };
  }

  const judged = await verifyVenture(inputs.visionDimensions, {
    repoUrl: inputs.repoUrl, deploymentUrl: inputs.deploymentUrl, localPath: inputs.localPath,
    buildVerdict: inputs.buildVerdict, visionKey: inputs.visionKey, visionContent: inputs.visionContent,
    ventureName: inputs.ventureName,
  });

  const verdict = normalizeVerdict(judged);
  await storeVerdict({ supabase, pgClient, ventureId, verdict, logger });
  return { dryRun: false, wrote: true, ventureId, verdict };
}

/**
 * Coerce a raw judge verdict into the canonical recorded shape. pass is strictly === true (an absent
 * or non-boolean pass becomes false, never a silent pass — mirrors classifyVisionAcceptance's
 * undefined-vs-false care).
 * @param {object|null|undefined} raw
 */
export function normalizeVerdict(raw) {
  return {
    pass: raw?.pass === true,
    criteria_results: Array.isArray(raw?.criteria_results) ? raw.criteria_results : [],
    gaps: Array.isArray(raw?.gaps) ? raw.gaps : [],
    corrective_sds: Array.isArray(raw?.corrective_sds) ? raw.corrective_sds : [],
    evaluated_at: raw?.evaluated_at || new Date().toISOString(),
    evaluated_by: raw?.evaluated_by || 'leo-verify-venture',
  };
}

/**
 * Persist a verdict the live judge (the /leo-verify-venture skill) has ALREADY produced — through the
 * same canonical read-merge-write store + audit as runVerify. This is NOT headless judging (no
 * verifyVenture is invoked); it only records the session-hosted judgment. Never advances/approves.
 * @param {{supabase:object, ventureId:string, verdict:object, pgClient?:any, logger?:object}} args
 */
export async function recordVerdict({ supabase, ventureId, verdict, pgClient = undefined, logger = console }) {
  if (!ventureId) throw new Error('recordVerdict: ventureId required');
  const normalized = normalizeVerdict(verdict);
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
    console.log('Usage: node lib/eva/bridge/venture-vision-verifier.js --venture-id <uuid> [--dry-run | --record <verdict.json>]');
    console.log('  --dry-run         introspect the recorded vision_acceptance_verdict + gathered inputs (ZERO writes).');
    console.log('  --record <file>   persist a verdict the live /leo-verify-venture judge already produced (read-merge-write + audit).');
    console.log('  A real verify is session-hosted: invoke the /leo-verify-venture skill in a live Claude session.');
    process.exit(args.ventureId ? 0 : 2);
  }
  const supabase = buildSupabase();
  if (args.record) {
    // Persist a verdict the live session-hosted judge already produced. This RECORDS (read-merge-write
    // + audit) — it does NOT judge headlessly (no verifyVenture is invoked) and never advances/approves.
    const fs = await import('fs');
    const raw = JSON.parse(fs.readFileSync(args.record, 'utf8'));
    const res = await recordVerdict({ supabase, ventureId: args.ventureId, verdict: raw });
    console.log(`Recorded vision_acceptance_verdict (pass=${res.verdict.pass}, gaps=${res.verdict.gaps.length}) for venture ${args.ventureId}`);
    process.exit(0);
  }
  if (!args.dryRun) {
    // The verification JUDGE is a live Claude session (the /leo-verify-venture skill); the CLI refuses
    // to verify headlessly (there is no headless judge). Only --dry-run introspection is supported.
    console.error('Refusing headless verify: the live judge is session-hosted (/leo-verify-venture). Re-run with --dry-run to introspect.');
    process.exit(2);
  }
  const res = await runVerify({ supabase, ventureId: args.ventureId, dryRun: true });
  console.log(JSON.stringify({
    ventureId: res.ventureId,
    visionPresent: res.visionPresent,
    currentVerdict: res.currentVerdict || '(none)',
    gatheredInputs: {
      repoUrl: res.inputs?.repoUrl || null,
      deploymentUrl: res.inputs?.deploymentUrl || null,
      buildVerdict: res.inputs?.buildVerdict || null,
      visionDimensions: Array.isArray(res.inputs?.visionDimensions) ? res.inputs.visionDimensions.length : 0,
    },
  }, null, 2));
  process.exit(0);
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('lib/eva/bridge/venture-vision-verifier.js');
if (invokedDirectly) {
  main().catch((err) => { console.error(`[verify] fatal: ${err.message}`); process.exit(2); });
}
