import { describe, it, expect } from 'vitest';
import { applyAutoSafe } from '../../repo-cleanup.js';

function r(file) { return { file, reason: 'no matching rule' }; }

describe('applyAutoSafe', () => {
  it('promotes a high-confidence cluster from review to commit', () => {
    const review = Array.from({ length: 5 }, (_, i) => r(`docs/plans/archived/sd-${i}.md`));
    const categories = { delete: [], gitignore: [], commit: [], review };
    const suggestions = [{ pattern: 'docs/plans/archived/*.md', category: 'commit', occurrences: 4, reason: 'seed' }];
    const result = applyAutoSafe(categories, { suggestions });
    expect(result.stats.applied).toBe(5);
    expect(result.categories.commit).toHaveLength(5);
    expect(result.categories.review).toHaveLength(0);
    expect(result.applied[0].pattern).toBe('docs/plans/archived/*.md');
  });

  it('defers low-confidence clusters (occurrences < minOccurrences)', () => {
    const review = Array.from({ length: 3 }, (_, i) => r(`docs/plans/archived/sd-${i}.md`));
    const categories = { delete: [], gitignore: [], commit: [], review };
    const suggestions = [{ pattern: 'docs/plans/archived/*.md', category: 'commit', occurrences: 1, reason: 'noise' }];
    const result = applyAutoSafe(categories, { suggestions, minOccurrences: 2 });
    expect(result.stats.applied).toBe(0);
    expect(result.stats.deferred).toBe(3);
    expect(result.categories.review).toHaveLength(3);
  });

  it('refuses to auto-apply delete category even at high confidence', () => {
    const review = Array.from({ length: 4 }, (_, i) => r(`scripts/oneoff-${i}.js`));
    const categories = { delete: [], gitignore: [], commit: [], review };
    const suggestions = [{ pattern: 'scripts/*.js', category: 'delete', occurrences: 99, reason: 'whatever' }];
    const result = applyAutoSafe(categories, { suggestions });
    expect(result.stats.applied).toBe(0);
    expect(result.stats.skipped_delete).toBe(4);
    expect(result.categories.delete).toHaveLength(0);
  });

  it('returns categories unchanged when no suggestions provided', () => {
    const categories = { delete: [], gitignore: [], commit: [], review: [r('a/b.md')] };
    const result = applyAutoSafe(categories, { suggestions: [] });
    expect(result.applied).toHaveLength(0);
    expect(result.categories).toBe(categories);
  });

  it('skips when no clusters meet the size threshold', () => {
    const categories = { delete: [], gitignore: [], commit: [], review: [r('a/b.md'), r('a/c.md')] };
    const suggestions = [{ pattern: 'a/*.md', category: 'commit', occurrences: 5, reason: 'x' }];
    const result = applyAutoSafe(categories, { suggestions });
    expect(result.stats.applied).toBe(0);
    expect(result.applied).toHaveLength(0);
  });
});
