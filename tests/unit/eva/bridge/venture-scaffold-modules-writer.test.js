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

  it('generated deploy.yml content reflects the venture name via options passthrough', () => {
    const result = applyVentureScaffoldModules('acme-venture', repoDir, {
      modules: ['deploy'],
      moduleOptions: { d1DatabaseName: 'acme-db' },
    });
    const deployYml = readFileSync(join(repoDir, '.github', 'workflows', 'deploy.yml'), 'utf-8');
    expect(deployYml).toContain('acme-db');
    expect(result.written).toContain(join(repoDir, '.github', 'workflows', 'deploy.yml'));
  });
});
