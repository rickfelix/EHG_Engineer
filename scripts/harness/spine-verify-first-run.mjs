#!/usr/bin/env node
/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: verify-first seeded thread.
 *
 * Drives ONE seeded end-to-end thread through the EXISTING (unmodified)
 * venture-ceo-factory creation path on a fixture venture: instantiate a
 * CEO+VP org, claim one agent_messages row, make one real budget-checked
 * decision, and leave one real calibration row. Proves the factory's good
 * bones work end-to-end before Children C-H take a dependency on it.
 *
 * Zero diff inside VentureFactory._createAgent()/_grantTools() — Child B
 * (spine core, in_progress) owns identity/authority. Fixture-scoping
 * (non-active status + metadata.is_fixture) is applied as a POST-CREATION
 * UPDATE from this script, not a change to the factory itself.
 *
 * Usage:
 *   node scripts/harness/spine-verify-first-run.mjs run [--no-teardown]
 *   node scripts/harness/spine-verify-first-run.mjs teardown <runId>
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildFixtureVentureRow } from './s20-fixture.mjs';
import { VentureFactory } from '../../lib/agents/venture-ceo-factory.js';
import { VentureCEORuntime, BudgetManager, TruthLayer } from '../../lib/agents/venture-ceo/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = join(__dirname, '.spine-verify-first-runs');

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

function manifestPath(runId) {
  return join(MANIFEST_DIR, `${runId}.json`);
}

function saveManifest(runId, manifest) {
  if (!existsSync(MANIFEST_DIR)) mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(manifestPath(runId), JSON.stringify(manifest, null, 2));
}

function loadManifest(runId) {
  return JSON.parse(readFileSync(manifestPath(runId), 'utf8'));
}

/**
 * Agent-id-based idempotent teardown. instantiateVenture() has no transaction/rollback
 * and agent_relationships/tool_access_grants carry no venture_id column, so teardown is
 * keyed by the CREATED AGENT IDs captured in the manifest, not venture_id. Safe to
 * re-run: every delete targets specific ids, a second pass is a clean no-op.
 */
export async function teardownRun(supabase, manifest) {
  const agentIds = [manifest.ceoAgentId, ...Object.values(manifest.vpAgentIds || {}), ...(manifest.crewAgentIds || [])].filter(Boolean);
  const results = {};

  if (agentIds.length > 0) {
    results.tool_access_grants = await supabase.from('tool_access_grants').delete().in('agent_id', agentIds);
    results.agent_relationships_from = await supabase.from('agent_relationships').delete().in('from_agent_id', agentIds);
    results.agent_relationships_to = await supabase.from('agent_relationships').delete().in('to_agent_id', agentIds);
    results.agent_messages_to = await supabase.from('agent_messages').delete().in('to_agent_id', agentIds);
    results.agent_messages_from = await supabase.from('agent_messages').delete().in('from_agent_id', agentIds);
    results.agent_budget_logs = await supabase.from('agent_budget_logs').delete().in('agent_id', agentIds);
    results.agent_budgets = await supabase.from('agent_budgets').delete().in('agent_id', agentIds);
    results.agent_predictions = await supabase.from('agent_predictions').delete().in('agent_id', agentIds);
    results.agent_memory_stores = await supabase.from('agent_memory_stores').delete().in('agent_id', agentIds);
    results.agent_registry = await supabase.from('agent_registry').delete().in('id', agentIds);
  }
  if (manifest.ventureId) {
    results.ventures = await supabase.from('ventures').delete().eq('id', manifest.ventureId);
  }

  const errors = Object.entries(results).filter(([, r]) => r?.error).map(([k, r]) => `${k}: ${r.error.message}`);
  if (errors.length > 0) throw new Error(`teardown errors: ${errors.join('; ')}`);
  return { agentIdsRemoved: agentIds.length, ventureRemoved: Boolean(manifest.ventureId) };
}

export async function runSeededThread({ supabase, runId }) {
  const manifest = { runId, ceoAgentId: null, vpAgentIds: {}, crewAgentIds: [], ventureId: null, predictionId: null };

  try {
    // Step 1: fixture venture (reuses s20-fixture.mjs's row contract; is_demo=true trips
    // the canonical isFixtureVenture discriminant). NOTE: VentureFactory._generateVentureCode()
    // truncates the normalized venture name to 20 chars for the hierarchy_path (which carries a
    // UNIQUE constraint) — the shared FIXTURE_NAME_PREFIX ('TEST-HARNESS-S20-') alone consumes 17
    // of those 20, so a name built as `${PREFIX}${runId}` collides on every run regardless of
    // runId (discovered via a real Playwright multi-project collision on
    // agent_registry_hierarchy_path_unique — 5 browser projects racing the same deterministic
    // hierarchy_path). A truncated-timestamp suffix isn't safe either (only ~2 digits of a 13-digit
    // ms timestamp survive truncation, ~100s granularity) — use real randomness within the first
    // 20 normalized chars instead.
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const ventureRow = { ...buildFixtureVentureRow(`SD-A-${runId}`), name: `TEST-${uniqueSuffix}-SD-A` };
    const { data: venture, error: ventureError } = await supabase.from('ventures').insert(ventureRow).select('id, name').single();
    if (ventureError) throw new Error(`fixture venture insert failed: ${ventureError.message}`);
    manifest.ventureId = venture.id;
    console.log(`[1/6] fixture venture created: ${venture.id} (${venture.name})`);

    // Step 2: instantiate the org via the EXISTING, unmodified factory path.
    const factory = new VentureFactory(supabase);
    const result = await factory.instantiateVenture({
      ventureName: venture.name,
      ventureId: venture.id,
      totalTokenBudget: 25000,
    });
    manifest.ceoAgentId = result.ceo_agent_id;
    manifest.vpAgentIds = result.executive_agent_ids;
    manifest.crewAgentIds = Object.values(result.crew_agent_ids || {}).flat();
    console.log(`[2/6] org instantiated: CEO ${manifest.ceoAgentId}, ${Object.keys(manifest.vpAgentIds).length} VPs, ${manifest.crewAgentIds.length} crew`);

    // Step 3: fixture-scope every created agent as a POST-CREATION compensating control —
    // zero diff inside VentureFactory._createAgent()/_grantTools() (Child B territory).
    // agent_registry has no metadata column; the fixture discriminant is status='standby'
    // (agent_registry_status_check allows only active/paused/terminated/standby — 'standby'
    // is the closest fit for "created but never actionable") plus the existing venture_id FK
    // to a fixture venture (is_demo=true) every created agent already carries.
    const allAgentIds = [manifest.ceoAgentId, ...Object.values(manifest.vpAgentIds), ...manifest.crewAgentIds];
    const { error: scopeError } = await supabase
      .from('agent_registry')
      .update({ status: 'standby' })
      .in('id', allAgentIds);
    if (scopeError) throw new Error(`fixture-scoping update failed: ${scopeError.message}`);

    // Read-after-write: Supabase .update() can silently no-op under RLS/CHECK edge cases
    // (RCA finding on this SD, sub_agent_execution_results). Verify every row actually landed.
    const { data: verifyRows, error: verifyError } = await supabase
      .from('agent_registry')
      .select('id, status')
      .in('id', allAgentIds);
    if (verifyError) throw new Error(`fixture-scoping verification query failed: ${verifyError.message}`);
    const notScoped = (verifyRows || []).filter((r) => r.status !== 'standby');
    if (notScoped.length > 0) throw new Error(`fixture-scoping silently failed on ${notScoped.length} row(s): ${notScoped.map((r) => r.id).join(', ')}`);
    console.log(`[3/6] fixture-scoped ${allAgentIds.length} agents (status=standby, verified via read-after-write; venture_id already points at is_demo=true fixture venture)`);

    // Step 4: claim the real startup agent_messages row via the existing runtime.
    const runtime = new VentureCEORuntime(supabase, manifest.ceoAgentId);
    const claimed = await runtime.claimNextMessage();
    if (!claimed) throw new Error('claimNextMessage() returned null — no startup message found to claim');
    console.log(`[4/6] message claimed: ${claimed.id} (${claimed.message_type})`);

    // Step 5: seed one real agent_budgets row, then make one real budget-checked decision.
    const { error: budgetSeedError } = await supabase.from('agent_budgets').insert({
      agent_id: manifest.ceoAgentId,
      daily_limit: 10000,
      daily_consumed: 0,
      monthly_limit: 100000,
      monthly_consumed: 0,
    });
    if (budgetSeedError) throw new Error(`budget seed failed: ${budgetSeedError.message}`);
    const budgetManager = new BudgetManager(supabase, manifest.ceoAgentId, manifest.ventureId);
    await budgetManager.checkBudgetOrThrow('verify_first_seeded_decision', 500);
    console.log('[5/6] budget-checked decision made (real check against seeded agent_budgets row)');

    // Step 6: leave one real calibration row.
    const truthLayer = new TruthLayer(supabase, manifest.ceoAgentId, manifest.ventureId);
    const prediction = await truthLayer.logPrediction({
      prediction_type: 'operational',
      statement: 'SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A verify-first seeded thread completes end-to-end without error',
      confidence: 0.9,
      timeframe: 'immediate',
      metadata: { run_id: runId, source: 'spine-verify-first-run' },
    });
    manifest.predictionId = prediction.id;
    await truthLayer.logOutcome(prediction.id, {
      was_correct: true,
      evidence: 'seeded thread reached this point without throwing',
      metadata: { run_id: runId },
    });
    console.log(`[6/6] calibration row written: ${manifest.predictionId}`);

    return manifest;
  } finally {
    saveManifest(runId, manifest);
  }
}

async function main() {
  const [, , cmd, arg] = process.argv;
  const supabase = makeClient();

  if (cmd === 'run') {
    const noTeardown = process.argv.includes('--no-teardown');
    const runId = `${Date.now()}`;
    console.log(`\n=== SD-A verify-first seeded thread (runId=${runId}) ===\n`);
    const manifest = await runSeededThread({ supabase, runId });
    console.log('\nSUCCESS. Manifest:', JSON.stringify(manifest, null, 2));
    if (!noTeardown) {
      console.log('\nTearing down...');
      const teardownResult = await teardownRun(supabase, manifest);
      console.log('Teardown complete:', teardownResult);
    } else {
      console.log(`\nSkipped teardown (--no-teardown). Run: node scripts/harness/spine-verify-first-run.mjs teardown ${runId}`);
    }
    process.exit(0);
  }

  if (cmd === 'teardown') {
    if (!arg) {
      console.error('Usage: node scripts/harness/spine-verify-first-run.mjs teardown <runId>');
      process.exit(1);
    }
    const manifest = loadManifest(arg);
    const result = await teardownRun(supabase, manifest);
    console.log('Teardown complete:', result);
    process.exit(0);
  }

  console.error('Usage: node scripts/harness/spine-verify-first-run.mjs run [--no-teardown] | teardown <runId>');
  process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('\nFAILED:', e.message);
    process.exit(1);
  });
}
