/**
 * Unit tests for lib/deleteVentureFully.js — the single-venture destructive
 * teardown helper.
 *
 * SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-D (Phase 4): locks the security
 * invariants of the irreversible destructive path so a future edit cannot
 * regress them. Every external effect is mocked — no real shell, GitHub,
 * Supabase, network, or filesystem mutation — so this runs under the no-DB
 * `unit` Vitest project.
 *
 * Invariants asserted:
 *   FR-2  PROTECTED_REPOS guard: gh repo delete is NOT invoked for
 *         rickfelix/ehg or rickfelix/EHG_Engineer, IS invoked for a
 *         non-protected venture repo.
 *   FR-3  SAFE_SLUG_RE: a slug with shell metacharacters is rejected before
 *         any execSync invocation.
 *   FR-4  Phase ordering: credential revocation runs BEFORE the delete_venture
 *         DB delete (so a DB cascade can never orphan live credentials).
 *   FR-5  Non-blocking error capture: a thrown teardown phase is captured into
 *         the structured result and the blocking DB delete still proceeds.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { execSyncMock, runTeardownMock, markResourcesMock, cleanupCredsMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  runTeardownMock: vi.fn(),
  markResourcesMock: vi.fn(),
  cleanupCredsMock: vi.fn(),
}));

vi.mock('child_process', () => ({ execSync: execSyncMock }));
vi.mock('../../lib/cleanup/index.js', () => ({ runTeardown: runTeardownMock }));
vi.mock('../../lib/venture-resources.js', () => ({ markResourcesCleaned: markResourcesMock }));
vi.mock('../../lib/cleanup/credentials.js', () => ({ cleanup: cleanupCredsMock }));
// supabase-client is imported at module load but never invoked when options.supabase
// is supplied; mock it so no real client is constructed during the test.
vi.mock('../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: vi.fn() }));

import {
  deleteVentureFully,
  parseRepoSlug,
  isProtectedRepo,
  PROTECTED_REPOS,
} from '../../lib/deleteVentureFully.js';

const VENTURE_ID = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

/**
 * Build a mock injectable supabase client.
 * @param {string|null} repoUrl  github_repo_url returned by the provisioning lookup
 * @param {Function}    [rpc]    custom rpc mock (defaults to a successful delete_venture)
 * ventureName is intentionally left null so the phase-7 registry/fs path is skipped.
 */
function makeSupabase(repoUrl = null, rpc) {
  const provChain = {
    select: () => provChain,
    eq: () => provChain,
    maybeSingle: vi.fn().mockResolvedValue({
      data: { venture_id: VENTURE_ID, venture_name: null, github_repo_url: repoUrl },
      error: null,
    }),
  };
  return {
    from: vi.fn(() => provChain),
    rpc: rpc || vi.fn().mockResolvedValue({ data: { success: true, deleted_counts: {} }, error: null }),
  };
}

describe('deleteVentureFully — destructive path security invariants', () => {
  beforeEach(() => {
    execSyncMock.mockReset();
    runTeardownMock.mockReset().mockResolvedValue({ success: true });
    markResourcesMock.mockReset().mockResolvedValue(1);
    cleanupCredsMock.mockReset().mockResolvedValue({ revoked: [], failed: [], skipped: [] });
  });

  it('returns an error and touches nothing when ventureId is missing', async () => {
    const result = await deleteVentureFully(null, { supabase: makeSupabase() });
    expect(result.success).toBe(false);
    expect(result.error).toBe('ventureId is required');
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  // FR-2: PROTECTED_REPOS guard ------------------------------------------------
  it('FR-2: invokes gh repo delete <slug> --yes for a NON-protected venture repo', async () => {
    const supabase = makeSupabase('https://github.com/rickfelix/canvas-ai');
    const result = await deleteVentureFully(VENTURE_ID, { supabase });

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toBe('gh repo delete rickfelix/canvas-ai --yes');
    expect(result.phases.github_repo.status).toBe('deleted');
    expect(result.phases.github_repo.slug).toBe('rickfelix/canvas-ai');
  });

  it.each([
    ['rickfelix/ehg', 'https://github.com/rickfelix/ehg'],
    ['rickfelix/EHG_Engineer', 'https://github.com/rickfelix/EHG_Engineer'],
    ['rickfelix/ehg_engineer (case-variant)', 'https://github.com/rickfelix/ehg_engineer'],
  ])('FR-2: NEVER invokes gh repo delete for protected repo %s', async (_label, url) => {
    const supabase = makeSupabase(url);
    const result = await deleteVentureFully(VENTURE_ID, { supabase });

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(result.phases.github_repo.status).toBe('skipped');
    expect(result.phases.github_repo.reason).toMatch(/PROTECTED/);
  });

  // FR-3: slug-injection rejection ---------------------------------------------
  it.each([
    'https://github.com/rickfelix/evil;whoami',
    'https://github.com/rickfelix/repo$(rm -rf /)',
    'https://github.com/rickfelix/repo with spaces',
  ])('FR-3: rejects unsafe slug before any shell invocation (%s)', async (url) => {
    const supabase = makeSupabase(url);
    const result = await deleteVentureFully(VENTURE_ID, { supabase });

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(result.phases.github_repo.status).toBe('failed');
    expect(result.phases.github_repo.reason).toMatch(/invalid or unsafe/);
  });

  // FR-4: phase ordering — credentials BEFORE DB delete ------------------------
  it('FR-4: revokes credentials BEFORE the delete_venture DB delete', async () => {
    const order = [];
    cleanupCredsMock.mockImplementation(async () => {
      order.push('credentials');
      return { revoked: [], failed: [], skipped: [] };
    });
    const rpc = vi.fn().mockImplementation(async () => {
      order.push('db_delete');
      return { data: { success: true, deleted_counts: {} }, error: null };
    });

    await deleteVentureFully(VENTURE_ID, { supabase: makeSupabase(null, rpc) });

    expect(cleanupCredsMock).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['credentials', 'db_delete']);
  });

  // FR-5: non-blocking error capture -------------------------------------------
  it('FR-5: captures a thrown teardown phase without aborting the DB delete', async () => {
    runTeardownMock.mockRejectedValue(new Error('vercel teardown exploded'));
    const rpc = vi.fn().mockResolvedValue({ data: { success: true, deleted_counts: {} }, error: null });

    const result = await deleteVentureFully(VENTURE_ID, { supabase: makeSupabase(null, rpc) });

    expect(result.phases.teardown).toEqual({ success: false, error: 'vercel teardown exploded' });
    expect(rpc).toHaveBeenCalledTimes(1); // DB delete still ran
    expect(result.success).toBe(true);
  });

  it('aborts (success=false) when the blocking DB delete itself fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc boom' } });
    const supabase = makeSupabase('https://github.com/rickfelix/canvas-ai', rpc);

    const result = await deleteVentureFully(VENTURE_ID, { supabase });

    expect(result.success).toBe(false);
    expect(result.phases.db.success).toBe(false);
    expect(execSyncMock).not.toHaveBeenCalled(); // never reached the gh delete after DB failure
  });

  it('dryRun: skips the DB delete and the gh repo delete', async () => {
    const rpc = vi.fn();
    const supabase = makeSupabase('https://github.com/rickfelix/canvas-ai', rpc);

    const result = await deleteVentureFully(VENTURE_ID, { supabase, dryRun: true });

    expect(rpc).not.toHaveBeenCalled();
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(result.phases.db.dryRun).toBe(true);
    expect(result.phases.github_repo.status).toBe('skipped');
  });
});

// Pure-function units — cheap, deterministic, and document the guard contract.
describe('parseRepoSlug / isProtectedRepo', () => {
  it('extracts owner/repo from a github URL and strips .git', () => {
    expect(parseRepoSlug('https://github.com/rickfelix/canvas-ai.git')).toEqual({
      slug: 'rickfelix/canvas-ai',
      valid: true,
    });
  });

  it('flags slugs with shell metacharacters as invalid', () => {
    expect(parseRepoSlug('https://github.com/rickfelix/evil;whoami').valid).toBe(false);
    expect(parseRepoSlug(null)).toEqual({ slug: null, valid: false });
  });

  it('treats the core repos (and lowercase variants) as protected', () => {
    expect(isProtectedRepo('rickfelix/ehg')).toBe(true);
    expect(isProtectedRepo('rickfelix/EHG_Engineer')).toBe(true);
    expect(isProtectedRepo('rickfelix/canvas-ai')).toBe(false);
    expect(PROTECTED_REPOS.has('rickfelix/ehg')).toBe(true);
  });
});
