/**
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-B — integration tests for the
 * Claude-Code-ready artifact wiring in seedRepo(). Verifies the three Child-A
 * writers are invoked on the live seed path so a seeded venture repo actually
 * receives CLAUDE.md, docs/build-tasks.md, and a minimal .replit — and that an
 * existing CLAUDE.md/.replit is PRESERVED (same rule as replit.md).
 *
 * Mocks seedRepo's IO (supabase, git, fs) — mirrors replit-repo-seeder.persist-url.test.js.
 *
 * TEST_REQUIRES_DB: false — @supabase/supabase-js is vi.mock'd below, so this is
 * a pure no-DB unit test (safe in the no-DB `unit` vitest project). This explicit
 * declaration satisfies the audit-db-test-guards signal: the supabase import here
 * is a mock target, not a live-DB dependency. (The guard's static check matches
 * the literal "@supabase/supabase-js" string in the vi.mock call and cannot infer
 * the mock on its own — auto-detecting vi.mock'd DB clients is a logged guard
 * enhancement, not a blocker for this mocked suite.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeCalls = [];
let lastFromTable = null;

vi.mock('../../../lib/venture-resources.js', () => ({
  registerVentureResource: vi.fn(() => Promise.resolve({ id: 'res-1', status: 'active' })),
}));

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((p, content) => writeCalls.push({ path: String(p), content: String(content) })),
  readFileSync: vi.fn(() => ''),
  // Default: artifact files absent (so they get written); dirs present (skip clone).
  existsSync: vi.fn((p) => !/(?:CLAUDE\.md|\.replit|replit\.md)$/.test(String(p).replace(/\\/g, '/'))),
}));

function buildSupabaseMock(screens) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, in() { return chain; },
    order() { return chain; }, limit() { return chain; },
    single() {
      if (lastFromTable === 'ventures') {
        return Promise.resolve({ data: { name: 'CanvasAI', target_platform: 'web', metadata: { doc_format: 'agent-optimized' } }, error: null });
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
          { artifact_type: 'blueprint_wireframes', content: JSON.stringify({ wireframes: { screens } }) },
        ] },
      ] },
      error: null,
    })),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => buildSupabaseMock([{ name: 'Dashboard' }, { name: 'Studio' }])),
}));

const seedPaths = () => writeCalls.map(c => c.path.replace(/\\/g, '/'));

beforeEach(async () => {
  writeCalls.length = 0;
  lastFromTable = null;
  const fs = await import('fs');
  fs.existsSync.mockImplementation((p) => !/(?:CLAUDE\.md|\.replit|replit\.md)$/.test(String(p).replace(/\\/g, '/')));
});

describe('seedRepo() — Claude-Code-ready artifacts (Child B wiring)', () => {
  it('writes CLAUDE.md, docs/build-tasks.md, and .replit into the seeded repo', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    await seedRepo('v-1', 'https://github.com/foo/bar.git');
    const paths = seedPaths();
    expect(paths.some(p => /\/CLAUDE\.md$/.test(p))).toBe(true);
    expect(paths.some(p => /\/docs\/build-tasks\.md$/.test(p))).toBe(true);
    expect(paths.some(p => /\/docs\/design-prompts\.md$/.test(p))).toBe(true); // FR-2 (TS-2)
    expect(paths.some(p => /\/\.replit$/.test(p))).toBe(true);
  });

  it('pins the backend rules in CLAUDE.md and derives build-tasks from the venture screens', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    await seedRepo('v-1', 'https://github.com/foo/bar.git');
    const claude = writeCalls.find(c => /\/CLAUDE\.md$/.test(c.path.replace(/\\/g, '/')));
    expect(claude).toBeDefined();
    expect(claude.content).toMatch(/never\s+Supabase/i);
    expect(claude.content).toContain('VITE_CLERK_PUBLISHABLE_KEY');
    const tasks = writeCalls.find(c => /build-tasks\.md$/.test(c.path));
    expect(tasks).toBeDefined();
    expect(tasks.content).toContain('Dashboard');
    expect(tasks.content).toContain('Studio');
  });

  it('preserves an existing CLAUDE.md / .replit (never overwrites the repo\'s own)', async () => {
    const fs = await import('fs');
    fs.existsSync.mockImplementation(() => true); // everything present → preserve path
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');
    await seedRepo('v-1', 'https://github.com/foo/bar.git');
    const paths = seedPaths();
    expect(paths.some(p => /\/CLAUDE\.md$/.test(p))).toBe(false); // preserved, not rewritten
    expect(paths.some(p => /\/\.replit$/.test(p))).toBe(false);   // preserved, not rewritten
    expect(paths.some(p => /build-tasks\.md$/.test(p))).toBe(true); // docs always regenerated
  });
});
