#!/usr/bin/env node
/**
 * SECURITY DEFINER EXECUTE-revoke standing check.
 *
 * SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 FR-6.
 *
 * The recurrence mechanism this repo has now hit twice (46 of 137 SECURITY DEFINER functions
 * exposed with zero migration ever having written a REVOKE): PostgreSQL grants EXECUTE to PUBLIC
 * on every new function by default. A migration that creates a SECURITY DEFINER function without
 * an explicit, CORRECT REVOKE reintroduces the exact exposure this SD closes.
 *
 * "CORRECT" has two requirements, not one — both measured defects in this SD's own original
 * design, found by PLAN-phase sub-agent review:
 *   1. The REVOKE's FROM list must name PUBLIC explicitly. anon/authenticated INHERIT PUBLIC's
 *      grant, so a REVOKE naming only anon/authenticated is a NO-OP (this is the exact defect
 *      this SD's own predecessor migration description originally contained).
 *   2. PUBLIC alone is not sufficient either — a function can carry a DIRECT anon or authenticated
 *      grant that "REVOKE ... FROM PUBLIC" cannot remove (live counter-example in this repo:
 *      fn_anon_ingress_prior_hour_count is PUBLIC-clean and still anon-executable). Each of
 *      {anon, authenticated} must be EITHER named in the same REVOKE's FROM list, OR explicitly
 *      re-GRANTed later in the same file (the re-grant branch is required — a legitimate anon-
 *      facing function, e.g. 20260815_venture_user_feedback_ownership_rpc.sql, GRANTs anon
 *      deliberately and must not be flagged).
 *
 * Detection is a pragmatic regex extractor on migration SQL text, not a full SQL parser —
 * mirrors this repo's established narrow-AST-not-full-parser philosophy (see
 * scripts/lint/rls-anon-tenant-predicate-lint.mjs's identical framing). Accepts false negatives
 * (unusual formatting it doesn't recognize) over false positives.
 *
 * Scope: the UNION of database/migrations/, supabase/migrations/, database/chairman-gated/ — a
 * lint scoped to database/migrations/ alone (the existing rls-anon-tenant-predicate-lint.mjs's
 * scope) would be blind to this SD's OWN migration, which lives in database/chairman-gated/
 * (DESIGN sub-agent finding, PLAN phase).
 *
 * KNOWN LIMITATION, stated plainly: this is a text lint over migration files. It cannot see a
 * SECURITY DEFINER function created via the Supabase dashboard SQL editor, outside any migration
 * file. That axis is covered by scripts/audit-rpc-execute-grants.mjs's completeness gate
 * (AUDIT_GRANTS_MODE=buckets), which measures the live catalog directly. Two independent
 * enforcement sites on two different observability axes — neither alone is sufficient.
 *
 * Modes (mirrors rls-anon-tenant-predicate-lint.mjs's precedent):
 *   --diff (default in CI): lint ONLY migration files changed vs the merge base with
 *       origin/main — a pre-existing backlog must never block a PR that didn't introduce it.
 *   --all: advisory full sweep of all three scoped directories.
 *
 * Usage:
 *   node scripts/lint/secdef-execute-revoke-lint.mjs [--diff|--all] [--json] [--root <dir>]
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCOPED_DIRS = ['database/migrations', 'supabase/migrations', 'database/chairman-gated'];
const ALLOWLIST_PATH = path.join(__dirname, 'secdef-execute-revoke-allowlist.json');

/**
 * PURE: extract {name, args} for every CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER in the
 * SQL text. Uses a paren-balance scan for the argument list so nested parens (e.g. a DEFAULT
 * expression containing a function call) don't truncate it early.
 * @param {string} sql
 * @returns {Array<{name: string, args: string}>}
 */
export function extractSecdefFunctions(sql) {
  const results = [];
  const headRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  let m;
  while ((m = headRe.exec(sql)) !== null) {
    const name = m[1];
    const argsStart = m.index + m[0].length;
    let depth = 1;
    let i = argsStart;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    const args = sql.slice(argsStart, i - 1);
    // Look ahead (bounded window) for SECURITY DEFINER before the next CREATE/statement boundary.
    const tail = sql.slice(i, i + 2000);
    const nextCreate = tail.search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
    const window = nextCreate >= 0 ? tail.slice(0, nextCreate) : tail;
    if (/SECURITY\s+DEFINER/i.test(window)) results.push({ name, args, createEndIdx: i });
  }
  return results;
}

/**
 * PURE: strip SQL `--` line comments and `/* *\/` block comments before any pattern-matching
 * runs, so text that exists ONLY inside a comment (e.g. a REVOKE disabled mid-debugging) cannot
 * satisfy the lint's requirements. Not a full tokenizer — does not special-case `--`/`/*` inside
 * a string literal, matching this file's own stated "pragmatic regex, not full parser" scope; a
 * migration string literal containing `--` is vanishingly rare and not this lint's concern.
 * @param {string} sql
 * @returns {string}
 */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, '');
}

/**
 * PURE: reduce a CREATE-style argument list ("p_a uuid, p_b integer DEFAULT 5") to just its
 * ordered type tokens ("uuid,integer"), matching DROP FUNCTION's type-only signature syntax.
 * Best-effort, not a full SQL type parser — splits on top-level commas (respecting paren depth
 * for parameterized types like numeric(10,2)), then for each chunk drops a trailing DEFAULT
 * clause and a leading param-name identifier if present.
 * @param {string} argsStr
 * @returns {string}
 */
export function normalizeArgTypes(argsStr) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of argsStr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => {
      const chunk = p.replace(/\bDEFAULT\b[\s\S]*$/i, '').trim();
      const tokens = chunk.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) tokens.shift(); // drop the leading param-name identifier
      return tokens.join(' ').toLowerCase();
    })
    .join(',');
}

/**
 * PURE: for a given function name, find every REVOKE EXECUTE ... FROM <list> ON FUNCTION
 * <name>(...) statement in the SQL and every GRANT EXECUTE ... TO <list> ON FUNCTION
 * <name>(...) statement, returning the union of roles named in each.
 * @param {string} sql
 * @param {string} fnName
 * @returns {{revokedFrom: Set<string>, grantedTo: Set<string>}}
 */
export function extractGrantActions(sql, fnName) {
  const revokedFrom = new Set();
  const grantedTo = new Set();
  const esc = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const revokeRe = new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${esc}\\s*\\([^)]*\\)\\s+FROM\\s+([^;]+);`, 'gi');
  const grantRe = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${esc}\\s*\\([^)]*\\)\\s+TO\\s+([^;]+);`, 'gi');
  let m;
  while ((m = revokeRe.exec(sql)) !== null) {
    for (const role of m[1].split(',')) revokedFrom.add(role.trim().toUpperCase());
  }
  while ((m = grantRe.exec(sql)) !== null) {
    for (const role of m[1].split(',')) grantedTo.add(role.trim().toUpperCase());
  }
  return { revokedFrom, grantedTo };
}

/**
 * PURE: evaluate one SECURITY DEFINER function against FR-6's two-requirement rule.
 * @returns {{compliant: boolean, reasons: string[]}}
 */
export function evaluateFunction(sql, fnName) {
  const { revokedFrom, grantedTo } = extractGrantActions(sql, fnName);
  const reasons = [];

  if (!revokedFrom.has('PUBLIC')) {
    reasons.push('no REVOKE ... FROM list for this function names PUBLIC explicitly — anon/authenticated inherit PUBLIC\'s grant, so omitting it is a no-op');
  }
  for (const role of ['ANON', 'AUTHENTICATED']) {
    const addressed = revokedFrom.has(role) || grantedTo.has(role);
    if (!addressed) {
      reasons.push(`${role.toLowerCase()} is neither revoked nor explicitly re-granted for this function`);
    }
  }

  return { compliant: reasons.length === 0, reasons };
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return {};
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
}

/**
 * TS-4: enumerate migration files in scope for `mode`. --all walks the UNION of SCOPED_DIRS
 * (database/migrations, supabase/migrations, database/chairman-gated) — exported so a unit test
 * can prove the chairman-gated directory is actually included, not just database/migrations/
 * (the FR-6 scope fix this lint exists to enforce on itself).
 */
export function listScopedFiles(mode, root) {
  if (mode === 'all') {
    const files = [];
    for (const dir of SCOPED_DIRS) {
      const full = path.join(root, dir);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.sql')) files.push(path.join(dir, f));
      }
    }
    return files;
  }
  // --diff: files changed vs merge-base with origin/main, within the scoped dirs.
  let mergeBase;
  try {
    mergeBase = execSync('git merge-base HEAD origin/main', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    try {
      mergeBase = execSync('git merge-base HEAD main', { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return [];
    }
  }
  const changed = execSync(`git diff --name-only --diff-filter=ACMR ${mergeBase}...HEAD`, { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  return changed.filter((f) => SCOPED_DIRS.some((d) => f.startsWith(d + '/')) && f.endsWith('.sql'));
}

/**
 * PURE: true only if the SAME function signature is DROPped AFTER this specific CREATE — a
 * transient, self-contained probe (e.g. an empirical self-test inside a DO block: create, use,
 * drop, all in one place) that never persists as a real exposure, so it is exempt from the
 * REVOKE requirement by construction, not by allowlist.
 *
 * TESTING/SECURITY sub-agent finding (E4/S3, EXEC-TO-PLAN review): the prior version matched ANY
 * `DROP FUNCTION <name>(` occurring anywhere in the file, with no ordering or argument check. That
 * missed the single most common migration idiom this repo actually uses — DROP-then-CREATE to
 * change a signature or return type, where the function PERSISTS after the file runs and is
 * exactly the exposure this lint exists to catch — while also missing the guarded `IF EXISTS`
 * form and matching across unrelated overloads. Now requires: (1) the DROP's match index is AFTER
 * createEndIdx (so drop-then-create is never exempt — only create-then-drop is), (2) `IF EXISTS`
 * is accepted, (3) the DROP's own argument list normalizes to the SAME type signature as the
 * CREATE (so dropping a different overload of the same name doesn't wrongly exempt it).
 */
export function isTransientProbe(sql, fnName, fnArgs, createEndIdx) {
  const esc = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dropRe = new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${esc}\\s*\\(`, 'gi');
  const expected = normalizeArgTypes(fnArgs);
  let m;
  while ((m = dropRe.exec(sql)) !== null) {
    if (m.index <= createEndIdx) continue; // DROP-then-CREATE: the function persists, not transient
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    const dropArgs = sql.slice(m.index + m[0].length, i - 1);
    if (normalizeArgTypes(dropArgs) === expected) return true;
  }
  return false;
}

export function lintFile(rawSql, filePath, allowlist) {
  const sql = stripSqlComments(rawSql);
  const findings = [];
  const secdefFns = extractSecdefFunctions(sql);
  for (const { name, args, createEndIdx } of secdefFns) {
    const allowEntry = allowlist[name];
    if (allowEntry?.reason) continue; // explicit, documented exception
    if (isTransientProbe(sql, name, args, createEndIdx)) continue; // created, used, dropped in place
    const { compliant, reasons } = evaluateFunction(sql, name);
    if (!compliant) {
      findings.push({ file: filePath, function: name, reasons });
    }
  }
  return findings;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--all') ? 'all' : 'diff';
  const asJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;

  const allowlist = loadAllowlist();
  const files = listScopedFiles(mode, root);

  let allFindings = [];
  for (const f of files) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) continue;
    const sql = fs.readFileSync(full, 'utf8');
    allFindings = allFindings.concat(lintFile(sql, f, allowlist));
  }

  if (asJson) {
    console.log(JSON.stringify({ mode, filesScanned: files.length, findings: allFindings }, null, 2));
  } else if (allFindings.length === 0) {
    console.log(`✅ secdef-execute-revoke-lint (${mode}): ${files.length} file(s) scanned, 0 violations.`);
  } else {
    console.error(`❌ secdef-execute-revoke-lint (${mode}): ${allFindings.length} violation(s) across ${files.length} file(s) scanned:\n`);
    for (const f of allFindings) {
      console.error(`  ${f.file} :: ${f.function}()`);
      for (const r of f.reasons) console.error(`    - ${r}`);
      console.error(`    Fix: REVOKE EXECUTE ON FUNCTION public.${f.function}(...) FROM PUBLIC, anon, authenticated; then GRANT back whichever role(s) legitimately need it.`);
      console.error(`    Escape hatch: add "${f.function}": {"reason": "<why this is safe>"} to scripts/lint/secdef-execute-revoke-allowlist.json`);
    }
  }

  process.exit(allFindings.length === 0 ? 0 : 1);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
