/**
 * QF-20260911-275 — captureLessonLearned() wires its "add lesson to existing retrospective"
 * UPDATE through updateRetrospectiveWithToken(). Asserts the token is present in the payload
 * sent to Supabase, registered as 'retro_lesson_capture' in retro_canonical_writer_policy().
 */
import { describe, it, expect, vi } from 'vitest';
import { captureLessonLearned } from '../../../lib/sub-agents/retro/lesson-capture.js';

function makeSupabaseMock(updateSpy) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [{ id: 'retro-1', key_learnings: [], what_needs_improvement: [] }],
            }),
          }),
        }),
      }),
      update: (payload) => {
        updateSpy(payload);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'retro-1' }, error: null }),
            }),
          }),
        };
      },
    }),
  };
}

describe('captureLessonLearned write-token wiring', () => {
  it('sends retro_write_token: retro_lesson_capture in the UPDATE payload', async () => {
    const updateSpy = vi.fn();
    const supabase = makeSupabaseMock(updateSpy);
    const results = { critical_issues: [], findings: {}, recommendations: [] };

    await captureLessonLearned(
      supabase,
      'sd-1',
      { status: 'EXEC' },
      { message: 'a lesson worth capturing', severity: 'medium' },
      results
    );

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ retro_write_token: 'retro_lesson_capture' });
  });
});
