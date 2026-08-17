/**
 * QF-20260817-550: --target-repos was parsed for --from-plan/--child/--from-roadmap-item
 * (plan.js:300) but createFromFeedback() never destructured it from options, so it was
 * silently swallowed on the --from-feedback route -- governed cross-repo metadata that
 * PR_MERGE_VERIFICATION's computeReposForSD() relies on never landed, with no error or
 * warning at creation time.
 */
import { describe, it, expect, vi } from 'vitest';

let feedbackRow;

function makeQueryBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve({ data: feedbackRow, error: null }),
  };
  return builder;
}

vi.mock('../../../lib/sd-creation/context.js', () => ({
  supabase: { from: () => makeQueryBuilder() },
}));

vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-FDBK-FIX-TEST-002'),
}));

vi.mock('../../../scripts/modules/triage-gate.js', () => ({
  runTriageGate: vi.fn().mockResolvedValue({ tier: 3, estimatedLoc: 200 }),
}));

vi.mock('../../../lib/eva/feedback-premise-adapter.js', () => ({
  checkFeedbackPremiseLiveness: vi.fn().mockResolvedValue({ status: 'LIVE' }),
  logForceLivenessOverride: vi.fn(),
}));

const createSDMock = vi.fn().mockImplementation(async (input) => ({ id: 'sd-uuid-2', ...input }));
vi.mock('../../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: vi.fn().mockResolvedValue(null),
  mapPriority: (p) => p || 'medium',
  createSDOrThrow: createSDMock,
}));

const { createFromFeedback } = await import('../../../lib/sd-creation/source-adapters/feedback.js');

const trustedRow = (id) => ({
  id,
  title: 'Trusted internal title',
  description: 'Trusted internal description',
  type: 'issue',
  priority: 'medium',
  source_type: 'manual_capture',
  source_application: 'EHG_Engineer',
  strategic_directive_id: null,
  resolution_sd_id: null,
});

describe('createFromFeedback target_repos wiring (QF-20260817-550)', () => {
  it('stamps metadata.target_repos when options.targetRepos is supplied', async () => {
    feedbackRow = trustedRow('fb-repos-1');
    createSDMock.mockClear();

    await createFromFeedback('fb-repos-1', { targetRepos: ['EHG', 'EHG_Engineer'] });

    const [sdInput] = createSDMock.mock.calls[0];
    expect(sdInput.metadata.target_repos).toEqual(['EHG', 'EHG_Engineer']);
  });

  it('omits metadata.target_repos entirely (not null/undefined key) when not supplied', async () => {
    feedbackRow = trustedRow('fb-repos-2');
    createSDMock.mockClear();

    await createFromFeedback('fb-repos-2');

    const [sdInput] = createSDMock.mock.calls[0];
    expect('target_repos' in sdInput.metadata).toBe(false);
  });

  it('omits metadata.target_repos when options.targetRepos is explicitly null', async () => {
    feedbackRow = trustedRow('fb-repos-3');
    createSDMock.mockClear();

    await createFromFeedback('fb-repos-3', { targetRepos: null });

    const [sdInput] = createSDMock.mock.calls[0];
    expect('target_repos' in sdInput.metadata).toBe(false);
  });
});
