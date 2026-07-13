/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-2) -- unit coverage for
 * lib/periodic-liveness/stamp-last-fired.js's stampFromGithubActionsRun(), the sibling function
 * added to fix TESTING sub-agent pre-EXEC FINDING-A (stampLastFired() hard-filters
 * liveness_source='self_stamped' and would silently no-op against gha_cron:* rows).
 */
import { describe, it, expect, vi } from 'vitest';
import { stampLastFired, stampFromGithubActionsRun } from '../../../lib/periodic-liveness/stamp-last-fired.js';

function fakeSupabase({ matchedRows, filterSpy }) {
  return {
    from: () => ({
      update: (payload) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            select: () => {
              filterSpy?.({ payload, col1, val1, col2, val2 });
              return Promise.resolve({ data: val2 === 'github_actions_api' || val2 === 'self_stamped' ? matchedRows : [], error: null });
            },
          }),
        }),
      }),
    }),
  };
}

describe('stampFromGithubActionsRun', () => {
  it('filters on liveness_source=github_actions_api, NOT self_stamped (FINDING-A fix)', async () => {
    const calls = [];
    const supabase = fakeSupabase({ matchedRows: [{ process_key: 'gha_cron:foo.yml' }], filterSpy: (c) => calls.push(c) });
    const result = await stampFromGithubActionsRun(supabase, 'gha_cron:foo.yml', '2026-07-10T00:00:00Z');
    expect(result).toEqual({ stamped: true });
    expect(calls[0].col2).toBe('liveness_source');
    expect(calls[0].val2).toBe('github_actions_api');
    expect(calls[0].payload.last_fired_at).toBe('2026-07-10T00:00:00Z');
  });

  it('is a no-op with a reason when the process_key is not registered as github_actions_api', async () => {
    const supabase = fakeSupabase({ matchedRows: [] });
    const result = await stampFromGithubActionsRun(supabase, 'gha_cron:unregistered.yml', '2026-07-10T00:00:00Z');
    expect(result).toEqual({ stamped: false, reason: 'not_registered_as_github_actions_api' });
  });

  it('requires both processKey and ranAtIso', async () => {
    const supabase = fakeSupabase({ matchedRows: [] });
    await expect(stampFromGithubActionsRun(supabase, '', '2026-07-10T00:00:00Z')).rejects.toThrow(/requires a processKey/);
    await expect(stampFromGithubActionsRun(supabase, 'gha_cron:foo.yml', '')).rejects.toThrow(/requires ranAtIso/);
  });

  it('stampLastFired (existing self_stamped helper) is unaffected by the new sibling function', async () => {
    const calls = [];
    const supabase = fakeSupabase({ matchedRows: [{ process_key: 'standard_loop:sweep' }], filterSpy: (c) => calls.push(c) });
    const result = await stampLastFired(supabase, 'standard_loop:sweep');
    expect(result).toEqual({ stamped: true });
    expect(calls[0].val2).toBe('self_stamped');
  });
});
