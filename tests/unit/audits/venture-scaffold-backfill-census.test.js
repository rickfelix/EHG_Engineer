import { describe, it, expect, vi, beforeEach } from 'vitest';

// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-5. Report-only census: enumerate the full
// live venture-repo population (not a 5-repo sample) and report scaffold-manifest
// presence/version per repo, with zero writes to any venture repo.

const execCalls = [];
let writeCalls = [];

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((cmd, args) => {
    const full = `${cmd} ${args.join(' ')}`;
    execCalls.push(full);
    if (args[0] === 'repo' && args[1] === 'list') {
      // 6 venture repos + the 2 known platform repos + 1 archived — proves "not a
      // 5-repo sample": more than 5 non-platform repos are present and all must appear
      // in the census output below.
      return JSON.stringify([
        { name: 'EHG', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'EHG_Engineer', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-a', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-b', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-c', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-d', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-e', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-f', isArchived: false, defaultBranchRef: { name: 'main' } },
        { name: 'venture-old-archived', isArchived: true, defaultBranchRef: { name: 'main' } },
      ]);
    }
    if (args[0] === 'api' && String(args[1]).includes('/contents/scaffold-manifest.json')) {
      const repoName = args[1].split('/')[2];
      // venture-a and venture-b are already scaffolded; the rest are not.
      if (repoName === 'venture-a' || repoName === 'venture-b') {
        const manifest = { generated_at: '2026-08-24T00:00:00.000Z', modules: [{ module: 'deploy', version: '1.0.0' }] };
        return Buffer.from(JSON.stringify(manifest)).toString('base64');
      }
      throw new Error('404 Not Found'); // gh api throws non-zero exit on 404
    }
    throw new Error(`unexpected exec call: ${full}`);
  }),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn((path, content) => { writeCalls.push({ path, content }); }),
}));

beforeEach(() => {
  execCalls.length = 0;
  writeCalls = [];
});

describe('venture-scaffold-backfill-census', () => {
  it('buildCensus() with injected fakes: excludes platform repos + archived, includes all venture repos (not a 5-repo sample)', async () => {
    const { buildCensus } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const fakeRepos = [
      { name: 'EHG', isArchived: false },
      { name: 'EHG_Engineer', isArchived: false },
      ...Array.from({ length: 7 }, (_, i) => ({ name: `venture-${i}`, isArchived: false })),
      { name: 'venture-archived', isArchived: true },
    ];
    const result = buildCensus({
      repoLister: () => fakeRepos,
      manifestFetcher: (name) => (name === 'venture-0' ? { present: true, manifest: { generated_at: 'x', modules: [{ module: 'deploy', version: '1.0.0' }] } } : { present: false, manifest: null }),
    });

    expect(result.totalReposScanned).toBe(10);
    expect(result.archivedExcluded).toBe(1);
    expect(result.platformExcluded.sort()).toEqual(['EHG', 'EHG_Engineer']);
    expect(result.ventureRepos.length).toBe(7); // > 5, proving not a 5-repo-sample cap
    expect(result.ventureRepos.some((r) => r.manifestPresent)).toBe(true);
    expect(result.ventureRepos.filter((r) => !r.manifestPresent).length).toBe(6);
  });

  // Regression: the real GitHub repo is `ehg` (lowercase), not `EHG` — an
  // earlier exact-case match against 'EHG' silently mis-listed it as a venture
  // "PROPOSED for backfill" in a real run of this script (caught by inspecting
  // the actual generated report, not by a mocked test).
  it('excludes the platform repo regardless of case (ehg vs EHG)', async () => {
    const { buildCensus } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const result = buildCensus({
      repoLister: () => [
        { name: 'ehg', isArchived: false },
        { name: 'EHG_Engineer', isArchived: false },
        { name: 'venture-a', isArchived: false },
      ],
      manifestFetcher: () => ({ present: false, manifest: null }),
    });
    expect(result.platformExcluded.map((n) => n.toLowerCase()).sort()).toEqual(['ehg', 'ehg_engineer']);
    expect(result.ventureRepos.map((r) => r.name)).toEqual(['venture-a']);
  });

  it('toMarkdown() lists every venture repo and proposes backfill only for the unscaffolded ones', async () => {
    const { toMarkdown } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const census = {
      totalReposScanned: 4,
      archivedExcluded: 0,
      platformExcluded: ['EHG'],
      ventureRepos: [
        { name: 'venture-a', manifestPresent: true, modules: 'deploy@1.0.0', generatedAt: '2026-08-24T00:00:00.000Z' },
        { name: 'venture-b', manifestPresent: false, modules: null, generatedAt: null },
      ],
    };
    const md = toMarkdown(census, '2026-08-24T00:00:00.000Z');
    expect(md).toContain('Report-only. Zero writes');
    expect(md).toContain('venture-a');
    expect(md).toContain('venture-b');
    expect(md).toMatch(/venture-b[\s\S]*Backfill proposal/); // venture-b table row, then the proposal section
    expect(md).toContain('1 venture repo(s) have no scaffold manifest');
  });

  it('FR-5 AC#2: main() makes zero write/mutating gh or git calls — only reads, and writes the report exactly once', async () => {
    const { main } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    main();

    expect(execCalls.length).toBeGreaterThan(0);
    const WRITE_SHAPED = /\b(push|commit|-X\s*(POST|PATCH|PUT|DELETE)|pr\s+create|repo\s+(delete|edit|create))\b/i;
    for (const call of execCalls) {
      expect(call, `unexpected write-shaped gh/git call: ${call}`).not.toMatch(WRITE_SHAPED);
    }

    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0].path).toBe('docs/audits/venture-scaffold-backfill-census.md');
    // All 6 non-platform, non-archived venture repos from the module-level mock must appear.
    for (const name of ['venture-a', 'venture-b', 'venture-c', 'venture-d', 'venture-e', 'venture-f']) {
      expect(writeCalls[0].content).toContain(name);
    }
    expect(writeCalls[0].content).not.toContain('venture-old-archived');
  });
});
