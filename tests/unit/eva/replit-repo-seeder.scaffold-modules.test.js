/**
 * SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-2 — integration test proving seedRepo()
 * (the seeded_repo provisioning path) actually stamps the deploy/stack-scan/feedback
 * MODULE_REGISTRY modules + the scaffold manifest, AND that the git-add allowlist
 * includes those paths so they get staged/pushed rather than silently dropped (the
 * exact gap TESTING sub-agent evidence 15ada745 found in the original PRD:
 * replit-repo-seeder.js:1341's hard-coded allowlist did not include any scaffold path).
 *
 * Mocks seedRepo's IO (supabase, git, fs) — mirrors replit-repo-seeder.claude-code-ready.test.js.
 * TEST_REQUIRES_DB: false — @supabase/supabase-js is vi.mock'd below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeCalls = [];
const existingPaths = new Set(); // paths that "exist" for existsSync, beyond the base always-true default
let lastFromTable = null;

vi.mock('../../../lib/venture-resources.js', () => ({
  registerVentureResource: vi.fn(() => Promise.resolve({ id: 'res-1', status: 'active' })),
}));

const execCalls = [];
vi.mock('child_process', () => ({ execSync: vi.fn((cmd) => { execCalls.push(String(cmd)); return ''; }) }));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((p, content) => writeCalls.push({ path: String(p).replace(/\\/g, '/'), content: String(content) })),
  // A minimal, ALWAYS-parseable manifest so applyVentureScaffoldModules' own
  // post-write self-check (checkScaffoldManifest) passes under this generic mock.
  readFileSync: vi.fn(() => JSON.stringify({ generated_at: new Date().toISOString(), modules: [{ module: 'deploy', version: '1.0.0' }] })),
  // TESTING finding F2 (EXEC-TO-PLAN review, evidence baa1c962, HIGH): a blanket
  // "true for everything except CLAUDE.md/.replit/replit.md" mock gave the git-add
  // allowlist gating in replit-repo-seeder.js ZERO effective coverage -- mutation-
  // tested by repointing all 3 gates at nonexistent paths and confirming the test
  // suite stayed fully green. Genuinely path-aware now: "exists" only for
  // CLAUDE.md/.replit/replit.md's absence special-case, or a path that was actually
  // written (or a directory containing something actually written) via writeFileSync
  // during THIS call -- close enough to real disk semantics to exercise the gating.
  existsSync: vi.fn((p) => {
    const norm = String(p).replace(/\\/g, '/');
    if (/(?:CLAUDE\.md|\.replit|replit\.md)$/.test(norm)) return false;
    return writeCalls.some((c) => c.path === norm || c.path.startsWith(`${norm}/`));
  }),
}));

function buildSupabaseMock() {
  const chain = {
    select() { return chain; }, eq() { return chain; }, in() { return chain; },
    order() { return chain; }, limit() { return chain; },
    single() {
      if (lastFromTable === 'ventures') {
        return Promise.resolve({ data: { name: 'AcmeVenture', target_platform: 'web' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    update() { return chain; }, upsert() { return chain; },
  };
  return {
    from: vi.fn((table) => { lastFromTable = table; return chain; }),
    rpc: vi.fn(() => Promise.resolve({
      data: { groups: [
        { group_key: 'how_to_build_it', artifacts: [
          { artifact_type: 'blueprint_wireframes', content: JSON.stringify({ wireframes: { screens: [{ name: 'Dashboard' }] } }) },
        ] },
      ] },
      error: null,
    })),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => buildSupabaseMock()),
}));

beforeEach(() => {
  writeCalls.length = 0;
  execCalls.length = 0;
  existingPaths.clear();
  lastFromTable = null;
});

describe('seedRepo() — FR-2 scaffold module wiring', () => {
  it('stamps deploy/stack-scan/feedback modules + scaffold-manifest.json into the seeded repo', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    const result = await seedRepo('v-1', 'https://github.com/foo/bar.git');

    const paths = writeCalls.map(c => c.path);
    expect(paths.some(p => p.endsWith('.github/workflows/deploy.yml'))).toBe(true);
    expect(paths.some(p => p.endsWith('.github/workflows/stack-scan.yml'))).toBe(true);
    expect(paths.some(p => p.endsWith('feedback/client.js'))).toBe(true);
    expect(paths.some(p => p.endsWith('feedback/server.js'))).toBe(true);
    expect(paths.some(p => p.endsWith('scaffold-manifest.json'))).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('FR-2 regression guard: the git-add allowlist includes the new scaffold paths, not just docs/replit.md/CLAUDE.md/.replit', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    await seedRepo('v-1', 'https://github.com/foo/bar.git');

    const addCall = execCalls.find(c => c.startsWith('git add '));
    expect(addCall, 'expected a `git add ...` call').toBeDefined();
    expect(addCall).toContain('.github/workflows/');
    expect(addCall).toContain('feedback/');
    expect(addCall).toContain('scaffold-manifest.json');
    // Pre-existing paths must still be present — this fix must not regress them.
    expect(addCall).toContain('docs/');
    expect(addCall).toContain('CLAUDE.md');
  });

  // TESTING finding F2's genuine negative arm: when the scaffold write genuinely
  // fails (nothing lands on disk), the gates must correctly EXCLUDE those paths --
  // proving the existsSync checks are load-bearing, not vacuously true.
  it('negative arm: when the scaffold module write fails, its paths are excluded from git add (pre-existing docs are still committed)', async () => {
    const fs = await import('fs');
    fs.writeFileSync.mockImplementation((p, content) => {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.includes('.github/workflows/') || norm.includes('/feedback/') || norm.endsWith('scaffold-manifest.json')) {
        throw new Error('simulated disk failure for scaffold module files');
      }
      writeCalls.push({ path: norm, content: String(content) });
    });

    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    const result = await seedRepo('v-1', 'https://github.com/foo/bar.git');

    expect(result.errors.some((e) => e.includes('scaffold modules'))).toBe(true);
    const addCall = execCalls.find((c) => c.startsWith('git add '));
    expect(addCall).toBeDefined();
    expect(addCall).not.toContain('.github/workflows/');
    expect(addCall).not.toContain('feedback/');
    expect(addCall).not.toContain('scaffold-manifest.json');
    expect(addCall).toContain('docs/');
    expect(addCall).toContain('CLAUDE.md');
  });
});
