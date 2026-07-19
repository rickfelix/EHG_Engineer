/**
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001 — L4 PostToolUse outcome capture tests.
 *
 * Tests that scripts/hooks/post-tool-rca-outcome.cjs:
 *   TS-17: writes .claude/last-outcome-<session>.json with proper schema
 *   TS-18: fail-open on malformed/empty stdin (exits 0, no crash)
 *   plus: regex assertion that hook reads stdin (not env) for tool_response.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HOOK_PATH = path.resolve(__dirname, '../post-tool-rca-outcome.cjs');

describe('L4 — post-tool-rca-outcome.cjs', () => {
  let tmpDir;
  const SESSION_ID = 'test-session-' + Math.random().toString(36).slice(2);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-outcome-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('TS-17: writes outcome file with {tool_name, exit_code, stderr_sha, captured_at}', () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_response: {
        exit_code: 1,
        stderr: 'ReferenceError: foo is not defined\n  at line 5',
      },
    });
    const result = spawnSync('node', [HOOK_PATH], {
      input: payload,
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: 'Bash',
        CLAUDE_SESSION_ID: SESSION_ID,
        LEO_RETRY_STATE_DIR: tmpDir,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(written.tool_name).toBe('Bash');
    expect(written.exit_code).toBe(1);
    expect(written.stderr_sha).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof written.captured_at).toBe('string');
    // SD-LEO-FIX-RCA-HASH-COLLISION-001: stderr_sha is no longer a digest of the
    // first line alone (that was the false-merge bug) — it mixes in a normalized
    // digest of a bounded body-line window. Compute the expected value via the
    // hook's own exported digestStderr so this assertion can never drift from
    // the real implementation.
    const { digestStderr } = require(HOOK_PATH);
    const expectedSha = digestStderr('ReferenceError: foo is not defined\n  at line 5');
    expect(written.stderr_sha).toBe(expectedSha);
  });

  it('TS-5 (SUCCEEDING-POLL-EXEMPTION-001, inverted contract): a SUCCESS payload (no exit_code, no stderr) writes NO file and never records exit_code 0', () => {
    // Claude Code Bash tool_response carries NO exit_code and routes error text to stdout,
    // so the OLD Control-4 inference fabricated exit_code:0 for success AND hard failure
    // alike. That fabrication is removed: absence-of-failure stays null and hits the
    // `exitCode===null && !stderrSha` skip, so no last-outcome file is written and the
    // succeeding-poll exemption can never fire on a fabricated success.
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/my-idempotent-tick.js' },
      tool_response: { stdout: 'ok', stderr: '' },
    });
    const result = spawnSync('node', [HOOK_PATH], {
      input: payload,
      env: { ...process.env, CLAUDE_TOOL_NAME: 'Bash', CLAUDE_SESSION_ID: SESSION_ID, LEO_RETRY_STATE_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(false); // no fabricated success signal
  });

  it('TS-5b (strict/teeth): an interrupted call is NOT recorded as success', () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/hangs.js' },
      tool_response: { stdout: '', stderr: '', interrupted: true },
    });
    const result = spawnSync('node', [HOOK_PATH], {
      input: payload,
      env: { ...process.env, CLAUDE_TOOL_NAME: 'Bash', CLAUDE_SESSION_ID: SESSION_ID, LEO_RETRY_STATE_DIR: tmpDir },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    // No success signal recorded (would otherwise wrongly exempt a hung/interrupted command).
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    if (fs.existsSync(outFile)) {
      const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(written.exit_code).not.toBe(0);
    }
  });

  it('TS-18: malformed stdin → exit 0, no crash, no file written', () => {
    const result = spawnSync('node', [HOOK_PATH], {
      input: 'not-json-at-all',
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: 'Bash',
        CLAUDE_SESSION_ID: SESSION_ID,
        LEO_RETRY_STATE_DIR: tmpDir,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('empty stdin → exit 0, no file written', () => {
    const result = spawnSync('node', [HOOK_PATH], {
      input: '',
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: 'Bash',
        CLAUDE_SESSION_ID: SESSION_ID,
        LEO_RETRY_STATE_DIR: tmpDir,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('feature-flag LEO_RCA_OUTCOME_CAPTURE=off short-circuits', () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_response: { exit_code: 1, stderr: 'x' },
    });
    const result = spawnSync('node', [HOOK_PATH], {
      input: payload,
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: 'Bash',
        CLAUDE_SESSION_ID: SESSION_ID,
        LEO_RETRY_STATE_DIR: tmpDir,
        LEO_RCA_OUTCOME_CAPTURE: 'off',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('TS-19: resolves session_id from the stdin payload when env is absent (SD-FDBK-REFAC-ADOPT-RESOLVESESSIONID-CASCADE-001)', () => {
    // Real PostToolUse contract: CLAUDE_SESSION_ID is NOT propagated to the hook
    // subprocess, but the stdin payload carries session_id. Before the fix this hook
    // resolved from env BEFORE reading stdin → '' → silent no-op. Now it must resolve
    // from payload.session_id and write the outcome file.
    const payloadSession = 'payload-sess-' + Math.random().toString(36).slice(2);
    const payload = JSON.stringify({
      session_id: payloadSession,
      tool_name: 'Bash',
      tool_response: { exit_code: 2, stderr: 'TypeError: x' },
    });
    const env = { ...process.env, CLAUDE_TOOL_NAME: 'Bash', LEO_RETRY_STATE_DIR: tmpDir };
    delete env.CLAUDE_SESSION_ID; // simulate the real PostToolUse env (no session id)
    delete env.SESSION_ID;
    const result = spawnSync('node', [HOOK_PATH], { input: payload, env, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${payloadSession}.json`);
    expect(fs.existsSync(outFile)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(written.tool_name).toBe('Bash');
    expect(written.exit_code).toBe(2);
  });

  it('non-Bash tool → no file written (signatures are file_path-keyed)', () => {
    const payload = JSON.stringify({
      tool_name: 'Edit',
      tool_response: { exit_code: 0 },
    });
    const result = spawnSync('node', [HOOK_PATH], {
      input: payload,
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: 'Edit',
        CLAUDE_SESSION_ID: SESSION_ID,
        LEO_RETRY_STATE_DIR: tmpDir,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const outFile = path.join(tmpDir, `last-outcome-${SESSION_ID}.json`);
    expect(fs.existsSync(outFile)).toBe(false);
  });
});

describe('Static-source guard — hook contract integrity', () => {
  it('post-tool-rca-outcome.cjs reads tool_response from STDIN, not env', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');
    // Must reference process.stdin (canonical contract)
    expect(src).toMatch(/process\.stdin/);
    // Must NOT read tool_response from env (the bug class)
    expect(src).not.toMatch(/process\.env\.CLAUDE_TOOL_RESPONSE/);
    expect(src).not.toMatch(/process\.env\.TOOL_RESPONSE/);
  });

  it('retry-state-manager signatureFor body references last_outcome AND createHash', () => {
    const mgrSrc = fs.readFileSync(
      path.resolve(__dirname, '../retry-state-manager.cjs'),
      'utf8'
    );
    expect(mgrSrc).toMatch(/lastOutcome/);
    expect(mgrSrc).toMatch(/createHash/);
  });

  it('retry-state-manager fetchRcaInvocationSince uses UUID resolution before query', () => {
    const mgrSrc = fs.readFileSync(
      path.resolve(__dirname, '../retry-state-manager.cjs'),
      'utf8'
    );
    expect(mgrSrc).toMatch(/resolveSdKeyToUuid/);
    expect(mgrSrc).toMatch(/UUID_REGEX/);
  });

  it('pre-tool-enforce.cjs prefers st.sd?.id over st.sd?.sd_key', () => {
    const enforceSrc = fs.readFileSync(
      path.resolve(__dirname, '../pre-tool-enforce.cjs'),
      'utf8'
    );
    // The order matters: st.sd?.id should come BEFORE st.sd?.sd_key in the OR fallback
    const claimedSdKeyMatch = enforceSrc.match(
      /claimedSdKey\s*=\s*st\.sd\?\.id\s*\|\|\s*st\.sd\?\.sd_key/
    );
    expect(claimedSdKeyMatch).toBeTruthy();
  });
});

describe('digestStderr (SD-LEO-FIX-RCA-HASH-COLLISION-001: distinct RCAs split, genuine recurrences still collide)', () => {
  it('Golf-verified case — two distinct missing-field errors sharing a count-only first line now produce DIFFERENT digests', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('✗ PRD contract: 1 violation(s):\n .executive_summary missing');
    const b = digestStderr('✗ PRD contract: 1 violation(s):\n .functional_requirements missing');
    expect(a).not.toBe(b);
  });

  it('a genuinely-identical recurrence with a different volatile absolute path still collides to the SAME digest', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('Error: ENOENT\n at C:\\Users\\rickf\\AppData\\Local\\Temp\\abc123.tmp');
    const b = digestStderr('Error: ENOENT\n at C:\\Users\\rickf\\AppData\\Local\\Temp\\xyz789.tmp');
    expect(a).toBe(b);
  });

  it('a genuinely-identical recurrence with a different timestamp still collides to the SAME digest', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('FAIL: gate rejected\n at 2026-07-17T14:16:47.153Z');
    const b = digestStderr('FAIL: gate rejected\n at 2026-07-18T09:02:11.900Z');
    expect(a).toBe(b);
  });

  it('a genuinely-identical recurrence with a different UUID still collides to the SAME digest', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('claim conflict\n owner=11111111-2222-3333-4444-555555555555');
    const b = digestStderr('claim conflict\n owner=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(a).toBe(b);
  });

  it('two genuinely different failure bodies still produce different digests (no over-normalization)', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('gate failed\n reason: missing acceptance_criteria');
    const b = digestStderr('gate failed\n reason: missing test_scenarios');
    expect(a).not.toBe(b);
  });

  it('a single-line stderr with no body still digests deterministically', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('simple one-line failure');
    const b = digestStderr('simple one-line failure');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('empty/non-string input returns an empty string (unchanged contract)', () => {
    const { digestStderr } = require(HOOK_PATH);
    expect(digestStderr('')).toBe('');
    expect(digestStderr(null)).toBe('');
    expect(digestStderr(undefined)).toBe('');
  });
});

describe('normalizeVolatileTokens (helper used by digestStderr body normalization)', () => {
  it('replaces Windows absolute paths', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('at C:\\Users\\rickf\\file.js:12')).toBe('at <PATH>:12');
  });

  it('replaces Unix-style absolute paths', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('at /home/user/repo/file.js')).toBe('at <PATH>');
  });

  it('leaves a relative repo path untouched (semantic — distinguishes which file failed)', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('at scripts/modules/handoff/retro-filters.js:130')).toBe(
      'at scripts/modules/handoff/retro-filters.js:130'
    );
  });

  it('two different failures distinguished only by relative file path still produce different digests', () => {
    const { digestStderr } = require(HOOK_PATH);
    const a = digestStderr('TypeError: undefined\n at scripts/foo.js:12');
    const b = digestStderr('TypeError: undefined\n at scripts/bar.js:12');
    expect(a).not.toBe(b);
  });

  it('leaves dotted field names (no slash) untouched', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('.executive_summary missing')).toBe('.executive_summary missing');
  });

  it('replaces ISO timestamps', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('at 2026-07-17T14:16:47.153Z')).toBe('at <TS>');
  });

  it('replaces UUIDs', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('id=11111111-2222-3333-4444-555555555555')).toBe('id=<UUID>');
  });

  it('replaces large numeric ids but leaves small numbers alone', () => {
    const { normalizeVolatileTokens } = require(HOOK_PATH);
    expect(normalizeVolatileTokens('run 1234567890 with 3 retries')).toBe('run <NUM> with 3 retries');
  });
});
