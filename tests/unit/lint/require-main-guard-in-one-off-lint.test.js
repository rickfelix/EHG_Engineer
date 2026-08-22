/**
 * SD-FDBK-ENH-578-SCRIPTS-ONE-001 -- end-to-end test for the driver script
 * (scripts/lint/require-main-guard-in-one-off-lint.mjs), run as a real subprocess against a
 * throwaway fixture directory via --root. Locks in the exact manual verification performed
 * during EXEC: a genuinely unguarded file is caught while both accepted guard shapes, and a
 * pure-exports file with no entrypoint call at all, pass clean.
 *
 * DELIBERATELY placed under tests/unit/lint/ (matching the sibling
 * ismainmodule-classguard-suffixed-variant.test.js), NOT tests/integration/: this suite touches
 * no database, but vitest.config.js routes every tests/integration/**\/*.test.js file into the
 * runtime-gated `db` project PURELY BY DIRECTORY (see DB_INCLUDE and its
 * migration-apply-state-ledger-wiring.test.js precedent comment) -- an undesignated target would
 * report every test here as skipped rather than actually running them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVER = path.resolve(__dirname, '../../../scripts/lint/require-main-guard-in-one-off-lint.mjs');
const REPO_ROOT = path.resolve(__dirname, '../../..');

let fixtureRoot;

function runDriver(root) {
  try {
    const stdout = execFileSync('node', [DRIVER, '--root', root, '--json'], { encoding: 'utf8' });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (err) {
    // execFileSync throws on non-zero exit; stdout is still on the error object.
    return { exitCode: err.status, json: JSON.parse(err.stdout) };
  }
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'require-main-guard-fixture-'));
  const oneOffDir = path.join(fixtureRoot, 'scripts', 'one-off');
  mkdirSync(oneOffDir, { recursive: true });

  // Mirror the real helper's relative import path (../../lib/utils/is-main-module.js from
  // scripts/one-off/) by creating the same lib structure under the fixture root.
  const libDir = path.join(fixtureRoot, 'lib', 'utils');
  mkdirSync(libDir, { recursive: true });
  writeFileSync(path.join(libDir, 'is-main-module.js'), 'export function isMainModule() { return false; }\n');

  writeFileSync(
    path.join(oneOffDir, 'bad-unguarded.mjs'),
    'async function main() { console.log("unguarded"); }\nmain();\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'good-guarded-ismainmodule.mjs'),
    "import { isMainModule } from '../../lib/utils/is-main-module.js';\n" +
      'async function main() { console.log("guarded"); }\n' +
      'if (isMainModule(import.meta.url)) { main(); }\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'good-guarded-fileurltopath.mjs'),
    "import { fileURLToPath } from 'node:url';\n" +
      'async function main() { console.log("guarded"); }\n' +
      'const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];\n' +
      'if (isDirectRun) { main().catch((e) => { console.error(e); process.exit(1); }); }\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'pure-exports.mjs'),
    'export function normalize(value) { return value.trim(); }\n',
  );
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('require-main-guard-in-one-off-lint.mjs (driver, real subprocess)', () => {
  it('inspects all fixture files and flags only the unguarded one', () => {
    const { exitCode, json } = runDriver(fixtureRoot);
    expect(json.scanned).toBe(4);
    expect(exitCode).toBe(1);
    const flagged = json.violations.map((v) => path.basename(v.filePath));
    expect(flagged).toEqual(['bad-unguarded.mjs']);
  });

  it('does not flag either accepted guard shape or a no-entrypoint file', () => {
    const { json } = runDriver(fixtureRoot);
    const flagged = new Set(json.violations.map((v) => path.basename(v.filePath)));
    expect(flagged.has('good-guarded-ismainmodule.mjs')).toBe(false);
    expect(flagged.has('good-guarded-fileurltopath.mjs')).toBe(false);
    expect(flagged.has('pure-exports.mjs')).toBe(false);
  });

  it('is deterministic across repeated runs against an unchanged fixture', () => {
    const first = runDriver(fixtureRoot);
    const second = runDriver(fixtureRoot);
    expect(first.json.violations.map((v) => v.filePath).sort()).toEqual(
      second.json.violations.map((v) => v.filePath).sort(),
    );
  });

  it('an allowlisted violation is excluded from the blocking exit code, and its count is visible in --json', () => {
    // The driver resolves BOTH its allowlist path AND every scanned file's relPath relative to
    // its own location's repo root (never --root) -- so proving real allowlist-matching requires
    // a fixture file that actually lives inside the repo tree (a fixture under an external temp
    // dir can never match a repo-root-relative allowlist key). Uses a real, temporary file under
    // scripts/one-off/ plus a temporary allowlist entry, both cleaned up in `finally`.
    const oneOffDir = path.resolve(REPO_ROOT, 'scripts', 'one-off');
    const tempFileName = `__test-fixture-require-main-guard-${process.pid}.mjs`;
    const tempFilePath = path.join(oneOffDir, tempFileName);
    const allowlistPath = path.resolve(__dirname, '../../../scripts/lint/require-main-guard-in-one-off-allowlist.json');
    const originalAllowlist = readFileSync(allowlistPath, 'utf8');
    try {
      writeFileSync(tempFilePath, 'async function main() { console.log("legacy"); }\nmain();\n');

      // First: confirm it IS flagged with no allowlist entry.
      const before = runDriver(REPO_ROOT);
      expect(before.exitCode).toBe(1);
      expect(before.json.violations.some((v) => v.filePath.endsWith(tempFileName))).toBe(true);
      const grandfatheredBefore = before.json.grandfathered;

      // Then: add it to the allowlist and confirm it's excluded from the violation list and
      // no longer forces a non-zero exit, while the grandfathered COUNT increments by exactly
      // one (this driver reports grandfathered as a count, not a raw list -- matching the
      // established scripts/lint/ismainmodule-classguard-lint.mjs precedent exactly).
      const doc = JSON.parse(originalAllowlist);
      doc.allow[`scripts/one-off/${tempFileName}`] = 'test fixture -- temporarily grandfathered to prove exclusion-from-blocking';
      writeFileSync(allowlistPath, JSON.stringify(doc, null, 2) + '\n');

      const after = runDriver(REPO_ROOT);
      expect(after.json.violations.some((v) => v.filePath.endsWith(tempFileName))).toBe(false);
      expect(after.json.grandfathered).toBe(grandfatheredBefore + 1);
    } finally {
      rmSync(tempFilePath, { force: true });
      writeFileSync(allowlistPath, originalAllowlist);
    }
  });

  it('the allowlist loader throws loud on an entry with an empty reason (never silently accepts it)', () => {
    // Cannot test loadAllowlist by importing the driver module directly: the driver, like its
    // scripts/lint/ismainmodule-classguard-lint.mjs precedent, calls main() unconditionally at
    // module scope (scripts/lint/* CLI tools are deliberately import-unsafe -- only
    // scripts/one-off/* is in this SD's scope) -- importing it would run the WHOLE scan and
    // process.exit() before this test's own assertions ever ran (caught live: the first draft of
    // this test asserted THREW/NO_THROW output and instead observed the driver's own clean-scan
    // banner, because the import's side effect exited the process first). Exercises the real
    // CLI as a subprocess instead, with the real allowlist file temporarily corrupted.
    const allowlistPath = path.resolve(__dirname, '../../../scripts/lint/require-main-guard-in-one-off-allowlist.json');
    const originalAllowlist = readFileSync(allowlistPath, 'utf8');
    try {
      writeFileSync(allowlistPath, JSON.stringify({ _doc: 'test', allow: { 'scripts/one-off/whatever.mjs': '' } }));
      let threw = false;
      let stderr = '';
      try {
        execFileSync('node', [DRIVER], { encoding: 'utf8' });
      } catch (err) {
        threw = true;
        stderr = String(err.stderr || '');
      }
      expect(threw).toBe(true);
      expect(stderr).toContain('non-empty reason');
    } finally {
      writeFileSync(allowlistPath, originalAllowlist);
    }
  });

  it('the real corpus allowlist loads without throwing (every entry has a non-empty reason)', () => {
    // Exercises the actual repo allowlist, not a fixture -- catches a malformed entry landing
    // in a future PR before it breaks CI for everyone.
    const { exitCode } = runDriver(REPO_ROOT);
    // Exit code is 0 (clean) or 1 (ungoverned violations found) -- either is a valid outcome of
    // successfully loading and evaluating the allowlist. A thrown/malformed-allowlist error
    // would produce an uncaught exception and a non-JSON stdout, which JSON.parse above would
    // have already failed on.
    expect([0, 1]).toContain(exitCode);
  });
});
