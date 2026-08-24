import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-2/FR-3: the new 'scaffold_modules_stamped'
// DEFAULT_STEPS entry closes the leo_bridge half of the gap TESTING sub-agent evidence
// 15ada745 flagged — deploy/stack-scan/feedback modules were never auto-invoked at
// provisioning. Mirrors venture-provisioner-scaffold-seeded.test.js's mocking pattern.
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

function scaffoldModulesStep() {
  const step = DEFAULT_STEPS.find((s) => s.name === 'scaffold_modules_stamped');
  if (!step) throw new Error('scaffold_modules_stamped step not found in DEFAULT_STEPS');
  return step;
}

describe('venture-provisioner DEFAULT_STEPS: scaffold_modules_stamped', () => {
  let repoPath;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'scaffold-modules-stamped-test-'));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('check() returns false on a fresh empty clone', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'AcmeVenture', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: [], log: () => {} };
    expect(await scaffoldModulesStep().check(ctx)).toBe(false);
  });

  it('execute() stamps deploy/stack-scan/feedback + the manifest; check() then reports complete', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'AcmeVenture', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: [], log: () => {} };
    await scaffoldModulesStep().execute(ctx);

    expect(existsSync(join(repoPath, '.github', 'workflows', 'deploy.yml'))).toBe(true);
    expect(existsSync(join(repoPath, '.github', 'workflows', 'stack-scan.yml'))).toBe(true);
    expect(existsSync(join(repoPath, 'feedback', 'client.js'))).toBe(true);
    expect(existsSync(join(repoPath, 'scaffold-manifest.json'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(repoPath, 'scaffold-manifest.json'), 'utf-8'));
    expect(manifest.modules.map(m => m.module).sort()).toEqual(['deploy', 'feedback', 'stack-scan']);

    expect(await scaffoldModulesStep().check(ctx)).toBe(true);
  });

  // Adversarial deep-tier review finding (ship-adversarial-review, PR #7482, WARNING):
  // this used to be `check() short-circuits once stepsCompleted includes this step,
  // without touching the repo` -- asserting a real bug as a feature. If execute() ever
  // ran with no repoPath available (a clean no-op, not an error), the step-runner marks
  // it 'completed' and persists that flag; the OLD check() then trusted the flag
  // forever, even once the repo path became available and the manifest still didn't
  // exist -- a silent-skip-forever. check() must always re-verify live, matching
  // cicd_configured's own pattern (which never had this shortcut).
  it('check() does NOT trust a stale stepsCompleted flag -- it always re-verifies the manifest against the live filesystem', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'AcmeVenture', localPath: repoPath }, ventureRepoPath: repoPath, stepsCompleted: ['scaffold_modules_stamped'], log: () => {} };
    // The flag CLAIMS this step is done, but no manifest was ever actually written --
    // check() must not be fooled by the flag alone.
    expect(await scaffoldModulesStep().check(ctx)).toBe(false);
    expect(existsSync(join(repoPath, 'scaffold-manifest.json'))).toBe(false);

    // Once the manifest genuinely exists, check() reports true regardless of the flag.
    await scaffoldModulesStep().execute(ctx);
    expect(await scaffoldModulesStep().check(ctx)).toBe(true);
  });

  it('execute() no-ops gracefully when no local repo path is resolvable', async () => {
    const ctx = { ventureId: 'v1', venture: { name: 'AcmeVenture', localPath: null }, ventureRepoPath: null, stepsCompleted: [], log: () => {} };
    await expect(scaffoldModulesStep().execute(ctx)).resolves.not.toThrow();
  });

  // FR-2 risk regression guard: stage-execution-worker.js:1962 / venture-provisioner.js:862
  // can pass a GitHub URL (not a local path) as ctx.ventureRepoPath in production. This must
  // not crash — existsSync() safely returns false for a URL string, so both check() and
  // execute() must no-op exactly like the "no local repo path" case above.
  it('is safe when ctx.ventureRepoPath is a GitHub URL rather than a local path (stage-execution-worker.js:1962 condition)', async () => {
    const urlCtx = { ventureId: 'v1', venture: { name: 'AcmeVenture', localPath: repoPath }, ventureRepoPath: 'https://github.com/rickfelix/acme-venture', stepsCompleted: [], log: () => {} };
    expect(await scaffoldModulesStep().check(urlCtx)).toBe(false);
    await expect(scaffoldModulesStep().execute(urlCtx)).resolves.not.toThrow();
    // Must not have fallen through to the real localPath and written there either —
    // ventureRepoPath (the URL) wins over localPath per the existing ctx precedence
    // (venture-provisioner.js:862), so nothing should be written at all here.
    expect(existsSync(join(repoPath, 'scaffold-manifest.json'))).toBe(false);
  });

  it('is positioned after cicd_configured in DEFAULT_STEPS', () => {
    const names = DEFAULT_STEPS.map((s) => s.name);
    expect(names.indexOf('scaffold_modules_stamped')).toBeGreaterThan(names.indexOf('cicd_configured'));
  });
});
