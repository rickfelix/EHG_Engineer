/**
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-6
 *
 * BASELINE + canonical-truth tests for lib/eva/stage-governance.js.
 *
 * Asserts the canonical post-refactor behavior (sets derived from work_type).
 * SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: the reader now reads the unified
 * `venture_stages` superset in a SINGLE query. Module had zero existing coverage
 * before this SD — these tests establish that coverage AND verify the
 * refactor (FR-2) produces correct classifications.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const STAGE_FIXTURE = [
  { stage_number: 1,  stage_name: 'Draft Idea',                  stage_key: 'draft',         gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 2,  stage_name: 'AI Review',                   stage_key: 'ai_review',     gate_type: 'none',      review_mode: 'auto',   work_type: 'automated_check', chunk: null, description: null },
  { stage_number: 3,  stage_name: 'Comprehensive Validation',    stage_key: 'comp_valid',    gate_type: 'kill',      review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 4,  stage_name: 'Competitive Intelligence',    stage_key: 'comp_intel',    gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 5,  stage_name: 'Profitability Forecasting',   stage_key: 'profit_fore',   gate_type: 'kill',      review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 6,  stage_name: 'Risk Evaluation',             stage_key: 'risk_eval',     gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 7,  stage_name: 'Revenue Architecture',        stage_key: 'revenue',       gate_type: 'none',      review_mode: 'review', work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 8,  stage_name: 'Business Model Canvas',       stage_key: 'bmc',           gate_type: 'none',      review_mode: 'review', work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 9,  stage_name: 'Exit Strategy',               stage_key: 'exit',          gate_type: 'none',      review_mode: 'review', work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 10, stage_name: 'Customer & Brand Foundation', stage_key: 'brand',         gate_type: 'promotion', review_mode: 'auto',   work_type: 'sd_required',     chunk: null, description: null },
  { stage_number: 11, stage_name: 'Naming & Visual Identity',    stage_key: 'naming',        gate_type: 'none',      review_mode: 'review', work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 12, stage_name: 'GTM & Sales Strategy',        stage_key: 'gtm',           gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 13, stage_name: 'Product Roadmap',             stage_key: 'roadmap',       gate_type: 'kill',      review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 14, stage_name: 'Technical Architecture',      stage_key: 'arch',          gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 15, stage_name: 'Design Studio',               stage_key: 'design',        gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 16, stage_name: 'Financial Projections',       stage_key: 'fin_proj',      gate_type: 'promotion', review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 17, stage_name: 'Blueprint Review',            stage_key: 'blueprint',     gate_type: 'promotion', review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 18, stage_name: 'Marketing Copy Studio',       stage_key: 'marketing',     gate_type: 'promotion', review_mode: 'auto',   work_type: 'sd_required',     chunk: null, description: null },
  { stage_number: 19, stage_name: 'Build in Replit',             stage_key: 'build',         gate_type: 'promotion', review_mode: 'auto',   work_type: 'sd_required',     chunk: null, description: null },
  { stage_number: 20, stage_name: 'Code Quality Gate',           stage_key: 'code_qual',     gate_type: 'none',      review_mode: 'auto',   work_type: 'automated_check', chunk: null, description: null },
  { stage_number: 21, stage_name: 'Visual Assets',               stage_key: 'visuals',       gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 22, stage_name: 'Distribution Setup',          stage_key: 'distrib',       gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 23, stage_name: 'Launch Readiness',            stage_key: 'launch_ready',  gate_type: 'kill',      review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 24, stage_name: 'Go Live & Announce',          stage_key: 'go_live',       gate_type: 'promotion', review_mode: 'auto',   work_type: 'decision_gate',   chunk: null, description: null },
  { stage_number: 25, stage_name: 'Post-Launch Review',          stage_key: 'post_launch',   gate_type: 'promotion', review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
  { stage_number: 26, stage_name: 'Growth Playbook',             stage_key: 'growth',        gate_type: 'none',      review_mode: 'auto',   work_type: 'artifact_only',   chunk: null, description: null },
];

// SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: _readFresh now ALSO reads
// leo_feature_flags (flag_key=HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED) on every
// refresh. This baseline file predates that flag and never asserts on
// is_high_consequence/highConsequenceStages, so default the flag to enabled — its
// value is irrelevant to every assertion here, but the table-aware branch is
// required so `.eq(...).maybeSingle()` resolves instead of throwing on a
// table-name-blind mock.
function makeMockSupabase(rows = STAGE_FIXTURE) {
  return {
    from: (table) => {
      if (table === 'leo_feature_flags') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { is_enabled: true }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    },
    channel: () => ({
      on: function () { return this; },
      subscribe: function (_cb) { return this; },
      unsubscribe: () => undefined,
    }),
  };
}

beforeEach(async () => {
  vi.resetModules();
});

// SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: _readFresh now ALSO reads leo_feature_flags
// (flag_key=HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED) on every refresh. Wraps a table-blind
// `from` implementation so raw ad-hoc mocks below resolve that read (defaulted ENABLED —
// irrelevant to every assertion in this file) instead of throwing on a missing `.eq()`.
function withLeoFeatureFlags(realFrom) {
  return (table) => {
    if (table === 'leo_feature_flags') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { is_enabled: true }, error: null }) }) }) };
    }
    return realFrom(table);
  };
}

describe('stage-governance — canonical sets derived from work_type', () => {
  it('killStages contains only decision_gate stages with gate_type=kill (S3, S5, S13, S23)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    expect([...gov.killStages].sort((a, b) => a - b)).toEqual([3, 5, 13, 23]);
  });

  it('promotionStages contains decision_gate stages with gate_type=promotion (S16, S17, S24) — EXCLUDES sd_required stages', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    expect([...gov.promotionStages].sort((a, b) => a - b)).toEqual([16, 17, 24]);
    // CRITICAL: sd_required stages must NOT be in promotionStages
    expect(gov.promotionStages.has(10)).toBe(false);
    expect(gov.promotionStages.has(18)).toBe(false);
    expect(gov.promotionStages.has(19)).toBe(false);
  });

  it('reviewStages contains stages with review_mode=review (S7, S8, S9, S11)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    expect([...gov.reviewStages].sort((a, b) => a - b)).toEqual([7, 8, 9, 11]);
  });

  it('blockingStages is union of killStages + promotionStages (S3, S5, S13, S16, S17, S23, S24)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    expect([...gov.blockingStages].sort((a, b) => a - b)).toEqual([3, 5, 13, 16, 17, 23, 24]);
  });

  it('sd_required stages are gated separately — never auto-classified as kill/promotion/review', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    for (const stageNum of [10, 18, 19]) {
      expect(gov.isKill(stageNum)).toBe(false);
      expect(gov.isPromotion(stageNum)).toBe(false);
      expect(gov.isReview(stageNum)).toBe(false);
      expect(gov.isBlocking(stageNum)).toBe(false);
    }
  });

  it('automated_check stages (S2, S20) are not in any decision set', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    for (const stageNum of [2, 20]) {
      expect(gov.isKill(stageNum)).toBe(false);
      expect(gov.isPromotion(stageNum)).toBe(false);
      expect(gov.isReview(stageNum)).toBe(false);
      expect(gov.isBlocking(stageNum)).toBe(false);
    }
  });

  it('getStage returns full row metadata for a known stage', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    const s10 = gov.getStage(10);
    expect(s10).toBeTruthy();
    expect(s10.stage_number).toBe(10);
    expect(s10.work_type).toBe('sd_required');
  });

  it('getStage returns null for unknown stages', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    expect(gov.getStage(99)).toBeNull();
  });
});

describe('stage-governance — defensive behavior', () => {
  it('empty data yields empty sets (degrades safely)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase([]));
    expect(gov.killStages.size).toBe(0);
    expect(gov.promotionStages.size).toBe(0);
    expect(gov.reviewStages.size).toBe(0);
    expect(gov.blockingStages.size).toBe(0);
    expect(gov.isKill(10)).toBe(false);
  });

  it('null data yields empty sets', async () => {
    const sb = {
      from: withLeoFeatureFlags(() => ({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: null }),
        }),
      })),
      channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, unsubscribe: () => undefined }),
    };
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(sb);
    expect(gov.killStages.size).toBe(0);
    expect(gov.promotionStages.size).toBe(0);
  });

  it('row with conflicting work_type and gate_type — work_type wins (canonical)', async () => {
    // S10: canonical says sd_required (should NOT be in promotionStages)
    // even though stage_config.gate_type='promotion' for it
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const gov = await mod.getStageGovernance(makeMockSupabase());
    // S10 has gate_type=promotion AND work_type=sd_required in fixture
    // promotionStages MUST exclude S10 because work_type is canonical
    expect(gov.promotionStages.has(10)).toBe(false);
  });
});

describe('stage-governance — cache behavior', () => {
  it('second call within TTL returns cached data (no DB refetch)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    let callCount = 0;
    // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: ONE venture_stages read per fresh fetch.
    const sb = {
      from: withLeoFeatureFlags(() => ({
        select: () => ({
          order: () => {
            callCount++;
            return Promise.resolve({ data: STAGE_FIXTURE, error: null });
          },
        }),
      })),
      channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, unsubscribe: () => undefined }),
    };
    await mod.getStageGovernance(sb);
    // After first call: 1 DB query (venture_stages) — the leo_feature_flags read is a
    // separate table-keyed branch, not counted by this venture_stages-scoped callCount.
    expect(callCount).toBe(1);
    await mod.getStageGovernance(sb);
    // Second call cached: still 1 (no additional queries)
    expect(callCount).toBe(1);
  });

  it('_resetCacheForTest forces fresh fetch on next call', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    let callCount = 0;
    const sb = {
      from: withLeoFeatureFlags(() => ({
        select: () => ({
          order: () => {
            callCount++;
            return Promise.resolve({ data: STAGE_FIXTURE, error: null });
          },
        }),
      })),
      channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, unsubscribe: () => undefined }),
    };
    await mod.getStageGovernance(sb);
    expect(callCount).toBe(1);
    mod._resetCacheForTest();
    await mod.getStageGovernance(sb);
    // Reset forces 1 more query
    expect(callCount).toBe(2);
  });
});

describe('stage-governance — Realtime channel teardown safety (QF-20260701-709)', () => {
  // QF-20260701-709: SD-FDBK-FIX-EVA-STAGE-GOVERNANCE-001's original fix (calling
  // supabase.removeChannel() instead of channel.unsubscribe()) was INEFFECTIVE --
  // removeChannel() also calls unsubscribe() internally, which under CI's
  // no-reachable-Realtime-server condition synchronously re-fires this same status
  // callback via phoenix's Channel.leave(), reproducing the identical
  // RangeError: Maximum call stack size exceeded. The correct fix drops the local
  // reference only and calls NEITHER unsubscribe() NOR removeChannel() from inside
  // the callback. These tests use a mock whose unsubscribe()/removeChannel() WOULD
  // recursively re-invoke the callback (reproducing the real vendored-client
  // behavior) and assert neither is ever called -- proving the recursion never gets
  // a chance to start.
  function makeMockSupabaseWithRecursiveTeardown(rows = STAGE_FIXTURE) {
    let capturedStatusCallback = null;
    let unsubscribeCallCount = 0;
    let removeChannelCallCount = 0;
    const channelMock = {
      on: function () { return this; },
      subscribe: function (cb) { capturedStatusCallback = cb; return this; },
      unsubscribe: function () {
        unsubscribeCallCount++;
        if (unsubscribeCallCount > 100) throw new Error('unsubscribe recursion guard tripped -- test itself would overflow');
        capturedStatusCallback?.('CLOSED'); // simulates phoenix's synchronous Channel.leave() re-firing CLOSED
      },
    };
    const sb = {
      from: withLeoFeatureFlags(() => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) })),
      channel: () => channelMock,
      removeChannel: function () {
        removeChannelCallCount++;
        if (removeChannelCallCount > 100) throw new Error('removeChannel recursion guard tripped -- test itself would overflow');
        channelMock.unsubscribe(); // real RealtimeClient.removeChannel() calls channel.unsubscribe() internally
      },
    };
    return {
      sb,
      getStatusCallback: () => capturedStatusCallback,
      getUnsubscribeCallCount: () => unsubscribeCallCount,
      getRemoveChannelCallCount: () => removeChannelCallCount,
    };
  }

  it('CHANNEL_ERROR/CLOSED/TIMED_OUT status drops the reference WITHOUT calling unsubscribe() or removeChannel() (both would recurse)', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockSupabaseWithRecursiveTeardown();

    await mod.getStageGovernance(sb);
    const statusCallback = getStatusCallback();
    expect(statusCallback).toBeTypeOf('function');

    expect(() => statusCallback('CHANNEL_ERROR')).not.toThrow();

    expect(getUnsubscribeCallCount()).toBe(0);
    expect(getRemoveChannelCallCount()).toBe(0);
  });

  it('a genuinely re-entrant CLOSED re-fire (simulating phoenix Channel.leave()) does not throw and calls no teardown method', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockSupabaseWithRecursiveTeardown();

    await mod.getStageGovernance(sb);
    const statusCallback = getStatusCallback();

    // Simulate the real recursion trigger directly: the callback fires CLOSED,
    // and (as phoenix would) immediately fires CLOSED again before the first
    // invocation returns.
    expect(() => {
      statusCallback('CLOSED');
      statusCallback('CLOSED');
    }).not.toThrow();

    expect(getUnsubscribeCallCount()).toBe(0);
    expect(getRemoveChannelCallCount()).toBe(0);
  });

  it('a channel whose unsubscribe()/removeChannel() recursively re-invoke the status callback would overflow the stack if either were called -- proves neither is', async () => {
    const mod = await import('../../../lib/eva/stage-governance.js');
    mod._resetCacheForTest();
    const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockSupabaseWithRecursiveTeardown();

    await mod.getStageGovernance(sb);
    const statusCallback = getStatusCallback();

    expect(() => statusCallback('TIMED_OUT')).not.toThrow();
    expect(getUnsubscribeCallCount()).toBe(0);
    expect(getRemoveChannelCallCount()).toBe(0);
  });
});
