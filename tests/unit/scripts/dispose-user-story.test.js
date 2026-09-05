/**
 * QF-20260903-222 — sanctioned disposition path for a user story that must never be
 * implemented (a generator artefact: a review finding, a scope estimate). Before this,
 * the only routes were a classifier-denied ad-hoc write or promoting the story to
 * 'completed', which asserts work that was never done.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseArgs, disposeUserStory } from '../../../scripts/dispose-user-story.js';

function makeSupabase({ existing, updateResult, fetchError, updateError } = {}) {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single, select: () => ({ single }) }));
  const select = vi.fn(() => ({ eq }));
  const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single }) }) }));
  single
    .mockResolvedValueOnce(fetchError ? { data: null, error: fetchError } : { data: existing, error: null })
    .mockResolvedValueOnce(updateError ? { data: null, error: updateError } : { data: updateResult, error: null });
  return { from: vi.fn(() => ({ select, update })), _update: update };
}

describe('parseArgs', () => {
  it('parses story key and flags', () => {
    const args = parseArgs(['SD-X:US-001', '--reason-code', 'not_actionable', '--reason', 'a review finding', '--actor', 'coordinator', '--dry-run']);
    expect(args).toEqual({
      storyKey: 'SD-X:US-001', reasonCode: 'not_actionable', reason: 'a review finding',
      actor: 'coordinator', dryRun: true
    });
  });
});

describe('disposeUserStory', () => {
  const validArgs = { storyKey: 'SD-X:US-001', reasonCode: 'not_actionable', reason: 'a review finding, not real work', actor: 'coordinator' };

  it('requires story_key, reason-code, reason, and actor', async () => {
    const supabase = makeSupabase();
    await expect(disposeUserStory(supabase, { ...validArgs, storyKey: null })).rejects.toThrow(/story_key/);
    await expect(disposeUserStory(supabase, { ...validArgs, reasonCode: null })).rejects.toThrow(/reason-code/);
    await expect(disposeUserStory(supabase, { ...validArgs, reason: null })).rejects.toThrow(/--reason/);
    await expect(disposeUserStory(supabase, { ...validArgs, actor: null })).rejects.toThrow(/actor/);
  });

  it('refuses to disposition a story already marked completed', async () => {
    const supabase = makeSupabase({ existing: { story_key: validArgs.storyKey, status: 'completed', metadata: {} } });
    await expect(disposeUserStory(supabase, validArgs)).rejects.toThrow(/already 'completed'/);
  });

  it('surfaces a clear error when the story is not found', async () => {
    const supabase = makeSupabase({ fetchError: { message: 'no rows' } });
    await expect(disposeUserStory(supabase, validArgs)).rejects.toThrow(/story not found.*no rows/);
  });

  it('dry-run reports the intended write without calling update', async () => {
    const supabase = makeSupabase({ existing: { story_key: validArgs.storyKey, status: 'draft', metadata: { note: 'keep me' } } });
    const result = await disposeUserStory(supabase, { ...validArgs, dryRun: true });

    expect(result.dry_run).toBe(true);
    expect(result.would_set.status).toBe('blocked');
    expect(result.would_set.validation_status).toBe('skipped');
    expect(result.would_set.metadata.note).toBe('keep me');
    expect(result.would_set.metadata.disposition).toMatchObject({
      reason_code: 'not_actionable', reason: validArgs.reason, disposed_by: 'coordinator'
    });
    expect(supabase._update).not.toHaveBeenCalled();
  });

  it('writes status=blocked + validation_status=skipped and merges disposition into existing metadata', async () => {
    const existing = { story_key: validArgs.storyKey, status: 'draft', metadata: { note: 'keep me' } };
    const supabase = makeSupabase({
      existing,
      updateResult: { story_key: validArgs.storyKey, status: 'blocked', validation_status: 'skipped', metadata: { note: 'keep me', disposition: {} } }
    });

    const result = await disposeUserStory(supabase, validArgs);

    expect(supabase._update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'blocked',
      validation_status: 'skipped',
      metadata: expect.objectContaining({
        note: 'keep me',
        disposition: expect.objectContaining({ reason_code: 'not_actionable', disposed_by: 'coordinator' })
      })
    }));
    expect(result.status).toBe('blocked');
  });

  it('surfaces a clear error when the update write fails', async () => {
    const supabase = makeSupabase({
      existing: { story_key: validArgs.storyKey, status: 'draft', metadata: {} },
      updateError: { message: 'permission denied' }
    });
    await expect(disposeUserStory(supabase, validArgs)).rejects.toThrow(/disposition write failed.*permission denied/);
  });
});
