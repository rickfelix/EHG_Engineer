/**
 * SD-LEO-INFRA-SUB-AGENT-REPO-001 — pins the ordering + wiring gap a TESTING sub-agent review
 * flagged: unit tests alone proved applySubAgentRepoVerdict() synthesizes conditions/justification
 * (resolve-sub-agent-repo.test.js) and that resolveTargetApplicationForRegression() has the right
 * precedence (regression-target-application-precedence.test.js), but nothing exercised execute()'s
 * actual control flow to confirm applySubAgentRepoVerdict() genuinely runs BEFORE storeResults()'s
 * insert, and that the insert payload it builds actually carries what that mutation produced. A
 * regression that moved the call back to the end of execute() (the pre-fix bug) would pass 100% of
 * the other new tests while reproducing the original defect.
 *
 * child_process.exec is mocked wholesale so this stays a fast, hermetic unit test — regression.js's
 * phase helpers (npm test, npx madge, grep) would otherwise shell out to real subprocesses against a
 * throwaway repo path, which is slow and non-deterministic. resolveSubAgentRepo is mocked to force
 * the failing-resolution branch directly (its own resolution logic is covered elsewhere); the REAL
 * applySubAgentRepoVerdict is used via importOriginal, since that is exactly what this test verifies
 * actually wires into the stored row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.mock('child_process', () => ({
  exec: (_cmd, _opts, callback) => callback(null, '{}', ''),
}));

vi.mock('../../../lib/sub-agents/resolve-repo.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveSubAgentRepo: vi.fn().mockResolvedValue({
      repoPath: null,
      repoResolved: false,
      registrySource: 'fallback',
    }),
  };
});

vi.mock('../../../scripts/modules/sd-id-normalizer.js', () => ({
  normalizeSDId: vi.fn().mockResolvedValue('fake-sd-uuid-0001'),
}));

const inserted = [];
// Mutable per-test fixture for the strategic_directives_v2 lookup -- lets the "SD not found"
// test below swap in a not-found response without a second vi.mock block.
let sdLookupResponse = {
  data: { id: 'fake-sd-uuid-0001', sd_type: 'infrastructure', intensity_level: null, status: 'active', target_application: 'EHG_Engineer' },
  error: null,
};

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn().mockResolvedValue({
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => sdLookupResponse,
            }),
          }),
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          insert: async (payload) => {
            inserted.push(payload);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  }),
}));

describe('regression.js execute() — repo-verdict/insert ordering (SD-LEO-INFRA-SUB-AGENT-REPO-001)', () => {
  let tmpDir;

  beforeEach(async () => {
    inserted.length = 0;
    sdLookupResponse = {
      data: { id: 'fake-sd-uuid-0001', sd_type: 'infrastructure', intensity_level: null, status: 'active', target_application: 'EHG_Engineer' },
      error: null,
    };
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'regression-ordering-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('the stored row carries the repo-resolution downgrade -- conditions/justification/metadata all present', async () => {
    const { execute } = await import('../../../lib/sub-agents/regression.js');

    await execute('fake-sd-uuid-0001', {}, {
      repo_path: tmpDir,
      engineer_path: tmpDir,
      fullValidation: true,
    });

    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.verdict).toBe('CONDITIONAL_PASS');
    expect(row.metadata).toBeTruthy();
    expect(row.metadata.repo_resolved).toBe(false);
    expect(row.metadata.repo_path).toBeNull();
    expect(Array.isArray(row.conditions)).toBe(true);
    expect(row.conditions.length).toBeGreaterThan(0);
    expect(typeof row.justification).toBe('string');
    expect(row.justification.length).toBeGreaterThanOrEqual(50);
  });

  it('resolves normally with verdict=ERROR (never rejects) when the SD is not found', async () => {
    // Deep-tier adversarial review finding: moving getSDDetails() ahead of resolveSubAgentRepo()
    // must not silently change execute()'s documented never-rejects contract. This pins it.
    sdLookupResponse = { data: null, error: { message: 'no rows found' } };
    const { execute } = await import('../../../lib/sub-agents/regression.js');

    const results = await execute('missing-sd-id', {}, {
      repo_path: tmpDir,
      engineer_path: tmpDir,
      fullValidation: true,
    });

    expect(results.verdict).toBe('ERROR');
    expect(results.confidence).toBe(0);
    expect(results.critical_issues.length).toBeGreaterThan(0);
    // The failure never reached storeResults() -- nothing should have been inserted.
    expect(inserted).toHaveLength(0);
  });
});
