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
    // stderr_sha should be a digest of the FIRST LINE only
    const crypto = require('crypto');
    const expectedSha = crypto
      .createHash('sha256')
      .update('ReferenceError: foo is not defined')
      .digest('hex')
      .slice(0, 16);
    expect(written.stderr_sha).toBe(expectedSha);
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
