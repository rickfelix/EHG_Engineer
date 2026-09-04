/**
 * QF-20260903-529 — lib/sub-agents/retro/index.js execute() batch-queried
 * sd_phase_handoffs, sub_agent_execution_results and sd_scope_deliverables filtered
 * on whatever identifier it was handed, even though those columns are always UUIDs.
 * Called with an sd_key (the documented form -- every usage example in
 * execute-subagent.js passes a key), the filter matched zero rows with no error, and
 * the run then narrated the empty deliverables result as "(legacy SD)" -- a cause the
 * code never established. Pins: the batch queries use the UUID gatherSDMetadata
 * already resolved (sdData.id), not the raw identifier, regardless of which form the
 * caller used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn().mockResolvedValue({}),
}));

const RESOLVED_UUID = 'a1b2c3d4-e5f6-4789-9abc-def012345678';

vi.mock('../../../lib/sub-agents/retro/db-operations.js', () => ({
  checkExistingRetrospective: vi.fn().mockResolvedValue({ found: false, needs_enhancement: false }),
  gatherSDMetadata: vi.fn().mockResolvedValue({
    found: true,
    id: RESOLVED_UUID,
    sd_key: 'SD-TEST-KEY-001',
    title: 'Test SD',
    status: 'active',
  }),
  fetchPrdForSd: vi.fn().mockResolvedValue({ found: false }),
  storeRetrospective: vi.fn(),
  enhanceRetrospective: vi.fn(),
  insertFeedbackForFutureEnhancements: vi.fn(),
  resolveFeedbackForCompletedSD: vi.fn(),
}));

let capturedFilters = null;
vi.mock('../../../lib/utils/batch-db-operations.js', () => ({
  batchQuery: vi.fn((configs) => {
    capturedFilters = configs.map((c) => ({ name: c.name, filters: c.filters }));
    // Short-circuit the rest of execute() -- outer try/catch handles this; the test
    // only needs the filters batchQuery was actually called with, captured above.
    throw new Error('test-short-circuit-after-capture');
  }),
}));

vi.mock('../../../scripts/lib/test-evidence-ingest.js', () => ({
  getLatestTestEvidence: vi.fn(),
  getStoryTestCoverage: vi.fn(),
}));

describe('QF-20260903-529: retro execute() resolves sd_key to UUID before batch-querying', () => {
  beforeEach(() => {
    capturedFilters = null;
    vi.resetModules();
  });

  it('filters sd_phase_handoffs / sub_agent_execution_results / sd_scope_deliverables on the resolved UUID, not the raw sd_key', async () => {
    const { execute } = await import('../../../lib/sub-agents/retro/index.js');

    await execute('SD-TEST-KEY-001', {}, {});

    expect(capturedFilters).not.toBeNull();
    const byName = Object.fromEntries(capturedFilters.map((c) => [c.name, c.filters]));
    expect(byName.handoffs).toEqual({ sd_id: RESOLVED_UUID });
    expect(byName.sub_agent_results).toEqual({ sd_id: RESOLVED_UUID });
    expect(byName.deliverables).toEqual({ sd_id: RESOLVED_UUID });
    // Never the raw key -- the exact bug: a key-form filter against a UUID column
    // silently matches zero rows with no error.
    expect(byName.handoffs.sd_id).not.toBe('SD-TEST-KEY-001');
  });

  it('filters on the same resolved UUID when execute() is called with the UUID form directly', async () => {
    const { execute } = await import('../../../lib/sub-agents/retro/index.js');

    await execute(RESOLVED_UUID, {}, {});

    const byName = Object.fromEntries(capturedFilters.map((c) => [c.name, c.filters]));
    expect(byName.deliverables).toEqual({ sd_id: RESOLVED_UUID });
  });
});
