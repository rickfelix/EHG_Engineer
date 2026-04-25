import { describe, it, expect } from 'vitest';
import { groupReviewItems, inferPattern, DEFAULT_MIN_CLUSTER_SIZE } from './group-review.js';

describe('inferPattern', () => {
  it('produces a directory + extension glob for nested files', () => {
    expect(inferPattern('docs/plans/archived/sd-leo-foo-plan.md')).toBe('docs/plans/archived/*.md');
  });

  it('anchors root-level files with leading slash', () => {
    expect(inferPattern('foo.json')).toBe('/*.json');
  });

  it('preserves directory paths with trailing-slash inputs', () => {
    expect(inferPattern('.claude-work/')).toBe('/.claude-work');
  });
});

describe('groupReviewItems', () => {
  it('clusters 10 plan files under one pattern', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      file: `docs/plans/archived/sd-leo-${i.toString().padStart(3, '0')}-plan.md`
    }));
    const { clusters, unclustered } = groupReviewItems(items);
    expect(clusters.size).toBe(1);
    expect(clusters.get('docs/plans/archived/*.md')?.length).toBe(10);
    expect(unclustered).toHaveLength(0);
  });

  it('drops below-threshold groups to unclustered', () => {
    const items = [
      { file: 'docs/plans/archived/a.md' },
      { file: 'docs/plans/archived/b.md' }
    ];
    const { clusters, unclustered } = groupReviewItems(items);
    expect(clusters.size).toBe(0);
    expect(unclustered).toHaveLength(2);
  });

  it('emits multiple clusters for mixed input', () => {
    const items = [
      ...Array.from({ length: 4 }, (_, i) => ({ file: `docs/plans/archived/p${i}.md` })),
      ...Array.from({ length: 3 }, (_, i) => ({ file: `.claude/session-${i}.md` })),
      ...Array.from({ length: 3 }, (_, i) => ({ file: `scripts/migration-${i}.sql` })),
      { file: 'odd-one.txt' }
    ];
    const { clusters, unclustered } = groupReviewItems(items);
    expect(clusters.size).toBe(3);
    expect(clusters.get('docs/plans/archived/*.md')?.length).toBe(4);
    expect(clusters.get('.claude/*.md')?.length).toBe(3);
    expect(clusters.get('scripts/*.sql')?.length).toBe(3);
    expect(unclustered.map(i => i.file)).toEqual(['odd-one.txt']);
  });

  it('respects custom minSize option', () => {
    const items = [
      { file: 'a/x.md' },
      { file: 'a/y.md' }
    ];
    const { clusters } = groupReviewItems(items, { minSize: 2 });
    expect(clusters.size).toBe(1);
  });

  it('accepts plain string items alongside objects', () => {
    const items = ['docs/plans/archived/a.md', 'docs/plans/archived/b.md', 'docs/plans/archived/c.md'];
    const { clusters } = groupReviewItems(items);
    expect(clusters.size).toBe(1);
    expect(clusters.get('docs/plans/archived/*.md')?.length).toBe(3);
  });

  it('default minSize matches DEFAULT_MIN_CLUSTER_SIZE', () => {
    expect(DEFAULT_MIN_CLUSTER_SIZE).toBe(3);
  });
});
