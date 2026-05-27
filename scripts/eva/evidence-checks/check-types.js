/**
 * check-types.js — Deterministic Evidence Check Types
 *
 * Six binary check types for vision/architecture dimension scoring.
 * Each returns { passed: boolean, evidence: string }.
 * All checks have a 10s timeout; throwing checks score as passed: false.
 *
 * SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-1):
 *   Refactored from module-level ROOT constant to createCheckTypes({ targetPath })
 *   factory. The factory closure captures ROOT so per-call check-types can
 *   evaluate venture codebases (e.g., CronGenius) without /heal vision falsely
 *   reporting 100/100 because rubric paths resolve to EHG_Engineer. Default
 *   ROOT (when targetPath is omitted) preserves identity for EHG self-scoring.
 */

import _glob from 'glob';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHECK_TIMEOUT_MS = 10_000;
const DEFAULT_ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Wrap a check function with a timeout. On timeout or error, returns passed: false.
 */
function withTimeout(fn) {
  return async (params) => {
    try {
      return await Promise.race([
        Promise.resolve(fn(params)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Check timed out')), CHECK_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      return { passed: false, evidence: `Error: ${err.message}` };
    }
  };
}

/**
 * Factory: create check-type implementations rooted at `targetPath`.
 * All path resolution (glob CWD, code_pattern path stripping, export_exists
 * dynamic import) honors the supplied targetPath via closure.
 *
 * @param {object} [opts]
 * @param {string} [opts.targetPath] - Absolute directory path to use as ROOT for
 *   path resolution. When omitted, defaults to the EHG_Engineer repo root
 *   (preserves identity for existing EHG self-scoring callers).
 * @returns {object} Registry of check-type runners.
 */
export function createCheckTypes({ targetPath } = {}) {
  const ROOT = targetPath ? resolve(targetPath) : DEFAULT_ROOT;

  /** glob@7 sync wrapper rooted at this factory's ROOT — returns string[] */
  function globSync(pattern, opts = {}) {
    return _glob.sync(pattern, { cwd: ROOT, nodir: true, ...opts });
  }

  /**
   * file_exists — Glob for files, pass if >= minMatches.
   */
  function _fileExists(params) {
    const pattern = params.glob;
    const minMatches = params.minMatches ?? 1;
    const matches = globSync(pattern);
    const passed = matches.length >= minMatches;
    return {
      passed,
      evidence: `Found ${matches.length} file(s) matching '${pattern}' (need >= ${minMatches})`,
    };
  }

  /**
   * code_pattern — Grep for regex in files matching a glob, pass if >= minMatches.
   */
  function _codePattern(params) {
    const files = globSync(params.glob, { absolute: true });
    const regex = new RegExp(params.pattern);
    const minMatches = params.minMatches ?? 1;
    let matchCount = 0;
    const matchedFiles = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8');
        if (regex.test(content)) {
          matchCount++;
          const rel = file.replace(ROOT, '').replace(/^[\\/]/, '');
          matchedFiles.push(rel);
        }
      } catch { /* skip unreadable files */ }
    }

    const passed = matchCount >= minMatches;
    const sample = matchedFiles.slice(0, 3).join(', ');
    return {
      passed,
      evidence: passed
        ? `Pattern '${params.pattern}' found in ${matchCount} file(s): ${sample}`
        : `Pattern '${params.pattern}' found in ${matchCount} file(s) (need >= ${minMatches})`,
    };
  }

  /**
   * anti_pattern — Grep for regex in files, pass if <= maxMatches (0 = none allowed).
   */
  function _antiPattern(params) {
    const files = globSync(params.glob, { absolute: true });
    const regex = new RegExp(params.pattern);
    const maxMatches = params.maxMatches ?? 0;
    let matchCount = 0;
    const matchedFiles = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8');
        if (regex.test(content)) {
          matchCount++;
          const rel = file.replace(ROOT, '').replace(/^[\\/]/, '');
          matchedFiles.push(rel);
        }
      } catch { /* skip */ }
    }

    const passed = matchCount <= maxMatches;
    const sample = matchedFiles.slice(0, 3).join(', ');
    return {
      passed,
      evidence: passed
        ? `Anti-pattern '${params.pattern}' found in ${matchCount} file(s) (<= ${maxMatches} allowed)`
        : `Anti-pattern '${params.pattern}' found in ${matchCount} file(s) (max ${maxMatches}): ${sample}`,
    };
  }

  /**
   * export_exists — Dynamic import a module rooted at ROOT, check that a named export exists.
   */
  async function _exportExists(params) {
    const modulePath = resolve(ROOT, params.module);
    try {
      const mod = await import(/* @vite-ignore */ `file:///${modulePath.replaceAll('\\', '/')}`);
      const has = params.exportName in mod || (mod.default && params.exportName in mod.default);
      return {
        passed: has,
        evidence: has
          ? `Export '${params.exportName}' found in ${params.module}`
          : `Export '${params.exportName}' NOT found in ${params.module} (exports: ${Object.keys(mod).join(', ')})`,
      };
    } catch (err) {
      return { passed: false, evidence: `Failed to import ${params.module}: ${err.message}` };
    }
  }

  /**
   * db_row_exists — Query Supabase, pass if count > 0. (Not path-bound — venture-agnostic.)
   */
  async function _dbRowExists(params, context) {
    if (!context?.supabase) {
      return { passed: false, evidence: 'No Supabase client provided' };
    }
    let query = context.supabase.from(params.table).select('id', { count: 'exact', head: true });
    if (params.column && params.value !== undefined) {
      query = query.eq(params.column, params.value);
    }
    if (params.filter) {
      for (const f of Array.isArray(params.filter) ? params.filter : [params.filter]) {
        query = query[f.op || 'eq'](f.column, f.value);
      }
    }
    const { count, error } = await query;
    if (error) {
      return { passed: false, evidence: `DB query error on ${params.table}: ${error.message}` };
    }
    const passed = (count ?? 0) > 0;
    return {
      passed,
      evidence: passed
        ? `Table '${params.table}' has ${count} matching row(s)`
        : `Table '${params.table}' has 0 matching rows`,
    };
  }

  /**
   * file_count — Glob for files, pass if count >= minCount.
   */
  function _fileCount(params) {
    const matches = globSync(params.glob);
    const passed = matches.length >= params.minCount;
    return {
      passed,
      evidence: `Found ${matches.length} file(s) matching '${params.glob}' (need >= ${params.minCount})`,
    };
  }

  /** Registry of all check types for this factory's ROOT. */
  return {
    file_exists: withTimeout(_fileExists),
    code_pattern: withTimeout(_codePattern),
    anti_pattern: withTimeout(_antiPattern),
    export_exists: withTimeout(_exportExists),
    db_row_exists: withTimeout((params) => _dbRowExists(params, params._context)),
    file_count: withTimeout(_fileCount),
  };
}

/**
 * Backward-compatible default registry — uses EHG_Engineer ROOT.
 * Existing callers (vision-evidence-scorer.js, check-runner.js without
 * context.targetPath) continue to work unchanged.
 */
export const checkTypes = createCheckTypes();
