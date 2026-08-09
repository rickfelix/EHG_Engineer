/**
 * collectSdDiff must never hand a git-supplied filename to a shell.
 * SD-LEO-FIX-SHELL-INJECTION-RCE-001.
 *
 * THE DEFECT. The per-file diff read `run(\`git diff ${baseRef}...HEAD -- "${path}"\`)`, where
 * `path` came straight out of `git diff --name-only`. execSync runs a command STRING through
 * /bin/sh on POSIX and cmd.exe on Windows, so a committed file whose NAME contained $(...) or a
 * backtick executed as a command — inside a process holding SUPABASE_SERVICE_ROLE_KEY. Double
 * quotes did not save it: under sh they suppress ; and & but command substitution still expands
 * inside them.
 *
 * WHY THIS FILE EXISTS AT ALL. Before it, the git-shelling path had ZERO coverage.
 * harness-adapter.test.js exercises gate shape and fail-open-on-missing-appPath; the sibling
 * operator-contract.test.js deliberately AVOIDS collectSdDiff and says so in its own docblock.
 * Nothing anywhere fed this function an adversarial filename.
 *
 * EVERY POSITIVE CLAIM HERE IS ARMED FIRST. Each "the fix holds" assertion is paired with a run
 * of the ORIGINAL vulnerable shape against the SAME fixture, proving the payload really fires on
 * this platform. Without that, "no marker was created" is indistinguishable from "the payload was
 * never capable of firing here" — which is exactly how a security test becomes decorative.
 *
 * child_process is NEVER mocked. collectSdDiff calls its runner TWICE per file (enumeration, then
 * the per-file diff), and the per-file call is the RCE line — a mock that inspects only the first
 * call would miss the defect entirely. These tests drive real git against real temp repos.
 *
 * PLATFORM SPLIT, measured rather than assumed:
 *   - $(...) / backtick fire under POSIX sh. Under Windows' default execSync (cmd.exe) they do
 *     NOT — cmd performs no command substitution, so vulnerable and fixed forms BOTH produce no
 *     marker and the assertion cannot discriminate. That arm therefore forces a resolved sh.exe
 *     on win32, and skips honestly if none is present.
 *   - %VAR% is the mirror image: inert under sh, but cmd.exe expands it BEFORE git sees the
 *     argument, so git matches no pathspec and exits 0 with an EMPTY diff and NO error. That is
 *     the silent-evasion vector, and it is the arm that fires on Windows with no shell-forcing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSdDiff } from '../harness-adapter.js';

const IS_WIN = process.platform === 'win32';

/** Resolve a real POSIX sh, if this host has one. Git-for-Windows ships one. */
function findSh() {
  // Try the PATH lookup under both spellings, then the Git-for-Windows install locations. A
  // hardcoded path alone would be wrong (portable/minimal Git installs differ), and a PATH lookup
  // alone misses the common case where Git's usr/bin is not on PATH — which is exactly how this
  // arm ends up silently skipped on a machine that could in fact run it.
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

/** A temp repo with a base commit on `main` and a second commit adding `files`. */
function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rce-fixture-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['branch', '-f', 'basebranch']);
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'add fixtures']);
  return dir;
}

const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };

describe('ARMED: the $(...) / backtick payload really executes under a POSIX shell', () => {
  // Skips honestly when no sh is available rather than passing vacuously.
  const canRun = !!SH;
  let dir; let payloadName; let markerPath;

  beforeAll(() => {
    if (!canRun) return;
    payloadName = 'pwn`touch MARKER.txt`end.txt';
    dir = makeRepo({ [payloadName]: 'x\n' });
    markerPath = path.join(dir, 'MARKER.txt');
  });
  afterAll(() => { if (dir) rm(dir); });

  it.runIf(canRun)('git returns the metacharacter filename BYTE-VERBATIM — it does not escape it for you', () => {
    const out = git(dir, ['diff', '--name-only', '-z', 'basebranch...HEAD']).split('\0').filter(Boolean);
    expect(out).toContain(payloadName);
  });

  it.runIf(canRun)('THE ARM: the ORIGINAL vulnerable shape CREATES THE MARKER — the payload can fire', () => {
    // This is the pre-fix line, reconstructed verbatim, run through a real sh. If this does not
    // create the marker, every "no marker" assertion below is meaningless and this file is
    // theatre — so it is asserted, not assumed.
    try {
      execSync(`git diff basebranch...HEAD -- "${payloadName}"`, {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: SH,
      });
    } catch { /* the shell may exit non-zero; the side effect is what matters */ }
    expect(path.resolve(markerPath).startsWith(path.resolve(dir)), 'marker must be inside the temp dir').toBe(true);
    expect(fs.existsSync(markerPath), 'vulnerable form did not execute — this test cannot fail, so it proves nothing').toBe(true);
  });

  it.runIf(canRun)('THE FIX: collectSdDiff creates NO marker, AND still reports the file', () => {
    // Both halves are required. "No marker" alone would also be satisfied by a fix that simply
    // stopped seeing the file — which would trade the RCE for a silent-evasion hole and be worse
    // than the defect.
    fs.rmSync(markerPath, { force: true });
    const { changedFiles } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(fs.existsSync(markerPath), 'the fixed path executed the filename').toBe(false);
    expect(changedFiles.map((f) => f.path), 'the adversarial file must remain VISIBLE, not silently dropped')
      .toContain(payloadName);
  });
});

describe('ARMED: the %VAR% silent-evasion vector (fires on Windows defaults, no shell-forcing)', () => {
  const NAME = 'f%PATH%.js';
  let dir;
  beforeAll(() => { dir = makeRepo({ [NAME]: 'const a = 1;\n' }); });
  afterAll(() => { if (dir) rm(dir); });

  it.runIf(IS_WIN)('THE ARM: the ORIGINAL vulnerable shape reads an EMPTY diff and throws NOTHING', () => {
    // cmd.exe expands %PATH% before git sees the argument, so git matches no pathspec and exits
    // 0. No error means the per-file catch never fires: the file reads as "present but with no
    // added lines". A gate that can be made to see nothing.
    let out = null; let threw = false;
    try {
      out = execSync(`git diff basebranch...HEAD -- "${NAME}"`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { threw = true; }
    expect(threw, 'the silent vector must NOT throw — that is what makes it silent').toBe(false);
    expect(out.trim(), 'vulnerable form saw a non-empty diff, so this arm cannot discriminate').toBe('');
  });

  it('THE FIX: the percent-name file is read for real — added lines are recovered', () => {
    const { changedFiles, unreadable } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    const entry = changedFiles.find((f) => f.path === NAME);
    expect(entry, 'percent-named file missing from changedFiles').toBeTruthy();
    expect(entry.added, 'added lines were not recovered — the argument was mangled before git saw it')
      .toContain('const a = 1;');
    expect(unreadable, 'no file should be unreadable in this fixture').toEqual([]);
  });
});

describe('the ordinary path is unchanged — including the .sql branch', () => {
  let dir;
  beforeAll(() => {
    // A .sql file is REQUIRED here: collectSdDiff branches on /\.sql$/i into a separate
    // migrations + createdTables extraction that also flows through the runner being changed.
    // A fixture of only .js files would never exercise it, and the claim that those outputs are
    // protected would be asserting something it never touched.
    dir = makeRepo({
      'a.js': 'const x = 1;\n',
      'db/m.sql': 'CREATE TABLE IF NOT EXISTS widgets (id uuid primary key);\n',
    });
  });
  afterAll(() => { if (dir) rm(dir); });

  it('a .sql file routes to migrations, a .js file to changedFiles — the split is preserved', () => {
    // Written first as "changedFiles contains both", which FAILED: .sql paths go to `migrations`,
    // not `changedFiles`. Corrected to the contract the code actually implements rather than the
    // one assumed — the test was wrong, not the code, and pinning the real split is the point of
    // exercising this branch at all.
    const { changedFiles, migrations } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(changedFiles.map((f) => f.path)).toContain('a.js');
    expect(migrations.map((m) => m.path)).toContain('db/m.sql');
    expect(changedFiles.find((f) => f.path === 'a.js').added).toContain('const x = 1;');
  });

  it('the .sql branch still yields migrations and createdTables', () => {
    const { migrations, createdTables } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(migrations.map((m) => m.path)).toContain('db/m.sql');
    expect(createdTables).toContain('widgets');
  });

  it('an unchanged branch yields an EMPTY array, not one empty-string entry', () => {
    // The old newline split produced [''] for an empty diff and leaned on filter(Boolean); the
    // NUL split must behave the same way rather than emitting a phantom path.
    const { changedFiles } = collectSdDiff({ appPath: dir, baseRef: 'HEAD' });
    expect(changedFiles).toEqual([]);
  });
});

/**
 * Build a repo whose commit contains paths the FILESYSTEM refuses. `:` and a literal newline are
 * both illegal in an NTFS filename, and `git add`/`update-index` validate the worktree path — so
 * the payloads below cannot be committed the ordinary way. `mktree` writes a tree object
 * directly, which is legitimate here precisely because collectSdDiff reads TREES (`a...b`) and
 * never needs a checkout. Without this the two vectors below would be untestable on Windows and
 * would have shipped on a promise.
 */
function makeRepoRaw(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rce-raw-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['branch', '-f', 'basebranch']);
  const parent = git(dir, ['rev-parse', 'HEAD']).trim();

  const entries = [['base.txt', git(dir, ['rev-parse', 'HEAD:base.txt']).trim()]];
  for (const [name, body] of Object.entries(files)) {
    const sha = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: body, encoding: 'utf8' }).trim();
    entries.push([name, sha]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const spec = entries.map(([name, sha]) => `100644 blob ${sha}\t${name}\0`).join('');
  const tree = execFileSync('git', ['mktree', '-z'], { cwd: dir, input: spec, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['commit-tree', tree, '-p', parent, '-m', 'raw fixtures'], { cwd: dir, encoding: 'utf8' }).trim();
  git(dir, ['update-ref', 'refs/heads/main', commit]);
  return dir;
}

describe('ARMED: SEC-R1 — pathspec magic survives `--` (the argv fix alone did NOT close this)', () => {
  // Found by adversarial review AFTER the argv fix landed, and it falsified a comment shipped
  // with that fix ("nothing parses it as syntax"). `--` ends OPTION parsing; it leaves PATHSPEC
  // MAGIC live. Strictly worse than the %VAR% vector: that one needs cmd.exe, this works
  // everywhere. Fixed with --literal-pathspecs in the runner.
  const ATTACK = ':(literal)hidden.sql';
  const CONTROL = 'hidden.sql';
  const SQL = 'CREATE TABLE IF NOT EXISTS stealth_table (id uuid primary key);\n';
  // TWO SEPARATE REPOS, deliberately. The first version of this fixture put both files in ONE
  // repo and the arm FAILED — because `:(literal)hidden.sql` means "the literal path
  // hidden.sql", the magic name resolved onto its own control sitting beside it and returned a
  // perfectly good diff. A single-repo fixture cannot express this vector at all: the payload
  // needs the plain name to be ABSENT for the empty read to be the empty read. Caught by the arm,
  // which is the entire reason the arm exists.
  let dir; let controlDir;
  beforeAll(() => {
    dir = makeRepoRaw({ [ATTACK]: SQL });
    controlDir = makeRepoRaw({ [CONTROL]: SQL });
  });
  afterAll(() => { if (dir) rm(dir); if (controlDir) rm(controlDir); });

  it('THE ARM: without --literal-pathspecs git returns an EMPTY diff and throws NOTHING', () => {
    // The blinding itself, proven on this host before anything is claimed about the fix.
    // Zero bytes AND no throw is what makes it silent: the per-file catch never fires, so
    // `unreadable` stays empty and the gate reports a clean read of a file it never read.
    let threw = false; let out = null;
    try {
      out = execFileSync('git', ['diff', 'basebranch...HEAD', '--', ATTACK], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { threw = true; }
    expect(threw, 'the vector must NOT throw — that is what makes it silent').toBe(false);
    expect(out, 'git already reads this path literally, so this arm cannot discriminate').toBe('');
  });

  it('THE ARM, other side: the SAME CONTENT under an ordinary name is read fine', () => {
    // Two-sided by construction — identical bytes, identical fixture machinery, only the NAME
    // differs. Without this, an empty diff could just mean the fixture never had content, and
    // the vector above would be indistinguishable from a broken makeRepoRaw.
    const out = execFileSync('git', ['diff', 'basebranch...HEAD', '--', CONTROL], { cwd: controlDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    expect(out).toContain('CREATE TABLE');
  });

  it('THE FIX: collectSdDiff reads the magic-named file — the blocking CREATOR check is not blinded', () => {
    const { migrations, createdTables, unreadable } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    const entry = migrations.find((m) => m.path === ATTACK);
    expect(entry, 'magic-named migration missing entirely').toBeTruthy();
    expect(entry.sql, 'the file was enumerated but its CONTENT was never read — still blinded').toContain('CREATE TABLE');
    expect(createdTables, 'detectCreator would see no table and the CREATOR check would flip').toContain('stealth_table');
    expect(unreadable, 'a silently-empty read must never look like a successful one').toEqual([]);
  });
});

describe('ARMED: -z is load-bearing, not cosmetic', () => {
  // Added because a mutation review measured this honestly: deleting -z and restoring the old
  // split('\n')+trim left the ENTIRE suite green. The -z half of the fix shipped with zero
  // discriminating coverage, and the test that CLAIMED to guard it only pinned behaviour common
  // to both forms. A newline in the name is the case that actually separates them.
  const NAME = 'we\nird.js';
  let dir;
  beforeAll(() => { dir = makeRepoRaw({ [NAME]: 'const nl = 1;\n' }); });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: WITHOUT -z git C-QUOTES the name, so a newline split shreds it into fragments', () => {
    const quoted = execFileSync('git', ['diff', '--name-only', 'basebranch...HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const fragments = quoted.split('\n').map((s) => s.trim()).filter(Boolean);
    // The discriminating claim is that the old form does NOT yield the true name. It fails by
    // C-QUOTING rather than by splitting — git emits "we\nird.js" with a two-character \n escape
    // inside literal quotes, so the old parser produced one CONFIDENTLY WRONG path rather than
    // several obvious fragments. That is the worse failure of the two: a wrong name still looks
    // like a name, and would have been reported as a real changed file.
    expect(fragments, 'the pre-fix parser must NOT be able to recover the true name').not.toContain(NAME);
    expect(fragments.some((f) => f.startsWith('"')), 'git did not quote at all here, so -z buys nothing on this host').toBe(true);
  });

  it('THE FIX: the newline-named file survives enumeration BYTE-EXACT and its content is read', () => {
    const { changedFiles } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    const entry = changedFiles.find((f) => f.path === NAME);
    expect(entry, 'newline filename did not round-trip — the NUL split or the dropped .trim() regressed').toBeTruthy();
    expect(entry.added).toContain('const nl = 1;');
  });
});

describe('SEC-R2: an option-shaped baseRef is refused, not silently defaulted', () => {
  let dir;
  beforeAll(() => { dir = makeRepo({ 'a.js': 'const x = 1;\n' }); });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: git honours an option-shaped ref as an OPTION and creates a file, throwing nothing', () => {
    // Argv-safety stops SHELLS, not ARGUMENT injection. Proven here rather than asserted, so the
    // guard below is known to be defending something real.
    const target = path.join(dir, 'OWNED.txt');
    let threw = false;
    try {
      execFileSync('git', ['diff', `--output=${target}`, '--', 'a.js'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { threw = true; }
    expect(threw, 'the primitive must be silent to be dangerous').toBe(false);
    expect(fs.existsSync(target), 'git did not honour --output, so this arm proves nothing').toBe(true);
  });

  it('THE GUARD: collectSdDiff REFUSES it — loudly, rather than falling back to origin/main', () => {
    // A silent fallback would make a rejected ref indistinguishable from an accepted one.
    expect(() => collectSdDiff({ appPath: dir, baseRef: '--output=pwned.txt' })).toThrow(/unsafe shape/);
    expect(fs.existsSync(path.join(dir, 'pwned.txt')), 'the refusal must happen BEFORE git runs').toBe(false);
  });

  it('the ordinary default ref shape is still accepted', () => {
    // Two-sided: a guard that rejects everything would also pass the test above.
    expect(() => collectSdDiff({ appPath: dir, baseRef: 'basebranch' })).not.toThrow();
  });
});

describe('CONTROL: stated limits of this suite', () => {
  it('NOTE: an embedded double-quote payload is NOT fixture-tested here', () => {
    // Stated rather than quietly omitted. `"` is illegal in an NTFS filename AND git itself
    // refuses such a path (core.protectNTFS defaults to true, cross-platform), so it cannot be
    // committed without -c core.protectNTFS=false plumbing. Its defence is ARCHITECTURAL — after
    // this fix there is no shell layer for a quote to escape from — not measured by a fixture.
    // This assertion exists to keep that admission in the suite instead of only in a PR body.
    expect(true).toBe(true);
  });
});
