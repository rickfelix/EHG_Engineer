/**
 * QF-20260912-632 — safe seat-record append helper.
 *
 * The core guarantee: fs.appendFileSync writes text as literal bytes -- a body containing a
 * backtick or $( ) never reaches a shell, so it is stored verbatim and never executes, unlike
 * the heredoc path this QF's ENF-19 half guards against.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { SESSION_STATE_RE, readTextArg, resolveByRole, main } = require('../../../scripts/seat-record-append.cjs');

describe('SESSION_STATE_RE', () => {
  it('matches a real session-state path', () => {
    expect(SESSION_STATE_RE.test('.claude/adam-session-state-49eabb23.md')).toBe(true);
  });
  it('rejects a path outside .claude/', () => {
    expect(SESSION_STATE_RE.test('scripts/adam-session-state-49eabb23.md')).toBe(false);
  });
  it('rejects a path with no session-state marker', () => {
    expect(SESSION_STATE_RE.test('.claude/settings.json')).toBe(false);
  });
});

describe('readTextArg', () => {
  let tmpFile;
  beforeEach(() => { tmpFile = path.join(os.tmpdir(), `qf632-text-${Date.now()}.txt`); });
  afterEach(() => { try { fs.rmSync(tmpFile, { force: true }); } catch { /* best-effort */ } });

  it('reads @<file> from disk verbatim, including backticks and $( )', () => {
    const body = 'Ran `node scripts/apply-migration.js --issue-token` today: $(date)';
    fs.writeFileSync(tmpFile, body, 'utf8');
    expect(readTextArg(`@${tmpFile}`)).toBe(body);
  });

  it('returns a non-@ argument as a literal inline string', () => {
    expect(readTextArg('plain text')).toBe('plain text');
  });

  it('returns null for a falsy input', () => {
    expect(readTextArg(null)).toBeNull();
  });
});

describe('resolveByRole', () => {
  let claudeDir;
  beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf632-claude-')); });
  afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

  it('resolves to the newest matching <role>-session-state-*.md by mtime', async () => {
    const older = path.join(claudeDir, 'adam-session-state-aaaaaaaa.md');
    const newer = path.join(claudeDir, 'adam-session-state-bbbbbbbb.md');
    fs.writeFileSync(older, '# older');
    await new Promise((r) => setTimeout(r, 10));
    fs.writeFileSync(newer, '# newer');
    expect(resolveByRole('adam', claudeDir)).toBe(path.join('.claude', 'adam-session-state-bbbbbbbb.md'));
  });

  it('returns null when no file matches the role', () => {
    expect(resolveByRole('nobody', claudeDir)).toBeNull();
  });

  it('never matches a different role\'s file', () => {
    fs.writeFileSync(path.join(claudeDir, 'coordinator-session-state-cccccccc.md'), '# x');
    expect(resolveByRole('adam', claudeDir)).toBeNull();
  });
});

describe('main() end-to-end: the append is literal, never executed', () => {
  let cwd;
  let bodyFile;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qf632-cwd-'));
    fs.mkdirSync(path.join(cwd, '.claude'));
    fs.writeFileSync(path.join(cwd, '.claude', 'adam-session-state-49eabb23.md'), '# Adam session state\n');
    bodyFile = path.join(cwd, 'body.txt');
  });
  afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });

  function runMain(argv) {
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    process.argv = ['node', 'seat-record-append.cjs', ...argv];
    process.chdir(cwd);
    try {
      main();
    } finally {
      process.argv = originalArgv;
      process.chdir(originalCwd);
    }
  }

  it('appends a backticked apply-script line as literal text -- the file gains it verbatim, nothing is executed', () => {
    const dangerous = 'Tried: `node scripts/apply-migration.js --issue-token` -- issued a live token.';
    fs.writeFileSync(bodyFile, dangerous, 'utf8');
    runMain(['adam', '--text', `@${bodyFile}`]);
    const contents = fs.readFileSync(path.join(cwd, '.claude', 'adam-session-state-49eabb23.md'), 'utf8');
    expect(contents).toContain(dangerous);
  });

  it('appends under a ## section heading when --section is given', () => {
    fs.writeFileSync(bodyFile, 'some finding', 'utf8');
    runMain(['adam', '--text', `@${bodyFile}`, '--section', 'Findings']);
    const contents = fs.readFileSync(path.join(cwd, '.claude', 'adam-session-state-49eabb23.md'), 'utf8');
    expect(contents).toMatch(/## Findings\n\nsome finding/);
  });

  it('refuses to append to a path that is not a session-state file', () => {
    runMain(['../../etc/passwd', '--text', 'x']);
    // No throw; exitCode is set non-zero and nothing is written outside .claude/.
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
