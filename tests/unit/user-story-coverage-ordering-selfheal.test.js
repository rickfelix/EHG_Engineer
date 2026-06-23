/**
 * SD-REFILL-00LLG0KZ — USER_STORY_COVERAGE same-pass ordering false-block (3rd witness).
 *
 * The EXEC-TO-PLAN gate pipeline could read user_stories BEFORE STORY_AUTO_VALIDATION
 * promoted them (draft->completed, pending->validated) in the same pass → coverage read
 * 0% and false-blocked, burning worker retries. Fix: the coverage gate best-effort, ORDER-
 * INDEPENDENTLY ensures promotion (idempotent autoValidateUserStories) before scoring, and
 * a promote failure must NEVER block coverage (defensive try/catch — falls through to score
 * the live state, exactly as before).
 *
 * (A fresh test file rather than extending user-story-coverage.test.js, which is quarantined
 * in the vitest exclude list and would not run in CI.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createUserStoryCoverageGate } from '../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js';

const gateSrc = readFileSync(
  fileURLToPath(new URL('../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js', import.meta.url)),
  'utf8'
);

// Mock supabase that supports the coverage read (select/eq/then) but NOT .update — so the
// best-effort autoValidateUserStories call throws and must be swallowed (proving the defensive
// fall-through), after which coverage scores the provided stories exactly as before the fix.
function makeSupabase(stories, { error = null } = {}) {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    then: (fn) => Promise.resolve({ data: stories, error }).then(fn),
  };
  return { from: vi.fn(() => chainable) };
}
function story(o = {}) {
  return { id: 'id', story_key: 'US-001', title: 'T', status: 'completed', validation_status: 'validated', acceptance_criteria: ['AC-1'], created_by: 'plan', metadata: {}, ...o };
}

describe('USER_STORY_COVERAGE ordering self-heal (SD-REFILL-00LLG0KZ)', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('wires a promote-before-read self-heal (autoValidateUserStories) ahead of the story SELECT', () => {
    // QF-888 dead-code lesson: assert the fix is actually wired into the gate body.
    const promoteIdx = gateSrc.indexOf('autoValidateUserStories(sdId, supabase)');
    const selectIdx = gateSrc.indexOf(".from('user_stories')");
    expect(promoteIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(promoteIdx).toBeLessThan(selectIdx); // promotion ensured BEFORE the coverage read
  });

  it('a promote failure NEVER blocks coverage — still scores the live stories (defensive)', async () => {
    // mock supabase has no .update → autoValidateUserStories throws → must be swallowed,
    // then coverage reads the (already-promoted) stories and scores them.
    const gate = createUserStoryCoverageGate(makeSupabase([
      story({ story_key: 'US-001' }),
      story({ story_key: 'US-002', validation_status: 'in_progress' }),
    ]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'bugfix' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.covered).toBe(2);
  });

  it('still surfaces genuinely-uncovered stories (no over-pass from the self-heal)', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([
      story({ story_key: 'US-OK', status: 'completed', acceptance_criteria: ['AC-1'] }),
      story({ story_key: 'US-BAD', status: 'draft', acceptance_criteria: [] }),
    ]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toContain('US-BAD');
  });
});
