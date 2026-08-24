import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

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

  // SEC-4 residual (SECURITY re-verification, evidence 8eec89e0): an .error field
  // containing the token in prose ("token X is expired") survived the .error/.message
  // allowlist unredacted, since the allowlist only bounds WHICH field is read, not
  // its contents. Extracts the REAL embedded `node -e` redaction script from the
  // generated workflow and actually EXECUTES it against SECURITY's exact leaking
  // case -- not a static inspection, a real run.
  it('SEC-4 regression: the UAT-failure redaction script actually redacts a token embedded in prose, not just the raw body', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec4-redact-test-'));
    try {
      const src = readFileSync(scaffoldPath, 'utf-8');
      // The node -e script lives inside a JS template literal, so its shell double
      // quotes are unescaped in source (no \" needed) -- and the script itself only
      // ever uses single quotes for JS string literals, so a plain [^"]* is exact.
      const nodeECalls = [...src.matchAll(/node -e "([^"]*)"/g)];
      expect(nodeECalls.length, 'expected to find embedded node -e redaction scripts in scaffold.js').toBeGreaterThanOrEqual(1);
      const script = nodeECalls[0][1];

      const token = 'sess_ABC/DEF+ghi=jkl';
      writeFileSync(join(dir, 'response.json'), JSON.stringify({ error: `token ${token} is expired` }), 'utf-8');

      const out = execFileSync('node', ['-e', script], {
        cwd: dir,
        encoding: 'utf-8',
        env: { ...process.env, CHAIRMAN_UAT_SESSION_TOKEN: token },
      });
      expect(out).not.toContain(token);
      expect(out).toContain('[REDACTED]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SECURITY finding SEC-3 (EXEC-TO-PLAN review, evidence 6f9eabc9): the original
  // stack-scan secret pattern caught only 2 of 7 realistic modern credential formats
  // tested empirically, while still reporting "No committed-secret-shaped patterns
  // found" -- manufactured confidence. This test extracts the SAME regex the generated
  // workflow embeds and proves it now catches every format that was missed.
  it('SEC-3 regression: the stack-scan secret pattern catches modern credential formats it previously missed', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    const match = stackScanYml.content.match(/PATTERN='(.+)'/);
    expect(match, 'expected to find the PATTERN= line in the generated workflow').toBeTruthy();
    const pattern = new RegExp(match[1]);

    // Built via concatenation/repeat (never a literal matching the full shape in
    // source text) so this repo's own pre-commit secret scanner does not false-
    // positive on these deliberately fake test fixtures.
    const shouldMatch = {
      'AWS key': 'AKIA' + 'FAKE'.repeat(4),
      'OpenAI legacy': 'sk-' + 'fake1234567890123456789',
      // SECURITY re-verification (evidence 8eec89e0): the pattern's sk- tail is
      // alphanumeric-only (enumerated prefix, not a widened character class -- see
      // scaffold.js's SEC-3 correction comment), so the fixture must be too.
      'OpenAI sk-proj-': 'sk-proj-' + 'fakeFAKE123'.repeat(2),
      'Stripe live key': 'sk_live_' + 'fake1234567890123456789',
      'GitHub classic PAT': 'ghp_' + 'a'.repeat(36),
      'GitHub OAuth token': 'gho_' + 'a'.repeat(36),
      'GitHub fine-grained PAT': 'github_pat_' + 'a'.repeat(22),
      'Supabase/generic JWT': 'eyJ' + 'fakeHeader'.repeat(2) + '.eyJ' + 'fakePayload'.repeat(2) + '.' + 'fakeSig'.repeat(3),
    };
    for (const [label, sample] of Object.entries(shouldMatch)) {
      expect(pattern.test(sample), `expected pattern to match ${label}: ${sample}`).toBe(true);
    }
  });

  // SECURITY re-verification (evidence 8eec89e0, EXEC-TO-PLAN) found the widened
  // sk- character class ([A-Za-z0-9_-]{20,}) false-positived on ordinary kebab-case
  // code containing "sk-" as a substring -- 5/5 ordinary samples matched. Reverted
  // to an enumerated prefix (sk-(proj-)?[A-Za-z0-9]{20,}); this proves zero false
  // positives on the same class of ordinary code, while shouldMatch above proves
  // the real formats are still caught.
  it('SEC-3 regression: the stack-scan pattern does not false-positive on ordinary kebab-case code', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    const match = stackScanYml.content.match(/PATTERN='(.+)'/);
    const pattern = new RegExp(match[1]);

    const ordinaryCode = [
      'sk-scheduler-configuration-manager',
      'sk-assessment-service-handler',
      'sk-usage-monitoring-subsystem',
      'sk-allocation-planning-module',
      'sk-compositing-render-pipeline-v2',
    ];
    for (const sample of ordinaryCode) {
      expect(pattern.test(sample), `pattern false-positived on ordinary code: ${sample}`).toBe(false);
    }
  });

  it('SEC-3 regression: the stack-scan step distinguishes a git-grep scan error from a clean pass', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    // Must capture the real exit code and branch on it (not `if git grep ...; then`,
    // which collapses "no match" (1) and "scan error" (>1) into the same branch).
    expect(stackScanYml.content).toContain('rc=$?');
    expect(stackScanYml.content).toMatch(/rc"\s*-gt\s*1/);
  });

  // SECURITY re-verification (evidence 8eec89e0) found a `set -e` bug: `git grep ...`
  // as a bare statement followed by a SEPARATE `rc=$?` line means git grep's own
  // exit 1 (no match -- the CLEAN case) trips `set -e` and aborts the script BEFORE
  // `rc=$?` runs, since GitHub Actions runs `run:` blocks as `bash -e {0}`. Empirically
  // reproduced: a secret-free repo exited 1 with zero output under bash -e. The fix is
  // `|| rc=$?`, which captures the exit code without exposing a bare non-zero exit to -e.
  it('SEC-3 regression: the git-grep exit-code capture does not trip bash -e on the clean-repo case', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    // A bare `git grep ... \n rc=$?` (no `||`) would abort under `bash -e` on git
    // grep's own exit 1 (no match) before `rc=$?` ever runs -- the exact bug found.
    expect(stackScanYml.content).toMatch(/git grep[^\n]*\|\|\s*rc=\$\?/);
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

    // TESTING finding F10 (EXEC-TO-PLAN review, evidence baa1c962, LOW): the sync
    // check previously compared keys+versions only -- the `files` arrays (the field
    // FR-1 AC-2 actually cares about, and the most likely to rot) were never
    // cross-checked against what generate() actually returns.
    const outputDir = '/tmp/sync-check-venture';
    for (const key of jsKeys) {
      const generatedFiles = MODULE_REGISTRY[key]
        .generate('sync-check-venture', outputDir, {})
        .map((f) => f.path.slice(outputDir.length + 1).replace(/\\/g, '/'))
        .sort();
      const declaredFiles = [...(staticRegistry.modules[key].files || [])].sort();
      expect(declaredFiles, `${key} files[] drift`).toEqual(generatedFiles);
    }
  });
});
