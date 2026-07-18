/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): uniformity audit (CLAUDE_EXEC.md
 * "Testability-Aware Implementation") — confirms EVERY one of the 5 mockable
 * non-roadmap-item source adapters (feedback/qf/learn/uat/child) actually wires
 * classifyPlanLinkage() into the metadata it hands to createSD(), not just that
 * the classifier itself is correct in isolation (covered by
 * plan-linkage-classifier.test.js). plan.js is verified structurally (heavier
 * file-parsing/archiving I/O makes a full mock low-value here) — see the
 * dedicated structural test below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const parentFixture = {
  id: 'parent-uuid-1',
  sd_key: 'SD-EHG-PRODUCT-PARENT-001',
  title: 'Parent SD',
  sd_type: 'feature',
  priority: 'medium',
  metadata: { plan_linkage: { linked: true, wave_id: 'w1', wave_title: 'Wave 1', rung: 'V1' } },
};

const fixturesByTable = {
  feedback: { id: 'fb-1', title: 'FB title', description: 'FB desc', type: 'issue', priority: 'high', source_type: 'manual_capture' },
  quick_fixes: { id: 'QF-20260101-001', title: 'QF title', description: 'QF desc', type: 'bug', severity: 'high', estimated_loc: 20, target_application: 'EHG', claiming_session_id: null },
  retrospectives: { id: 'pat-1', lesson_type: 'bug', key_lesson: 'Lesson', actionable_improvements: ['do X'] },
  uat_test_results: { id: 'test-1', test_name: 'Test', notes: 'notes', status: 'failed' },
};

function makeBuilder(table) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    in: () => builder,
    update: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve({ data: table === 'strategic_directives_v2' ? parentFixture : fixturesByTable[table], error: null }),
    maybeSingle: () => Promise.resolve({ data: table === 'strategic_directives_v2' ? parentFixture : fixturesByTable[table], error: null }),
    // bare-await callers (child.js's existingChildren select, qf.js's update) never call
    // .single()/.maybeSingle() — make the builder itself thenable so `await` resolves.
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return builder;
}

vi.mock('../../../lib/sd-creation/context.js', () => ({
  supabase: { from: (table) => makeBuilder(table), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-TEST-GENERATED-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-EHG-PRODUCT-PARENT-001A'),
  deriveChildIndex: vi.fn().mockReturnValue({ index: 0, bumped: false, takenIndexes: [] }),
}));

vi.mock('../../../scripts/modules/triage-gate.js', () => ({
  runTriageGate: vi.fn().mockResolvedValue({ tier: 3, estimatedLoc: 200 }),
}));

vi.mock('../../../lib/eva/feedback-premise-adapter.js', () => ({
  checkFeedbackPremiseLiveness: vi.fn().mockResolvedValue({ status: 'LIVE' }),
  logForceLivenessOverride: vi.fn(),
}));

vi.mock('../../../lib/eva/stage-zero/data-pollers/retry.js', () => ({
  withRetry: async (fn) => fn(),
}));

const createSDMock = vi.fn().mockImplementation(async (input) => ({ id: 'sd-uuid-new', ...input }));
vi.mock('../../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: vi.fn().mockResolvedValue(null),
  mapPriority: (p) => p || 'medium',
  inheritStrategicFields: vi.fn().mockReturnValue({}),
  createSDOrThrow: createSDMock,
}));

beforeEach(() => {
  createSDMock.mockClear();
});

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): every mockable adapter stamps metadata.plan_linkage', () => {
  it('createFromFeedback', async () => {
    const { createFromFeedback } = await import('../../../lib/sd-creation/source-adapters/feedback.js');
    await createFromFeedback('fb-1');
    const [sdInput] = createSDMock.mock.calls.at(-1);
    expect(sdInput.metadata.plan_linkage).toBeDefined();
    expect(sdInput.metadata.plan_linkage.linked).toBe(false);
    expect(sdInput.metadata.plan_linkage.unlinked_reason).toBeTruthy();
  });

  it('createFromQF', async () => {
    const { createFromQF } = await import('../../../lib/sd-creation/source-adapters/qf.js');
    await createFromQF('QF-20260101-001');
    const [sdInput] = createSDMock.mock.calls.at(-1);
    expect(sdInput.metadata.plan_linkage).toBeDefined();
    expect(sdInput.metadata.plan_linkage.linked).toBe(false);
  });

  it('createFromLearn', async () => {
    const { createFromLearn } = await import('../../../lib/sd-creation/source-adapters/learn.js');
    await createFromLearn('pat-1');
    const [sdInput] = createSDMock.mock.calls.at(-1);
    expect(sdInput.metadata.plan_linkage).toBeDefined();
  });

  it('createFromUAT', async () => {
    const { createFromUAT } = await import('../../../lib/sd-creation/source-adapters/uat.js');
    await createFromUAT('test-1');
    const [sdInput] = createSDMock.mock.calls.at(-1);
    expect(sdInput.metadata.plan_linkage).toBeDefined();
  });

  it('createChild under a wave-linked parent inherits linked=true (not just "defined")', async () => {
    const { createChild } = await import('../../../lib/sd-creation/source-adapters/child.js');
    await createChild('SD-EHG-PRODUCT-PARENT-001', 0, {});
    const [sdInput] = createSDMock.mock.calls.at(-1);
    expect(sdInput.metadata.plan_linkage).toBeDefined();
    expect(sdInput.metadata.plan_linkage.linked).toBe(true);
    expect(sdInput.metadata.plan_linkage.wave_id).toBe('w1');
  });
});

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): plan.js structural wiring check', () => {
  it('createOptions.metadata calls classifyPlanLinkage with sdKey and overrides.waveDisposition', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../lib/sd-creation/source-adapters/plan.js', import.meta.url), 'utf8');
    expect(src).toMatch(/import\s*\{\s*classifyPlanLinkage\s*\}\s*from\s*'\.\.\/plan-linkage-classifier\.js'/);
    expect(src).toMatch(/plan_linkage:\s*classifyPlanLinkage\(\{\s*sdKey,\s*waveDisposition:\s*overrides\.waveDisposition/);
  });
});
