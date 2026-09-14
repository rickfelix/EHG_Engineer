/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-2, TS-3/TS-4/TS-11/TS-12/TS-13) — subprocess
 * tests for archplan-command.mjs's mandatory --approved|--draft choice.
 *
 * Mechanism: archplan-command.mjs has NO isMainModule() guard (its argv-driven dispatch
 * runs at module top level, same as vision-command.mjs), so importing it directly in a test
 * would execute the live CLI against real argv. Uses execFileSync subprocess invocation
 * instead, matching the archive-script-guard test pattern already established in this
 * session for a similarly-unguarded CLI entrypoint.
 *
 * Every case below omits --vision-key or uses a plan-key that cannot resolve a real vision,
 * so any test that reaches the DB layer fails fast on "Vision document not found" rather
 * than silently writing -- these tests only need to prove argv-parsing and error-path
 * behavior BEFORE any DB write is attempted, never a real write.
 */
import { describe, test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'archplan-command.mjs');

function runCli(args, { timeout = 15000 } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8', timeout });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('archplan-command.mjs upsert — mandatory approval choice (FR-2)', () => {
  test('TS-3: hard-errors with neither --approved nor --draft, before any DB write is attempted', () => {
    const result = runCli(['upsert', '--plan-key', 'ARCH-TEST-NOFLAG', '--vision-key', 'VISION-DOES-NOT-EXIST', '--content', 'x']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/Approval decision required/);
    expect(result.stderr).toMatch(/--approved/);
    expect(result.stderr).toMatch(/--draft/);
  });

  test('TS-12: hard-errors when BOTH --approved and --draft are passed', () => {
    const result = runCli(['upsert', '--plan-key', 'ARCH-TEST-BOTHFLAGS', '--vision-key', 'VISION-DOES-NOT-EXIST', '--content', 'x', '--approved', '--draft']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/Pass only ONE of --approved or --draft/);
  });

  test('TS-4: rejects a string value on --approved (e.g. "false") instead of silently coercing to true', () => {
    // parseArgs treats `--approved false` as the string "false" (only a FOLLOWING --flag stops
    // value-capture) -- must be rejected by rejectStringFlagValue, matching vision-command.mjs.
    const result = runCli(['upsert', '--plan-key', 'ARCH-TEST-STRINGCOERCE', '--vision-key', 'VISION-DOES-NOT-EXIST', '--content', 'x', '--approved', 'false']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/--approved/);
  });

  test('TS-11a: --draft passes argv validation and proceeds to the DB layer (fails there on a non-existent vision, proving it got past approval parsing)', () => {
    // --dimensions '[]' skips the real LLM extraction call entirely, so this fails fast at
    // the vision lookup rather than hanging on a live API call.
    const result = runCli(['upsert', '--plan-key', 'ARCH-TEST-DRAFT-OK', '--vision-key', 'VISION-DOES-NOT-EXIST-XYZ', '--content', 'x', '--dimensions', '[]', '--draft']);
    expect(result.code).not.toBe(0);
    // Must NOT be the approval-decision error -- proves --draft alone satisfies the choice.
    expect(result.stderr).not.toMatch(/Approval decision required/);
    expect(result.stderr).toMatch(/Upsert failed|Vision document not found/);
  });

  test('TS-11b: --approved passes argv validation and proceeds to the DB layer (same non-existent-vision failure mode as --draft)', () => {
    const result = runCli(['upsert', '--plan-key', 'ARCH-TEST-APPROVED-OK', '--vision-key', 'VISION-DOES-NOT-EXIST-XYZ', '--content', 'x', '--dimensions', '[]', '--approved']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toMatch(/Approval decision required/);
    expect(result.stderr).toMatch(/Upsert failed|Vision document not found/);
  });

  test('TS-13: help/usage text no longer claims upsert happens "after chairman approval" unconditionally', () => {
    const source = readFileSync(CLI_PATH, 'utf8');
    expect(source).not.toMatch(/Upsert architecture plan after chairman approval/);
    expect(source).toMatch(/REQUIRED: deliberate approval choice/);
  });
});
