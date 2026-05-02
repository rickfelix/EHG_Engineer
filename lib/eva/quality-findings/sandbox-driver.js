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
 * FR-D: Default env allowlist for sandbox subprocess spawn.
 *
 * Parent process.env is filtered through this list before being passed to spawned
 * processes — without this, secrets like SUPABASE_DB_PASSWORD / OPENAI_API_KEY /
 * GITHUB_TOKEN leak into untrusted venture builds (the security hole closed by
 * SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-D-001).
 *
 * Operators extend via LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST (comma-separated).
 */
export const DEFAULT_SANDBOX_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'HOME',
  'NODE_VERSION',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'USER',
  'LOGNAME',
  'SystemRoot',     // Windows: required for crypto, network, fs subprocess work
  'APPDATA',        // Windows: npm/npx cache lookup
  'LOCALAPPDATA',   // Windows: same family
  'USERPROFILE',    // Windows: HOME equivalent
]);

function getRuntimeAllowlist() {
  const ext = process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST;
  if (!ext || typeof ext !== 'string') return [...DEFAULT_SANDBOX_ENV_ALLOWLIST];
  const extra = ext.split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_SANDBOX_ENV_ALLOWLIST, ...extra])];
}

/**
 * FR-D FR-1: Build a filtered env object containing ONLY allowlisted keys
 * from parentEnv. Pure function — does not mutate parentEnv.
 *
 * @param {Object} parentEnv - source env (typically process.env)
 * @param {string[]} [allowKeys] - explicit allowlist; defaults to runtime allowlist
 * @returns {Object} new object with only allowlisted keys present in parentEnv
 */
export function buildEnvAllowlist(parentEnv, allowKeys = null) {
  if (!parentEnv || typeof parentEnv !== 'object') {
    throw new Error('buildEnvAllowlist: parentEnv must be an object');
  }
  const keys = Array.isArray(allowKeys) ? allowKeys : getRuntimeAllowlist();
  const result = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(parentEnv, k)) {
      result[k] = parentEnv[k];
    }
  }
  return result;
}

/**
 * FR-D FR-3: Return install args with --ignore-scripts for known package managers.
 * Throws on unknown PMs so callers fail loud rather than silently skip the security flag.
 *
 * @param {string} packageManager - 'npm' | 'pnpm' | 'yarn'
 * @returns {string[]} args array, e.g. ['install', '--ignore-scripts']
 */
export function installArgsFor(packageManager) {
  switch (packageManager) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return ['install', '--ignore-scripts'];
    default:
      throw new Error(`installArgsFor: unsupported package manager: ${packageManager}`);
  }
}

/**
 * Detect that required capabilities are present. Throws on missing.
 * Returns the resolved versions for diagnostic logs.
 *
 * @returns {Object} { node: string, git: string }
 */
export function detectCapabilities() {
  const out = {};
  // FR-D adversarial-review fix (PR #3450 round 1): pass env through allowlist
  // for defense-in-depth. Capability detection runs --version on benign tools,
  // but inheriting process.env exposes host secrets to /proc/<pid>/environ
  // during the (brief) subprocess lifetime. The allowlist costs nothing here.
  const envAllowed = buildEnvAllowlist(process.env);
  for (const cap of REQUIRED_CAPABILITIES) {
    try {
      const v = execSync(`${cap} --version`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: envAllowed,
      }).trim();
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
      // FR-D adversarial-review fix (PR #3450 round 1): pass allowlisted env
      // to git subprocess. sourceDir is a local path under caller control
      // (not a remote URL), so injection risk is lower than analyzer cloneRepo,
      // but defense-in-depth: every spawn site uses buildEnvAllowlist.
      execSync(`git clone --no-hardlinks "${sourceDir}" "${dest}"`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildEnvAllowlist(process.env),
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
export async function runInSandbox({ sourceDir, command, args = [], env = {}, allowlist = null, timeoutMs = 300_000 }) {
  if (!sourceDir) throw new Error('sourceDir required');
  if (!command) throw new Error('command required');

  // Capability detection — throws if missing.
  detectCapabilities();

  const startMs = Date.now();
  const { tmpDir, cleanup } = createSandboxDir();

  try {
    const repoDir = cloneIntoSandbox(sourceDir, tmpDir);

    // FR-D FR-2: env stripping — parent process.env is filtered through allowlist
    // before being passed to the spawned subprocess. Caller-supplied env wins for
    // explicit additions (e.g. NODE_ENV=test), but secrets from process.env do NOT
    // leak through. Closes the SUPABASE_*/OPENAI_*/GITHUB_TOKEN exposure hole.
    const sandboxEnv = { ...buildEnvAllowlist(process.env, allowlist), ...env };

    return await new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: repoDir,
        env: sandboxEnv,
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
