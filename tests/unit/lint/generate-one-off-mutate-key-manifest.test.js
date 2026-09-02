/**
 * SD-LEO-FIX-TEST-FIXTURE-LANE-001 -- FR-2/TR-4: the manifest generator
 * (scripts/lint/generate-one-off-mutate-key-manifest.mjs) is the sole source of truth for the
 * ENF-18 dangerous-file corpus. Exercises generateManifest() directly against a throwaway git
 * fixture (mirrors require-main-guard-in-one-off-lint.test.js's tracked-only pattern -- the
 * generator's trackedFiles() is git-ls-files-based, so a fixture with no .git would report zero
 * files) plus the --check drift-detection CLI mode as a real subprocess.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateManifest } from '../../../scripts/lint/generate-one-off-mutate-key-manifest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.resolve(__dirname, '../../../scripts/lint/generate-one-off-mutate-key-manifest.mjs');
const REPO_ROOT = path.resolve(__dirname, '../../..');

let gitRoot;

function initGitFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'one-off-mutate-key-manifest-fixture-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  const oneOffDir = path.join(root, 'scripts', 'one-off');
  mkdirSync(oneOffDir, { recursive: true });

  writeFileSync(
    path.join(oneOffDir, 'dangerous.mjs'),
    'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n' +
      'async function main() { await supabase.from("t").update({ x: 1 }); }\n' +
      'main();\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'guarded.mjs'),
    "import { pathToFileURL } from 'node:url';\n" +
      'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n' +
      'async function main() { await supabase.from("t").update({ x: 1 }); }\n' +
      'if (import.meta.url === pathToFileURL(process.argv[1]).href) { main(); }\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'only-key.mjs'),
    'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n' +
      'console.log(key ? "present" : "absent");\n',
  );
  writeFileSync(
    path.join(oneOffDir, 'only-mutate.mjs'),
    'async function main() { await supabase.from("t").update({ x: 1 }); }\n' +
      'main();\n',
  );

  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root });
  return root;
}

beforeAll(() => {
  gitRoot = initGitFixture();
});

afterAll(() => {
  rmSync(gitRoot, { recursive: true, force: true });
});

describe('generateManifest (fixture)', () => {
  it('flags only the file that both mutates and holds the key, and is unguarded', () => {
    const { entries, scanned, mutateAndKey } = generateManifest(gitRoot);
    expect(scanned).toBe(4);
    expect(mutateAndKey).toBe(2); // dangerous.mjs + guarded.mjs
    expect(Object.keys(entries)).toEqual(['scripts/one-off/dangerous.mjs']);
  });

  it('never flags a mutate-only or key-only file (missing the other half of the signature)', () => {
    const { entries } = generateManifest(gitRoot);
    expect(entries['scripts/one-off/only-key.mjs']).toBeUndefined();
    expect(entries['scripts/one-off/only-mutate.mjs']).toBeUndefined();
  });

  it('never flags a properly guarded mutate+key file', () => {
    const { entries } = generateManifest(gitRoot);
    expect(entries['scripts/one-off/guarded.mjs']).toBeUndefined();
  });

  it('is deterministic across repeated runs against an unchanged fixture', () => {
    const first = generateManifest(gitRoot);
    const second = generateManifest(gitRoot);
    expect(first.entries).toEqual(second.entries);
  });
});

describe('generate-one-off-mutate-key-manifest.mjs --check (real subprocess, real repo)', () => {
  it('exits 0 when the committed manifest matches a fresh scan of the real corpus', () => {
    let exitCode = 0;
    try {
      execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
    }
    expect(exitCode).toBe(0);
  });

  it('exits 1 against a fixture root with no committed manifest (drift by construction)', () => {
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [GENERATOR, '--check', '--root', gitRoot], { encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
      stderr = String(err.stderr || '');
    }
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DRIFT');
  });
});
