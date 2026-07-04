/**
 * Unit tests for lib/eva/post-build-verdict-engine.js pure functions and
 * mocked-supabase write/read paths.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  computeDisposition,
  extractUserStoryClaims,
  findEvidenceForClaim,
  upsertVerdict,
  enumerateRequiredArtifacts,
  checkCompleteness,
  resolveVentureRepoPath,
} from '../../../lib/eva/post-build-verdict-engine.js';

describe('computeDisposition()', () => {
  it('MISSING when the artifact is not present, regardless of other inputs', () => {
    expect(computeDisposition({ present: false, evidenceConfidence: 'STRONG', deviationRecords: [] })).toBe('MISSING');
  });

  it('BUILT when present and evidence is STRONG', () => {
    expect(computeDisposition({ present: true, evidenceConfidence: 'STRONG', deviationRecords: [] })).toBe('BUILT');
  });

  it('PARTIAL (never BUILT) when evidence is only WEAK — ambiguity fails toward caution', () => {
    expect(computeDisposition({ present: true, evidenceConfidence: 'WEAK', deviationRecords: [] })).toBe('PARTIAL');
  });

  it('MISSING (never BUILT) when no evidence and no deviation record', () => {
    expect(computeDisposition({ present: true, evidenceConfidence: 'NONE', deviationRecords: [] })).toBe('MISSING');
  });

  it('DEVIATED_WITH_DOCUMENTED_REASON when no evidence but a substantive deviation reason exists', () => {
    const result = computeDisposition({
      present: true, evidenceConfidence: 'NONE',
      deviationRecords: [{ why: 'UX review found a combined flow reduced drop-off in testing' }],
    });
    expect(result).toBe('DEVIATED_WITH_DOCUMENTED_REASON');
  });

  it('DEVIATED_UNDOCUMENTED when a deviation record exists but its reason is thin', () => {
    const result = computeDisposition({
      present: true, evidenceConfidence: 'NONE',
      deviationRecords: [{ why: 'skip' }],
    });
    expect(result).toBe('DEVIATED_UNDOCUMENTED');
  });
});

describe('extractUserStoryClaims()', () => {
  it('extracts from an artifact_data array of strings', () => {
    const claims = extractUserStoryClaims({ artifact_data: ['As a user, I can sign up', 'As a user, I can log in'] });
    expect(claims).toEqual(['As a user, I can sign up', 'As a user, I can log in']);
  });

  it('extracts from an artifact_data.stories array of objects with a title field', () => {
    const claims = extractUserStoryClaims({ artifact_data: { stories: [{ title: 'Signup form' }, { story: 'Login flow' }] } });
    expect(claims).toEqual(['Signup form', 'Login flow']);
  });

  it('extracts from the REAL nested epics[].stories[] shape (as_a/i_want_to/so_that) confirmed live on MarketLens', () => {
    const artifactRow = {
      artifact_data: {
        epics: [
          {
            name: 'Market Data & Search',
            stories: [
              { as_a: 'Strategic Consultant', i_want_to: 'search for market data by industry, geography, and time period', so_that: "I can quickly find relevant information for my client's specific needs." },
            ],
          },
          {
            name: 'Competitive Intelligence',
            stories: [
              { as_a: 'Fractional CMO', i_want_to: 'view a list of top competitors for a specified company or market segment', so_that: 'I can understand the competitive landscape for my client.' },
            ],
          },
        ],
      },
    };
    const claims = extractUserStoryClaims(artifactRow);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toContain('Strategic Consultant');
    expect(claims[0]).toContain('search for market data by industry, geography, and time period');
    expect(claims[1]).toContain('Fractional CMO');
  });

  it('falls back to markdown bullet lines in content when artifact_data is unusable', () => {
    const claims = extractUserStoryClaims({ content: 'Intro text\n- As a user, I can view results\n- As a user, I can export data\n' });
    expect(claims).toEqual(['As a user, I can view results', 'As a user, I can export data']);
  });

  it('returns an empty array (never throws) on unparseable content', () => {
    expect(extractUserStoryClaims({})).toEqual([]);
    expect(extractUserStoryClaims({ content: 'no bullets here' })).toEqual([]);
  });
});

describe('findEvidenceForClaim()', () => {
  let tmpDir;

  function makeRepo(files) {
    tmpDir = mkdtempSync(join(tmpdir(), 'pbve-test-'));
    for (const [relPath, content] of Object.entries(files)) {
      const full = join(tmpDir, relPath);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    }
    return tmpDir;
  }

  it('STRONG confidence when 2+ distinct keywords match in one file', () => {
    const repo = makeRepo({ 'src/routes/signup.js': "router.post('/signup', handleSignupForm);" });
    const result = findEvidenceForClaim({ repoPath: repo, claimText: 'As a user, I can access the signup form' });
    expect(result.confidence).toBe('STRONG');
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    rmSync(repo, { recursive: true, force: true });
  });

  it('STRONG confidence when the file PATH itself matches a keyword (even with weak body content)', () => {
    const repo = makeRepo({ 'src/routes/signup.js': 'module.exports = router;' });
    const result = findEvidenceForClaim({ repoPath: repo, claimText: 'signup functionality description' });
    expect(result.confidence).toBe('STRONG');
    rmSync(repo, { recursive: true, force: true });
  });

  it('WEAK confidence when only exactly one keyword matches in body text, no path hit', () => {
    const repo = makeRepo({ 'src/utils/helpers.js': 'export function formatSignup(x) { return x; }' });
    const result = findEvidenceForClaim({ repoPath: repo, claimText: 'unrelated words signup only match' });
    expect(['WEAK', 'STRONG']).toContain(result.confidence);
    rmSync(repo, { recursive: true, force: true });
  });

  it('NONE confidence when nothing matches', () => {
    const repo = makeRepo({ 'src/index.js': 'console.log("hello world");' });
    const result = findEvidenceForClaim({ repoPath: repo, claimText: 'completely unrelated persona dashboard export' });
    expect(result.confidence).toBe('NONE');
    expect(result.evidenceRefs).toEqual([]);
    rmSync(repo, { recursive: true, force: true });
  });

  it('NONE confidence (never throws) when repoPath does not exist', () => {
    const result = findEvidenceForClaim({ repoPath: '/nonexistent/path/xyz', claimText: 'anything' });
    expect(result.confidence).toBe('NONE');
  });

  it('returns NONE for a claim with no meaningful (non-stopword, >=4 char) keywords', () => {
    const repo = makeRepo({ 'a.js': 'x' });
    const result = findEvidenceForClaim({ repoPath: repo, claimText: 'a to it' });
    expect(result.confidence).toBe('NONE');
    rmSync(repo, { recursive: true, force: true });
  });
});

function createMockSupabase({ upsertResponse = { data: { id: 'verdict-1' }, error: null } } = {}) {
  const upsertCalls = [];
  const from = vi.fn().mockImplementation(() => ({
    upsert: vi.fn().mockImplementation((row, opts) => {
      upsertCalls.push({ row, opts });
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(upsertResponse),
        }),
      };
    }),
  }));
  return { from, _upsertCalls: upsertCalls };
}

describe('upsertVerdict()', () => {
  const baseOpts = { ventureId: 'v1', artifactType: 'blueprint_user_story_pack', claimRef: 'blueprint_user_story_pack:signup', disposition: 'BUILT' };

  it('upserts with the correct onConflict target (grain safety)', async () => {
    const supabase = createMockSupabase();
    const id = await upsertVerdict(supabase, baseOpts);
    expect(id).toBe('verdict-1');
    expect(supabase._upsertCalls[0].opts).toEqual({ onConflict: 'venture_id,artifact_type,claim_ref' });
    expect(supabase._upsertCalls[0].row.venture_id).toBe('v1');
  });

  it('rejects an invalid disposition value', async () => {
    const supabase = createMockSupabase();
    await expect(upsertVerdict(supabase, { ...baseOpts, disposition: 'SORT_OF_BUILT' })).rejects.toThrow(/valid disposition/);
  });

  it('requires ventureId, artifactType, claimRef', async () => {
    const supabase = createMockSupabase();
    await expect(upsertVerdict(supabase, { ...baseOpts, ventureId: undefined })).rejects.toThrow(/ventureId/);
    await expect(upsertVerdict(supabase, { ...baseOpts, artifactType: undefined })).rejects.toThrow(/artifactType/);
    await expect(upsertVerdict(supabase, { ...baseOpts, claimRef: undefined })).rejects.toThrow(/claimRef/);
  });

  it('surfaces a supabase error', async () => {
    const supabase = createMockSupabase({ upsertResponse: { data: null, error: { message: 'upsert failed' } } });
    await expect(upsertVerdict(supabase, baseOpts)).rejects.toThrow(/upsert failed/);
  });
});

describe('enumerateRequiredArtifacts() / checkCompleteness() / resolveVentureRepoPath() — query shape', () => {
  it('enumerateRequiredArtifacts dedupes across stages and preserves stage order', async () => {
    const rows = [
      { stage_number: 13, required_artifacts: ['a', 'b'] },
      { stage_number: 14, required_artifacts: ['b', 'c'] },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    };
    const result = await enumerateRequiredArtifacts(supabase, { throughStage: 14 });
    expect(result).toEqual([
      { artifactType: 'a', requiredAtStage: 13 },
      { artifactType: 'b', requiredAtStage: 13 },
      { artifactType: 'c', requiredAtStage: 14 },
    ]);
  });

  it('checkCompleteness filters is_current=true explicitly', async () => {
    const eqCalls = [];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(function (col, val) {
            eqCalls.push([col, val]);
            return this;
          }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
    await checkCompleteness(supabase, { ventureId: 'v1', artifactType: 'x' });
    expect(eqCalls).toContainEqual(['is_current', true]);
  });

  it('resolveVentureRepoPath returns null when no application has a local_path', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
    const result = await resolveVentureRepoPath(supabase, { ventureId: 'v1' });
    expect(result).toBeNull();
  });
});
