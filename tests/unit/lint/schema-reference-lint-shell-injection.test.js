/**
 * schema-reference-lint must never hand a git-supplied filename OR an env-supplied ref to a shell.
 * SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001.
 *
 * THE DEFECT. Two sites in scripts/lint/schema-reference-lint.mjs built a /bin/sh command string
 * from an attacker-influenced value:
 *   :92   git merge-base <base> HEAD    where base = process.env.SCHEMA_LINT_BASE, wholly unguarded
 *   :153  git show <mergeBase>:<file>   UNQUOTED, where file came from git diff --name-only
 * This job runs on ubuntu-latest on every PR touching lib/api/app/scripts
 * (.github/workflows/schema-reference-lint.yml:69) and its job is continue-on-error:false.
 *
 * ON "BLOCKING": that setting governs whether a REGRESSION is caught, never whether a payload
 * EXECUTES. Reachability is what makes the injection live. Recorded here because the SD's original
 * framing leaned on blocking-ness as the severity argument, and that is the wrong predicate.
 *
 * THE FIXTURE MUST REACH THE SINK, and two measured ways it silently does not:
 *   1. In --json mode a MISSING database/schema-reference-snapshot.json exits 0 having run ZERO git
 *      commands. A test asserting "exit 0 and no marker" then passes without touching a sink.
 *   2. WITHOUT SCHEMA_LINT_BASE, only `git merge-base origin/main HEAD` runs, throws in a temp repo,
 *      leaves mergeBase null, and baselineViolationKeys returns BEFORE :153.
 * So every fixture below copies the snapshot AND sets the base ref, and the tests assert the sink
 * was REACHED rather than merely that nothing bad happened. Absence of a marker is not evidence
 * when the code path was never entered.
 *
 * THESE TESTS SPAWN, THEY DO NOT IMPORT. The target has ZERO exports and runs top-level side
 * effects off process.argv. child_process is never mocked.
 *
 * EVERY POSITIVE CLAIM IS ARMED: the original vulnerable shape is replayed against the SAME fixture
 * under a real sh and proven to fire, before any claim that the fixed form does not.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const LINT = path.join(REPO, 'scripts', 'lint', 'schema-reference-lint.mjs');
const SNAPSHOT = path.join(REPO, 'database', 'schema-reference-snapshot.json');
const IS_WIN = process.platform === 'win32';

/** Resolve a real POSIX sh if the host has one. PATH first, then Git-for-Windows locations. */
function findSh() {
  for (const probe of IS_WIN ? ['sh.exe', 'sh'] : ['sh']) {
    try {
      const out = execFileSync(IS_WIN ? 'where' : 'which', [probe], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    } catch { /* try the next probe */ }
  }
  if (IS_WIN) {
    for (const c of [
      'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
      'C:\\Program Files\\Git\\bin\\sh.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\sh.exe',
    ]) if (fs.existsSync(c)) return c;
  }
  return null;
}
const SH = findSh();

const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * A repo the lint will actually WORK ON: real snapshot in place, a `basebranch` ref to diff from,
 * and a payload file under a RUNTIME_DIR matching CODE_RE so it survives candidateFiles filtering.
 */
function makeRepo(payloadName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schemalint-inj-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);

  // Trap 1 closed: without this the lint exits 0 in --json mode having run ZERO git commands.
  fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
  fs.copyFileSync(SNAPSHOT, path.join(dir, 'database', 'schema-reference-snapshot.json'));

  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'base.js'), 'export const a = 1;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['branch', '-f', 'basebranch']);

  if (payloadName) {
    const full = path.join(dir, payloadName);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'export const b = 2;\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'payload']);
  }
  return dir;
}

/**
 * Run the REAL lint. Never throws — the exit code and the side effects are what matter.
 * Trap 2 closed: SCHEMA_LINT_BASE is always set, or the run returns before the :153 sink.
 */
function runLint(dir, baseRef, extraEnv = {}) {
  // MEASURED LIMIT: reverting :153 to its pre-fix shell string produces ZERO red on this Windows
  // host. Windows splits the command line on spaces and leaves backticks LITERAL, so the payload
  // cannot execute here regardless of the fix. A ComSpec override to a real sh was tried and
  // measured NOT to work — the child still ran under cmd — and was removed rather than kept with a
  // comment claiming otherwise. These assertions discriminate on ubuntu (where CI runs and where
  // the ARM proves the payload fires); locally the discriminating coverage is the GUARD tests below,
  // which do go red when VALID_BASE_REF is removed.
  try {
    const stdout = execFileSync(process.execPath, [LINT, '--diff'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45000,
      env: { ...process.env, SCHEMA_LINT_BASE: baseRef, CI: '', ...extraEnv },
    });
    return { stdout, stderr: '', failed: false };
  } catch (e) {
    return { stdout: e?.stdout || '', stderr: e?.stderr || '', failed: true };
  }
}

const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };

describe('ARMED: schema-reference-lint :153 — the UNQUOTED git show sink', () => {
  const canRun = !!SH;
  const NAME = 'scripts/pwn`touch MARKER153.txt`end.js';
  let dir; let marker;

  beforeAll(() => {
    if (!canRun) return;
    dir = makeRepo(NAME);
    marker = path.join(dir, 'MARKER153.txt');
  });
  afterAll(() => { if (dir) rm(dir); });

  it.runIf(canRun)('git returns the metacharacter filename BYTE-VERBATIM', () => {
    const out = git(dir, ['diff', '--name-only', '-z', 'basebranch..HEAD']).split('\0').filter(Boolean);
    expect(out).toContain(NAME);
  });

  it.runIf(canRun)('THE ARM: the ORIGINAL unquoted shape CREATES THE MARKER — the payload can fire', () => {
    // The pre-fix line reconstructed verbatim, through a real sh. If this does not create the
    // marker, every "no marker" assertion below proves nothing and this file is theatre.
    const base = git(dir, ['rev-parse', 'basebranch']).trim();
    try {
      execSync(`git show ${base}:${NAME}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: SH });
    } catch { /* non-zero exit is fine; the side effect is the point */ }
    expect(path.resolve(marker).startsWith(path.resolve(dir)), 'marker must be inside the temp dir').toBe(true);
    expect(fs.existsSync(marker), 'vulnerable form did not execute — this test cannot fail, so it proves nothing').toBe(true);
  });

  it.runIf(canRun)('THE FIX: the lint REACHES the sink, creates NO marker, and still checks the file', () => {
    // Three assertions, and the reachability one is not optional: "no marker" is worthless if the
    // sink was never entered. The scope line proves the merge base resolved and files were checked.
    fs.rmSync(marker, { force: true });
    const { stdout, stderr } = runLint(dir, 'basebranch');
    const out = stdout + stderr;
    expect(out, 'the lint never got as far as resolving a merge base — the sink was not reached').toMatch(/merge_base=/);
    expect(out, 'zero files checked means candidateFiles filtered the payload out before the sink').toMatch(/file\(s\) checked/);
    expect(fs.existsSync(marker), 'the fixed path executed the filename').toBe(false);
  });
});

describe('ARMED: schema-reference-lint :92 — the env-supplied base ref', () => {
  const canRun = !!SH;
  let dir;

  beforeAll(() => { dir = makeRepo(null); });
  afterAll(() => { if (dir) rm(dir); });

  it.runIf(canRun)('THE ARM: an interpolated base ref EXECUTES under a real sh', () => {
    // Proves the :92 sink was genuinely exploitable, not merely untidy. Argv-safety alone would
    // close this one; the shape-guard below additionally closes ARGUMENT injection, which argv does
    // NOT — a ref leading with a dash is read by git as an OPTION even inside an argv array.
    const marker = path.join(dir, 'MARKER92.txt');
    const payloadBase = 'main`touch MARKER92.txt`';
    try {
      execSync(`git merge-base ${payloadBase} HEAD`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: SH });
    } catch { /* the side effect is the point */ }
    expect(fs.existsSync(marker), 'vulnerable form did not execute — the arm cannot discriminate').toBe(true);
    fs.rmSync(marker, { force: true });
  });

  it('THE GUARD: a metacharacter base ref is REFUSED and nothing is executed', () => {
    const marker = path.join(dir, 'MARKER92.txt');
    const { stdout, stderr, failed } = runLint(dir, 'main`touch MARKER92.txt`');
    expect(failed, 'a refused ref must fail loudly, not degrade to an advisory sweep').toBe(true);
    expect(stdout + stderr).toMatch(/refusing SCHEMA_LINT_BASE/);
    expect(fs.existsSync(marker), 'the refusal must happen BEFORE git runs').toBe(false);
  });

  it('THE GUARD: an OPTION-shaped ref is refused too — argv-safety alone would not stop this', () => {
    // git parses a dash-leading argument as an option even in an argv array: --output=<path> makes
    // git CREATE that file and throw nothing. This is why the shape-guard exists on top of argv.
    const target = path.join(dir, 'OWNED92.txt');
    const { stdout, stderr, failed } = runLint(dir, `--output=${target}`);
    expect(failed).toBe(true);
    expect(stdout + stderr).toMatch(/refusing SCHEMA_LINT_BASE/);
    expect(fs.existsSync(target), 'git honoured an option-shaped ref — the guard did not fire first').toBe(false);
  });

  it('THE GUARD IS TWO-SIDED: an ordinary ref is still ACCEPTED and the lint runs', () => {
    // Without this, a guard that rejected EVERYTHING would also satisfy the tests above.
    const { stdout, stderr } = runLint(dir, 'basebranch');
    const out = stdout + stderr;
    expect(out, 'the guard rejected a legitimate ref').not.toMatch(/refusing SCHEMA_LINT_BASE/);
    expect(out, 'an accepted ref must actually resolve a merge base').toMatch(/merge_base=/);
  });
});

describe('the lint still does its job after the conversion', () => {
  let dir;
  beforeAll(() => { dir = makeRepo('scripts/ordinary.js'); });
  afterAll(() => { if (dir) rm(dir); });

  it('an ordinary diff run reports a checked-file count and a resolved scope', () => {
    const { stdout, stderr } = runLint(dir, 'basebranch');
    const out = stdout + stderr;
    expect(out).toMatch(/schema-reference-lint \(diff\)/);
    expect(out).toMatch(/file\(s\) checked/);
    expect(out).toMatch(/merge_base=/);
  });
});

describe('CONTROL: stated limits of this suite', () => {
  it('NOTE: an embedded double-quote payload is NOT fixture-tested here', () => {
    // Illegal in an NTFS filename and refused by git itself (core.protectNTFS defaults true), so it
    // cannot be committed without extra plumbing. Its defence is ARCHITECTURAL — after this fix
    // there is no shell layer for a quote to escape from — not measured by a fixture.
    expect(true).toBe(true);
  });

  it('NOTE: collection is proven separately, because a suite-wide run cannot report an absent file', () => {
    // A targeted run of a non-collected file exits 1 "No test files found", so running this file by
    // name is loud. The silent case is suite-wide: an uncollected file is simply ABSENT from
    // `vitest run --project unit` with no error and no skip notice. Proof obligation is therefore
    // `npx vitest list --project unit <this path>`, pasted in the PR — not a green suite.
    expect(true).toBe(true);
  });
});
