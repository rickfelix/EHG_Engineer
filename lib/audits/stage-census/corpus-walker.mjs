/**
 * Filesystem corpus walker for the stage 21-26 census (FR-1, FR-6).
 *
 * Extends the cross-repo scope scripts/audit-stage-classifier-sets.mjs's own header explicitly
 * deferred to a follow-up SD (this one): that script scans EHG_Engineer only for hand-maintained
 * Set/array stage-collection literals. This walker sweeps EITHER repo (EHG_Engineer or the
 * sibling ehg) for the DIFFERENT defect class this SD targets -- individual stage-number literals
 * embedded in filenames, assignments, and prose (component_path values, hardcoded stage
 * references) -- using the shared bracket-class regex set in regex.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { findStageLiterals } from './regex.mjs';

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.worktrees', 'coverage',
  // Historical/non-renumber-relevant surfaces: a stage-21-26 mention inside a completed SD's
  // retrospective, an archived script, or a point-in-time diagnostic log is NEVER touched by a
  // future renumber migration -- it is an immutable record of what a repo looked like at a past
  // moment, not a live surface. Including these would produce a document dominated by historical
  // noise (measured: EHG_Engineer alone went from ~7.7K to ~19.7K matches between two runs of an
  // early unscoped version, purely from unrelated fleet activity writing new retrospective/summary
  // files mid-sweep) rather than the "live code + docs/CI" corpus this census's blast-radius
  // purpose (citing this document before writing renumber DDL) actually needs. This narrowing is
  // documented, not silent -- see EXCLUDED_HISTORICAL_DIRS_RATIONALE below and the report header.
  'archive', 'retrospectives', 'logs', 'screenshots', 'playwright-report',
  'diagnostic-test-results', 'reports', 'output', 'uat-sessions', 'brainstorm', 'poc', 'examples',
]);
const INCLUDE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.md', '.sql', '.yml', '.yaml']);

export const EXCLUDED_HISTORICAL_DIRS_RATIONALE =
  'Excludes archive/, retrospectives/, logs/, screenshots/, playwright-report/, ' +
  'diagnostic-test-results/, reports/, output/, uat-sessions/, brainstorm/, poc/, examples/ ' +
  '(plus node_modules/.git/dist/build/.worktrees/coverage): these are historical records or ' +
  'build artifacts a future stage renumber migration never touches, not live renumber-risk ' +
  'surfaces. scripts/one-off/, scripts/temp/, scripts/archive/, docs/archive/, docs/summaries/ ' +
  'are additionally excluded per-repo below for the same reason.';

// Relative-path prefixes (from repoRoot) excluded for the same historical/scratch reason as
// DEFAULT_EXCLUDE_DIRS, but scoped to a specific subtree rather than any directory of that name
// anywhere in the tree (e.g. "scripts/one-off" excludes only that path, not any "one-off" dir).
const DEFAULT_EXCLUDE_REL_PATH_PREFIXES = [
  'scripts/one-off', 'scripts/temp', 'scripts/archive', 'docs/archive', 'docs/summaries',
  // SELF-REFERENTIAL FEEDBACK LOOP (caught live during EXEC): docs/audits/ is where THIS
  // instrument writes its own committed report. Sweeping it as input means every re-run reads
  // the PREVIOUS run's report -- which lists every prior match as table-row text -- as NEW
  // findings, so the count compounds on every run (measured: 7.7K -> 19.7K -> 39.5K over 3
  // consecutive runs, 36097 of the 3rd run's 39518 EHG_Engineer matches were literal quotes from
  // the instrument's own prior markdown output). Excluding docs/audits/ entirely also drops the
  // 5 pre-existing precedent census documents, which is correct for the same historical-record
  // reason as docs/archive/ -- an audit report ABOUT stage literals is not itself a renumber-risk
  // surface.
  'docs/audits',
];

/**
 * @param {string} repoRoot - absolute path to the repo root
 * @param {object} [opts]
 * @param {Set<string>} [opts.excludeDirs]
 * @param {Array<string>} [opts.excludeRelPathPrefixes]
 * @param {Set<string>} [opts.includeExtensions]
 * @returns {Promise<Array<{repo: string, file: string, line: number, match: string, stageNumber: string}>>}
 */
export async function walkRepoForStageLiterals(repoRoot, opts = {}) {
  const excludeDirs = opts.excludeDirs || DEFAULT_EXCLUDE_DIRS;
  const excludeRelPathPrefixes = opts.excludeRelPathPrefixes || DEFAULT_EXCLUDE_REL_PATH_PREFIXES;
  const includeExtensions = opts.includeExtensions || INCLUDE_EXTENSIONS;
  const repoLabel = opts.repoLabel || path.basename(repoRoot);
  const out = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
        if (excludeRelPathPrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!includeExtensions.has(ext)) continue;
        let content;
        try {
          content = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        const literals = findStageLiterals(content);
        if (literals.length === 0) continue;
        const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
        for (const lit of literals) {
          const before = content.slice(0, lit.index);
          const line = before.split('\n').length;
          out.push({ repo: repoLabel, file: rel, line, match: lit.match, stageNumber: lit.stageNumber });
        }
      }
    }
  }

  await walk(repoRoot);
  return out;
}
