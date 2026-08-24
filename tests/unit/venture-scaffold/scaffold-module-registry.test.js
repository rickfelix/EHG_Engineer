import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-1. Before this SD, templates/venture-scaffold/
// scaffold.js exported nothing and called main() unconditionally at module load — importing
// it (as FR-2's shared generation function must) ran the full CLI flow and called
// process.exit(0), which would have silently killed this very test file's vitest worker.
// Empirically confirmed pre-fix via `node --input-type=module -e "import(...)"`: the process
// exited before any importer code ran. This test proves the fix; it cannot itself demonstrate
// the pre-fix crash without corrupting the test run.

const __dirname = dirname(fileURLToPath(import.meta.url));
const scaffoldPath = join(__dirname, '..', '..', '..', 'templates', 'venture-scaffold', 'scaffold.js');
const registryJsonPath = join(__dirname, '..', '..', '..', 'templates', 'venture-scaffold', 'module-registry.json');

describe('venture-scaffold MODULE_REGISTRY', () => {
  it('scaffold.js is import-safe: importing it does not invoke the CLI', async () => {
    const mod = await import(scaffoldPath);
    expect(mod.MODULE_REGISTRY).toBeDefined();
    expect(typeof mod.main).toBe('function');
  });

  it('exposes all 5 modules, each independently versioned and independently addressable', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const expectedKeys = ['testing', 'ci-cd', 'deploy', 'stack-scan', 'feedback'];
    expect(Object.keys(MODULE_REGISTRY).sort()).toEqual(expectedKeys.sort());
    for (const key of expectedKeys) {
      const mod = MODULE_REGISTRY[key];
      expect(mod.version, `${key}.version`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(typeof mod.generate, `${key}.generate`).toBe('function');
    }
  });

  it('each generate() is pure: returns a files list, no disk writes, given a nonexistent outputDir', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const fakeOutputDir = join(tmpdir(), 'venture-scaffold-purity-check-' + Math.random().toString(36).slice(2));

    for (const [key, mod] of Object.entries(MODULE_REGISTRY)) {
      const files = mod.generate('test-venture', fakeOutputDir, { port: 8080, baseUrl: 'http://localhost:8080' });
      expect(Array.isArray(files), `${key}.generate() should return an array`).toBe(true);
      expect(files.length, `${key}.generate() should return at least one file`).toBeGreaterThan(0);
      for (const file of files) {
        expect(typeof file.path).toBe('string');
        expect(typeof file.content).toBe('string');
      }
      // Purity check: generate() must not have created the (nonexistent) outputDir as a side effect.
      expect(existsSync(fakeOutputDir), `${key}.generate() must not perform disk I/O`).toBe(false);
    }
  });

  it('deploy module content is parameterized (not hard-coded to altifyai-specific literals) but preserves the safety patterns', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY.deploy.generate('acme-venture', '/tmp/acme-venture', {
      buildSecretEnvVar: 'VITE_MY_KEY',
      d1DatabaseName: 'acme-db',
      uatProbePath: '/api/health',
    });
    const deployYml = files.find(f => f.path.endsWith('deploy.yml'));
    expect(deployYml).toBeDefined();
    expect(deployYml.content).toContain('VITE_MY_KEY');
    expect(deployYml.content).toContain('acme-db');
    expect(deployYml.content).toContain('/api/health');
    expect(deployYml.content).toContain('cancel-in-progress: true'); // concurrency guard preserved
    expect(deployYml.content).toContain('post-deploy-signed-in-uat'); // UAT probe preserved
  });

  it('module-registry.json stays in sync with MODULE_REGISTRY (version + module set) — not orphaned dead data', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    expect(existsSync(registryJsonPath)).toBe(true);
    const staticRegistry = JSON.parse(readFileSync(registryJsonPath, 'utf-8'));

    const jsKeys = Object.keys(MODULE_REGISTRY).sort();
    const jsonKeys = Object.keys(staticRegistry.modules).sort();
    expect(jsonKeys).toEqual(jsKeys);

    for (const key of jsKeys) {
      expect(staticRegistry.modules[key].version, `${key} version drift`).toBe(MODULE_REGISTRY[key].version);
    }
  });
});
