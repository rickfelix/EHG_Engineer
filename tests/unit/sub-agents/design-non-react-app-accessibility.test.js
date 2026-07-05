/**
 * QF-20260704-180 — DESIGN gate false-blocks non-React apps.
 *
 * Two defects, both witnessed via 2 independent adversarial code reviews + e2e suite
 * against SD-LEO-FEAT-MARKETLENS-CORE-PRODUCT-001 (Express + server-rendered HTML,
 * legitimately zero React components):
 *
 * 1. checkAccessibility (lib/sub-agents/design/checks.js) hardcodes `src/components`
 *    for its standalone design-sub-agent CLI invocation. When that directory does not
 *    exist, the CLI produces no parseable "Design Score: X/100" line, so the score
 *    silently defaults to 0 and `issues` is reported as 1 — a false accessibility
 *    violation with zero real evidence. Fix: detect the missing directory up front and
 *    return a neutral skipped result instead of scoring against a path that cannot exist.
 *
 * 2. checkResponsiveDesign flags `missing_breakpoints: 1` whenever no responsive
 *    Tailwind classes are found, even when total_components is 0 (no src/components at
 *    all) — there is nothing to be "non-responsive". Fix: zero components can never be
 *    flagged as missing breakpoints.
 *
 * A third, separately-witnessed defect (non-deterministic dead-end flagging from an
 * unsorted user_stories DB fetch) is covered in design-workflow-user-stories-order.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// checks.js uses `promisify(exec)`. Attach util.promisify.custom to the mocked exec so
// promisify(exec) returns our directly-controllable async fn — mirrors the established
// pattern in design-getgitdifffiles-changeset.test.js.
const execAsyncImpl = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => {
  const { promisify } = require('node:util');
  const fn = vi.fn();
  fn[promisify.custom] = execAsyncImpl;
  return fn;
});
vi.mock('child_process', () => ({ exec: execMock }));

const existsSyncMock = vi.hoisted(() => vi.fn());
vi.mock('fs', async (importActual) => {
  const actual = await importActual();
  return { ...actual, default: { ...actual.default, existsSync: existsSyncMock }, existsSync: existsSyncMock };
});

const { hasReactComponentsDir, checkAccessibility, checkResponsiveDesign } =
  await import('../../../lib/sub-agents/design/checks.js');

describe('QF-20260704-180 — hasReactComponentsDir', () => {
  beforeEach(() => existsSyncMock.mockReset());

  it('reports true when src/components exists', () => {
    existsSyncMock.mockReturnValue(true);
    expect(hasReactComponentsDir('/repo')).toBe(true);
  });

  it('reports false for a non-React app with no src/components', () => {
    existsSyncMock.mockReturnValue(false);
    expect(hasReactComponentsDir('/repo')).toBe(false);
  });
});

describe('QF-20260704-180 — checkAccessibility skips non-React apps instead of false-blocking', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    execAsyncImpl.mockReset();
  });

  it('returns a neutral skipped result and never shells out when src/components is absent', async () => {
    existsSyncMock.mockReturnValue(false);
    const result = await checkAccessibility('/repo', 'SD-XXX', {});
    expect(result).toEqual({
      checked: false,
      issues: 0,
      skipped: true,
      reason: 'no src/components directory (non-React app)',
      affected_files: [],
      issue_details: [],
    });
    expect(execAsyncImpl).not.toHaveBeenCalled();
  });

  it('still runs the normal design-sub-agent scoring path when src/components exists', async () => {
    existsSyncMock.mockReturnValue(true);
    execAsyncImpl.mockResolvedValue({ stdout: 'Design Score: 92/100', stderr: '' });
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { category: 'feature' } }) }) }) }),
    };
    const result = await checkAccessibility('/repo', 'SD-XXX', supabase);
    expect(result.design_score).toBe(92);
    expect(execAsyncImpl).toHaveBeenCalled();
  });
});

describe('QF-20260704-180 — checkResponsiveDesign does not flag zero components as non-responsive', () => {
  beforeEach(() => execAsyncImpl.mockReset());

  it('reports missing_breakpoints: 0 when there are no components at all', async () => {
    execAsyncImpl
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }) // responsive class grep
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // component find
    const result = await checkResponsiveDesign('/repo', 'SD-XXX');
    expect(result.total_components).toBe(0);
    expect(result.missing_breakpoints).toBe(0);
    expect(result.non_responsive_components).toEqual([]);
  });

  it('still flags real components that lack responsive classes', async () => {
    execAsyncImpl
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }) // no responsive classes found
      .mockResolvedValueOnce({ stdout: '3\n', stderr: '' }); // 3 real components
    const result = await checkResponsiveDesign('/repo', 'SD-XXX');
    expect(result.total_components).toBe(3);
    expect(result.missing_breakpoints).toBe(1);
    expect(result.non_responsive_components).toHaveLength(1);
  });
});
