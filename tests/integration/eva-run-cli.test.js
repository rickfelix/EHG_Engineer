/**
 * Integration tests for eva-run CLI dispatcher
 * SD-EVA-FEAT-CLI-DISPATCHER-001
 *
 * Tests the CLI behavior by spawning the script as a child process
 * and verifying exit codes and output.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);
const scriptPath = resolve(import.meta.dirname, '../../scripts/eva-run.js');

/**
 * Run eva-run.js with given args and return { stdout, stderr, exitCode }.
 * Does not throw on non-zero exit code.
 */
async function runEvaRun(args = [], timeoutMs = 15000) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
      timeout: timeoutMs,
      env: { ...process.env },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? -1 : (err.code ?? 1),
    };
  }
}

describe('eva-run CLI', () => {
  describe('US-001: CLI entry point', () => {
    it('prints usage and exits with code 1 when no arguments provided', async () => {
      const result = await runEvaRun([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing venture_id');
    });

    it('prints usage and exits with code 1 when only flags provided (no venture_id)', async () => {
      const result = await runEvaRun(['--dry-run']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing venture_id');
    });

    it('exits with code 1 for invalid --stage value', async () => {
      const result = await runEvaRun(['some-id', '--stage', 'abc']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--stage must be a number');
    });

    it('exits with code 1 for --stage out of range', async () => {
      const result = await runEvaRun(['some-id', '--stage', '30']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--stage must be a number between 0 and 25');
    });

    it('exits with code 2 for non-existent venture', async () => {
      const result = await runEvaRun(['00000000-0000-0000-0000-000000000000']);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Venture not found');
    });
  });

  describe('US-001: usage help output', () => {
    it('includes usage instructions in error output', async () => {
      const result = await runEvaRun([]);
      // Usage text is printed to stdout
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--stage');
      expect(result.stdout).toContain('--dry-run');
    });
  });

  describe('US-002: stage range validation', () => {
    it('accepts --stage 0', async () => {
      // Will fail with NOT_FOUND (2) since venture doesn't exist, but NOT with USAGE (1)
      const result = await runEvaRun(['00000000-0000-0000-0000-000000000000', '--stage', '0']);
      expect(result.exitCode).toBe(2); // Not found, not usage error
    });

    it('accepts --stage 25', async () => {
      const result = await runEvaRun(['00000000-0000-0000-0000-000000000000', '--stage', '25']);
      expect(result.exitCode).toBe(2); // Not found, not usage error
    });

    it('rejects --stage -1', async () => {
      const result = await runEvaRun(['some-id', '--stage', '-1']);
      expect(result.exitCode).toBe(1); // Usage error
    });

    it('rejects --stage 26', async () => {
      const result = await runEvaRun(['some-id', '--stage', '26']);
      expect(result.exitCode).toBe(1); // Usage error
    });
  });
});
