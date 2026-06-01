/**
 * SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 / FR-2 — S20PauseController.check() fails CLOSED on the
 * zero-SD branch for leo_bridge ventures.
 *
 * Before this SD the `orchestratorSDs.length === 0` branch always returned
 * { blocked:false, status:'no_sds' } (fail-OPEN), so a leo_bridge venture whose build never
 * produced any SDs (unapproved vision / failed bridge) sailed through S20 to the reality gate
 * (RCA a14ff698: DataDistill). The new branch (lib/eva/s20-pause-controller.js ~77) resolves the
 * build model from ventures.build_model and:
 *   - build_model resolves to 'leo_bridge' → { blocked:true,  status:'no_sds_leo_bridge',
 *                                              data:{ total_sds:0, build_model:'leo_bridge' } }
 *   - any other (genuinely legacy) model    → { blocked:false, status:'no_sds',
 *                                              data:{ total_sds:0 } }  (backward compatible)
 *
 * RESOLVER NUANCE (lib/eva/bridge/resolve-build-model.js): an UNSET build_model (null) DEFAULTS to
 * 'leo_bridge'. So the only way to land on the backward-compatible 'no_sds' pass is an EXPLICIT
 * non-leo_bridge opt-out — build_model='seeded_repo'. A null build_model now fails closed. These
 * tests pin that real behavior (a null-passes assumption would be wrong post-default-flip).
 *
 * Test strategy (per the implementation): construct a real S20PauseController with a chainable
 * supabase mock that supplies ventures.build_model, then stub the surrounding plumbing so check()
 * reaches the zero-SD branch deterministically:
 *   - _loadPauseState → null            (no prior pause state; not force_advanced / not COMPLETE)
 *   - _getBuildMethod → 'claude_code'   (≠ 'replit_agent' so it does not take the replit fast-path)
 *   - _findLinkedOrchestratorSDs → []   (the zero-SD condition under test)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { S20PauseController } from '../../../lib/eva/s20-pause-controller.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Minimal chainable supabase mock. The only read check() makes after the stubbed methods is
 * `ventures.select('build_model').eq('id', ventureId).maybeSingle()`, so we answer that.
 *
 * @param {string|null} buildModel  ventures.build_model row value (null ⇒ no row returned)
 */
function createMockSupabase(buildModel) {
  const calls = { from: [], eq: [] };
  const from = vi.fn((table) => {
    calls.from.push(table);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col, val) => { calls.eq.push({ table, col, val }); return chain; }),
      maybeSingle: vi.fn(() => {
        if (table === 'ventures') {
          return Promise.resolve({ data: buildModel === null ? null : { build_model: buildModel }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return chain;
  });
  return { from, _calls: calls };
}

/**
 * Build a controller whose plumbing deterministically routes check() into the zero-SD branch.
 * @param {string|null} buildModel
 */
function makeController(buildModel) {
  const supabase = createMockSupabase(buildModel);
  const controller = new S20PauseController(supabase, logger);
  controller._loadPauseState = vi.fn().mockResolvedValue(null);
  controller._getBuildMethod = vi.fn().mockResolvedValue('claude_code'); // not replit_agent
  controller._findLinkedOrchestratorSDs = vi.fn().mockResolvedValue([]); // ZERO SDs
  // Guard against accidental persistence if a later branch were reached.
  controller._savePauseState = vi.fn().mockResolvedValue(undefined);
  return { controller, supabase };
}

describe('SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 S20PauseController.check() — zero-SD fail-closed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('build_model=leo_bridge + 0 SDs → blocked:true, status:no_sds_leo_bridge, data flags the gap', async () => {
    const { controller } = makeController('leo_bridge');

    const result = await controller.check('v-bridge-zero');

    expect(result.blocked).toBe(true);
    expect(result.status).toBe('no_sds_leo_bridge');
    expect(result.data).toEqual({ total_sds: 0, build_model: 'leo_bridge' });
  });

  it('build_model=seeded_repo + 0 SDs → blocked:false, status:no_sds (backward compatible legacy pass)', async () => {
    const { controller } = makeController('seeded_repo');

    const result = await controller.check('v-seeded-zero');

    expect(result.blocked).toBe(false);
    expect(result.status).toBe('no_sds');
    expect(result.data).toEqual({ total_sds: 0 });
  });

  it('build_model UNSET (null) + 0 SDs → fails CLOSED (resolver defaults unset to leo_bridge)', async () => {
    const { controller } = makeController(null);

    const result = await controller.check('v-null-zero');

    // Post default-flip, an unset build_model resolves to leo_bridge → must block, not pass.
    expect(result.blocked).toBe(true);
    expect(result.status).toBe('no_sds_leo_bridge');
    expect(result.data).toEqual({ total_sds: 0, build_model: 'leo_bridge' });
  });

  it('replit_agent build method short-circuits to the legacy replit path before the zero-SD branch', async () => {
    const { controller, supabase } = makeController('leo_bridge');
    controller._getBuildMethod = vi.fn().mockResolvedValue('replit_agent');

    const result = await controller.check('v-replit');

    expect(result.blocked).toBe(false);
    expect(result.status).toBe('replit_path');
    // It returned before ever resolving the venture build_model for the zero-SD branch.
    expect(controller._findLinkedOrchestratorSDs).not.toHaveBeenCalled();
    expect(supabase._calls.from.filter((t) => t === 'ventures')).toHaveLength(0);
  });

  it('does NOT persist any pause state on the zero-SD branch (no savePauseState write)', async () => {
    const { controller } = makeController('leo_bridge');

    await controller.check('v-no-persist');

    expect(controller._savePauseState).not.toHaveBeenCalled();
  });
});
