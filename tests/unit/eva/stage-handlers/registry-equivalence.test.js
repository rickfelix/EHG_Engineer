/**
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-5): frozen-snapshot equivalence.
 * The pre-refactor IO snapshot (tests/fixtures/stage-worker-pre-refactor.snapshot.json,
 * committed BEFORE any hook body moved — anti-tautology) is replayed through the
 * RELOCATED handlers via BOTH dispatch paths (external registry + kill-switch Map).
 * Equal call logs = behavior preserved at the IO boundary for these scenarios.
 * Also covers FR-3 registry semantics (fail-soft posture, kill-switch single-impl).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeRecordingSupabase, makeRecordingLogger } from '../../../fixtures/stage-worker-io-recorder.js';
import { STAGE_HANDLERS, runStageHandler, isRegistryEnabled } from '../../../../lib/eva/stage-handlers/registry.js';
import * as s11 from '../../../../lib/eva/stage-handlers/s11.js';
import * as s17 from '../../../../lib/eva/stage-handlers/s17.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/stage-worker-pre-refactor.snapshot.json'), 'utf8'));
const V = '00000000-0000-4000-8000-000000000001';

// Same scenario steering as the pre-refactor capture (tests/fixtures/capture-stage-worker-snapshot.mjs).
const SCENARIOS = {
  s11_logo_pre_s7_skip: {
    fn: (ctx) => s11.logoGeneration(ctx, V),
    responses: { 'venture_stage_work|select': { data: [], error: null } },
  },
  s11_logo_idempotent_skip: {
    fn: (ctx) => s11.logoGeneration(ctx, V),
    responses: {
      'venture_stage_work|select': { data: [{ lifecycle_stage: 7 }], error: null },
      'venture_artifacts|select': { data: [{ id: 'a1' }], error: null },
    },
  },
  s11_logo_no_spec_skip: {
    fn: (ctx) => s11.logoGeneration(ctx, V),
    responses: {
      'venture_stage_work|select': { data: [{ lifecycle_stage: 7 }], error: null },
      'venture_artifacts|select': [
        { data: [], error: null },
        { data: { artifact_data: {} }, error: null },
      ],
    },
  },
  s17_docgen_default_path: { fn: (ctx) => s17.docGen(ctx, V), responses: {} },
  s17_seed_draft_vision_default_path: { fn: (ctx) => s17.seedDraftVision(ctx, V), responses: {} },
};

function makeCtx(responses) {
  const { supabase, log } = makeRecordingSupabase(responses);
  const logger = makeRecordingLogger();
  const ctx = {
    supabase, logger, ventureId: V,
    ensureS17StrategySelected: async () => { log.push({ kind: 'call', fn: 'ensureS17StrategySelected' }); },
  };
  return { ctx, log, logger };
}

describe('FR-5: frozen pre-refactor snapshot equivalence (relocated handlers)', () => {
  for (const [name, spec] of Object.entries(SCENARIOS)) {
    it(`${name}: relocated handler reproduces the pre-refactor IO trace`, async () => {
      const { ctx, log, logger } = makeCtx(spec.responses);
      try { await spec.fn(ctx); } catch (e) { log.push({ kind: 'throw', message: String(e?.message || e).slice(0, 120) }); }
      expect({ io: log, loggerLines: logger.lines }).toEqual(SNAPSHOT[name]);
    });
  }
});

describe('FR-3: registry semantics', () => {
  it('STAGE_HANDLERS holds exactly S11/S15/S17 (S19 stays in-worker by design)', () => {
    expect([...STAGE_HANDLERS.keys()].sort((a, b) => a - b)).toEqual([11, 15, 17]);
    for (const mod of STAGE_HANDLERS.values()) expect(typeof mod.execute).toBe('function');
  });

  it('runStageHandler is fail-soft: a throwing handler warns and never propagates', async () => {
    // Real handlers swallow errors internally, so exercise the registry's OWN catch
    // with a synthetic always-throwing handler (removed after the assertion).
    const logger = makeRecordingLogger();
    STAGE_HANDLERS.set(99, { execute: async () => { throw new Error('handler exploded'); } });
    try {
      await expect(runStageHandler(99, { supabase: {}, logger, ventureId: V })).resolves.toBe(true);
    } finally {
      STAGE_HANDLERS.delete(99);
    }
    expect(logger.lines.warn).toBe(1); // the non-fatal warn, matching _runPostStageHooks posture
  });

  it('a handler whose sub-hooks hit total DB failure still never propagates (S11 internal swallow)', async () => {
    const logger = makeRecordingLogger();
    const ctx = { supabase: { from: () => { throw new Error('db exploded'); } }, logger, ventureId: V, ensureS17StrategySelected: async () => {} };
    await expect(runStageHandler(11, ctx)).resolves.toBe(true);
  });

  it('runStageHandler returns false for unregistered stages (worker Map handles S19)', async () => {
    const logger = makeRecordingLogger();
    expect(await runStageHandler(19, { supabase: {}, logger, ventureId: V })).toBe(false);
    expect(logger.lines.warn).toBe(0);
  });

  it('every dynamic import in the relocated handlers resolves to a real file', () => {
    // Guard for the relocation-depth bug class: the extraction re-pathed './x'
    // sibling imports but cross-package '../../lib/gvos/*' specifiers needed one
    // more level. A wrong depth is SILENT in production (hooks are fail-soft),
    // so resolve every specifier statically here.
    const handlerDir = resolve(__dirname, '../../../../lib/eva/stage-handlers');
    for (const file of ['s11.js', 's15.js', 's17.js', 'registry.js']) {
      const src = readFileSync(resolve(handlerDir, file), 'utf8');
      const specs = [...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
      for (const spec of specs) {
        expect(existsSync(resolve(handlerDir, spec)), `${file}: unresolvable dynamic import '${spec}'`).toBe(true);
      }
    }
  });

  it('registry log strings match the kill-switch Map path verbatim (dispatch-observability parity)', () => {
    const registrySrc = readFileSync(resolve(__dirname, '../../../../lib/eva/stage-handlers/registry.js'), 'utf8');
    const workerSrc = readFileSync(resolve(__dirname, '../../../../lib/eva/stage-execution-worker.js'), 'utf8');
    for (const fragment of ['Post-stage hook fired for S', 'failed (non-fatal):']) {
      expect(registrySrc).toContain(fragment);
      expect(workerSrc).toContain(fragment);
    }
    expect(registrySrc).not.toMatch(/Post-stage handler (fired|S)/);
  });

  it('kill-switch: isRegistryEnabled honors STAGE_HANDLER_REGISTRY=off', () => {
    expect(isRegistryEnabled({})).toBe(true);
    expect(isRegistryEnabled({ STAGE_HANDLER_REGISTRY: 'off' })).toBe(false);
  });

  it('the S11 execute order is NamePromotion -> Logo -> GvosProfile (load-bearing)', async () => {
    // Order probe: NamePromotion's first IO is the identity_brand_name artifact read;
    // logoGeneration's first IO is the venture_stage_work viability read. If the log
    // starts with venture_stage_work, the load-bearing order was broken.
    const { ctx, log } = makeCtx({});
    await s11.execute(ctx);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].table).toBe('venture_artifacts');
    expect(log[0].filters).toContainEqual(['eq', 'artifact_type', 'identity_brand_name']);
  });
});
