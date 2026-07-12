#!/usr/bin/env node
/**
 * RLS anon/authenticated-role tenant-predicate-sufficiency lint.
 *
 * SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 FR-4.
 * Extended to the authenticated role by SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001 FR-3.
 *
 * This exact bug class -- a SELECT RLS policy referencing a tenant-shaped
 * column (venture_id/tenant_id/etc.) without binding it to the caller's own
 * identity -- has now recurred three times: companies table (anon,
 * SD-LEO-GEN-SCOPE-ANON-KEY-001), feedback table anon policy
 * (venture_user_select_feedback, SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001),
 * and feedback table authenticated policy (select_feedback_policy,
 * SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001). The first extension of this
 * lint covered only anon; that scope gap is exactly why the authenticated
 * instance shipped undetected. This one scans migration SQL text for the
 * pattern directly, rather than the live DB, so it can run in CI on a PR
 * diff before a bad policy is ever applied.
 *
 * Scope: SELECT-cmd, anon OR authenticated-role policies. An INSERT/UPDATE/
 * DELETE policy referencing a tenant column (e.g. venture_user_insert_feedback's
 * WITH CHECK venture_id IS NOT NULL AND ...) is a DIFFERENT risk class
 * (write-integrity/spam, not read-confidentiality leakage) and is
 * deliberately not flagged -- none of this lint's motivating real instances
 * is an INSERT policy.
 *
 * Detection is a pragmatic regex/paren-balance extractor on CREATE POLICY
 * statements, not a full SQL parser -- mirrors this repo's own established
 * narrow-AST-not-full-parser philosophy (see eslint-rules/
 * no-echoed-session-coordination-target.js's own header). Accepts false
 * negatives (an unusual CREATE POLICY formatting it doesn't recognize) over
 * false positives.
 *
 * Modes (mirrors scripts/lint/schema-reference-lint.mjs's precedent):
 *   --diff (default in CI): lint ONLY migration files changed vs the merge
 *       base with origin/main -- a pre-existing backlog must never block a
 *       PR that didn't introduce it.
 *   --all: advisory full sweep of database/migrations/.
 *
 * Usage:
 *   node scripts/lint/rls-anon-tenant-predicate-lint.mjs [--diff|--all] [--json] [--root <dir>]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TENANT_COLUMN_RE = /\b(venture_id|tenant_id|org_id|company_id|portfolio_id|account_id)\b/i;
// auth.uid()/auth.jwt() (raw caller-identity primitives) AND the established
// SECURITY DEFINER caller-binding helpers used elsewhere in this schema
// (product_requirements_v2, sd_phase_handoffs): fn_user_has_venture_access,
// fn_user_has_company_access. A predicate calling any of these is
// caller-bound even though it doesn't reference auth.*() directly itself.
const IDENTITY_BOUND_RE = /\bauth\.(uid|jwt)\s*\(|\bfn_user_has_(venture|company)_access\s*\(/i;
const SCOPED_ROLES = ['anon', 'authenticated'];

/**
 * PURE: extract CREATE POLICY statements from SQL text as {name, table, cmd,
 * roles, using, withCheck} objects. Handles multi-line, balanced-paren
 * USING(...)/WITH CHECK(...) clauses.
 * @param {string} sql
 * @returns {Array<object>}
 */
export function extractPolicies(sql) {
  const policies = [];
  // Policy names are Postgres identifiers -- either bare (\w+) or
  // double-quoted with arbitrary content (e.g. "Anon read companies", the
  // real companies-table incident's own policy name).
  const stmtRe = /CREATE\s+POLICY\s+(?:"([^"]+)"|(\w+))\s+ON\s+(?:public\.)?(\w+)/gi;
  let m;
  while ((m = stmtRe.exec(sql)) !== null) {
    const name = m[1] !== undefined ? m[1] : m[2];
    const table = m[3];
    const bodyStart = m.index + m[0].length;
    const terminatorIdx = findStatementTerminator(sql, bodyStart);
    const body = sql.slice(bodyStart, terminatorIdx);

    const cmdMatch = /FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i.exec(body);
    const cmd = cmdMatch ? cmdMatch[1].toUpperCase() : 'ALL';

    const toMatch = /TO\s+([^\n]+?)(?=\s*(?:USING|WITH\s+CHECK|;|$))/i.exec(body);
    const roles = toMatch ? toMatch[1].split(',').map((r) => r.trim().toLowerCase()) : [];

    const using = extractParenBlock(body, /USING\s*\(/i);
    const withCheck = extractParenBlock(body, /WITH\s+CHECK\s*\(/i);

    policies.push({ name, table, cmd, roles, using, withCheck });
  }
  return policies;
}

/** Find the `;` that terminates this CREATE POLICY statement (paren-depth-aware). */
function findStatementTerminator(sql, fromIdx) {
  let depth = 0;
  for (let i = fromIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth <= 0) return i;
  }
  return sql.length;
}

/** Extract the balanced-paren contents immediately following a keyword match (e.g. USING(...)). */
function extractParenBlock(text, keywordRe) {
  const m = keywordRe.exec(text);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1; // position of the opening '('
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return null;
}

const BLANKET_TRUE_RE = /^\s*true\s*$/i;

/**
 * PURE: classify a SELECT/anon-or-authenticated policy's violation, or null
 * if clean. Two distinct shapes, both real historical instances:
 *   'unconditional_anon_select' -- USING (true), zero predicate at all (the
 *      companies-table incident, SD-LEO-GEN-SCOPE-ANON-KEY-001, and the
 *      feedback-table authenticated-role instance pre-fix,
 *      SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001) -- flagged regardless of
 *      whether the table has any tenant-shaped column, since blanket
 *      unauthenticated-or-any-logged-in-user SELECT access is inherently
 *      risky on its own. Name kept for stability even though it now also
 *      fires for authenticated -- it describes the SHAPE, not the role.
 *   'unbound_tenant_predicate' -- USING references a tenant-shaped column
 *      without binding it to the caller's identity (the feedback-table
 *      instances, venture_user_select_feedback [anon] and
 *      select_feedback_policy [authenticated]) -- partially scoped but not
 *      by CALLER, so still admits every tenant's rows.
 * @param {{cmd:string, roles:string[], using:string|null}} policy
 * @returns {string|null}
 */
export function classifyViolation(policy) {
  if (policy.cmd !== 'SELECT') return null;
  if (!policy.roles.some((r) => SCOPED_ROLES.includes(r))) return null;
  if (!policy.using) return null;
  if (BLANKET_TRUE_RE.test(policy.using)) return 'unconditional_anon_select';
  if (TENANT_COLUMN_RE.test(policy.using) && !IDENTITY_BOUND_RE.test(policy.using)) return 'unbound_tenant_predicate';
  return null;
}

const scopedRoleLabel = (p) => p.roles.filter((r) => SCOPED_ROLES.includes(r)).join('/');

const VIOLATION_MESSAGES = {
  unconditional_anon_select: (p) =>
    `${scopedRoleLabel(p)}-role SELECT policy '${p.name}' ON ${p.table} has an unconditional USING (true) -- any ${scopedRoleLabel(p) === 'anon' ? 'anon-key holder' : 'matching-role caller'} can read ALL rows. See SD-LEO-GEN-SCOPE-ANON-KEY-001 (companies table) and SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001 (feedback table, authenticated) for prior real instances of this class.`,
  unbound_tenant_predicate: (p) =>
    `${scopedRoleLabel(p)}-role SELECT policy '${p.name}' ON ${p.table} references tenant column '${TENANT_COLUMN_RE.exec(p.using)[1]}' in USING without binding it to auth.uid()/auth.jwt()/fn_user_has_venture_access()/fn_user_has_company_access() -- any ${scopedRoleLabel(p) === 'anon' ? 'anon-key holder' : 'matching-role caller'} can read every tenant's rows. See SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 (feedback table, anon) and SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001 (feedback table, authenticated) for prior real instances of this class.`,
};

/**
 * PURE: scan SQL text, return violation policies with their violation class.
 * @param {string} sql
 * @param {string} [filePath] for reporting
 * @returns {Array<object>}
 */
export function lintSql(sql, filePath = '(inline)') {
  const out = [];
  for (const p of extractPolicies(sql)) {
    const violationClass = classifyViolation(p);
    if (!violationClass) continue;
    out.push({
      filePath,
      policyName: p.name,
      table: p.table,
      violationClass,
      tenantColumn: violationClass === 'unbound_tenant_predicate' ? TENANT_COLUMN_RE.exec(p.using)[1] : null,
      message: VIOLATION_MESSAGES[violationClass](p),
    });
  }
  return out;
}

// ── CLI driver (diff/all modes, mirrors schema-reference-lint.mjs) ──────────

function candidateFilesDiff(repoRoot) {
  const base = process.env.RLS_LINT_BASE || 'origin/main';
  const out = [
    execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git diff --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git diff --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
  ].join('\n');
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
    .filter((f) => f.startsWith('database/migrations/') && f.endsWith('.sql'))
    .map((f) => path.join(repoRoot, f));
}

function candidateFilesAll(repoRoot) {
  const dir = path.join(repoRoot, 'database', 'migrations');
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  return entries.filter((f) => f.endsWith('.sql')).map((f) => path.join(dir, f));
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--all') ? 'all' : 'diff';
  const asJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const repoRoot = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;

  const files = mode === 'all' ? candidateFilesAll(repoRoot) : candidateFilesDiff(repoRoot);
  const violations = [];
  for (const f of files) {
    let sql;
    try { sql = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const relPath = path.relative(repoRoot, f).split(path.sep).join('/');
    violations.push(...lintSql(sql, relPath));
  }

  const result = { mode, scanned: files.length, violations, blocking: mode === 'diff' };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[RLS-ANON-TENANT-PREDICATE-LINT] mode=${mode} scanned=${files.length}`);
    if (violations.length === 0) {
      console.log('  0 violation(s) -- clean.');
    } else {
      for (const v of violations) console.log(`  ${v.filePath}: ${v.message}`);
    }
  }

  if (mode === 'diff' && violations.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
