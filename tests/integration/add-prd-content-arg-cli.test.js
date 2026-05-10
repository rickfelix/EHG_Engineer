/**
 * SD-FDBK-INFRA-ADD-PRD-DATABASE-001
 * CLI subprocess smoke tests for add-prd-to-database.js --content flag.
 *
 * Runs the actual binary via spawnSync. Tests cover surface that is
 * isolated from the database (help, validation errors). Full happy-path
 * AC coverage lives in the unit tests; the static guard pins the wire-in
 * to scripts/prd/index.js.
 *
 * NOTE: For tests that need a real subprocess but no DB, we test only the
 * pre-DB validation path (file-not-found, oversized, bad JSON). The script
 * exits before any Supabase call.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'add-prd-to-database.js');

function runCli(args, opts = {}) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    ...opts
  });
}

describe('add-prd-to-database.js --content CLI', () => {
  it('AC-2: help message includes --content usage when no args given', () => {
    const r = runCli([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/--content/);
    expect(r.stdout).toMatch(/@path/);
    expect(r.stdout).toMatch(/cat prd\.json/);
  });

  it('AC-4: --content @<missing-path> exits non-zero with file-not-found', () => {
    const missing = path.join(os.tmpdir(), `nonexistent-prd-${Date.now()}.json`);
    const r = runCli(['SD-FAKE-FOR-CLI-TEST', '--content', '@' + missing]);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/file not found/);
  });

  it('AC-7: --content with malformed JSON exits non-zero with INVALID_JSON', () => {
    const r = runCli(['SD-FAKE-FOR-CLI-TEST', '--content', '{not: valid}']);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/INVALID_JSON/);
  });

  it('AC-7: --content with array (non-object) exits non-zero', () => {
    const r = runCli(['SD-FAKE-FOR-CLI-TEST', '--content', '[1,2,3]']);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/must be a JSON object/);
  });

  it('AC-4: --content @<oversized-file> exits non-zero with PAYLOAD_TOO_LARGE', () => {
    const big = path.join(os.tmpdir(), `big-prd-${Date.now()}.json`);
    fs.writeFileSync(big, JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024 + 100) }), 'utf8');
    try {
      const r = runCli(['SD-FAKE-FOR-CLI-TEST', '--content', '@' + big]);
      expect(r.status).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/PAYLOAD_TOO_LARGE/);
    } finally {
      try { fs.unlinkSync(big); } catch { /* ignore */ }
    }
  });

  it('--content with empty value (--content=) exits non-zero', () => {
    const r = runCli(['SD-FAKE-FOR-CLI-TEST', '--content=']);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/--content requires a value/);
  });
});
