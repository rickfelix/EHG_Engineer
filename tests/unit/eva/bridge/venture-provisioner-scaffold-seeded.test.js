import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (TS-1, TS-2): the new 'scaffold_seeded' DEFAULT_STEPS
// entry is what closes the QF-20260706-168 gap — leo_bridge ventures were missing
// CLAUDE.md/docs/build-tasks.md/.replit because they never call replit-repo-seeder.js's
// seedRepo(). Mock the DB client so execute() reads stack_descriptor as null (Replit-path
// default) without a live Supabase connection.
vi.mock('../../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

const { DEFAULT_STEPS, ensureLeoBridgeScaffold } = await import('../../../../lib/eva/bridge/venture-provisioner.js');

function scaffoldStep() {
  const step = DEFAULT_STEPS.find((s) => s.name === 'scaffold_seeded');
  if (!step) throw new Error('scaffold_seeded step not found in DEFAULT_STEPS');
  return step;
}

describe('venture-provisioner DEFAULT_STEPS: scaffold_seeded', () => {
  let repoPath;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'leo-bridge-scaffold-test-'));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('check() returns false on a fresh empty clone (TS-1)', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'MarketLens', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: [], log: () => {} };
    const done = await scaffoldStep().check(ctx);
    expect(done).toBe(false);
  });

  it('execute() writes CLAUDE.md, docs/build-tasks.md, and .replit (TS-1)', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'MarketLens', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: [], log: () => {} };
    await scaffoldStep().execute(ctx);

    expect(existsSync(join(repoPath, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(repoPath, 'docs', 'build-tasks.md'))).toBe(true);
    expect(existsSync(join(repoPath, '.replit'))).toBe(true);

    const claudeMd = readFileSync(join(repoPath, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toMatch(/MarketLens/);
    expect(claudeMd).not.toMatch(/design-prompts\.md/);

    // check() must now report complete.
    const done = await scaffoldStep().check(ctx);
    expect(done).toBe(true);
  });

  it('execute() is idempotent — re-running does not overwrite a hand-tuned CLAUDE.md or .replit (TS-2)', async () => {
    writeFileSync(join(repoPath, 'CLAUDE.md'), '# hand-tuned\n');
    writeFileSync(join(repoPath, '.replit'), 'run = "custom"\n');

    const ctx = { ventureId: 'v1', venture: { name: 'MarketLens', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: [], log: () => {} };
    await scaffoldStep().execute(ctx);

    expect(readFileSync(join(repoPath, 'CLAUDE.md'), 'utf8')).toBe('# hand-tuned\n');
    expect(readFileSync(join(repoPath, '.replit'), 'utf8')).toBe('run = "custom"\n');
    // build-tasks.md is always (re)written -- it is a point-in-time export, not hand-tuned.
    expect(existsSync(join(repoPath, 'docs', 'build-tasks.md'))).toBe(true);
  });

  it('check() short-circuits once scaffold_seeded is in stepsCompleted, without touching the repo', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'MarketLens', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: ['scaffold_seeded'], log: () => {} };
    const done = await scaffoldStep().check(ctx);
    expect(done).toBe(true);
    expect(existsSync(join(repoPath, 'CLAUDE.md'))).toBe(false);
  });

  it('execute() no-ops gracefully when no local repo path is resolvable', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'MarketLens', localPath: null }, ventureRepoPath: null, stepsCompleted: [], log: () => {} };
    await expect(scaffoldStep().execute(ctx)).resolves.not.toThrow();
  });

  // Regression guard for the adversarial-review finding: scaffold_seeded MUST run after
  // schema_created (which seeds a default Cloudflare stack_descriptor for a new venture) —
  // running before it would bake a permanently-wrong Replit-flavored CLAUDE.md/.replit into
  // a Cloudflare-targeted repo, since the step's fresh read would see no descriptor yet.
  it('is positioned AFTER schema_created in DEFAULT_STEPS (stack_descriptor ordering)', () => {
    const names = DEFAULT_STEPS.map((s) => s.name);
    expect(names.indexOf('scaffold_seeded')).toBeGreaterThan(names.indexOf('schema_created'));
  });
});

// Regression guard for the adversarial-review deadlock finding: the fix must be callable
// standalone, independent of provisionVenture()'s top-level 'completed' status early-return
// and _verifyAndProvisionVenture()'s 'provisioned' short-circuit -- both of which mean an
// ALREADY-provisioned venture (the exact population QF-20260706-168 reported) can never
// reach DEFAULT_STEPS at all. ensureLeoBridgeScaffold is the self-heal path the S19 gate
// calls directly for exactly that case.
describe('ensureLeoBridgeScaffold (standalone, callable outside provisionVenture)', () => {
  let repoPath;
  const fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { name: 'MarketLens', stack_descriptor: null }, error: null }) }),
      }),
    }),
  };

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'ensure-leo-bridge-scaffold-test-'));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('writes all 3 files given only (ventureId, repoPath) and an injected supabase client', async () => {
    const result = await ensureLeoBridgeScaffold('v1', repoPath, { ventureName: 'MarketLens', supabase: fakeSupabase, logger: () => {} });
    expect(existsSync(join(repoPath, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(repoPath, 'docs', 'build-tasks.md'))).toBe(true);
    expect(existsSync(join(repoPath, '.replit'))).toBe(true);
    expect(result.written).toEqual(expect.arrayContaining(['CLAUDE.md', 'docs/build-tasks.md', '.replit']));
  });

  it('returns written:[] preserved:[] and touches nothing when repoPath does not exist', async () => {
    const result = await ensureLeoBridgeScaffold('v1', join(repoPath, 'does-not-exist'), { ventureName: 'MarketLens', supabase: fakeSupabase, logger: () => {} });
    expect(result).toEqual({ written: [], preserved: [] });
  });

  it('is idempotent on a second call — preserves existing CLAUDE.md/.replit, refreshes build-tasks.md', async () => {
    await ensureLeoBridgeScaffold('v1', repoPath, { ventureName: 'MarketLens', supabase: fakeSupabase, logger: () => {} });
    const secondResult = await ensureLeoBridgeScaffold('v1', repoPath, { ventureName: 'MarketLens', supabase: fakeSupabase, logger: () => {} });
    expect(secondResult.preserved).toEqual(expect.arrayContaining(['CLAUDE.md', '.replit']));
    expect(secondResult.written).toEqual(['docs/build-tasks.md']);
  });
});
