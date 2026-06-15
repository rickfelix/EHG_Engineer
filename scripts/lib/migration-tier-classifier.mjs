/**
 * Migration TIER classifier — PURE, fail-closed allow-list DDL linter.
 *
 * SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001 (FR-1).
 *
 * classifyMigration(sql) => { tier: 1 | 2, reason, matched: string[] }
 *
 * TIER-1 (auto-apply-eligible) is granted ONLY when EVERY statement in the
 * migration matches an explicit provably-additive allow rule AND no destructive
 * token survives a whole-file sweep AND no function body hides destructive SQL.
 * EVERYTHING ELSE — destructive, ambiguous, unparseable, OR REPLACE, DO-block,
 * unrecognized — is TIER-2 (keeps the full 3-factor @approved-by chairman gate
 * in scripts/lib/migration-guards.js, which this module NEVER touches).
 *
 * SAFETY CONTRACT: a false TIER-1 verdict on a destructive migration is
 * catastrophic (it would auto-apply, bypassing the chairman gate). Therefore:
 *   - ALLOW-LIST only (never a deny-list). Default verdict = TIER-2.
 *   - The function NEVER throws and NEVER returns tier:1 on any error/ambiguity path.
 *   - Three independent layers must AGREE for tier:1 (see classifyMigration).
 *
 * PURE: no DB, no live-schema, no I/O. Reuses the repo's existing SQL primitives
 * (splitPostgreSQLStatements, stripNonDdl) rather than re-rolling SQL parsing.
 *
 * KNOWN PRIMITIVE GAP COMPENSATED: splitPostgreSQLStatements tracks only bare `$$`
 * dollar quotes, not named tags `$tag$` (wf_5071dc05). We add a named-tag balance
 * pre-check + a function-body deep-scan so a destructive named-tag body cannot
 * mis-split into a false TIER-1.
 *
 * @module scripts/lib/migration-tier-classifier
 */

import { splitPostgreSQLStatements } from './supabase-connection.js';
import { stripNonDdl } from '../verify-migration-apply-state.mjs';

// Bound input size so a pathological body cannot trigger regex catastrophic
// backtracking / a DoS hang that could leave the classifier in an undefined state.
const MAX_SQL_BYTES = 200_000;

// Top-level destructive / permission-altering / non-additive verbs. If any of these
// survive in the body-stripped, allow-head-stripped residue, the migration is TIER-2.
const FORBIDDEN_TOPLEVEL = /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|GRANT|REVOKE|CLUSTER|REINDEX|REFRESH|VACUUM|ANALYZE|COMMENT|COPY|CALL|LISTEN|NOTIFY|IMPORT|MERGE|LOCK|DO)\b/i;

// Destructive tokens inside a CREATE FUNCTION / VIEW body (Rule E deep-scan).
const BODY_DESTRUCTIVE = /\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\b[\s\S]*?\bSET\b|ALTER\s+(TABLE|VIEW|MATERIALIZED|SEQUENCE|TYPE|SCHEMA|POLICY)|GRANT|REVOKE|CALL|COPY|EXECUTE|\bDO\b|INSERT\s+INTO|MERGE)\b/i;

// A constant-only DEFAULT expression: numeric/string/bool/null literal, or a bare
// cast of those. Anything with a function call, sub-SELECT, or column ref is rejected.
const CONST_DEFAULT = /^\s*(?:NULL|TRUE|FALSE|-?\d+(?:\.\d+)?|'(?:[^']|'')*'|"(?:[^"]|"")*")\s*(?:::\s*[A-Za-z_][\w ]*(?:\[\])?\s*)?$/i;

function T2(reason) { return { tier: 2, reason, matched: [] }; }

/** Strip leading line/block comments, lowercase, collapse whitespace — for head matching. */
function normalizeHead(raw) {
  let s = String(raw);
  // strip leading -- line comments and /* */ block comments repeatedly
  let prev;
  do {
    prev = s;
    s = s.replace(/^\s*--[^\n]*\n?/, '');
    s = s.replace(/^\s*\/\*[\s\S]*?\*\//, '');
  } while (s !== prev);
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Even number of bare $$ and balanced named $tag$ dollar quotes. */
function dollarQuotesBalanced(sql) {
  const bare = (sql.match(/\$\$/g) || []).length;
  if (bare % 2 !== 0) return false;
  const tags = sql.match(/\$[A-Za-z_]\w*\$/g) || [];
  const counts = {};
  for (const t of tags) counts[t] = (counts[t] || 0) + 1;
  return Object.values(counts).every((n) => n % 2 === 0);
}

/** Count top-level (not inside a string/comment/dollar body) semicolons in a residue. */
function countTopLevelSemicolons(residue) {
  return (residue.match(/;/g) || []).length;
}

/** Remove balanced parenthesized groups (iteratively, innermost-first) — bounded. */
function stripParens(s) {
  let prev;
  let out = s;
  let guard = 0;
  do {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  } while (out !== prev && guard++ < 200);
  return out;
}

const COMMAND_VERBS = /\b(create|alter|drop|truncate|insert|update|delete|grant|revoke|merge|refresh|cluster|reindex|vacuum|analyze|comment|copy|call|do|lock|reset|listen|notify|import|rename|begin|commit|rollback|savepoint)\b/g;

/**
 * A single (already-split) statement must contain exactly ONE top-level command
 * verb. >1 means the splitter under-split (e.g. two CREATEs with no separating ;,
 * which the prefix-only head match would otherwise false-pass) or a destructive
 * command was concatenated — fail closed. Parens (incl. type sizes + function
 * argument lists) are stripped first so they cannot hide or fabricate a verb.
 */
function commandVerbCount(head) {
  return (stripParens(head).match(COMMAND_VERBS) || []).length;
}

/** Split an ALTER action list on TOP-LEVEL commas (ignoring commas inside parens). */
function splitTopLevelCommas(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// ── Allow-rule matchers (return {token} on match, else null) ──────────────────

// Rule A — CREATE TABLE IF NOT EXISTS (IF NOT EXISTS mandatory; FC-12).
function matchCreateTableINE(head) {
  const m = head.match(/^create\s+table\s+if\s+not\s+exists\s+([a-z0-9_."]+)/);
  return m ? { token: `create_table_if_not_exists:${m[1]}` } : null;
}

// Rule B — CREATE INDEX (incl UNIQUE / CONCURRENTLY / IF NOT EXISTS).
function matchCreateIndex(head) {
  const m = head.match(/^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?/);
  return m ? { token: 'create_index' } : null;
}

// Rule C — ALTER TABLE with ONLY additive nullable ADD COLUMN actions (FC-3/4/5/9).
function matchAdditiveAddColumn(head) {
  const m = head.match(/^alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+(.+)$/);
  if (!m) return null;
  const table = m[1];
  const actions = splitTopLevelCommas(m[2]);
  if (!actions.length) return null;
  const cols = [];
  for (const a0 of actions) {
    const a = a0.trim();
    // must be: add column [if not exists] <col> <type...> [default <expr>]
    const am = a.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s+(.+)$/);
    if (!am) return null; // any non-add-column action => not Rule C
    const col = am[1];
    let rest = am[2];
    // forbidden inline qualifiers => TIER-2 (FC-5/FC-9)
    if (/\b(not\s+null|primary\s+key|unique|references|generated|constraint|check)\b/.test(rest)) return null;
    // default must be constant-only (FC-4)
    const dm = rest.match(/\bdefault\b\s+(.+)$/);
    if (dm) {
      const expr = dm[1].trim();
      if (!CONST_DEFAULT.test(expr)) return null; // volatile/expression/subquery default => TIER-2
    }
    cols.push(`${table}.${col}`);
  }
  return { token: `add_column_nullable:${cols.join(',')}` };
}

// Rule D — CREATE POLICY, or ALTER TABLE ... ENABLE ROW LEVEL SECURITY (only that form).
function matchPolicyOrEnableRls(head) {
  if (/^create\s+policy\b/.test(head)) return { token: 'create_policy' };
  const m = head.match(/^alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+enable\s+row\s+level\s+security$/);
  return m ? { token: `enable_rls:${m[1]}` } : null;
}

// Rule E — bare CREATE FUNCTION/VIEW/MATVIEW (NOT 'OR REPLACE'), body free of destructive SQL.
function matchSafeCreateFnView(head, rawStmt) {
  if (/^create\s+or\s+replace\b/.test(head)) return null; // FC-8: OR REPLACE => TIER-2
  if (!/^create\s+(function|view|materialized\s+view)\b/.test(head)) return null;
  // SECURITY DEFINER privilege-escalation vector => TIER-2 (FC-15)
  if (/\bsecurity\s+definer\b/i.test(rawStmt)) return null;
  // deep-scan the FULL raw statement body for destructive tokens (FC-7).
  if (BODY_DESTRUCTIVE.test(rawStmt)) return null;
  const kind = head.startsWith('create function') ? 'create_function'
    : head.startsWith('create materialized view') ? 'create_matview' : 'create_view';
  return { token: kind };
}

const RULES = [matchCreateTableINE, matchCreateIndex, matchAdditiveAddColumn, matchPolicyOrEnableRls];

/**
 * Classify a migration's risk tier. PURE; never throws; default-deny to TIER-2.
 * @param {string} sql
 * @returns {{ tier: 1|2, reason: string, matched: string[] }}
 */
export function classifyMigration(sql) {
  try {
    if (typeof sql !== 'string') return T2('non_string_input');
    if (sql.length > MAX_SQL_BYTES) return T2('migration_too_large');
    if (!sql.trim()) return T2('empty_migration');

    // FC-1: structural dollar-quote balance (bare $$ + named $tag$).
    if (!dollarQuotesBalanced(sql)) return T2('unbalanced_dollar_quote');

    const stmts = splitPostgreSQLStatements(sql);
    if (!stmts.length) return T2('no_statements'); // FC-13

    const residue = stripNonDdl(sql);

    // FC-3: under-split detection — residue has more top-level ; than statements found.
    if (countTopLevelSemicolons(residue) > stmts.length) return T2('under_split_ambiguity');

    // FC-6: any top-level DO block anywhere => TIER-2 (anonymous code block, arbitrary side effects).
    if (/(^|;|\s)do\b/i.test(residue)) return T2('do_block_present');

    const matched = [];
    for (const raw of stmts) {
      const head = normalizeHead(raw);
      if (!head) continue; // comment/whitespace-only fragment between statements
      if (head.includes(';')) return T2('embedded_semicolon_ambiguity'); // FC-3
      // FC-3 (under-split): a single statement must carry exactly one command verb.
      // Catches the no-semicolon blob (two CREATEs) that a prefix-only head match
      // would false-pass, and any destructive command concatenated to an additive one.
      if (commandVerbCount(head) > 1) return T2('multiple_commands_in_statement');
      let r = null;
      for (const rule of RULES) { r = rule(head); if (r) break; }
      if (!r) r = matchSafeCreateFnView(head, raw); // Rule E needs the raw body, not just head
      if (!r) return T2(`unrecognized_or_unsafe_statement: ${head.slice(0, 80)}`); // FC-2
      matched.push(r.token);
    }
    if (!matched.length) return T2('no_ddl_statements'); // FC-13 (comment-only)

    // FC-7/FC-10: whole-file forbidden sweep. stripNonDdl already removed comments +
    // dollar bodies; a forbidden top-level verb surviving here (not part of an
    // allow-listed head we matched) means a destructive statement slipped the
    // per-statement loop or the two parsers disagree on boundaries (FC-14) => TIER-2.
    // We do NOT trust the per-statement loop alone — both must agree.
    const residueForbidden = FORBIDDEN_TOPLEVEL.test(residue);
    if (residueForbidden) {
      // Allow-listed heads never contain these verbs, so any hit is a real forbidden
      // token (or a parser disagreement) — fail closed.
      return T2('forbidden_token_in_residue');
    }

    return { tier: 1, reason: 'all_statements_provably_additive', matched };
  } catch (e) {
    return T2(`classifier_exception: ${e && e.message ? e.message : String(e)}`); // FC-16
  }
}

export default { classifyMigration };
