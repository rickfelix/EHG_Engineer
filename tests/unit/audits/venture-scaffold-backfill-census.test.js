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
      // Mirrors execFileSync's real thrown shape (an Error with a populated .stderr
      // string, given encoding:'utf8') and gh's real 404 message, empirically
      // confirmed via a live run: "gh: Not Found (HTTP 404)".
      const err = new Error('Command failed');
      err.stderr = 'gh: Not Found (HTTP 404)\n';
      throw err;
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

  it('toMarkdownSummary() reports aggregate counts only — no per-repo venture names', async () => {
    const { toMarkdownSummary } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const census = {
      totalReposScanned: 4,
      archivedExcluded: 0,
      platformExcluded: ['ehg'],
      ventureRepos: [
        { name: 'venture-a', manifestPresent: true, modules: 'deploy@1.0.0', generatedAt: '2026-08-24T00:00:00.000Z' },
        { name: 'venture-b', manifestPresent: false, modules: null, generatedAt: null },
      ],
    };
    const md = toMarkdownSummary(census, '2026-08-24T00:00:00.000Z');
    expect(md).toContain('Report-only. Zero writes');
    expect(md).toContain('Venture repos in census: 2');
    expect(md).toContain('Already scaffolded (manifest present): 1 / 2');
    expect(md).toContain('Genuinely missing a manifest (proposed for backfill): 1 / 2');
    expect(md).toContain('Fetch failed (auth/rate-limit/network — status UNKNOWN, NOT counted as missing): 0 / 2');
    // SECURITY finding SEC-1 regression: the committed summary must never name a venture.
    expect(md).not.toContain('venture-a');
    expect(md).not.toContain('venture-b');
  });

  it('toMarkdownFull() (local-only artifact) lists every venture repo and proposes backfill only for the unscaffolded ones', async () => {
    const { toMarkdownFull } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const census = {
      totalReposScanned: 4,
      archivedExcluded: 0,
      platformExcluded: ['ehg'],
      ventureRepos: [
        { name: 'venture-a', manifestPresent: true, modules: 'deploy@1.0.0', generatedAt: '2026-08-24T00:00:00.000Z', fetchError: null },
        { name: 'venture-b', manifestPresent: false, modules: null, generatedAt: null, fetchError: null },
      ],
    };
    const md = toMarkdownFull(census, '2026-08-24T00:00:00.000Z');
    expect(md).toContain('venture-a');
    expect(md).toContain('venture-b');
    expect(md).toMatch(/venture-b[\s\S]*Backfill proposal/); // venture-b table row, then the proposal section
    expect(md).toContain('1 venture repo(s) have no scaffold manifest');
  });

  // TESTING finding F8 (EXEC-TO-PLAN review, evidence baa1c962, MEDIUM): a fetch
  // failure (auth/rate-limit/network) must be surfaced as UNKNOWN, never silently
  // collapsed into "missing" -- the report's whole purpose is deciding backfill
  // scope, so a failed instrument must not manufacture confidence.
  it('toMarkdownFull() distinguishes a genuinely fetch-failed repo from one that is genuinely missing a manifest', async () => {
    const { toMarkdownFull } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    const census = {
      totalReposScanned: 3,
      archivedExcluded: 0,
      platformExcluded: ['ehg'],
      ventureRepos: [
        { name: 'venture-missing', manifestPresent: false, modules: null, generatedAt: null, fetchError: null },
        { name: 'venture-rate-limited', manifestPresent: false, modules: null, generatedAt: null, fetchError: 'API rate limit exceeded' },
      ],
    };
    const md = toMarkdownFull(census, '2026-08-24T00:00:00.000Z');
    expect(md).toMatch(/venture-missing.*❌ PROPOSED for backfill/);
    expect(md).toMatch(/venture-rate-limited.*⚠️ UNKNOWN \(fetch failed: API rate limit exceeded\)/);
    // The rate-limited repo must NOT be listed under the backfill proposal.
    const proposalSection = md.slice(md.indexOf('## Backfill proposal'));
    expect(proposalSection).toContain('venture-missing');
    expect(proposalSection).not.toContain('venture-rate-limited');
  });

  it('FR-5 AC#2: main() makes zero write/mutating gh or git calls — only reads', async () => {
    const { main } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    main();

    expect(execCalls.length).toBeGreaterThan(0);
    const WRITE_SHAPED = /\b(push|commit|-X\s*(POST|PATCH|PUT|DELETE)|pr\s+create|repo\s+(delete|edit|create))\b/i;
    for (const call of execCalls) {
      expect(call, `unexpected write-shaped gh/git call: ${call}`).not.toMatch(WRITE_SHAPED);
    }
  });

  it('main() writes the committable summary (no names) and the local-only full report (names) separately (SEC-1 fix)', async () => {
    const { main } = await import('../../../scripts/audits/venture-scaffold-backfill-census.mjs');
    main();

    expect(writeCalls.length).toBe(2);
    const summary = writeCalls.find((c) => c.path === 'docs/audits/venture-scaffold-backfill-census.md');
    const full = writeCalls.find((c) => c.path === 'scripts/temp/venture-scaffold-backfill-census-full.md');
    expect(summary, 'expected the committable summary to be written').toBeDefined();
    expect(full, 'expected the local-only full report to be written').toBeDefined();

    // The committed summary must never leak a venture repo name.
    for (const name of ['venture-a', 'venture-b', 'venture-c', 'venture-d', 'venture-e', 'venture-f']) {
      expect(summary.content).not.toContain(name);
    }
    // The local-only (gitignored, scripts/temp/) report is where the real names live.
    for (const name of ['venture-a', 'venture-b', 'venture-c', 'venture-d', 'venture-e', 'venture-f']) {
      expect(full.content).toContain(name);
    }
    expect(full.content).not.toContain('venture-old-archived');

    // TESTING finding F7 (EXEC-TO-PLAN review, evidence baa1c962, MEDIUM,
    // mutation-proven): the positive arm (a manifest that actually decodes) had
    // never been demonstrated end-to-end -- a broken base64/JSON decode would be
    // indistinguishable from "no repo has a manifest". venture-a/venture-b are
    // mocked (module-level, top of this file) to genuinely have a manifest;
    // assert they are reported PRESENT, and that the non-scaffolded repos are not.
    expect(full.content).toMatch(/venture-a \| ✅ \| deploy@1\.0\.0/);
    expect(full.content).toMatch(/venture-b \| ✅ \| deploy@1\.0\.0/);
    expect(full.content).toMatch(/venture-c \| ❌ PROPOSED for backfill/);
    expect(summary.content).toContain('Already scaffolded (manifest present): 2 / 6');
  });
});
