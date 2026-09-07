/**
 * QF-20260905-934 — session-coordination-insert-classguard-lint.yml's actions/checkout@v4 had no
 * fetch-depth: 0, so origin/main was never resolvable in CI: candidateFilesDiff() always threw,
 * and the script silently fell back to `--all (advisory)`, which is explicitly non-blocking
 * (`blocking = mode === 'diff'`). A gate that presents as genuinely blocking (no continue-on-error)
 * but structurally can never actually block is a zero-yield gate -- it read as wired while
 * catching nothing. Verified live on merged PR #8235 (run 33963260337): '41 violation(s) ...
 * not blocking', exit 0.
 *
 * This pins two things end-to-end via the REAL script (spawned, real temp git repos -- not a
 * mocked internal function) so a future edit cannot silently reopen the hole:
 *   1. With a real origin/main reachable, diff mode succeeds and IS blocking on a violation.
 *   2. With origin/main genuinely unresolvable AND CI=true, the script now fails LOUD (exit 1,
 *      distinct message) instead of silently degrading to advisory -- the fix's own hardening.
 *   3. The SAME unresolvable-base case OUTSIDE CI (no CI env var) still gets the original,
 *      unchanged local-dev advisory fallback (never blocking) -- CI=true is the sole behavior
 *      change, not a global tightening.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/lint/session-coordination-insert-classguard-lint.mjs');

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

/** A minimal real git repo with a `main` branch, an `origin` remote (itself, for a real fetchable
 *  ref), and one committed file. Optionally a second branch (`feature`) with an UNCOMMITTED-vs-main
 *  violating file, to exercise diff mode's actual blocking behavior. */
function makeRepo({ withOriginMain, withViolation }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classguard-ci-'));
  const bareRemote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(['init', '-q', '--bare', bareRemote]);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['config', 'user.email', 't@t.com'], work);
  git(['config', 'user.name', 't'], work);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(work, 'scripts', 'placeholder.js'), '// nothing here\n');
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'init'], work);
  if (withOriginMain) {
    git(['remote', 'add', 'origin', bareRemote], work);
    git(['push', '-q', 'origin', 'main'], work);
  }
  if (withViolation) {
    git(['checkout', '-q', '-b', 'feature'], work);
    fs.writeFileSync(
      path.join(work, 'scripts', 'violation.js'),
      "const supabase = require('x');\nsupabase.from('session_coordination').insert({ a: 1 });\n"
    );
    git(['add', '.'], work);
    git(['commit', '-q', '-m', 'introduce violation'], work);
  }
  return work;
}

function runScript(cwd, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  // Ensure a clean CI signal: explicitly unset when the test wants "not CI" (the test-runner's
  // OWN environment commonly has CI=true set, which would otherwise leak into the "local dev"
  // case and mask the very behavior this test exists to distinguish).
  if (envOverrides.CI === undefined) delete env.CI;
  // --root is REQUIRED: the script's scanRoot comes ONLY from this flag (defaulting to the
  // script's own REPO_ROOT otherwise) -- cwd alone does not redirect candidateFilesDiff's git
  // commands or the file walk to the fixture repo.
  return spawnSync('node', [SCRIPT, '--json', '--root', cwd], { cwd, encoding: 'utf8', env });
}

describe('session-coordination-insert-classguard-lint.mjs — CI fail-closed on unresolvable diff base (QF-20260905-934)', () => {
  it('origin/main resolvable, a real violation present: diff mode blocks (exit 1)', () => {
    const work = makeRepo({ withOriginMain: true, withViolation: true });
    const r = runScript(work);
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('diff');
    expect(out.blocking).toBe(true);
    expect(out.violations.length).toBeGreaterThan(0);
    expect(r.status).toBe(1);
  });

  it('origin/main unresolvable + CI=true: fails LOUD (exit 1), distinct misconfiguration message -- never silently advisory', () => {
    const work = makeRepo({ withOriginMain: false, withViolation: false });
    const r = runScript(work, { CI: 'true' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/diff base unavailable in CI/);
    expect(r.stderr).toMatch(/Fix the workflow/);
  });

  it('origin/main unresolvable, NOT CI (local dev): unchanged advisory fallback, never blocks', () => {
    const work = makeRepo({ withOriginMain: false, withViolation: false });
    const r = runScript(work); // no CI env
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('all (degraded)');
    expect(out.blocking).toBe(false);
    expect(r.status).toBe(0);
  });
});
