/**
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-5): capture the FROZEN PRE-REFACTOR snapshot.
 * Run ONCE against pre-refactor code; output committed to
 * tests/fixtures/stage-worker-pre-refactor.snapshot.json BEFORE any hook body moves
 * (anti-tautology: the snapshot is evidence of the old code's behavior, not the new).
 *
 * Scenarios deliberately steer DETERMINISTIC paths (skip/idempotent/early-return) that
 * exercise the hooks' query sequences without reaching dynamic-import side effects
 * (imagen renderer, doc-gen LLM). Deeper paths are covered by the existing behavioral
 * suites (s11-brand-grounded, etc.) which also run pre/post.
 */
import { writeFileSync } from 'node:fs';
import StageExecutionWorker from '../../lib/eva/stage-execution-worker.js';
import { makeRecordingSupabase, makeRecordingLogger } from './stage-worker-io-recorder.js';

const V = '00000000-0000-4000-8000-000000000001';

// Scenario definitions: name -> { hook, responses }
export const SCENARIOS = {
  // S11 Logo: venture not past S7 -> viability-gate skip (1 query, 1 log)
  s11_logo_pre_s7_skip: {
    stage: 11, method: '_postStageHook_S11_LogoGeneration',
    responses: { 'venture_stage_work|select': { data: [], error: null } },
  },
  // S11 Logo: past S7, logo already exists -> idempotency skip (2 queries)
  s11_logo_idempotent_skip: {
    stage: 11, method: '_postStageHook_S11_LogoGeneration',
    responses: {
      'venture_stage_work|select': { data: [{ lifecycle_stage: 7 }], error: null },
      'venture_artifacts|select': { data: [{ id: 'a1' }], error: null },
    },
  },
  // S11 Logo: past S7, no logo, but no logoSpec in the brand artifact -> spec-missing skip
  s11_logo_no_spec_skip: {
    stage: 11, method: '_postStageHook_S11_LogoGeneration',
    responses: {
      'venture_stage_work|select': { data: [{ lifecycle_stage: 7 }], error: null },
      'venture_artifacts|select': [
        { data: [], error: null },
        { data: { artifact_data: {} }, error: null },
      ],
    },
  },
  // S17 DocGen steered to its earliest deterministic exit (responses default to null data).
  s17_docgen_default_path: {
    stage: 17, method: '_postStageHook_S17_DocGen',
    responses: {},
  },
  // S17 SeedDraftVision default path.
  s17_seed_draft_vision_default_path: {
    stage: 17, method: '_postStageHook_S17_SeedDraftVision',
    responses: {},
  },
};

export async function runScenario(name, invoke) {
  const spec = SCENARIOS[name];
  const { supabase, log } = makeRecordingSupabase(spec.responses);
  const logger = makeRecordingLogger();
  // Prototype-based instantiation: constructor wiring (health server, intervals) is
  // irrelevant to hook behavior and must not run in tests.
  const worker = Object.create(StageExecutionWorker.prototype);
  worker._supabase = supabase;
  worker._logger = logger;
  worker._ensureS17StrategySelected = async () => { log.push({ kind: 'call', fn: 'ensureS17StrategySelected' }); };
  try {
    await invoke(worker, spec, V);
  } catch (e) {
    log.push({ kind: 'throw', message: String(e && e.message || e).slice(0, 120) });
  }
  return { io: log, loggerLines: logger.lines };
}

const results = {};
for (const name of Object.keys(SCENARIOS)) {
  results[name] = await runScenario(name, (worker, spec, v) => worker[spec.method](v));
}
writeFileSync('tests/fixtures/stage-worker-pre-refactor.snapshot.json', JSON.stringify(results, null, 2));
console.log('snapshot captured:', Object.keys(results).join(', '));
for (const [k, v] of Object.entries(results)) console.log(' ', k, '->', v.io.length, 'io events');
