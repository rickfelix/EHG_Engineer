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

const { DEFAULT_STEPS } = await import('../../../../lib/eva/bridge/venture-provisioner.js');

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
});
