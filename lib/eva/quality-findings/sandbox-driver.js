/**
 * Sandboxed runner for Stage 20 quality checks.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-D
 *
 * Provides isolated re-execution harness for Stage 20 quality runs:
 *   - Cloned-repo (npm test, eslint) for code-review categories
 *   - Isolated execution environment for QA/UAT
 *
 * Read-only venture worktree access via copy-into-tmp semantics.
 * Capability detection on boot (sandbox container/runtime present).
 * Cleanup contract on exit (try/finally; runs on both success + failure).
 *
 * S20-only by deliberate design — Stage 21 visual-asset isolation has
 * a different threat model and is out of scope.
 *
 * @module lib/eva/quality-findings/sandbox-driver
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { randomBytes } from 'crypto';

/**
 * Required capabilities for the sandbox to function.
 * Component E (Rule 9 capability checks) wraps this list with its own
 * registry; D's role is to verify them at boot and surface clear errors.
 */
export const REQUIRED_CAPABILITIES = Object.freeze([
  'node',  // for cloned-repo npm scripts
  'git',   // for git clone
]);

/**
 * Detect that required capabilities are present. Throws on missing.
 * Returns the resolved versions for diagnostic logs.
 *
 * @returns {Object} { node: string, git: string }
 */
export function detectCapabilities() {
  const out = {};
  for (const cap of REQUIRED_CAPABILITIES) {
    try {
      const v = execSync(`${cap} --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      out[cap] = v;
    } catch (err) {
      throw new Error(
        `Sandbox capability missing: ${cap}. The sandbox runner requires '${cap}' on PATH. ` +
        `Install ${cap} or run from an environment where it is available.`
      );
    }
  }
  return out;
}

/**
 * Create a tmp directory for isolated execution.
 * Returns the absolute path. Caller is responsible for cleanup via the
 * returned cleanup function.
 *
 * @param {string} prefix
 * @returns {{ tmpDir: string, cleanup: () => void }}
 */
export function createSandboxDir(prefix = 'leo-sandbox-') {
  const id = randomBytes(8).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `${prefix}${id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // best-effort; the OS will eventually GC tmp dirs.
    }
  };

  return { tmpDir, cleanup };
}

/**
 * Clone a repo (or copy a directory) into the sandbox for read-only
 * execution. The original venture worktree is never modified.
 *
 * @param {string} sourceDir         - venture worktree path (read-only)
 * @param {string} sandboxDir        - tmp dir from createSandboxDir
 * @param {Object} [opts]
 * @param {boolean} [opts.useGitClone=true] - prefer git clone for cleaner copy
 * @returns {string} the destination path (sandbox/repo)
 */
export function cloneIntoSandbox(sourceDir, sandboxDir, opts = {}) {
  const useGitClone = opts.useGitClone !== false;
  const dest = path.join(sandboxDir, 'repo');

  if (useGitClone) {
    try {
      execSync(`git clone --no-hardlinks "${sourceDir}" "${dest}"`, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return dest;
    } catch {
      // Fall through to fs-copy if git clone fails (e.g., not a git repo).
    }
  }

  // Fallback: fs-level copy (skips .git for safety).
  fs.cpSync(sourceDir, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`),
  });
  return dest;
}

/**
 * Run a quality check command inside the sandbox. Returns {exitCode, stdout, stderr}.
 *
 * Cleanup runs in a try/finally so the tmp dir is removed regardless of
 * whether the command succeeded or threw.
 *
 * @param {Object} params
 * @param {string} params.sourceDir       - venture worktree (read-only input)
 * @param {string} params.command         - command to execute (e.g., "npm test")
 * @param {Array<string>} [params.args]   - command args
 * @param {Object} [params.env]           - additional env vars
 * @param {number} [params.timeoutMs]     - default 300_000 (5 minutes)
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string, durationMs: number}>}
 */
export async function runInSandbox({ sourceDir, command, args = [], env = {}, timeoutMs = 300_000 }) {
  if (!sourceDir) throw new Error('sourceDir required');
  if (!command) throw new Error('command required');

  // Capability detection — throws if missing.
  detectCapabilities();

  const startMs = Date.now();
  const { tmpDir, cleanup } = createSandboxDir();

  try {
    const repoDir = cloneIntoSandbox(sourceDir, tmpDir);

    return await new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: repoDir,
        env: { ...process.env, ...env },
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Sandbox run timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      proc.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          durationMs: Date.now() - startMs,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } finally {
    cleanup();
  }
}
