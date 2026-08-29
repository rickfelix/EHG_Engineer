/**
 * SD-FDBK-ENH-MINT-PIPELINE-WRITES-001 (FR-2): createFromPlan previously fell through to a
 * hardcoded 3-line generic template ('All implementation items from plan are complete', ...)
 * when a plan had NEITHER a real Success Criteria section NOR derivable checklist steps
 * ('- [ ] text' task items -- extractSteps(), not a '## Steps' heading).
 * This is now a loud, structured refusal instead — matching this file's sanctioned
 * exit-to-return convention ({ok:false, error, exitCode}).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/sd-creation/context.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            not: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-FDBK-FIX-PLAN-TEST-001'),
}));

vi.mock('../../../scripts/modules/plan-archiver.js', () => ({
  findMostRecentPlan: vi.fn(),
  archivePlanFile: vi.fn().mockResolvedValue({ archivedPath: '/tmp/archived-plan.md' }),
  readPlanFile: vi.fn(),
  getDisplayPath: (p) => p,
}));

vi.mock('../../../lib/sd-creation/plan-linkage-classifier.js', () => ({
  classifyPlanLinkage: () => ({ linked: false }),
}));

const createSDMock = vi.fn().mockImplementation(async (input) => ({ id: 'sd-uuid-plan-1', ...input }));
vi.mock('../../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: vi.fn().mockResolvedValue(null),
  createSDOrThrow: createSDMock,
}));

const { createFromPlan } = await import('../../../lib/sd-creation/source-adapters/plan.js');
const { readPlanFile } = await import('../../../scripts/modules/plan-archiver.js');

describe('createFromPlan success_criteria refusal (FR-2)', () => {
  it('refuses (structured {ok:false}) when the plan has NEITHER Success Criteria NOR Steps', async () => {
    readPlanFile.mockReturnValue('# My Plan\n\n## Summary\n\nJust a summary paragraph, nothing else.\n');
    createSDMock.mockClear();

    const result = await createFromPlan('/tmp/no-criteria-plan.md', true, {});

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no derivable success_criteria/i);
    expect(createSDMock).not.toHaveBeenCalled();
  });

  it('mints normally when the plan has a real (numbered) Success Criteria section', async () => {
    readPlanFile.mockReturnValue('# My Plan\n\n## Success Criteria\n1. First real criterion\n2. Second real criterion\n');
    createSDMock.mockClear();

    const result = await createFromPlan('/tmp/numbered-criteria-plan.md', true, {});

    expect(result.ok).not.toBe(false);
    const [sdInput] = createSDMock.mock.calls[0];
    expect(sdInput.success_criteria).toEqual(['First real criterion', 'Second real criterion']);
  });

  it('mints normally (step-derived) when Success Criteria is absent but checklist steps exist — not a refusal case', async () => {
    // extractSteps() matches markdown task-list items ('- [ ] text'), not a heading.
    readPlanFile.mockReturnValue('# My Plan\n\n## Tasks\n- [ ] Do the first thing\n- [ ] Do the second thing\n');
    createSDMock.mockClear();

    const result = await createFromPlan('/tmp/steps-only-plan.md', true, {});

    expect(result.ok).not.toBe(false);
    expect(createSDMock).toHaveBeenCalledTimes(1);
  });
});
