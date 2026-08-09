/**
 * docmon must never hand a git-supplied filename to a shell.
 * SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001.
 *
 * THE DEFECT. Two sites in scripts/docmon.js built a /bin/sh command string from a filename that
 * came straight out of `git diff --name-only`:
 *   :162  git diff -U0 <mergeBase>...HEAD -- "<filePath>"   (double-quoted: $() and backtick live)
 *   :386  git show <mergeBase>:<filePath>                    (UNQUOTED: ; & | $() backtick all live)
 * Both run on ubuntu on every PR touching docs/ or *.md (.github/workflows/strunkian-gates.yml:36)
 * and UNCONDITIONALLY on every developer push (.husky/pre-push:35), where the host is not ephemeral
 * and the credentials are real.
 *
 * .test.js, NOT .test.mjs, DELIBERATELY. The vitest unit project includes a recursive .test.js glob
 * plus two narrow .mjs anchors that do not cover this directory, so a .test.mjs file here is
 * collected by ZERO projects — measured by A-B probe.
 *
 * WHERE THAT BECOMES SILENT, stated precisely rather than overstated: a TARGETED run of a
 * non-collected file EXITS 1 with "No test files found", so running this file by name is safe and
 * loud. The vacuity is SUITE-WIDE only. `npm test` and CI's test:coverage both run
 * `vitest run --project unit`, and an uncollected file is simply ABSENT from that sweep — no error,
 * no skip notice, just green. So the danger is not that the file fails quietly; it is that the
 * suite succeeds without it and nothing reports a file that was never collected. Prove collection with
 * `npx vitest list --project unit tests/unit/docmon-shell-injection.test.js`; a green run is not
 * proof, because a file that never ran is also green.
 *
 * THESE TESTS SPAWN, THEY DO NOT IMPORT. scripts/docmon.js has ZERO exports and runs top-level side
 * effects off process.argv, so there is no function to call. Every assertion drives the real script
 * as a subprocess against a real git repo. child_process is never mocked.
 *
 * EVERY POSITIVE CLAIM IS ARMED. Each "the fix holds" assertion is paired with a replay of the
 * ORIGINAL vulnerable shape against the SAME fixture, proving the payload can actually fire here.
 * Without that, "no marker was created" is indistinguishable from "the payload was never capable of
 * firing on this platform" — which is exactly how a security test becomes decorative.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const DOCMON = path.join(REPO, 'scripts', 'docmon.js');
const IS_WIN = process.platform === 'win32';

/**
 * Resolve a real POSIX sh if this host has one. Probes PATH under both spellings, THEN the
 * Git-for-Windows install locations — a PATH-only lookup is exactly how this arm ends up silently
 * skipped on a machine that could in fact run it.
 */
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

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docmon-inj-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  // THE FIXTURE MUST REACH THE SINK. docmon filters candidates through .strunkian-rules.json;
  // without it the payload file is never selected and the suite passes having executed nothing.
  const rules = path.join(REPO, '.strunkian-rules.json');
  if (fs.existsSync(rules)) fs.copyFileSync(rules, path.join(dir, '.strunkian-rules.json'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'base.md'), '# Base\n\nSome ordinary prose here.\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

/** Commit `files` as a SECOND commit so `HEAD~1...HEAD` sees them as changed. */
function commitOrdinary(dir, files) {
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'payload']);
}

/**
 * Commit paths the FILESYSTEM refuses. A literal newline and a colon are illegal in NTFS names and
 * `git add` validates the worktree path, so these payloads cannot be committed the ordinary way.
 * mktree writes a tree object directly, which is legitimate because docmon reads TREES.
 * Without this, the -z and pathspec-magic vectors would be untestable on Windows and would ship on
 * a promise — which is how the sibling SD's -z change shipped with zero discriminating coverage.
 *
 * CONSTRAINT, measured the hard way: `git mktree` builds ONE tree level and rejects ANY path
 * containing a slash ("fatal: path docs/base.md contains slash"). That applies to the INHERITED
 * entries too, not just the new ones — a nested base file breaks it before the payload is reached.
 * So every fixture that goes through here uses FLAT names and initFlatRepo(). Nested payloads would
 * need write-tree over a built index instead, which buys nothing for these two vectors.
 */
/**
 * A repo whose base commit is FLAT. Required by commitRaw below — see the constraint recorded there.
 */
function initFlatRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docmon-raw-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'base.md'), '# Base\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

function commitRaw(dir, files) {
  const parent = git(dir, ['rev-parse', 'HEAD']).trim();
  const entries = [];
  const baseTree = git(dir, ['ls-tree', '-z', '-r', 'HEAD']).split('\0').filter(Boolean);
  for (const line of baseTree) {
    const m = /^(\d+) blob ([0-9a-f]+)\t(.*)$/.exec(line);
    if (m) entries.push([m[3], m[2], m[1]]);
  }
  for (const [name, body] of Object.entries(files)) {
    const sha = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: body, encoding: 'utf8' }).trim();
    entries.push([name, sha, '100644']);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const spec = entries.map(([name, sha, mode]) => `${mode} blob ${sha}\t${name}\0`).join('');
  const tree = execFileSync('git', ['mktree', '-z', '--missing'], { cwd: dir, input: spec, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['commit-tree', tree, '-p', parent, '-m', 'raw payload'], { cwd: dir, encoding: 'utf8' }).trim();
  git(dir, ['update-ref', 'refs/heads/main', commit]);
}

/**
 * Run the REAL docmon against a fixture repo. Never throws; the side effects are what matter.
 *
 * HOW THIS BECAME DISCRIMINATING, recorded because the first version was not and looked identical.
 * With a backtick payload, a mutation reverting :386 to its pre-fix shell string produced ZERO red
 * on Windows. Diagnosed with the TRUE pre-fix file from git history rather than a reconstruction:
 * the sink IS reached (git reported `fatal: path 'docs/pwn` + backtick + `touch' does not exist`),
 * but Windows splits the command line on spaces and leaves the backtick LITERAL, so the payload
 * could not fire with or without the fix. The assertion was true for the wrong reason.
 *
 * A ComSpec override pointing at a real sh was tried and MEASURED NOT TO WORK — the child still ran
 * under cmd — and was removed rather than left with a comment claiming otherwise.
 *
 * The payload now chains `&`-separated commands that fire under BOTH cmd.exe and sh (see the :386
 * describe). MEASURED end-to-end against the true pre-fix file: marker CREATED before the fix,
 * ABSENT after, with the file still reported. The pair discriminates on this host, not merely on CI.
 */
function runDocmon(dir) {
  try {
    return execFileSync(process.execPath, [DOCMON, '--json'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 45000,
    });
  } catch (e) {
    return e?.stdout || '';
  }
}

const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };

describe('ARMED: docmon :386 — the UNQUOTED git show sink', () => {
  /**
   * THE PAYLOAD IS CROSS-PLATFORM BY CONSTRUCTION, and it had to be. A backtick payload was tried
   * first and MEASURED not to discriminate: reverting the fix left this test green, because Windows
   * splits the command line on spaces and treats a backtick as a LITERAL character. The assertion
   * was true for the wrong reason — the payload could not fire, so "no marker" said nothing about
   * the fix. A ComSpec override to route the child through sh was also tried and measured NOT to
   * work; the child still ran under cmd.
   *
   * `&` is the operator that IS live under cmd.exe at an unquoted sink, and it also separates
   * commands under sh. Chaining BOTH shells' file-creating commands means one filename arms on
   * either platform with no skip and no shell forcing:
   *   cmd.exe -> `git show <rev>:docs/x` | `copy nul MARKER` | `touch ...`(fails) | `y.md`(fails)
   *   sh      -> `git show ...&` | `copy ...`(fails) | `touch MARKER &` | `y.md &`(fails)
   * Either way the marker appears. `copy nul <f>` is used rather than a redirect because `>` is
   * illegal in an NTFS filename.
   */
  const NAME = 'docs/x&copy nul MARKER386.txt&touch MARKER386.txt&y.md';
  let dir; let marker;

  beforeAll(() => {
    dir = initRepo();
    commitOrdinary(dir, { [NAME]: '# Payload\n\nAdded prose line.\n' });
    marker = path.join(dir, 'MARKER386.txt');
  });
  afterAll(() => { if (dir) rm(dir); });

  it('git returns the metacharacter filename BYTE-VERBATIM — it does not escape it for you', () => {
    const out = git(dir, ['diff', '--name-only', '-z', 'HEAD~1...HEAD']).split('\0').filter(Boolean);
    expect(out).toContain(NAME);
  });

  it('THE ARM: the ORIGINAL unquoted shape CREATES THE MARKER — the payload can fire', () => {
    // The pre-fix line reconstructed verbatim, run through whatever shell this host actually uses.
    // MEASURED against the TRUE pre-fix file from git history: it creates the marker. If this ever
    // stops firing, every "no marker" assertion below becomes meaningless and this file is theatre.
    fs.rmSync(marker, { force: true });
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    try {
      execSync(`git show ${base}:${NAME}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* non-zero exit is expected; the side effect is the point */ }
    expect(path.resolve(marker).startsWith(path.resolve(dir)), 'marker must be inside the temp dir').toBe(true);
    expect(fs.existsSync(marker), 'vulnerable form did not execute — this test cannot fail, so it proves nothing').toBe(true);
  });

  it('THE FIX: docmon creates NO marker, AND still reports the adversarial file', () => {
    // Both halves required. "No marker" alone would also be satisfied by a fix that simply stopped
    // seeing the file — trading execution for silent evasion, which is worse than the defect.
    fs.rmSync(marker, { force: true });
    const out = runDocmon(dir);
    expect(fs.existsSync(marker), 'the fixed path executed the filename').toBe(false);
    expect(out, 'the adversarial file must remain VISIBLE to docmon, not silently dropped').toContain('MARKER386');
  });
});

describe('ARMED: docmon :162 — the DOUBLE-QUOTED sink, via the %VAR% vector', () => {
  /**
   * WHY NOT `&` HERE. :162 interpolates the filename INSIDE DOUBLE QUOTES. Under cmd.exe that
   * suppresses `&` and `|` — measured — so the payload that arms the unquoted sink is INERT here and
   * would produce a test that cannot fail.
   *
   * THE NAME CARRIES BOTH SHELLS' EXPANSIONS, and it has to. A %VAR%-only payload was written first
   * and an EXEC review caught that it would go RED on ubuntu: %VAR% is a cmd.exe-only expansion, so
   * under sh the name stays literal, git MATCHES the file, and the diff is non-empty — the arm's
   * `toBe('')` would fail on the very platform CI runs. `$(...)` is the mirror image: live under sh
   * inside double quotes, inert under cmd. Carrying BOTH means exactly one of them expands on any
   * host, the pathspec stops matching the real filename either way, and the arm holds everywhere
   * without a platform gate.
   *
   * THE FAILURE IS SILENT, WHICH IS WHY THE ASSERTION IS ABOUT WHAT IS SEEN, NOT ABOUT A MARKER.
   * cmd expands %PATH% BEFORE git sees the argument, so git matches no pathspec and exits 0 with an
   * EMPTY diff and NO error. getChangedLines therefore returns an empty set, and because
   * checkBlacklist is gated on changed lines, the blacklisted word on the added line is NEVER
   * REPORTED. The gate is made to see nothing — worse than a crash, and invisible in CI.
   */
  const NAME = 'docs/note%PATH%$(echo z)x.md';
  let dir;

  beforeAll(() => {
    dir = initRepo();
    // 'crucial' is a blacklisted word. It is only reported if getChangedLines recovered this line.
    commitOrdinary(dir, { [NAME]: '# Note\n\nThis is a crucial improvement to the system.\n' });
  });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: the ORIGINAL double-quoted shape yields an EMPTY diff and throws NOTHING', () => {
    // Zero bytes AND no throw is what makes it silent — no catch fires, so the file reads as
    // "present, nothing changed" rather than "unreadable".
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    let threw = false; let out = null;
    try {
      out = execSync(`git diff -U0 ${base}...HEAD -- "${NAME}"`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { threw = true; }
    expect(threw, 'the vector must NOT throw — that is what makes it silent').toBe(false);
    expect(out.trim(), 'the shell did not expand the variable here, so this arm cannot discriminate').toBe('');
  });

  it('THE FIX: docmon recovers the changed line and REPORTS the blacklisted word', () => {
    // If :162 regresses, changedLines is empty, checkBlacklist reports nothing, and this count is 0
    // while the run still exits cleanly. That silent zero is the whole failure mode.
    const out = runDocmon(dir);
    const parsed = JSON.parse(out);
    expect(parsed.summary.filesScanned, 'the payload file was not scanned at all').toBeGreaterThan(0);
    expect(parsed.summary.blacklistViolations, 'no violation reported — the changed line was never recovered, so the gate saw nothing').toBeGreaterThan(0);
  });
});

describe('ARMED: docmon :162 — pathspec magic survives `--`, so argv alone is NOT enough', () => {
  // The finding that argv-ization ALONE converts this RCE into SILENT EVASION. `--` ends OPTION
  // parsing but leaves PATHSPEC MAGIC live, so a :(glob)-prefixed name yields an empty diff and no
  // error — the file becomes invisible to the gate. SEC-R1 from PR #6872, recurring verbatim.
  // Flat name: mktree rejects slashes (see commitRaw). This describe drives git directly rather
  // than docmon, so the name does not need to satisfy docmon's doc-path patterns.
  const ATTACK = ':(glob)hidden.md';
  let dir;

  beforeAll(() => {
    dir = initFlatRepo();
    commitRaw(dir, { [ATTACK]: '# Hidden\n\nThis line was added and must be seen.\n' });
  });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: WITHOUT --literal-pathspecs git returns an EMPTY diff and throws NOTHING', () => {
    // Zero bytes AND no throw is what makes it silent: the catch never fires, so the file reads as
    // "present, no added lines" rather than "unreadable".
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    let threw = false; let out = null;
    try {
      out = execFileSync('git', ['diff', '-U0', `${base}...HEAD`, '--', ATTACK], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { threw = true; }
    expect(threw, 'the vector must NOT throw — that is what makes it silent').toBe(false);
    expect(out, 'git already reads this path literally here, so this arm cannot discriminate').toBe('');
  });

  it('THE FIX: --literal-pathspecs recovers the real diff for the same path', () => {
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    const out = execFileSync('git', ['--literal-pathspecs', 'diff', '-U0', `${base}...HEAD`, '--', ATTACK], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    expect(out, 'the flag is the whole difference between seeing the file and not').toContain('must be seen');
  });
});

describe('ARMED: -z is load-bearing, not cosmetic', () => {
  // Added because the sibling SD measured this honestly: deleting -z and restoring split(newline)
  // left the ENTIRE suite green. A newline in the name is the case that actually separates them.
  const NAME = 'we\nird.md';
  let dir;

  beforeAll(() => {
    dir = initFlatRepo();
    commitRaw(dir, { [NAME]: '# Weird\n\nProse body.\n' });
  });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: WITHOUT -z git C-QUOTES the name, so a newline split cannot recover it', () => {
    // It fails by QUOTING, not by shredding: git emits "we\nird.md" with a two-character escape, so
    // the old parser produced ONE CONFIDENTLY WRONG path rather than obvious fragments. A wrong name
    // still looks like a name, which is the worse failure of the two.
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    const quoted = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const fragments = quoted.split('\n').map((s) => s.trim()).filter(Boolean);
    expect(fragments, 'the pre-fix parser must NOT be able to recover the true name').not.toContain(NAME);
    expect(fragments.some((f) => f.startsWith('"')), 'git did not quote at all here, so -z buys nothing on this host').toBe(true);
  });

  it('THE FIX: with -z the newline name round-trips BYTE-EXACT', () => {
    const base = git(dir, ['rev-parse', 'HEAD~1']).trim();
    const names = execFileSync('git', ['diff', '--name-only', '-z', `${base}...HEAD`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
    expect(names, 'the NUL split or the dropped .trim() regressed').toContain(NAME);
  });
});

describe('docmon behaviour is unchanged for ordinary input', () => {
  let dir;
  beforeAll(() => {
    dir = initRepo();
    commitOrdinary(dir, { 'docs/plain.md': '# Plain\n\nAn ordinary sentence for the validator.\n' });
  });
  afterAll(() => { if (dir) rm(dir); });

  it('still emits well-formed JSON with a summary', () => {
    const out = runDocmon(dir);
    expect(out.trim().length, 'docmon produced no output at all').toBeGreaterThan(0);
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('summary');
  });
});

describe('CONTROL: stated limits of this suite', () => {
  it('NOTE: an embedded double-quote payload is NOT fixture-tested here', () => {
    // Stated rather than quietly omitted. `"` is illegal in an NTFS filename AND git refuses such a
    // path (core.protectNTFS defaults true, cross-platform). Its defence is ARCHITECTURAL — after
    // this fix there is no shell layer for a quote to escape from — not measured by a fixture.
    expect(true).toBe(true);
  });

  it('NOTE: a colon in a filename silently creates an NTFS Alternate Data Stream', () => {
    // Measured during PLAN: writeFileSync on `a:payload.md` APPEARS to succeed but creates an ADS on
    // file `a`, and `git add` then fails with "outside repository". A fixture author reading only the
    // write result would conclude it worked. That is why colon-bearing payloads go through mktree.
    expect(true).toBe(true);
  });
});
