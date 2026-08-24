/**
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 FR-2/FR-3: proves the LEAD-FINAL-APPROVAL gate's branch-name
 * shell-injection fix against REAL subprocesses, not mocks -- the two sinks fixed in gates.js:887
 * and :898 are execFileSync('git'|'gh', [...argv], opts), the EXACT argv shapes reproduced below.
 *
 * ASYMMETRIC PAYLOAD MATRIX (load-bearing, independently discovered twice this SD -- once by
 * LEAD for sink #2, once by PLAN-phase TESTING for the mirror case on sink #1): sink #1 is
 * UNQUOTED shell interpolation, sink #2 is DOUBLE-QUOTE-WRAPPED. A uniform payload set is a false
 * green on one sink or the other:
 *   - bare '&'/'|'/';' fires against sink #1 (no quoting at all) but NOT sink #2 (quotes hold on
 *     Windows/cmd.exe).
 *   - a quote-breakout payload (a literal '"' followed by shell metacharacters) fires against
 *     sink #2 but NOT sink #1 -- the unmatched leading '"' causes cmd.exe to treat everything
 *     through the next '"' as a literal quoted string, swallowing the following operators as
 *     literal characters rather than command separators.
 * Both were verified directly (real execSync calls) before being encoded here.
 *
 * DETECTION: a side-effect marker file, not stdout scanning -- command substitution (backtick/
 * $()) consumes the injected command's OUTPUT INTO THE ARGUMENT itself, making it invisible to a
 * stdout-based detector even when it genuinely executed (PLAN-phase TESTING finding).
 *
 * PLATFORM CONTRACT: backtick/$() substitution is never interpreted by cmd.exe on either sink.
 * This test file has no blocking CI (pr-merge-verification.test.js's own header notes the same),
 * so it runs on whatever host EXEC/CI actually uses -- the POSIX-only payload is explicitly
 * skipped on win32 rather than asserted unconditionally, which would silently prove nothing on a
 * Windows host regardless of fix status.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRefCharsetSafe } from '../../lib/git/branch-owner.js';

let dir;
let markerFile;

function resetMarker() {
  markerFile = path.join(dir, `marker-${Math.random().toString(36).slice(2)}.txt`);
}

/** Windows: `cmd /c echo ok > <marker>`. POSIX: `touch <marker>`. Runs as a real shell command
 * only when INJECTED (i.e. only if the sink under test actually invokes a shell). */
function markerWriteCommand() {
  return process.platform === 'win32'
    ? `type nul > "${markerFile}"`
    : `touch '${markerFile}'`;
}

function markerExists() {
  return fs.existsSync(markerFile);
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lfa-injection-')));
  resetMarker();
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('FR-1/FR-3: sink #1 (git rev-list --count) -- unquoted, asymmetric matrix', () => {
  it('VULNERABLE (pre-fix shape, execSync unquoted) confirms the payload class actually fires here', () => {
    resetMarker();
    const evilBranch = `feat/X-a&${markerWriteCommand()}&b`;
    try {
      execSync(`git rev-list --count origin/main..${evilBranch}`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* rev-list itself errors on the bogus rev; the injected command already ran by then */ }
    expect(markerExists(), 'documents the vulnerability: bare & fires against unquoted sink #1').toBe(true);
  });

  it('FIXED (execFileSync argv, the real gates.js:887 shape) is immune to bare &/|/;', () => {
    for (const op of ['&', '|', ';']) {
      resetMarker();
      const evilBranch = `feat/X-a${op}${markerWriteCommand()}${op}b`;
      try {
        execFileSync('git', ['rev-list', '--count', `origin/main..${evilBranch}`], { encoding: 'utf8', timeout: 10000 });
      } catch { /* expected: not a valid rev, no shell involved */ }
      expect(markerExists(), `operator '${op}' must not execute via execFileSync`).toBe(false);
    }
  });

  it('the MIRROR false-green: a quote-breakout payload does NOT fire against unquoted sink #1 (even pre-fix)', () => {
    resetMarker();
    const quoteBreakout = `feat/X-a"&${markerWriteCommand()}&"b`;
    try {
      execSync(`git rev-list --count origin/main..${quoteBreakout}`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* expected: literal text is an invalid rev */ }
    expect(
      markerExists(),
      'a quote-breakout-only test would be a FALSE GREEN for sink #1: this payload class is inert here even against fully vulnerable code',
    ).toBe(false);
  });
});

describe('FR-1/FR-3: sink #2 (gh pr list --head) -- double-quoted, asymmetric matrix', () => {
  it('VULNERABLE (pre-fix shape, execSync double-quoted) confirms quote-breakout fires here', () => {
    resetMarker();
    const quoteBreakout = `feat/X-a"&${markerWriteCommand()}&"b`;
    try {
      execSync(`gh pr list --head "${quoteBreakout}" --state merged --json number --limit 1`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* gh itself errors on the mangled arg; the injected command already ran by then */ }
    expect(markerExists(), 'documents the vulnerability: quote-breakout fires against double-quoted sink #2').toBe(true);
  });

  it('FIXED (execFileSync argv, the real gates.js:898 shape) is immune to quote-breakout', () => {
    resetMarker();
    const quoteBreakout = `feat/X-a"&${markerWriteCommand()}&"b`;
    try {
      execFileSync('gh', ['pr', 'list', '--head', quoteBreakout, '--state', 'merged', '--json', 'number', '--limit', '1'], { encoding: 'utf8', timeout: 10000 });
    } catch { /* expected: gh rejects or returns nothing for a nonsense branch, no shell involved */ }
    expect(markerExists(), 'quote-breakout must not execute via execFileSync').toBe(false);
  });

  it('the MIRROR false-green: a bare & does NOT fire against double-quoted sink #2 on this platform (even pre-fix)', () => {
    resetMarker();
    const bareBranch = `feat/X-a&${markerWriteCommand()}&b`;
    try {
      execSync(`gh pr list --head "${bareBranch}" --state merged --json number --limit 1`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* expected */ }
    expect(
      markerExists(),
      "a bare-'&'-only test would be a FALSE GREEN for sink #2 on Windows: quotes hold against a bare operator here even against fully vulnerable code",
    ).toBe(false);
  });
});

describe.skipIf(process.platform === 'win32')('FR-3: backtick/$() substitution -- POSIX-only, explicitly platform-gated', () => {
  it('VULNERABLE (pre-fix shape, execSync) confirms command substitution actually fires on sink #1', () => {
    resetMarker();
    const substitutionBranch = `feat/X-a\`${markerWriteCommand()}\`b`;
    try {
      execSync(`git rev-list --count origin/main..${substitutionBranch}`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* expected: git errors on the substituted-away text, injected command already ran */ }
    expect(markerExists(), 'documents the vulnerability: backtick substitution fires against execSync sink #1').toBe(true);
  });

  it('FIXED: command substitution is neutralized by execFileSync on sink #1 (git rev-list --count)', () => {
    resetMarker();
    const substitutionBranch = `feat/X-a\`${markerWriteCommand()}\`b`;
    try {
      execFileSync('git', ['rev-list', '--count', `origin/main..${substitutionBranch}`], { encoding: 'utf8', timeout: 10000, shell: false });
    } catch { /* expected */ }
    expect(markerExists(), 'backtick substitution must not execute via execFileSync on sink #1').toBe(false);
  });

  it('VULNERABLE (pre-fix shape, execSync double-quoted) confirms command substitution fires on sink #2 too', () => {
    resetMarker();
    const substitutionBranch = `feat/X-a\`${markerWriteCommand()}\`b`;
    try {
      execSync(`gh pr list --head "${substitutionBranch}" --state merged --json number --limit 1`, { encoding: 'utf8', timeout: 10000 });
    } catch { /* expected */ }
    expect(markerExists(), 'documents the vulnerability: backtick substitution fires against execSync sink #2 (double quotes do not block $()/backtick substitution)').toBe(true);
  });

  it('FIXED: command substitution is neutralized by execFileSync on sink #2 (gh pr list --head)', () => {
    resetMarker();
    const substitutionBranch = `feat/X-a\`${markerWriteCommand()}\`b`;
    try {
      execFileSync('gh', ['pr', 'list', '--head', substitutionBranch, '--state', 'merged', '--json', 'number', '--limit', '1'], { encoding: 'utf8', timeout: 10000, shell: false });
    } catch { /* expected */ }
    expect(markerExists(), 'backtick substitution must not execute via execFileSync on sink #2').toBe(false);
  });
});

describe('FR-2: isRefCharsetSafe -- fail-closed defense-in-depth guard', () => {
  it('accepts a well-formed branch name', () => {
    expect(isRefCharsetSafe('feat/SD-LEO-FIX-LEAD-FINAL-APPROVAL-001')).toBe(true);
    expect(isRefCharsetSafe('feat/SD-LEO-FIX-LEAD-FINAL-APPROVAL-001-a-suffix')).toBe(true);
  });

  it('rejects a semicolon (command separator on POSIX)', () => {
    expect(isRefCharsetSafe('feat/X-a;whoami')).toBe(false);
  });

  it('rejects a double quote (the quote-breakout vector)', () => {
    expect(isRefCharsetSafe('feat/X-a"&whoami&"b')).toBe(false);
  });

  it('rejects the full reported PoC branch name', () => {
    expect(isRefCharsetSafe('feat/SD-KEY-a&whoami')).toBe(false);
  });

  it('is anchored -- a malicious substring anywhere in the string is rejected, not just at the start/end', () => {
    expect(isRefCharsetSafe('feat/safe-prefix-;whoami-safe-suffix')).toBe(false);
  });

  it('rejects a non-string input rather than throwing', () => {
    expect(isRefCharsetSafe(undefined)).toBe(false);
    expect(isRefCharsetSafe(null)).toBe(false);
  });
});
