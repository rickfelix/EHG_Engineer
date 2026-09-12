import { describe, it, expect, vi } from 'vitest';
import {
  parseLsRemoteHeads,
  groupRefsBySha,
  findDenylistedPaths,
  runAudit,
} from '../../../scripts/audits/wip-reclaim-denylist-audit.mjs';

// QF-20260911-567: one-shot READ-ONLY audit of existing origin wip/reclaim/* refs for
// denylisted per-host identity paths (sibling of QF-20260911-379's forward-only guard).
// runAudit's I/O is injectable so these tests exercise the real finding logic against a
// fixture tree, never real git/network.

describe('parseLsRemoteHeads', () => {
  it('extracts {sha, ref} pairs, stripping refs/heads/, and skips blank lines', () => {
    const raw = [
      'abc123\trefs/heads/wip/reclaim/QF-1/2026-09-01T00-00-00-000Z',
      '',
      'def456\trefs/heads/wip/reclaim/QF-2/2026-09-02T00-00-00-000Z',
      '',
    ].join('\n');
    expect(parseLsRemoteHeads(raw)).toEqual([
      { sha: 'abc123', ref: 'wip/reclaim/QF-1/2026-09-01T00-00-00-000Z' },
      { sha: 'def456', ref: 'wip/reclaim/QF-2/2026-09-02T00-00-00-000Z' },
    ]);
  });

  it('returns [] for empty/null input', () => {
    expect(parseLsRemoteHeads('')).toEqual([]);
    expect(parseLsRemoteHeads(null)).toEqual([]);
  });
});

describe('groupRefsBySha', () => {
  it('groups multiple refs that share an identical tree SHA', () => {
    const refs = [
      { sha: 's1', ref: 'wip/reclaim/A/t1' },
      { sha: 's1', ref: 'wip/reclaim/A/t2' },
      { sha: 's2', ref: 'wip/reclaim/B/t1' },
    ];
    const grouped = groupRefsBySha(refs);
    expect(grouped.size).toBe(2);
    expect(grouped.get('s1')).toEqual(['wip/reclaim/A/t1', 'wip/reclaim/A/t2']);
    expect(grouped.get('s2')).toEqual(['wip/reclaim/B/t1']);
  });
});

describe('findDenylistedPaths', () => {
  it('flags a real denylisted path and leaves ordinary paths alone', () => {
    const paths = ['README.md', '.account-identity-last.json', 'src/index.js', '.env'];
    expect(findDenylistedPaths(paths)).toEqual(['.account-identity-last.json', '.env']);
  });

  it('returns [] for a clean tree', () => {
    expect(findDenylistedPaths(['README.md', 'src/index.js', '.env.example'])).toEqual([]);
  });

  // Found live during a smoke run against real origin refs, not in the original QF spec:
  // lib/fleet/account-identity.cjs matches the same broad pattern written to catch the
  // leaked .account-identity-last.json, but it is ordinary tracked source code present in
  // (almost) every tree. Without baseline exclusion every ref would misreport this file as
  // a finding, drowning the real signal.
  it('excludes a denylisted-shaped path that is a baseline (main-tracked) file', () => {
    const paths = ['lib/fleet/account-identity.cjs', '.account-identity-last.json'];
    const baseline = new Set(['lib/fleet/account-identity.cjs']);
    expect(findDenylistedPaths(paths, baseline)).toEqual(['.account-identity-last.json']);
  });
});

describe('runAudit (fixture tree, injected I/O — no real git/network)', () => {
  const emptyBaseline = () => new Set();

  it('reports CLEAN with zero findings when no fixture tree carries a denylisted path', () => {
    const listRefs = vi.fn(() => [{ sha: 's1', ref: 'wip/reclaim/A/t1' }]);
    const getTreePaths = vi.fn(() => ['README.md', 'src/index.js']);
    const result = runAudit({ listRefs, getTreePaths, getBaseline: emptyBaseline });
    expect(result.findings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.totalRefs).toBe(1);
    expect(result.distinctTrees).toBe(1);
    expect(result.auditedShaCount).toBe(1);
  });

  it('reports a finding — including every ref that shares the bad tree — for a denylisted path', () => {
    const refs = [
      { sha: 'bad-sha', ref: 'wip/reclaim/QF-X/t1' },
      { sha: 'bad-sha', ref: 'wip/reclaim/QF-X/t2' }, // same tree, different timestamp
      { sha: 'clean-sha', ref: 'wip/reclaim/QF-Y/t1' },
    ];
    const listRefs = vi.fn(() => refs);
    const getTreePaths = vi.fn((ref) =>
      ref.startsWith('wip/reclaim/QF-X') ? ['README.md', '.account-identity-last.json'] : ['README.md']
    );
    const result = runAudit({ listRefs, getTreePaths, getBaseline: emptyBaseline });
    // Fetched once per DISTINCT tree, not once per ref (2 refs share bad-sha).
    expect(getTreePaths).toHaveBeenCalledTimes(2);
    expect(result.distinctTrees).toBe(2);
    expect(result.totalRefs).toBe(3);
    expect(result.findings).toEqual([
      { sha: 'bad-sha', refs: ['wip/reclaim/QF-X/t1', 'wip/reclaim/QF-X/t2'], hits: ['.account-identity-last.json'] },
    ]);
  });

  it('applies the baseline exclusion fleet-wide, not just to one tree', () => {
    const refs = [{ sha: 's1', ref: 'wip/reclaim/A/t1' }];
    const listRefs = vi.fn(() => refs);
    const getTreePaths = vi.fn(() => ['lib/fleet/account-identity.cjs']);
    const getBaseline = vi.fn(() => new Set(['lib/fleet/account-identity.cjs']));
    const result = runAudit({ listRefs, getTreePaths, getBaseline });
    expect(getBaseline).toHaveBeenCalledTimes(1); // computed once, reused for every tree
    expect(result.findings).toEqual([]);
  });

  it('is fail-soft per tree: a fetch/ls-tree error on one tree is captured, never aborts the run', () => {
    const refs = [
      { sha: 'broken-sha', ref: 'wip/reclaim/QF-Z/t1' },
      { sha: 'ok-sha', ref: 'wip/reclaim/QF-OK/t1' },
    ];
    const listRefs = vi.fn(() => refs);
    const getTreePaths = vi.fn((ref) => {
      if (ref.startsWith('wip/reclaim/QF-Z')) throw new Error('fetch failed: unknown revision');
      return ['README.md'];
    });
    const result = runAudit({ listRefs, getTreePaths, getBaseline: emptyBaseline });
    expect(result.errors).toEqual([
      { sha: 'broken-sha', refs: ['wip/reclaim/QF-Z/t1'], error: 'fetch failed: unknown revision' },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.auditedShaCount).toBe(1); // only the surviving tree counts as audited
  });
});
