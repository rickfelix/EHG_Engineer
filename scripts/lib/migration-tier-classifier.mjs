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
// COMMENT is deliberately EXCLUDED (QF-20260711-804): it now has its own narrow,
// literal-value-only allow-rule (matchCommentOnColumn) — same treatment as CREATE/ALTER,
// which are also absent here and gated by their own RULES instead of a blanket ban.
const FORBIDDEN_TOPLEVEL = /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|GRANT|REVOKE|CLUSTER|REINDEX|REFRESH|VACUUM|ANALYZE|COPY|CALL|LISTEN|NOTIFY|IMPORT|MERGE|LOCK|DO)\b/i;

// Destructive tokens inside a CREATE FUNCTION / VIEW body (Rule E deep-scan).
const BODY_DESTRUCTIVE = /\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\b[\s\S]*?\bSET\b|ALTER\s+(TABLE|VIEW|MATERIALIZED|SEQUENCE|TYPE|SCHEMA|POLICY)|GRANT|REVOKE|CALL|COPY|EXECUTE|\bDO\b|INSERT\s+INTO|MERGE)\b/i;

// Constructs that EXECUTE a query at apply time or structurally couple to an existing
// object, and have NO provably-additive allow-listed counterpart — fail closed wherever
// they appear in the residue (whole-file defense-in-depth, adversarial review SD-LEO-
// INFRA-MIGRATION-TIER-CLASSIFIER-001). NOTE: CTAS (`... AS SELECT`) and expression
// indexes are caught at the RULE level (Rule A / Rule B) instead, because a plain
// CREATE VIEW legitimately uses `AS SELECT` and so cannot be swept whole-file.
const APPLY_TIME_OR_COUPLING = /\b(materialized\s+view|partition\s+of|inherits)\b/i;

// serial pseudo-types: Postgres expands these to NOT NULL + an implicit sequence +
// DEFAULT nextval + (on a non-empty table) a rewrite — NOT a nullable-additive column.
const SERIAL_PSEUDOTYPE = /\b(smallserial|bigserial|serial8|serial4|serial2|serial)\b/i;

// Zero-width chars JS \s does NOT match: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ).
// Built from char codes so no invisible character lives in this source file (which an
// editor or git filter could silently strip, disarming the FC-18 normalization).
const ZERO_WIDTH = new RegExp('[' + String.fromCharCode(0x200b, 0x200c, 0x200d) + ']', 'g');

// Strip SQL line comments (dash-dash to EOL) and block comments, replacing each with a
// space. Postgres treats comments as whitespace in its token stream, so a destructive or
// flag token can be split by an INTERIOR comment (the SECURITY DEFINER comment-split
// bypass) to evade a \s-based regex. Run the security / body scans over this cleaned form.
// Over-stripping only makes a scan MORE conservative (errs toward TIER-2), which is safe.
function stripSqlComments(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/--[^\n]*/g, ' ');        // line comments
}

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

/**
 * Count semicolons OUTSIDE any single-quoted string literal in `s`. A quoted string —
 * e.g. a COMMENT ON COLUMN ... IS '...' value — can legitimately contain semicolons as
 * prose punctuation; those are NOT statement boundaries and must not be miscounted as
 * one (QF-20260711-804: a chairman-facing COMMENT string with semicolons in its prose
 * false-triggered the under-split/embedded-semicolon checks on an otherwise provably-
 * additive migration). Dollar-quoted bodies are already removed by stripNonDdl() before
 * this runs, so only '...'-style literals need handling here. Escaped '' inside a
 * string (the SQL-standard doubled-quote escape) is honored.
 */
function countTopLevelSemicolons(s) {
  let count = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") {
      if (inString && s[i + 1] === "'") { i++; continue; } // escaped '' inside a string
      inString = !inString;
      continue;
    }
    if (ch === ';' && !inString) count++;
  }
  return count;
}

/** True iff `s` contains a semicolon OUTSIDE any single-quoted string literal. */
function hasTopLevelSemicolon(s) {
  return countTopLevelSemicolons(s) > 0;
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
// MUST be the canonical column-definition form: the column list '(' immediately follows
// the table name. Reject the tail forms that EXECUTE a query at apply time or couple to
// an existing object (adversarial review SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001):
//   - CTAS  `... AS SELECT|VALUES|...`  → runs the query at apply (data exfil / arbitrary fn)
//   - PARTITION OF                       → attaches to / locks an existing parent table
//   - INHERITS                           → couples to an existing parent
//   - LIKE                               → copies from a template (not a standalone create)
// (An in-table column DEFAULT — even a volatile one like gen_random_uuid() — is NOT
//  rejected: for a brand-new empty table the default only fires on later INSERTs, never
//  at apply, so it stays provably-additive at apply time.)
function matchCreateTableINE(head) {
  const m = head.match(/^create\s+table\s+if\s+not\s+exists\s+([a-z0-9_."]+)\s*(.*)$/);
  if (!m) return null;
  const rest = m[2];
  if (!rest.startsWith('(')) return null;                       // not a column-list create (CTAS/PARTITION OF/OF type/...)
  if (/\b(as|partition|inherits|like|execute)\b/.test(rest)) return null; // CTAS / coupling / template forms
  return { token: `create_table_if_not_exists:${m[1]}` };
}

// Rule B — CREATE INDEX (incl UNIQUE / CONCURRENTLY / IF NOT EXISTS).
// MUST be a plain column-list index. An expression / functional index, an INCLUDE(...)
// or USING method(...) expression, or a partial-index WHERE predicate is EVALUATED per
// existing row at BUILD time, so a volatile function there executes at apply (adversarial
// review: nextval/pg_advisory_lock/side-effecting fns). Allow ONLY a bare column list:
//   - require an `ON <table>` before the column-list parens,
//   - the column-list parens must contain NO nested '(' or ')' (a function call,
//     expression, INCLUDE(...), USING(...) or WITH(...) clause), and
//   - reject any trailing WHERE (partial-index predicates are not provably side-effect-free).
function matchCreateIndex(head) {
  if (!/^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?/.test(head)) return null;
  const open = head.indexOf('(');
  const close = head.lastIndexOf(')');
  if (open === -1 || close <= open) return null;                       // no column list => unrecognized
  if (!/\bon\s+[a-z0-9_."]+/.test(head.slice(0, open))) return null;   // require ON <table> before the column list
  const inner = head.slice(open + 1, close);
  if (inner.includes('(') || inner.includes(')')) return null;         // function/expr/INCLUDE/USING/WITH => TIER-2
  if (/\bwhere\b/.test(head.slice(close))) return null;                // partial-index predicate => TIER-2
  return { token: 'create_index' };
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
    // serial pseudo-types imply NOT NULL + an implicit sequence + DEFAULT nextval + a
    // possible rewrite — not a nullable-additive column (adversarial review).
    if (SERIAL_PSEUDOTYPE.test(rest)) return null;
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

// Rule E — bare CREATE FUNCTION / VIEW (NOT 'OR REPLACE'), body free of destructive SQL.
// CREATE MATERIALIZED VIEW is EXCLUDED: it is materialized WITH DATA at apply time, so its
// defining SELECT EXECUTES during the migration (setval/pg_sleep/pg_terminate_backend =>
// apply-time side effects) — always TIER-2 (adversarial review). A plain VIEW and a bare
// CREATE FUNCTION are additive at apply (the view is lazy; the function definition is
// stored, not executed) — but guarded below.
function matchSafeCreateFnView(head, rawStmt) {
  if (/^create\s+or\s+replace\b/.test(head)) return null;            // FC-8: OR REPLACE => TIER-2
  if (/^create\s+materialized\s+view\b/.test(head)) return null;     // matview executes WITH DATA at apply => TIER-2
  if (!/^create\s+(function|view)\b/.test(head)) return null;
  // Postgres treats comments as whitespace, so scan a COMMENT-STRIPPED form — otherwise
  // `SECURITY/*c*/DEFINER` or `SECURITY --c<nl>DEFINER` parse as DEFINER yet evade \s (FC-15).
  const clean = stripSqlComments(rawStmt);
  if (/\bsecurity\s+definer\b/i.test(clean)) return null;            // FC-15 (covers EXTERNAL SECURITY DEFINER)
  if (BODY_DESTRUCTIVE.test(clean)) return null;                     // FC-7 deep-scan (comment-split safe)
  if (head.startsWith('create view')) {
    // A provably-additive VIEW is a pure projection. A function call / sub-expression in
    // the defining query is an un-provable footgun (runs on every read; cannot prove it
    // pure), so require the body (everything after the first `AS`) to contain no parens.
    const am = clean.match(/\bas\b([\s\S]*)$/i);
    const body = am ? am[1] : clean;
    if (body.includes('(')) return null;
    return { token: 'create_view' };
  }
  return { token: 'create_function' };
}

// Rule F — COMMENT ON COLUMN <table>.<col> IS <literal-or-NULL> (QF-20260711-804). Pure
// catalog metadata (pg_description) on an EXISTING column — no query execution, no data
// mutation, no object coupling beyond referencing the column. The value MUST be a plain
// constant string literal or NULL (clears the comment) — never a sub-expression/function
// call, which could not be proven side-effect-free. COMMENT ON <anything else> (TABLE,
// FUNCTION, ...) is intentionally NOT covered — fails closed to TIER-2 (unrecognized).
function matchCommentOnColumn(head) {
  const m = head.match(/^comment\s+on\s+column\s+([a-z0-9_."]+)\s+is\s+(.+)$/);
  if (!m) return null;
  const value = m[2].trim();
  if (value === 'null') return { token: `comment_on_column:${m[1]}` };
  if (!/^'(?:[^']|'')*'$/.test(value)) return null; // must be a plain string literal
  return { token: `comment_on_column:${m[1]}` };
}

const RULES = [matchCreateTableINE, matchCreateIndex, matchAdditiveAddColumn, matchPolicyOrEnableRls, matchCommentOnColumn];

/**
 * Classify a migration's risk tier. PURE; never throws; default-deny to TIER-2.
 * @param {string} sql
 * @returns {{ tier: 1|2, reason: string, matched: string[] }}
 */
export function classifyMigration(sql) {
  try {
    if (typeof sql !== 'string') return T2('non_string_input');
    // FC-18: normalize the zero-width chars that JS \s does NOT match (U+200B/C/D) to
    // spaces, so an invisible char cannot split a keyword pair (e.g. SECURITY<ZWSP>DEFINER)
    // past a \s-based check. Postgres rejects these as token delimiters (a real apply would
    // syntax-error), so normalizing toward TIER-2 removes any doubt. Defense-in-depth.
    // (regex built from char codes so no invisible chars live in this source file.)
    sql = sql.replace(ZERO_WIDTH, ' ');
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
      if (hasTopLevelSemicolon(head)) return T2('embedded_semicolon_ambiguity'); // FC-3
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

    // FC-17: whole-file defense-in-depth for apply-time-executing / object-coupling forms
    // that carry no destructive VERB token (so the FORBIDDEN_TOPLEVEL sweep is blind to
    // them) but are caught at the rule level above. Re-check the residue so a future
    // rule-level regression cannot silently re-open them (matview / PARTITION OF / INHERITS).
    if (APPLY_TIME_OR_COUPLING.test(residue)) {
      return T2('apply_time_or_coupling_construct');
    }

    return { tier: 1, reason: 'all_statements_provably_additive', matched };
  } catch (e) {
    return T2(`classifier_exception: ${e && e.message ? e.message : String(e)}`); // FC-16
  }
}

export default { classifyMigration };
