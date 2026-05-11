/**
 * Phantom Test Audit — pre-merge call-surface alignment check.
 *
 * SD-FDBK-ENH-PAT-PHANTOM-TABLE-001 / PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 CAPA-2+CAPA-3
 * Closes feedback 9f24c164-471a-4f0c-a506-4d5762c52a55 (RCA cluster from QF-20260509-849).
 *
 * Detects test/code call-surface misalignment when a PR removes a phantom-table
 * reference but leaves behind orphaned __tests__/ or tests/ assertions on the
 * removed table name. Runs at LEAD-FINAL-APPROVAL alongside wire-check-gate.
 *
 * Limitation: Only single-line, single- or double-quoted string literals are
 * extracted from the diff. Template literals, multi-line strings, and dynamic
 * `.from(${tableNameVar})` refs are NOT covered. The same-PR test edit check
 * is the safety net when the literal extractor misses something.
 *
 * Pure-function core: `auditPhantomTableTests({removedTables, changedFiles,
 * testFiles})` does NO I/O — all git/fs lives in the CLI wrapper at the bottom
 * of this file, which collects inputs and invokes the pure function.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pure function: audit test/code call-surface alignment.
 *
 * @param {Object} input
 * @param {Set<string>} input.removedTables - Table-name string literals removed from src/ in diff
 * @param {string[]} input.changedFiles - Files changed in PR (relative paths)
 * @param {Array<{path: string, contents: string}>} input.testFiles - Test files to scan
 * @returns {{passed: boolean, issues: string[], details: {orphaned_tests: Array<{table: string, testFile: string}>, matched_edits: string[]}}}
 */
export function auditPhantomTableTests({ removedTables, changedFiles, testFiles }) {
  const orphaned = [];
  const matchedEdits = new Set();
  const changedSet = new Set(changedFiles.map(normalize));

  for (const tf of testFiles) {
    const normalizedPath = normalize(tf.path);
    const isChanged = changedSet.has(normalizedPath);

    for (const table of removedTables) {
      // Match single-line single- or double-quoted literals containing the table name.
      const pattern = new RegExp(`['"]${escapeRegex(table)}['"]`);
      if (!pattern.test(tf.contents)) continue;

      if (isChanged) {
        matchedEdits.add(normalizedPath);
      } else {
        orphaned.push({ table, testFile: normalizedPath });
      }
    }
  }

  if (orphaned.length === 0) {
    return {
      passed: true,
      issues: [],
      details: { orphaned_tests: [], matched_edits: [...matchedEdits] },
    };
  }

  const issues = [
    `PHANTOM_TEST_AUDIT: ${orphaned.length} orphaned test reference(s) to removed table literal(s):`,
    ...orphaned.map(o => `  - test "${o.testFile}" references removed table '${o.table}' but was NOT edited in this PR`),
    `Edit the listed test file(s) in the same PR, OR set PHANTOM_TEST_AUDIT_BYPASS=1 with bypass reason in handoff governance_metadata.`,
  ];
  return {
    passed: false,
    issues,
    details: { orphaned_tests: orphaned, matched_edits: [...matchedEdits] },
  };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(p) {
  return String(p).replace(/\\/g, '/');
}

/**
 * Trigger regex for phantom-table CAPA cluster.
 * Subject-only scan (NOT body) per empirical risk analysis: 1/2000 origin/main
 * subjects match (genuine target); body scanning would create future false-positives.
 */
export const PHANTOM_COMMIT_TRIGGER = /phantom.*table|dead.*query/i;

/**
 * Collect inputs from git + fs and invoke the pure function.
 * Used by the gate wrapper (and the CLI below).
 *
 * @param {Object} opts
 * @param {string} opts.repoPath - Repo root
 * @param {string} opts.baseRef - Base ref (default origin/main)
 * @returns {{triggered: boolean, result: ReturnType<auditPhantomTableTests> | null}}
 */
export function collectAndAudit({ repoPath, baseRef = 'origin/main' }) {
  // Commit subjects in baseRef..HEAD; subject-only (--format=%s)
  const subjects = safeGit(`git log ${baseRef}..HEAD --format=%s`, repoPath);
  const triggered = subjects
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .some(s => PHANTOM_COMMIT_TRIGGER.test(s));

  if (!triggered) {
    return { triggered: false, result: null };
  }

  // Removed string literals from src diff (single-line single/double-quoted).
  const diff = safeGit(`git diff ${baseRef}..HEAD -- "scripts/*" "lib/*" "src/*"`, repoPath, { maxBuffer: 16 * 1024 * 1024 });
  const removedTables = extractRemovedLiterals(diff);

  // Files changed in this PR.
  const changedRaw = safeGit(`git diff --name-only ${baseRef}..HEAD`, repoPath);
  const changedFiles = changedRaw.split('\n').map(s => s.trim()).filter(Boolean);

  // Test files to scan (recursive from tests/ and __tests__/).
  const testFiles = enumerateTestFiles(repoPath);

  const result = auditPhantomTableTests({ removedTables, changedFiles, testFiles });
  return { triggered: true, result };
}

function safeGit(cmd, cwd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd, timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...opts });
  } catch (_err) {
    return '';
  }
}

function extractRemovedLiterals(diff) {
  const set = new Set();
  // Lines starting with '-' (removed) but not '---' (file header).
  const lines = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
  for (const line of lines) {
    // Find single- or double-quoted single-line literals: 'foo' or "foo".
    const re = /(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      // Heuristic: only table-name-shaped tokens (snake_case alphanumerics).
      if (m[2].length >= 3 && /^[a-z][a-z0-9_]*$/.test(m[2])) {
        set.add(m[2]);
      }
    }
  }
  return set;
}

function enumerateTestFiles(repoPath) {
  const roots = ['tests', '__tests__'];
  const out = [];
  for (const root of roots) {
    const abs = path.join(repoPath, root);
    try {
      const stat = statSync(abs);
      if (!stat.isDirectory()) continue;
    } catch { continue; }
    walk(abs, repoPath, out);
  }
  return out;
}

function walk(dir, repoPath, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, repoPath, out);
    } else if (ent.isFile() && /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/.test(ent.name)) {
      try {
        const rel = path.relative(repoPath, full).replace(/\\/g, '/');
        const contents = readFileSync(full, 'utf8');
        out.push({ path: rel, contents });
      } catch { /* skip unreadable */ }
    }
  }
}

// CLI wrapper.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const repoPath = process.cwd();
  const baseRef = process.env.PHANTOM_AUDIT_BASE_REF || 'origin/main';
  const { triggered, result } = collectAndAudit({ repoPath, baseRef });
  if (!triggered) {
    console.log('[PHANTOM_TEST_AUDIT] No commit subject matches /phantom.*table|dead.*query/i — audit not applicable (early-return PASS).');
    process.exit(0);
  }
  if (result.passed) {
    console.log(`[PHANTOM_TEST_AUDIT] PASS. Matched same-PR test edits: ${result.details.matched_edits.length}`);
    process.exit(0);
  }
  for (const issue of result.issues) console.error(issue);
  process.exit(1);
}
