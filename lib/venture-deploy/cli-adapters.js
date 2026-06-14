/**
 * CLI adapters for venture publish — thin, injectable, mockable wrappers around
 * the external deploy CLIs (wrangler / gcloud / neonctl / CI trigger).
 *
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D (FR-2).
 *
 * Each adapter is a THIN execFile wrapper with NO business logic — the
 * orchestration lives in publish.js. publish() takes an adapter set via
 * dependency injection (deps.adapters), so unit tests pass fakes and need no
 * real wrangler/gcloud/neonctl installed. The real adapters are NEVER invoked
 * in a dry-run (publish() only records their planned-action descriptors).
 *
 * @module lib/venture-deploy/cli-adapters
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Build a thin execFile-backed adapter. The returned fn runs `bin args...` and
 * resolves { stdout, stderr }. No parsing / no business logic.
 * @param {string} bin
 */
function cmd(bin) {
  return async (args = [], opts = {}) => {
    const { stdout, stderr } = await execFileAsync(bin, args, { ...opts });
    return { bin, args, stdout, stderr };
  };
}

/**
 * The default REAL adapter set. Each entry is a thin CLI wrapper.
 * @typedef {Object} CliAdapters
 * @property {(args?:string[])=>Promise<any>} deployPages    — `wrangler pages deploy`
 * @property {(args?:string[])=>Promise<any>} deployWorkers  — `wrangler deploy`
 * @property {(args?:string[])=>Promise<any>} deployCloudRun — `gcloud run deploy`
 * @property {(args?:string[])=>Promise<any>} ensureD1       — `wrangler d1`
 * @property {(args?:string[])=>Promise<any>} ensureNeon     — `neonctl`
 * @property {(args?:string[])=>Promise<any>} ensureR2       — `wrangler r2`
 * @property {(args?:string[])=>Promise<any>} runMigrations  — project migration applier
 */
export const realAdapters = Object.freeze({
  deployPages: cmd('wrangler'),    // wrangler pages deploy ...
  deployWorkers: cmd('wrangler'),  // wrangler deploy ...
  deployCloudRun: cmd('gcloud'),   // gcloud run deploy ...
  ensureD1: cmd('wrangler'),       // wrangler d1 ...
  ensureNeon: cmd('neonctl'),      // neonctl ...
  ensureR2: cmd('wrangler'),       // wrangler r2 ...
  runMigrations: cmd('node'),      // node scripts/apply-migration.js ... (real prod apply stays chairman-gated elsewhere)
});

/** Canonical adapter keys, in stable order — used to validate an injected set. */
export const ADAPTER_KEYS = Object.freeze(Object.keys(realAdapters));

export default { realAdapters, ADAPTER_KEYS };
