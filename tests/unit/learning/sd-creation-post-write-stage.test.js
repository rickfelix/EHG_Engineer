/**
 * QF-20260912-150 (escalated to SD-LEO-FIX-POST-WRITE-HANG-001), FR-1: the 3 post-write steps
 * in executeSDCreationWorkflow (tagSourceItems, createDecisionRecord, the learning_decisions
 * status update) ran with no timeout bound, so a hang in any of them -- AFTER the SD row had
 * already landed in strategic_directives_v2 -- blocked the caller past its external kill
 * timeout with no output. These tests inject a never-resolving promise at each of the 3 sites
 * and assert the workflow still returns success with the SD already created, matching the
 * exact diagnostic pattern already proven generically for lib/completion/post-write-stage.js
 * (tests/unit/post-write-stage.test.js).
 *
 * Mocking strategy: createSDFromLearning's own core write (the strategic_directives_v2 insert)
 * must always succeed quickly in every test -- it is explicitly OUT of scope for this hang
 * fix (the row has already landed by the time any of these 3 steps run). generateSDId is
 * mocked (classification.js) so the core write never depends on live DB state to form a key.
 * tagSourceItems' own internal supabase calls (issue_patterns/protocol_improvement_queue) are
 * controlled via the shared fake client's per-table hang switch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../scripts/modules/learning/classification.js', () => ({
  generateSDId: vi.fn(async () => 'SD-TEST-POST-WRITE-001'),
  classifyComplexity: vi.fn(() => 'full-sd'),
  checkExistingAssignments: vi.fn(async () => []),
}));

let hangTables = new Set();

// QF-20260912-150: runPostWriteStage calls fnPromise.catch() directly (lib/completion/
// post-write-stage.js:54), so the fake chain must be a genuine thenable with a real .catch --
// not just a .then method -- or the wrapped call throws before the race even starts. Backing
// every chain by a real Promise and delegating then/catch/finally to it satisfies that.
function chain(table) {
  const hang = hangTables.has(table);
  const real = hang ? new Promise(() => {}) : Promise.resolve({ data: null, error: null });
  const self = {
    insert: () => self,
    update: () => self,
    select: () => self,
    eq: () => self,
    ilike: () => self,
    single: () => (hang ? new Promise(() => {}) : Promise.resolve({
      data: { id: 'sd-uuid-1', sd_key: 'SD-TEST-POST-WRITE-001', title: 'Test SD', status: 'draft' },
      error: null,
    })),
    // Awaiting `self` directly (no trailing .single()) goes through here -- the shape
    // tagSourceItems' and the learning_decisions update's terminal .eq() calls rely on.
    then: (...args) => real.then(...args),
    catch: (...args) => real.catch(...args),
    finally: (...args) => real.finally(...args),
  };
  return self;
}

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: (table) => chain(table) }),
}));

const { executeSDCreationWorkflow } = await import('../../../scripts/modules/learning/sd-creation.js');

const REVIEWED_CONTEXT = {
  patterns: [{ id: 'PAT-1', pattern_id: 'PAT-1', issue_summary: 'fixture pattern' }],
  improvements: [],
  sub_agent_learnings: [],
  feedback_learnings: [],
  feedback_patterns: [],
};
const DECISIONS = { 'PAT-1': { status: 'APPROVED' } };

describe('executeSDCreationWorkflow post-write steps (QF-20260912-150 FR-1)', () => {
  beforeEach(() => {
    hangTables = new Set();
    // runPostWriteStage's default timeout is 45s -- far longer than this test should wait.
    // The source has no per-call override, only the env var, so drive it down here.
    process.env.POST_WRITE_STAGE_TIMEOUT_MS = '50';
  });

  it('TS-1: a hung tagSourceItems (issue_patterns update) never blocks the workflow from returning success', async () => {
    hangTables.add('issue_patterns');
    const createDecisionRecord = vi.fn(async () => ({ id: 'LOCAL-1' }));

    const result = await executeSDCreationWorkflow(REVIEWED_CONTEXT, DECISIONS, createDecisionRecord, { skipLeadValidation: true });

    expect(result.success).toBe(true);
    expect(result.sd_key).toBe('SD-TEST-POST-WRITE-001');
  });

  it('TS-2: a hung createDecisionRecord never blocks the workflow from returning success', async () => {
    const createDecisionRecord = vi.fn(() => new Promise(() => {})); // injected 3rd param, never resolves

    const result = await executeSDCreationWorkflow(REVIEWED_CONTEXT, DECISIONS, createDecisionRecord, { skipLeadValidation: true });

    expect(result.success).toBe(true);
    expect(result.sd_key).toBe('SD-TEST-POST-WRITE-001');
    // decisionRecord fell back to {id: null} on timeout, so the learning_decisions update
    // (gated on decisionRecord.id) never ran -- decision_id reflects the safe fallback.
    expect(result.decision_id).toBeNull();
  });

  it('TS-3: a hung learning_decisions status update never blocks the workflow from returning success', async () => {
    hangTables.add('learning_decisions');
    const createDecisionRecord = vi.fn(async () => ({ id: 'real-decision-id' }));

    const result = await executeSDCreationWorkflow(REVIEWED_CONTEXT, DECISIONS, createDecisionRecord, { skipLeadValidation: true });

    expect(result.success).toBe(true);
    expect(result.sd_key).toBe('SD-TEST-POST-WRITE-001');
  });

  it('TS-9 (control): all 3 steps resolve normally -- full success path, no timeouts', async () => {
    const createDecisionRecord = vi.fn(async () => ({ id: 'real-decision-id' }));

    const result = await executeSDCreationWorkflow(REVIEWED_CONTEXT, DECISIONS, createDecisionRecord, { skipLeadValidation: true });

    expect(result.success).toBe(true);
    expect(result.sd_key).toBe('SD-TEST-POST-WRITE-001');
    expect(result.decision_id).toBe('real-decision-id');
    expect(result.tagged_count).toBeGreaterThanOrEqual(0);
  });
});
