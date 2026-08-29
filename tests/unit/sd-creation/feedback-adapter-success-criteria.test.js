/**
 * SD-FDBK-ENH-MINT-PIPELINE-WRITES-001 (FR-3): createFromFeedback previously never attempted
 * to derive success_criteria from the feedback body -- it always fell through SILENTLY to
 * pipeline.js's buildDefaultSuccessCriteria() generic 3-line template. This now attempts
 * structured extraction from feedback.description first. DEFAULT is warn-and-proceed (not
 * refuse) when nothing is derivable -- measured during EXEC that most feedback bodies are
 * unstructured prose, so refuse-by-default broke this codebase's own existing feedback-adapter
 * tests and would block routine automated feedback ingestion fleet-wide. --strict-criteria
 * opts INTO the harder refusal for supervised/interactive use.
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
  generateSDKey: vi.fn().mockResolvedValue('SD-FDBK-FIX-TEST-003'),
}));

vi.mock('../../../scripts/modules/triage-gate.js', () => ({
  runTriageGate: vi.fn().mockResolvedValue({ tier: 3, estimatedLoc: 200 }),
}));

vi.mock('../../../lib/eva/feedback-premise-adapter.js', () => ({
  checkFeedbackPremiseLiveness: vi.fn().mockResolvedValue({ status: 'LIVE' }),
  logForceLivenessOverride: vi.fn(),
}));

const createSDMock = vi.fn().mockImplementation(async (input) => ({ id: 'sd-uuid-3', ...input }));
vi.mock('../../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: vi.fn().mockResolvedValue(null),
  mapPriority: (p) => p || 'medium',
  createSDOrThrow: createSDMock,
}));

const { createFromFeedback } = await import('../../../lib/sd-creation/source-adapters/feedback.js');

const rowWith = (id, description) => ({
  id,
  title: 'Test feedback title',
  description,
  type: 'issue',
  priority: 'medium',
  source_type: 'manual_capture',
  source_application: 'EHG_Engineer',
  strategic_directive_id: null,
  resolution_sd_id: null,
});

describe('createFromFeedback success_criteria derivation (FR-3)', () => {
  it('derives real criteria from a structured Success Criteria section in the body', async () => {
    feedbackRow = rowWith('fb-sc-1', '## Success Criteria\n1. Real criterion one\n2. Real criterion two\n');
    createSDMock.mockClear();

    const result = await createFromFeedback('fb-sc-1');

    expect(result.ok).not.toBe(false);
    const [sdInput] = createSDMock.mock.calls[0];
    expect(sdInput.success_criteria).toEqual(['Real criterion one', 'Real criterion two']);
  });

  it('DEFAULT (no --strict-criteria): warns and proceeds with the generic template when nothing is derivable', async () => {
    feedbackRow = rowWith('fb-sc-2', 'Just some unstructured prose describing a bug, no headings at all.');
    createSDMock.mockClear();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await createFromFeedback('fb-sc-2');

    expect(result.ok).not.toBe(false);
    expect(createSDMock).toHaveBeenCalledTimes(1);
    const [sdInput] = createSDMock.mock.calls[0];
    // null lets createSD's own buildDefaultSuccessCriteria() fallback apply -- this adapter
    // does not reimplement the template, it only decides whether to reach it.
    expect(sdInput.success_criteria).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/no structured list found/i));
    warnSpy.mockRestore();
  });

  it('--strict-criteria: refuses loudly (never a silent template) when the body has no structured criteria', async () => {
    feedbackRow = rowWith('fb-sc-3', 'Unstructured prose, no criteria list.');
    createSDMock.mockClear();

    const result = await createFromFeedback('fb-sc-3', { strictCriteria: true });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no derivable success_criteria/i);
    expect(createSDMock).not.toHaveBeenCalled();
  });
});
