/**
 * QF-20260907-023 — session-coordination-insert-classguard-lint.mjs's diff mode selected whole
 * FILES changed vs the merge base (candidateFilesDiff), then re-linted each file's ENTIRE current
 * content — every PRE-EXISTING violation anywhere in a touched file reported as "new", defeating
 * this lint's own stated purpose ("the ~28-site existing phantom backlog... never blocks an
 * unrelated PR"). Measured live on PR #8538: an unrelated stale-session-sweep.cjs edit surfaced
 * 11 pre-existing violations, none on a changed line.
 *
 * Mirrors tests/unit/lint/session-coordination-insert-classguard-lint-ci-fallback.test.js's own
 * convention: spawns the REAL script against a real temp git repo, not a mocked internal function.
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

const VIOLATION_LINE = "supabase.from('session_coordination').insert({ a: 1 });\n";

/** A real repo with origin/main resolvable, a pre-existing violation already on main, and a
 *  `feature` branch that edits the SAME file elsewhere (never touching the violation's line). */
function makeRepoUnrelatedEdit() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classguard-linescope-'));
  const bareRemote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(['init', '-q', '--bare', bareRemote]);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['config', 'user.email', 't@t.com'], work);
  git(['config', 'user.name', 't'], work);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  // A large-ish file so the pre-existing violation sits far from the line the feature branch edits.
  const preExisting = "const supabase = require('x');\n"
    + Array.from({ length: 20 }, (_, i) => `// filler line ${i}\n`).join('')
    + VIOLATION_LINE
    + Array.from({ length: 20 }, (_, i) => `// more filler ${i}\n`).join('')
    + 'function untouched() { return 1; }\n';
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), preExisting);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'pre-existing violation'], work);
  git(['remote', 'add', 'origin', bareRemote], work);
  git(['push', '-q', 'origin', 'main'], work);

  git(['checkout', '-q', '-b', 'feature'], work);
  const edited = preExisting.replace('function untouched() { return 1; }', 'function untouched() { return 2; }');
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), edited);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'unrelated edit far from the violation'], work);
  return work;
}

/** Same shape, but the feature branch's edit IS the violation itself (added on a changed line). */
function makeRepoNewViolation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classguard-linescope-new-'));
  const bareRemote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(['init', '-q', '--bare', bareRemote]);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['config', 'user.email', 't@t.com'], work);
  git(['config', 'user.name', 't'], work);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), "const supabase = require('x');\nfunction f() { return 1; }\n");
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'init'], work);
  git(['remote', 'add', 'origin', bareRemote], work);
  git(['push', '-q', 'origin', 'main'], work);

  git(['checkout', '-q', '-b', 'feature'], work);
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), "const supabase = require('x');\nfunction f() { return 1; }\n" + VIOLATION_LINE);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'introduce a NEW violation'], work);
  return work;
}

function runScript(cwd) {
  const env = { ...process.env };
  return spawnSync('node', [SCRIPT, '--json', '--root', cwd], { cwd, encoding: 'utf8', env });
}

describe('session-coordination-insert-classguard-lint.mjs — line-scoped diff (QF-20260907-023)', () => {
  it('a pre-existing violation on an UNTOUCHED line of an otherwise-edited file does NOT block', () => {
    const work = makeRepoUnrelatedEdit();
    const r = runScript(work);
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('diff');
    expect(out.violations).toHaveLength(0);
    expect(r.status).toBe(0);
  });

  it('ANTI-VACUITY: a genuinely NEW violation on a changed line still blocks', () => {
    const work = makeRepoNewViolation();
    const r = runScript(work);
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('diff');
    expect(out.blocking).toBe(true);
    expect(out.violations.length).toBeGreaterThan(0);
    expect(r.status).toBe(1);
  });
});
