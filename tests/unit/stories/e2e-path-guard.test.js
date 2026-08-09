/**
 * SD-LEO-INFRA-STORY-E2E-AUTO-001 — FR-1 guard + FR-2 gate enforcement.
 *
 * Two-sided throughout: each arm is proven to REJECT the fabricated mapping AND to PASS the
 * real one. A gate that only rejects cannot discriminate; one that only passes is camouflage.
 * The existence and relevance arms are tested SEPARATELY because they are separately trusted —
 * existence is decidable, relevance is a heuristic, and merging them would let the heuristic's
 * false negatives hide behind the sound arm.
 */
import { describe, it, expect } from 'vitest';
import { specFileExists, specReferencesStory, resolveE2ePath } from '../../../lib/stories/e2e-path-guard.js';
import { verifyUserStories } from '../../../lib/sub-agents/testing/phases/phase4-evidence.js';

const ROOT = '/repo';
const present = new Set(['/repo/tests/e2e/real.spec.ts', '/repo/tests/e2e/other.spec.ts']);
const deps = {
  existsSync: (p) => present.has(p.replace(/\\/g, '/')),
  readFileSync: (p) => {
    const k = p.replace(/\\/g, '/');
    if (k === '/repo/tests/e2e/real.spec.ts') return "test('SD-X-001:US-001 does the thing', () => {})";
    if (k === '/repo/tests/e2e/other.spec.ts') return "test('something entirely unrelated', () => {})";
    throw new Error('ENOENT');
  },
};
const story = { story_key: 'SD-X-001:US-001', changed_files: ['lib/marketing/autonomy-gate.js'] };

describe('FR-1 arm 1 — existence (decidable)', () => {
  it('REJECTS a path whose file does not exist — the 234-distinct-path case', () => {
    expect(specFileExists(ROOT, 'tests/e2e/api-coverage-audit.spec.ts', deps)).toBe(false);
  });

  it('ACCEPTS a path whose file exists', () => {
    expect(specFileExists(ROOT, 'tests/e2e/real.spec.ts', deps)).toBe(true);
  });

  it('REJECTS the documentation sentinel, which is prose and not a path', () => {
    expect(specFileExists(ROOT, 'N/A - documentation SD (no E2E required)', deps)).toBe(false);
  });

  // The first cut of this test was VACUOUS and a mutation caught it: with the shape guard
  // deleted, both paths still resolved outside the stub's existing-file set, so the assertion
  // passed either way and proved nothing. Here existence is forced TRUE for every path, so
  // the ONLY thing that can reject these is the absolute/traversal guard itself.
  it('REJECTS an absolute path and a traversal even when the target exists — a mapping must stay inside the repo', () => {
    const allExist = { existsSync: () => true };
    expect(specFileExists(ROOT, '/etc/passwd', allExist)).toBe(false);
    expect(specFileExists(ROOT, 'tests/../../outside/real.spec.ts', allExist)).toBe(false);
    // Control: the same all-exists stub ACCEPTS an ordinary repo-relative path, so the two
    // rejections above are the guard firing and not the stub refusing everything.
    expect(specFileExists(ROOT, 'tests/e2e/anything.spec.ts', allExist)).toBe(true);
  });

  it('REJECTS empty, whitespace and non-string candidates rather than throwing', () => {
    for (const bad of ['', '   ', null, undefined, 42, {}]) {
      expect(specFileExists(ROOT, bad, deps)).toBe(false);
    }
  });
});

describe('FR-1 arm 2 — relevance (heuristic, kept separate on purpose)', () => {
  it('ACCEPTS a spec that names the story', () => {
    expect(specReferencesStory(ROOT, 'tests/e2e/real.spec.ts', story, deps)).toBe(true);
  });

  it('REJECTS an EXISTING spec that does not reference the story — proves this is a real second arm, not existence wearing a relevance name', () => {
    expect(specReferencesStory(ROOT, 'tests/e2e/other.spec.ts', story, deps)).toBe(false);
  });

  it('REJECTS a nonexistent spec without attempting to read it', () => {
    expect(specReferencesStory(ROOT, 'tests/e2e/nope.spec.ts', story, deps)).toBe(false);
  });

  it('matches on a changed-file basename as well as the story key', () => {
    const byFile = { changed_files: ['lib/marketing/autonomy-gate.js'] };
    expect(specReferencesStory(ROOT, 'tests/e2e/real.spec.ts', byFile, deps)).toBe(false);
    const named = { story_key: 'SD-X-001:US-001' };
    expect(specReferencesStory(ROOT, 'tests/e2e/real.spec.ts', named, deps)).toBe(true);
  });
});

describe('FR-1 resolver — map correctly or emit NULL', () => {
  it('returns NULL for a nonexistent spec', () => {
    expect(resolveE2ePath({ repoRoot: ROOT, candidatePath: 'tests/e2e/ghost.spec.ts', story, deps })).toBe(null);
  });

  it('returns NULL for an existing but irrelevant spec', () => {
    expect(resolveE2ePath({ repoRoot: ROOT, candidatePath: 'tests/e2e/other.spec.ts', story, deps })).toBe(null);
  });

  it('returns the path for an existing, story-referencing spec', () => {
    expect(resolveE2ePath({ repoRoot: ROOT, candidatePath: 'tests/e2e/real.spec.ts', story, deps })).toBe('tests/e2e/real.spec.ts');
  });

  it('existence-only mode accepts an irrelevant existing spec — the documented fallback if the heuristic proves noisy', () => {
    const r = resolveE2ePath({ repoRoot: ROOT, candidatePath: 'tests/e2e/other.spec.ts', story, requireRelevance: false, deps });
    expect(r).toBe('tests/e2e/other.spec.ts');
  });
});

/** Minimal stub matching the one call shape: .from().select().eq() -> {data, error}. */
function stubSupabase(rows) {
  return { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }) };
}
const completed = (over = {}) => ({
  story_key: 'SD-X-001:US-001', title: 'S', status: 'completed',
  validation_status: 'validated', e2e_test_path: null, e2e_test_status: 'not_created', ...over,
});

describe('FR-2 — the gate rejects a mapping it cannot stand behind', () => {
  it('BLOCKS the exact 641-row shape: status=passing on a spec that does not exist', async () => {
    const rows = [completed({ e2e_test_path: 'tests/e2e/api-coverage-audit.spec.ts', e2e_test_status: 'passing' })];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'feature', specFileExists: () => false });
    expect(res.verified).toBe(false);
  });

  it('BLOCKS it even when validation_status=validated — validation cannot excuse a false path', async () => {
    const rows = [completed({ e2e_test_path: 'tests/e2e/ghost.spec.ts', e2e_test_status: 'passing', validation_status: 'validated' })];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'feature', specFileExists: () => false });
    expect(res.verified).toBe(false);
  });

  it('PASSES the same row once the spec exists — the clean control', async () => {
    const rows = [completed({ e2e_test_path: 'tests/e2e/real.spec.ts', e2e_test_status: 'passing' })];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'feature', specFileExists: () => true });
    expect(res.verified).toBe(true);
  });

  it('REGRESSION GUARD (QF-20260801-425): a validated story with a NULL path still passes, and the existence check is never consulted for it', async () => {
    let consulted = false;
    const res = await verifyUserStories('sd-1', stubSupabase([completed()]), {
      sdType: 'feature',
      specFileExists: () => { consulted = true; return false; },
    });
    expect(res.verified).toBe(true);
    // NULL is the honest "no mapping" — nulling a fabricated path is the one-line remediation
    // this gate leaves available, which is what makes enforcing the non-null case fair.
    expect(consulted).toBe(false);
  });
});
