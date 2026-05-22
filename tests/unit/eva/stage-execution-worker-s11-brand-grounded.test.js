/**
 * Tests for S11 brand-grounding post-stage hooks.
 * SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001
 *
 *   FR-1: _postStageHook_S11_NamePromotion — promote identity_brand_name
 *         decision.selectedName into ventures.name with a provenance guard that
 *         never overwrites a deliberately-set / chairman-edited name.
 *   FR-3: _postStageHook_S11_LogoGeneration — read logoSpec from the canonical
 *         identity_brand_name artifact (artifact_data.logoSpec), falling back to
 *         venture_stage_work.stage_data.logoSpec for legacy ventures.
 *
 * Both hooks use a mocked this._supabase. renderLogo + writeArtifact are mocked
 * so the logo hook never makes a network/DB call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the renderer + persistence used by the logo hook (dynamic imports).
vi.mock('../../../lib/eva/bridge/imagen-logo-renderer.js', () => ({
  renderLogo: vi.fn(),
}));
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('artifact-id'),
}));

import { renderLogo } from '../../../lib/eva/bridge/imagen-logo-renderer.js';
import { writeArtifact } from '../../../lib/eva/artifact-persistence-service.js';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/**
 * Per-table queued-response Supabase mock.
 *
 * `responses` maps a table name to an array of results consumed FIFO, one per
 * terminal call. A terminal call is awaiting the chain itself (e.g. after
 * `.limit()`), or calling `.maybeSingle()` / `.single()`. Each builder chain is
 * also a thenable so `await supabase.from(t)....limit(1)` resolves to the next
 * queued result. `.update(...)` records the payload and resolves to the next
 * queued result (default { error: null }).
 */
function createQueuedSupabase(responses = {}) {
  const queues = {};
  for (const [t, arr] of Object.entries(responses)) queues[t] = [...arr];
  const updateCalls = {}; // table -> array of update payloads

  function nextResult(table) {
    const q = queues[table];
    if (q && q.length) return q.shift();
    return { data: null, error: null };
  }

  function makeChain(table) {
    const chain = {};
    const passthrough = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'limit'];
    for (const m of passthrough) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
    chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
    chain.update = vi.fn((payload) => {
      (updateCalls[table] = updateCalls[table] || []).push(payload);
      const result = nextResult(table);
      // .update(...).eq(...) — return a thenable that also has .eq()
      const upd = {
        eq: vi.fn(() => Promise.resolve(result)),
        then: (resolve) => resolve(result),
      };
      return upd;
    });
    chain.insert = vi.fn(() => ({ then: (resolve) => resolve(nextResult(table)) }));
    // Make the chain itself awaitable (terminal after .limit() etc.)
    chain.then = (resolve) => resolve(nextResult(table));
    return chain;
  }

  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example/logo.png' } })),
    })),
    createBucket: vi.fn().mockResolvedValue({ error: null }),
  };

  return {
    from: vi.fn((table) => makeChain(table)),
    storage,
    _updateCalls: updateCalls,
    _queues: queues,
  };
}

function makeWorker(supabase, logger) {
  return new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
}

const VID = 'venture-uuid-abc';

describe('FR-1: _postStageHook_S11_NamePromotion (provenance-guarded name promotion)', () => {
  let logger;
  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('promotes selectedName -> ventures.name on first run (no marker) and stamps provenance', async () => {
    const supabase = createQueuedSupabase({
      // 1) identity_brand_name artifact lookup
      venture_artifacts: [
        { data: { artifact_data: { decision: { selectedName: 'Stratum' } } }, error: null },
      ],
      // 2) ventures load (current auto-derived creation name, no marker), 3) update result
      ventures: [
        { data: { id: VID, name: 'DesignVerse AI', metadata: { stage_zero: { db_archetype: 'saas' } } }, error: null },
        { error: null },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_NamePromotion(VID);

    const updates = supabase._updateCalls.ventures || [];
    expect(updates).toHaveLength(1);
    expect(updates[0].name).toBe('Stratum');
    // Provenance marker stamped, preserving prior name + existing metadata
    expect(updates[0].metadata.brand_name_promotion.promoted_name).toBe('Stratum');
    expect(updates[0].metadata.brand_name_promotion.prior_name).toBe('DesignVerse AI');
    expect(updates[0].metadata.brand_name_promotion.sd).toBe('SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001');
    expect(updates[0].metadata.stage_zero).toEqual({ db_archetype: 'saas' });
  });

  it('NEVER overwrites a deliberately-edited / chairman-set name on an S11 re-run (mandatory regression)', async () => {
    // Chairman renamed the venture AFTER our promotion: current name !== marker.promoted_name.
    const supabase = createQueuedSupabase({
      venture_artifacts: [
        { data: { artifact_data: { decision: { selectedName: 'Stratum' } } }, error: null },
      ],
      ventures: [
        {
          data: {
            id: VID,
            name: 'Chairman Chosen Name', // human edit after promotion
            metadata: { brand_name_promotion: { promoted_name: 'Stratum', prior_name: 'DesignVerse AI' } },
          },
          error: null,
        },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_NamePromotion(VID);

    // No update must occur — the chairman edit is sticky forever.
    expect(supabase._updateCalls.ventures || []).toHaveLength(0);
  });

  it('is idempotent: no write when name already promoted to the selected value', async () => {
    const supabase = createQueuedSupabase({
      venture_artifacts: [
        { data: { artifact_data: { decision: { selectedName: 'Stratum' } } }, error: null },
      ],
      ventures: [
        {
          data: {
            id: VID,
            name: 'Stratum', // already equals selectedName + marker
            metadata: { brand_name_promotion: { promoted_name: 'Stratum', prior_name: 'DesignVerse AI' } },
          },
          error: null,
        },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_NamePromotion(VID);

    expect(supabase._updateCalls.ventures || []).toHaveLength(0);
  });

  it('safe refresh: updates to a changed selectedName when current name still equals our last promotion', async () => {
    const supabase = createQueuedSupabase({
      venture_artifacts: [
        { data: { artifact_data: { decision: { selectedName: 'StratumV2' } } }, error: null },
      ],
      ventures: [
        {
          data: {
            id: VID,
            name: 'Stratum', // equals marker.promoted_name -> still ours, safe to refresh
            metadata: { brand_name_promotion: { promoted_name: 'Stratum', prior_name: 'DesignVerse AI' } },
          },
          error: null,
        },
        { error: null },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_NamePromotion(VID);

    const updates = supabase._updateCalls.ventures || [];
    expect(updates).toHaveLength(1);
    expect(updates[0].name).toBe('StratumV2');
    expect(updates[0].metadata.brand_name_promotion.prior_name).toBe('Stratum');
  });

  it('skips when artifact has no decision.selectedName', async () => {
    const supabase = createQueuedSupabase({
      venture_artifacts: [
        { data: { artifact_data: { decision: {} } }, error: null },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_NamePromotion(VID);

    expect(supabase._updateCalls.ventures || []).toHaveLength(0);
    // ventures table should not even be queried for an update
  });

  it('error path is non-throwing (ventures load error is swallowed)', async () => {
    const supabase = createQueuedSupabase({
      venture_artifacts: [
        { data: { artifact_data: { decision: { selectedName: 'Stratum' } } }, error: null },
      ],
      ventures: [
        { data: null, error: { message: 'connection reset' } },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await expect(worker._postStageHook_S11_NamePromotion(VID)).resolves.toBeUndefined();
    expect(supabase._updateCalls.ventures || []).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not throw when supabase itself throws (outer try/catch)', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('boom'); }),
      storage: {},
    };
    const worker = makeWorker(supabase, logger);
    await expect(worker._postStageHook_S11_NamePromotion(VID)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[S11-NamePromotion] hook errored (non-fatal):',
      'boom'
    );
  });
});

describe('FR-3: _postStageHook_S11_LogoGeneration (logoSpec source)', () => {
  let logger;
  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    renderLogo.mockResolvedValue({ buffer: Buffer.from('png'), mimeType: 'image/png' });
  });

  it('reads logoSpec from the identity_brand_name artifact (NOT stage_data)', async () => {
    const logoSpec = { iconConcept: 'mountain', primaryColor: '#2563EB', textTreatment: 'Stratum' };
    const supabase = createQueuedSupabase({
      // 1) viability gate (stages >= 7), 2) idempotency (no existing logo)
      venture_stage_work: [
        { data: [{ lifecycle_stage: 11 }], error: null }, // viability gate
      ],
      venture_artifacts: [
        { data: [], error: null }, // idempotency: no identity_logo_image
        { data: { artifact_data: { logoSpec } }, error: null }, // identity_brand_name lookup
      ],
      ventures: [
        { data: { name: 'Stratum' }, error: null }, // venture name fetch
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_LogoGeneration(VID);

    expect(renderLogo).toHaveBeenCalledTimes(1);
    expect(renderLogo).toHaveBeenCalledWith(logoSpec, expect.objectContaining({ ventureName: 'Stratum' }));
    expect(writeArtifact).toHaveBeenCalledTimes(1);
    const wrote = writeArtifact.mock.calls[0][1];
    expect(wrote.artifactType).toBe('identity_logo_image');
    expect(wrote.artifactData.logoSpec).toEqual(logoSpec);
  });

  it('falls back to venture_stage_work.stage_data.logoSpec when no artifact logoSpec', async () => {
    const legacySpec = { iconConcept: 'legacy-icon', primaryColor: '#000000' };
    const supabase = createQueuedSupabase({
      venture_stage_work: [
        { data: [{ lifecycle_stage: 11 }], error: null }, // viability gate
        { data: { stage_data: { logoSpec: legacySpec } }, error: null }, // legacy fallback
      ],
      venture_artifacts: [
        { data: [], error: null }, // idempotency
        { data: { artifact_data: {} }, error: null }, // identity_brand_name has NO logoSpec
      ],
      ventures: [
        { data: { name: 'LegacyCo' }, error: null },
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_LogoGeneration(VID);

    expect(renderLogo).toHaveBeenCalledTimes(1);
    expect(renderLogo).toHaveBeenCalledWith(legacySpec, expect.objectContaining({ ventureName: 'LegacyCo' }));
  });

  it('skips (no render) when neither artifact nor stage_data has a logoSpec', async () => {
    const supabase = createQueuedSupabase({
      venture_stage_work: [
        { data: [{ lifecycle_stage: 11 }], error: null }, // viability gate
        { data: { stage_data: {} }, error: null }, // legacy fallback empty
      ],
      venture_artifacts: [
        { data: [], error: null }, // idempotency
        { data: { artifact_data: {} }, error: null }, // no logoSpec
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_LogoGeneration(VID);

    expect(renderLogo).not.toHaveBeenCalled();
    expect(writeArtifact).not.toHaveBeenCalled();
  });

  it('idempotency: skips when identity_logo_image already exists', async () => {
    const supabase = createQueuedSupabase({
      venture_stage_work: [
        { data: [{ lifecycle_stage: 11 }], error: null }, // viability gate
      ],
      venture_artifacts: [
        { data: [{ id: 'existing-logo' }], error: null }, // idempotency hit
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_LogoGeneration(VID);

    expect(renderLogo).not.toHaveBeenCalled();
    expect(writeArtifact).not.toHaveBeenCalled();
  });

  it('viability gate: skips when venture has not passed S7', async () => {
    const supabase = createQueuedSupabase({
      venture_stage_work: [
        { data: [], error: null }, // no stages >= 7
      ],
    });
    const worker = makeWorker(supabase, logger);

    await worker._postStageHook_S11_LogoGeneration(VID);

    expect(renderLogo).not.toHaveBeenCalled();
  });
});
