/**
 * LEAD empirical precheck helpers — three reusable verification primitives.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-1.
 *
 * Three pure functions that return `{ok: true|false|null, evidence: object}`:
 *   - verifyOriginMainPremise — does origin/main contradict a claim?
 *   - verifyJoinShape          — do two columns share a value-shape?
 *   - verifyHelperCoverage     — are there bypass sites around a canonical helper?
 *
 * Side-effect-free (zero supabase write calls). Idempotent. Never throws —
 * caller decides how to act on `ok=false` or `ok=null` (degraded).
 *
 * `ok` semantics:
 *   - true  : premise verified — caller may proceed
 *   - false : premise contradicted — caller must reject
 *   - null  : verification could not run (offline / no supabase / sandbox) —
 *             caller decides via env gate (e.g. LEAD_PRECHECK_OFFLINE_OK)
 *
 * @module scripts/lib/lead-precheck-helpers
 */

import { execSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, sep, relative } from 'node:path';
import { getMainRef } from '../modules/handoff/shared-git-context.js';

/**
 * Default join-shape thresholds. Exported so tests can pin the contract.
 */
export const DEFAULT_JOIN_THRESHOLDS = Object.freeze({
  /** Min fraction of left-side samples whose shape is "compatible" with right-side samples */
  leftMatchMin: 0.5,
  /** Max fraction of right-side samples that may share a foreign shape (false-positive ceiling) */
  rightMatchMax: 0.05,
});

/**
 * Evidence schemas — JSDoc-style shape contract for downstream consumers.
 */
export const EVIDENCE_SCHEMAS = Object.freeze({
  verifyOriginMainPremise: {
    contradicting_commits: 'string[]',
    main_ref: 'string',
    main_ref_source: 'origin|origin-master|local-fallback',
    network_error: 'boolean',
    git_exit_code: 'number|null',
    stderr_first_line: 'string|null',
  },
  verifyJoinShape: {
    left_histogram: 'Record<string, number>',
    right_histogram: 'Record<string, number>',
    sample_size: 'number',
    threshold_evaluation: 'object',
    test_mode: 'boolean',
  },
  verifyHelperCoverage: {
    bypass_sites: 'Array<{path: string, line: number, snippet: string, axis: string}>',
    canonical_imports: 'string[]',
    files_scanned: 'number',
    ms_elapsed: 'number',
    advisory: 'boolean',
  },
});

/**
 * Default exclude allowlist for verifyHelperCoverage — prevents the bypass
 * scan from flagging tests, archived scripts, the helper file itself,
 * the canonical template, docs, and node_modules.
 */
const DEFAULT_EXCLUDE_DIRS = ['tests', '__tests__', 'archived-prd-scripts', 'archived-sd-scripts', 'node_modules', '.worktrees', '.git'];
const DEFAULT_EXCLUDE_FILE_SUFFIXES = ['.test.js', '.spec.js', '.test.mjs', '.spec.mjs', '.md', '.txt', '.json'];

/**
 * How far past a `.from('<table>')` the multi-line pass will look for a write verb.
 * 1200 chars comfortably spans the longest real chain in this repo (SDRepository.js's
 * payload-building block) while staying short enough that an unrelated later statement
 * cannot be misattributed to it.
 */
const MULTILINE_CHAIN_WINDOW = 1200;

/**
 * Classify a sample value into a shape category for histogram comparison.
 * Cheap; no allocations beyond the regex test.
 */
function shapeOf(v) {
  if (v == null) return 'null';
  if (typeof v === 'number') return 'numeric';
  if (typeof v !== 'string') return typeof v;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'uuid';
  if (/^SD-[A-Z0-9-]+/i.test(v)) return 'sd_key';
  if (/^QF-\d{8}-\d+/i.test(v)) return 'qf_key';
  if (/^[0-9a-f]{40}$/i.test(v)) return 'sha1';
  if (/^[0-9a-f]{12,}$/i.test(v)) return 'hex';
  if (/^\d+$/.test(v)) return 'numeric_string';
  return 'string';
}

function buildHistogram(rows, col) {
  const histogram = {};
  for (const row of rows || []) {
    const cat = shapeOf(row?.[col]);
    histogram[cat] = (histogram[cat] || 0) + 1;
  }
  return histogram;
}

/**
 * Verify that a claim about origin/main is not contradicted by what's actually
 * on origin/main. Composes over `getMainRef()` from shared-git-context.js — does
 * NOT re-implement fetch/fallback chain.
 *
 * Use this when LEAD has a claim like "X feature does not exist on origin/main"
 * or "Y file was never wired up". If origin/main contains commits touching
 * `witnessFile`, the claim is contradicted.
 *
 * @param {Object} args
 * @param {string} args.claim - One-line prose claim (logged in evidence)
 * @param {string} args.witnessFile - Repo-relative path the claim references
 * @param {string|RegExp} [args.expectedAbsent] - Token whose presence in origin/main contradicts the claim
 * @param {string} [args.cwd] - Working directory for git commands
 * @param {number} [args.timeoutMs] - Override LEAD_PRECHECK_FETCH_TIMEOUT_MS
 * @returns {Promise<{ok: boolean|null, evidence: object}>}
 */
export async function verifyOriginMainPremise(args) {
  const { claim, witnessFile, expectedAbsent, cwd } = args || {};
  const timeoutMs = Number(args?.timeoutMs ?? process.env.LEAD_PRECHECK_FETCH_TIMEOUT_MS ?? 5000);
  const offlineOk = process.env.LEAD_PRECHECK_OFFLINE_OK === '1';

  const evidence = {
    claim,
    witness_file: witnessFile,
    main_ref: null,
    main_ref_source: null,
    network_error: false,
    git_exit_code: null,
    stderr_first_line: null,
    contradicting_commits: [],
  };

  if (!witnessFile) {
    evidence.error = 'missing_witnessFile';
    return { ok: null, evidence };
  }

  let mainInfo;
  try {
    mainInfo = getMainRef({ cwd, skipFetch: false });
    evidence.main_ref = mainInfo.ref;
    evidence.main_ref_source = mainInfo.source;
  } catch (err) {
    evidence.network_error = true;
    evidence.stderr_first_line = String(err?.message || err).split('\n')[0];
    return { ok: offlineOk ? null : null, evidence };
  }

  if (mainInfo.source === 'local-fallback') {
    // No network — we cannot verify against true origin/main
    evidence.network_error = true;
    return { ok: null, evidence };
  }

  // Run `git log -1 <ref> -- <file>` to get latest commit touching the file
  let logOutput = '';
  try {
    logOutput = execSync(
      `git log -1 --format=%H ${JSON.stringify(mainInfo.ref)} -- ${JSON.stringify(witnessFile)}`,
      { encoding: 'utf8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'], cwd },
    ).trim();
  } catch (err) {
    evidence.git_exit_code = err?.status ?? null;
    evidence.stderr_first_line = String(err?.stderr || err?.message || '').split('\n')[0] || null;
    return { ok: null, evidence };
  }

  if (!logOutput) {
    // No commit touching this file on origin/main — claim is consistent
    // (file does not exist there)
    return { ok: true, evidence };
  }

  // File exists on origin/main. If `expectedAbsent` provided, verify the
  // token is absent in the file's content on origin/main.
  evidence.contradicting_commits.push(logOutput);

  if (expectedAbsent != null) {
    let fileContent = '';
    try {
      fileContent = execSync(
        `git show ${JSON.stringify(mainInfo.ref)}:${JSON.stringify(witnessFile)}`,
        { encoding: 'utf8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'], cwd },
      );
    } catch (err) {
      evidence.git_exit_code = err?.status ?? null;
      evidence.stderr_first_line = String(err?.stderr || err?.message || '').split('\n')[0] || null;
      return { ok: null, evidence };
    }
    const re = expectedAbsent instanceof RegExp ? expectedAbsent : new RegExp(String(expectedAbsent));
    const found = re.test(fileContent);
    return { ok: !found, evidence };
  }

  // File simply exists — claim of "absent" is contradicted
  return { ok: false, evidence };
}

/**
 * Verify two columns share a value-shape histogram before designing a join.
 * Returns ok=true when (left rows whose shape is dominant in right) ≥ leftMatchMin
 * AND (right rows whose shape is foreign to left) ≤ rightMatchMax.
 *
 * Mock-supabase contract: pass `supabase=null` → returns {ok: null, evidence: {test_mode: true}}.
 *
 * @param {Object} args
 * @param {string} args.leftTable
 * @param {string} args.leftCol
 * @param {string} args.rightTable
 * @param {string} args.rightCol
 * @param {Object|null} args.supabase - Supabase client, or null for test mode
 * @param {number} [args.sampleSize=100]
 * @param {{leftMatchMin?:number,rightMatchMax?:number}} [args.thresholds]
 * @returns {Promise<{ok: boolean|null, evidence: object}>}
 */
export async function verifyJoinShape(args) {
  const { leftTable, leftCol, rightTable, rightCol, supabase } = args || {};
  const sampleSize = Number(args?.sampleSize ?? 100);
  const thresholds = { ...DEFAULT_JOIN_THRESHOLDS, ...(args?.thresholds || {}) };

  const evidence = {
    left: { table: leftTable, col: leftCol },
    right: { table: rightTable, col: rightCol },
    sample_size: sampleSize,
    left_histogram: {},
    right_histogram: {},
    threshold_evaluation: { leftMatchMin: thresholds.leftMatchMin, rightMatchMax: thresholds.rightMatchMax },
    test_mode: false,
  };

  if (supabase == null) {
    evidence.test_mode = true;
    return { ok: null, evidence };
  }

  let leftRows, rightRows;
  try {
    const left = await supabase.from(leftTable).select(leftCol).limit(sampleSize);
    const right = await supabase.from(rightTable).select(rightCol).limit(sampleSize);
    if (left?.error) {
      evidence.error = `left: ${left.error.message}`;
      return { ok: null, evidence };
    }
    if (right?.error) {
      evidence.error = `right: ${right.error.message}`;
      return { ok: null, evidence };
    }
    leftRows = left?.data || [];
    rightRows = right?.data || [];
  } catch (err) {
    evidence.error = String(err?.message || err);
    return { ok: null, evidence };
  }

  evidence.left_histogram = buildHistogram(leftRows, leftCol);
  evidence.right_histogram = buildHistogram(rightRows, rightCol);

  const leftTotal = leftRows.length;
  const rightTotal = rightRows.length;
  if (leftTotal === 0 || rightTotal === 0) {
    evidence.error = 'empty_sample';
    return { ok: null, evidence };
  }

  const dominantRightShape = Object.entries(evidence.right_histogram).sort((a, b) => b[1] - a[1])[0]?.[0];
  const leftMatchCount = evidence.left_histogram[dominantRightShape] || 0;
  const leftMatchFraction = leftMatchCount / leftTotal;
  evidence.threshold_evaluation.leftMatchFraction = leftMatchFraction;
  evidence.threshold_evaluation.dominantRightShape = dominantRightShape;

  // Compute fraction of right-side samples whose shape is FOREIGN to left distribution
  const leftShapes = new Set(Object.keys(evidence.left_histogram));
  let foreignRightCount = 0;
  for (const shape of Object.keys(evidence.right_histogram)) {
    if (!leftShapes.has(shape)) foreignRightCount += evidence.right_histogram[shape];
  }
  const rightForeignFraction = foreignRightCount / rightTotal;
  evidence.threshold_evaluation.rightForeignFraction = rightForeignFraction;

  const ok = leftMatchFraction >= thresholds.leftMatchMin && rightForeignFraction <= thresholds.rightMatchMax;
  return { ok, evidence };
}

/**
 * Walk the repo and find all bypass sites for a canonical helper. Default-
 * excludes tests, archived scripts, .worktrees, and the helper file itself.
 *
 * 3-axis classifier: each call site gets an `axis` label of WRITE_NOW (insert/
 * upsert), CLEAR_NULL (.update({col: null})), or READ (.select / .from without
 * a write verb). Only WRITE_NOW and CLEAR_NULL are considered bypass sites.
 *
 * ADVISORY ONLY — SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-8.
 * This scanner flags CANDIDATE write sites for human review. It is NOT the
 * enforcement mechanism for strategic_directives_v2's lifecycle columns — the DB-side
 * canonical-writer choke (aaa_/zzz_enforce_canonical_lifecycle_write) is, and it is
 * unconditional. Retiring this scanner entirely was considered and rejected: it still
 * catches new writers to ANY registered table, which the SD-v2-specific trigger cannot.
 * Do not re-promote its output to a blocking gate without re-deciding that.
 *
 * MEASURED RECALL DEFECT THIS REPAIRS (FR-8 / TS-20). The original implementation matched
 * only `.from(TABLE_NAME).update(` on ONE physical line. In this codebase's dominant style the
 * table name and the write verb land on DIFFERENT lines, so recall on real lifecycle writers
 * was ZERO — scripts/modules/handoff/db/SDRepository.js (the declared canonical writer itself)
 * and lib/sd-park.js were both invisible, while all 16 of its findings were metadata/scope
 * writes nobody was worried about. Three passes now run:
 *   PASS 1  single-line chain      (unchanged; keeps exact line numbers and the 3-axis label)
 *   PASS 2  MULTI-LINE chain       (.from(table) ... .update( within a bounded window)
 *   PASS 3  RAW SQL                (UPDATE / INSERT INTO / DELETE FROM <table>, e.g. lib/sd-park.js)
 *   PASS 4  RPC                    (.rpc('name') for caller-supplied writer RPC names)
 * PASS 3 is text-level and will also match SQL inside a comment or a doc string. That is
 * acceptable for an advisory lint and is the reason this is not a blocking gate.
 *
 * @param {Object} args
 * @param {string} args.helperFile - Repo-relative path of the canonical helper
 * @param {string} args.table - Supabase table name to scan for
 * @param {string} args.repoRoot - Absolute path to repo root
 * @param {string[]} [args.includeDirs=['lib','scripts']]
 * @param {string[]} [args.extraExcludeDirs] - Append to DEFAULT_EXCLUDE_DIRS
 * @param {string[]} [args.rpcWriters=[]] - RPC names that write this table; `.rpc('<name>')`
 *   call sites for these are reported with axis RPC_WRITE. Empty by default, so PASS 4 is
 *   inert unless a caller names the RPCs — a generic `.rpc(` sweep would flag hundreds of
 *   unrelated calls and train reviewers to ignore the output.
 * @param {number} [args.budgetMs=5000] - Soft scan budget
 * @returns {Promise<{ok: boolean, evidence: object}>}
 */
export async function verifyHelperCoverage(args) {
  const { helperFile, table, repoRoot } = args || {};
  const includeDirs = args?.includeDirs ?? ['lib', 'scripts'];
  const extraExcludes = args?.extraExcludeDirs ?? [];
  const rpcWriters = args?.rpcWriters ?? [];
  const budgetMs = Number(args?.budgetMs ?? 5000);
  const excludeDirs = new Set([...DEFAULT_EXCLUDE_DIRS, ...extraExcludes]);

  const evidence = {
    helper_file: helperFile,
    table,
    bypass_sites: [],
    canonical_imports: [],
    files_scanned: 0,
    ms_elapsed: 0,
    advisory: true,
  };
  const start = Date.now();

  if (!repoRoot || !table || !helperFile) {
    evidence.error = 'missing_required_args';
    return { ok: false, evidence };
  }

  // Pre-build patterns. Use line-anchored regex per-call-site, NOT greedy
  // multi-line spans. Reference table name as a literal — dynamic table
  // names are detected separately and noted in axis evidence.
  // `$&` (the whole match), not `$1` — there is no capture group here, so the original `\\$1`
  // emitted a literal backslash-dollar-one instead of escaping anything. Inert for every table
  // name in the registry today (none contains a regex metacharacter), but a scanner whose escape
  // is silently broken is the same class of defect as the recall gap above.
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match `from('table').(insert|upsert|update)(` or  `from(`table`)`
  const writeNowRe = new RegExp(`\\.from\\(\\s*[\\'"\`]${escapedTable}[\\'"\`]\\s*\\)\\s*\\.(insert|upsert|update)\\s*\\(`);
  // Dynamic table fallback: capture from(`${var}`) at insert/upsert
  const dynamicWriteRe = new RegExp('\\.from\\(\\s*`\\$\\{[^}]+\\}`\\s*\\)\\s*\\.(insert|upsert|update)\\s*\\(');
  // Canonical helper import: by relative path or by exported function name.
  // Allow file extensions and additional path segments after basename.
  const helperBaseName = helperFile.replace(/^.*[\\/]/, '').replace(/\.[mc]?js$/, '');
  const importRe = new RegExp(`from\\s+[\\'"][^\\'"]*${helperBaseName}[^\\'"]*[\\'"]`);

  const helperAbs = resolve(repoRoot, helperFile);

  function walk(dirAbs) {
    if (Date.now() - start > budgetMs) return;
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        if (excludeDirs.has(ent.name)) continue;
        if (ent.name.startsWith('archived-')) continue;
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      // Exclude file suffixes (tests, docs, helper file itself, canonical template)
      if (DEFAULT_EXCLUDE_FILE_SUFFIXES.some((s) => ent.name.endsWith(s))) continue;
      if (full === helperAbs) continue;
      if (full.endsWith('_lead-enrich-template.mjs')) continue;
      if (!/\.[mc]?js$/.test(ent.name)) continue;
      evidence.files_scanned += 1;
      let src;
      try {
        src = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      // canonical import detection — record but do NOT count as bypass
      if (importRe.test(src)) {
        evidence.canonical_imports.push(relative(repoRoot, full).replaceAll(sep, '/'));
      }
      const relPath = relative(repoRoot, full).replaceAll(sep, '/');
      const lineAt = (charIndex) => src.slice(0, charIndex).split(/\r?\n/).length;
      const recordedLines = new Set();

      // Per-line scan to compute accurate line numbers + 3-axis classification
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (writeNowRe.test(line)) {
          recordedLines.add(i + 1);
          // Determine axis: insert/upsert → WRITE_NOW; .update({col:null}) → CLEAR_NULL
          const verbMatch = line.match(/\.(insert|upsert|update)\s*\(/);
          const verb = verbMatch?.[1] ?? 'unknown';
          let axis = 'WRITE_NOW';
          if (verb === 'update') {
            // peek next 3 lines to see if it's a CLEAR_NULL pattern
            const peek = lines.slice(i, i + 3).join(' ');
            if (/:\s*null/.test(peek)) axis = 'CLEAR_NULL';
          }
          evidence.bypass_sites.push({
            path: relative(repoRoot, full).replaceAll(sep, '/'),
            line: i + 1,
            axis,
            verb,
            snippet: line.trim().slice(0, 200),
            dynamic_table: false,
          });
        } else if (dynamicWriteRe.test(line)) {
          recordedLines.add(i + 1);
          evidence.bypass_sites.push({
            path: relative(repoRoot, full).replaceAll(sep, '/'),
            line: i + 1,
            axis: 'DYNAMIC_TABLE_NAME',
            verb: 'unknown',
            snippet: line.trim().slice(0, 200),
            dynamic_table: true,
          });
        }
      }

      // PASS 2 — MULTI-LINE Supabase chains. The recall gap FR-8 exists to close: `.from(table)`
      // and the write verb routinely land on different physical lines, so PASS 1's line-anchored
      // regex could never see them.
      const fromRe = new RegExp(`\\.from\\(\\s*['"\`]${escapedTable}['"\`]\\s*\\)`, 'g');
      let fromMatch;
      while ((fromMatch = fromRe.exec(src)) !== null) {
        const window = src.slice(fromMatch.index, fromMatch.index + MULTILINE_CHAIN_WINDOW);
        const verbMatch = window.match(/\.(insert|upsert|update)\s*\(/);
        if (!verbMatch) continue;
        // A second `.from(` between this one and the verb means the verb belongs to a DIFFERENT
        // chain — attributing it here would be a false positive that erodes trust in the report.
        if (/\.from\s*\(/.test(window.slice(1, verbMatch.index))) continue;
        const line = lineAt(fromMatch.index);
        if (recordedLines.has(line)) continue; // PASS 1 already has it, with a better snippet
        recordedLines.add(line);
        const verb = verbMatch[1];
        let axis = 'WRITE_NOW';
        if (verb === 'update' && /:\s*null/.test(window.slice(verbMatch.index, verbMatch.index + 200))) {
          axis = 'CLEAR_NULL';
        }
        evidence.bypass_sites.push({
          path: relPath,
          line,
          axis,
          verb,
          snippet: window.slice(0, 200).replace(/\s+/g, ' ').trim(),
          dynamic_table: false,
          multiline: true,
        });
      }

      // PASS 3 — RAW SQL. lib/sd-park.js writes through a raw `pg` client, so no amount of
      // Supabase-chain matching would ever have seen it.
      const rawSqlRe = new RegExp(
        `\\b(?:UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+(?:public\\.)?${escapedTable}\\b`,
        'gi',
      );
      let sqlMatch;
      while ((sqlMatch = rawSqlRe.exec(src)) !== null) {
        const line = lineAt(sqlMatch.index);
        if (recordedLines.has(line)) continue;
        recordedLines.add(line);
        evidence.bypass_sites.push({
          path: relPath,
          line,
          axis: 'RAW_SQL',
          verb: sqlMatch[0].split(/\s+/)[0].toLowerCase(),
          snippet: src.slice(sqlMatch.index, sqlMatch.index + 200).replace(/\s+/g, ' ').trim(),
          dynamic_table: false,
          raw_sql: true,
        });
      }

      // PASS 4 — RPC call sites, only for RPC names the caller declares as writers of this table.
      if (rpcWriters.length > 0) {
        const escapedRpcs = rpcWriters.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const rpcRe = new RegExp(`\\.rpc\\(\\s*['"\`](${escapedRpcs})['"\`]`, 'g');
        let rpcMatch;
        while ((rpcMatch = rpcRe.exec(src)) !== null) {
          const line = lineAt(rpcMatch.index);
          if (recordedLines.has(line)) continue;
          recordedLines.add(line);
          evidence.bypass_sites.push({
            path: relPath,
            line,
            axis: 'RPC_WRITE',
            verb: 'rpc',
            snippet: src.slice(rpcMatch.index, rpcMatch.index + 200).replace(/\s+/g, ' ').trim(),
            dynamic_table: false,
            rpc_name: rpcMatch[1],
          });
        }
      }
    }
  }

  for (const sub of includeDirs) {
    const dirAbs = resolve(repoRoot, sub);
    try {
      const st = statSync(dirAbs);
      if (st.isDirectory()) walk(dirAbs);
    } catch {
      // include dir missing — skip
    }
  }

  evidence.ms_elapsed = Date.now() - start;
  // ok=true ONLY if zero bypass sites — caller decides whether DYNAMIC_TABLE_NAME
  // is acceptable (registry exempt_writers can list specific paths)
  const ok = evidence.bypass_sites.length === 0;
  return { ok, evidence };
}
