/**
 * SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 — the FAIL-CLOSED delegated-apply boundary.
 *
 * Chairman-authorized (2026-06-16) scope: Adam may APPLY additive DB changes (CREATE TABLE/INDEX,
 * add nullable column, CHECK-widen) + governed data-row inserts. DESTRUCTIVE (DROP/rename/NOT-NULL)
 * and ANY permission/access-control/data-access-policy change remain CHAIRMAN-ONLY.
 *
 * This module is the load-bearing access-control boundary for delegating PRODUCTION apply rights to
 * an AI. It is PURE (no I/O), DEFAULT-DENY, and reuses the shipped, proven tier classifier
 * byte-unchanged. Two grounding+security-review-verified gaps are closed here:
 *   GAP A: classifyMigration returns tier:1 for CREATE POLICY + ENABLE RLS (data-access-policy
 *          changes the chairman reserved) — so delegatable is a STRICT SUBSET of TIER-1 that
 *          EXCLUDES any create_policy / enable_rls:* token. (Empirically the EXACT TIER-1 leak;
 *          every other access-control vector — ALTER POLICY, FORCE/DISABLE RLS, GRANT/REVOKE,
 *          ALTER DEFAULT PRIVILEGES, ALTER OWNER, SECURITY DEFINER, GRANT-in-DO — is already TIER-2.)
 *   GAP B: the classifier rejects ALL DML to TIER-2, so governed data-row INSERTs use a SEPARATE,
 *          conservative, fail-closed helper here (the proven classifier is NOT relaxed).
 *
 * SECURITY NOTE (SEC-H1, enforced in the apply layer, not here): authenticating the delegate by a
 * STRING (an @-line) is forgeable; the apply path MUST additionally require a real secret factor
 * (the delegation token). This module only decides WHAT is in-scope; the apply gate decides WHO.
 */
import { classifyMigration } from '../../scripts/lib/migration-tier-classifier.mjs';

/**
 * Hardcoded allow-list of GOVERNED tables a delegated data-row INSERT may target. Default-deny:
 * any table not in this set is NOT delegatable (chairman path). Extend ONLY via security review.
 */
export const DELEGATABLE_INSERT_TABLES = Object.freeze([
  'vision_ladder_criteria',
  'conversion_ledger',
]);

// Zero-width / BOM chars JS \s does NOT match (mirrors the classifier's FC-18 defense).
const ZERO_WIDTH_RE = /[​‌‍﻿]/g;

// Tokens that must NEVER appear in a delegated governed INSERT (destructive / privilege / volatile /
// data-access / smuggling vectors). Fail-closed: presence => reject. NOTE: 'DO'/'SET' are deliberately
// NOT here — they collide with the legitimate `ON CONFLICT ... DO NOTHING` clause; the mutation form
// `ON CONFLICT ... DO UPDATE` is still rejected by the UPDATE token, and a standalone `DO $$` block
// cannot occur (the statement must start with INSERT INTO and be single-statement).
const INSERT_FORBIDDEN_RE =
  /\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER|CREATE|RENAME|GRANT|REVOKE|MERGE|CALL|COPY|EXECUTE|LISTEN|NOTIFY|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|RETURNING|nextval|setval|currval|pg_sleep|dblink|pg_read|pg_ls|lo_import|lo_export)\b/i;

// A real relation reference in a FROM/JOIN that is NOT a parenthesized VALUES list (blocks
// INSERT ... SELECT ... FROM <sensitive_table>). Allowed source is ONLY a literal VALUES list.
const FROM_OR_JOIN_RE = /\b(?:FROM|JOIN)\s+(?!\(\s*VALUES\b)/i;

/** Strip SQL comments (-- to EOL and /* block *​/) so comment-evasion cannot hide tokens. */
function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/--[^\n\r]*/g, ' ');       // line comments
}

/** Count top-level (non-string, non-comment) semicolons to reject multi-statement smuggling. */
function topLevelSemicolons(noComments) {
  let n = 0, inS = false, inD = false;
  for (let i = 0; i < noComments.length; i++) {
    const c = noComments[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ';' && !inS && !inD) n++;
  }
  return n;
}

/**
 * GAP A — is the migration additive AND free of any data-access-policy (create_policy / enable_rls)
 * statement? Delegatable additive == classifier TIER-1 MINUS the policy/RLS leak. Default-deny.
 * @param {string} sql
 * @returns {{ delegatable: boolean, reason: string, matched: string[] }}
 */
export function isDelegatableAdditive(sql) {
  try {
    const verdict = classifyMigration(sql);
    if (!verdict || verdict.tier !== 1) {
      return { delegatable: false, reason: `not_tier1:${verdict && verdict.reason}`, matched: (verdict && verdict.matched) || [] };
    }
    const matched = Array.isArray(verdict.matched) ? verdict.matched : [];
    // EXACT leak surface: token-suffixed enable_rls:* + create_policy. Use some() with startsWith.
    const policyTok = matched.find((t) => t === 'create_policy' || (typeof t === 'string' && t.startsWith('enable_rls:')));
    if (policyTok) {
      return { delegatable: false, reason: `policy_or_rls_chairman_only:${policyTok}`, matched };
    }
    return { delegatable: true, reason: 'additive_no_policy_rls', matched };
  } catch (e) {
    return { delegatable: false, reason: `additive_classifier_error:${e && e.message ? e.message : e}`, matched: [] };
  }
}

/**
 * GAP B — is this a single, bounded, governed data-row INSERT into an allow-listed table?
 * CONSERVATIVE / fail-closed: single statement, no CTE (WITH), no RETURNING, no sub-SELECT from a
 * real relation (only a literal VALUES source), no forbidden/volatile token, comment + zero-width
 * normalized, table in DELEGATABLE_INSERT_TABLES. Anything else => not delegatable.
 * @param {string} sql
 * @returns {{ delegatable: boolean, reason: string, table: string|null }}
 */
export function classifyGovernedInsert(sql) {
  try {
    if (typeof sql !== 'string' || !sql.trim()) return { delegatable: false, reason: 'empty_or_non_string', table: null };
    const norm = sql.replace(ZERO_WIDTH_RE, ''); // strip zero-width BEFORE anything else
    const body = stripSqlComments(norm).trim().replace(/;+\s*$/, ''); // drop trailing semicolons
    if (!body) return { delegatable: false, reason: 'comment_or_empty_only', table: null };
    if (topLevelSemicolons(body) > 0) return { delegatable: false, reason: 'multi_statement', table: null };
    if (/^\s*with\b/i.test(body)) return { delegatable: false, reason: 'cte_not_allowed', table: null }; // CTE-smuggle (WITH x AS (DELETE..) INSERT..)
    const m = body.match(/^\s*insert\s+into\s+(?:"?([a-z_][a-z0-9_$]*)"?\.)?"?([a-z_][a-z0-9_$]*)"?/i);
    if (!m) return { delegatable: false, reason: 'not_a_top_level_insert', table: null };
    const schema = (m[1] || 'public').toLowerCase();
    const table = m[2].toLowerCase();
    if (schema !== 'public') return { delegatable: false, reason: `non_public_schema:${schema}`, table };
    if (!DELEGATABLE_INSERT_TABLES.includes(table)) return { delegatable: false, reason: `table_not_allow_listed:${table}`, table };
    // ALLOW-LIST (NOT a deny-list): only a LITERAL `VALUES` insert. A deny-list of dangerous tokens
    // leaks (pg_read_binary_file / current_setting / query_to_xml / dblink_exec read files/secrets/run
    // SQL AT APPLY TIME inside a VALUES tuple). So: no SELECT-form, no DEFAULT VALUES, and the VALUES
    // tuples must contain ONLY literals (numbers / quoted strings / NULL/TRUE/FALSE / ::type casts) —
    // NO function call (identifier '(') and NO bare special value keyword (current_user, etc.).
    // Strip string literals ONCE (with '' escapes) so quoted content — which cannot execute — never
    // trips a structural keyword check. ALL structural checks run on `sb` (the de-stringed body).
    const sb = body.replace(/'(?:[^']|'')*'/g, "''");
    if (FROM_OR_JOIN_RE.test(sb)) return { delegatable: false, reason: 'sub_select_from_relation', table };
    if (/\bselect\b/i.test(sb)) return { delegatable: false, reason: 'select_not_allowed', table }; // no INSERT...SELECT (incl. no-FROM constant SELECT)
    if (/\bdefault\s+values\b/i.test(sb)) return { delegatable: false, reason: 'default_values_not_allowed', table };
    if (INSERT_FORBIDDEN_RE.test(sb)) return { delegatable: false, reason: 'forbidden_or_volatile_token', table }; // RETURNING / DO UPDATE / DDL-mix (defense-in-depth)
    const vm = sb.match(/\bvalues\s*\(/i);
    if (!vm) return { delegatable: false, reason: 'no_values_tuple', table };
    // VALUES region = after the VALUES keyword, minus an optional ON CONFLICT ... DO NOTHING tail.
    const region = sb.slice(vm.index).replace(/^\s*values/i, '').replace(/\bon\s+conflict\b[\s\S]*$/i, '');
    if (/[a-z_][a-z0-9_$]*\s*\(/i.test(region)) return { delegatable: false, reason: 'function_call_in_values', table }; // any identifier( = function call (executes at apply time)
    const residue = region.replace(/::\s*[a-z_][a-z0-9_]*/gi, '').replace(/\b(null|true|false)\b/gi, '');
    if (/[a-z_]/i.test(residue)) return { delegatable: false, reason: 'non_literal_token_in_values', table }; // current_user / bare identifier / keyword
    return { delegatable: true, reason: 'governed_literal_insert', table };
  } catch (e) {
    return { delegatable: false, reason: `governed_insert_error:${e && e.message ? e.message : e}`, table: null };
  }
}

/**
 * THE delegated-apply scope decision. A migration is delegatable iff it is (additive-no-policy/rls)
 * OR (a single governed literal INSERT). Default-deny on anything else / any error.
 * @param {string} sql
 * @returns {{ delegatable: boolean, kind: 'additive'|'governed_insert'|null, reason: string, detail: object }}
 */
export function isDelegatableForApply(sql) {
  const add = isDelegatableAdditive(sql);
  if (add.delegatable) return { delegatable: true, kind: 'additive', reason: add.reason, detail: add };
  const ins = classifyGovernedInsert(sql);
  if (ins.delegatable) return { delegatable: true, kind: 'governed_insert', reason: ins.reason, detail: ins };
  // Not delegatable — surface both reasons for the audit row.
  return { delegatable: false, kind: null, reason: `not_delegatable (additive:${add.reason}; insert:${ins.reason})`, detail: { add, ins } };
}

/**
 * FR-4 kill-switch — delegation is OFF unless the env flag is EXACTLY 'on'. Fail-closed: unset,
 * typo, wrong case, or any non-'on' value => disabled => the chairman 3-factor gate is the only path.
 * @param {object} [env]
 * @returns {boolean}
 */
export function isDelegationEnabled(env = (typeof process !== 'undefined' ? process.env : {})) {
  try {
    return String((env && env.LEO_ADAM_DBAPPLY_DELEGATION) || '').trim() === 'on';
  } catch {
    return false;
  }
}

export const KILL_SWITCH_ENV = 'LEO_ADAM_DBAPPLY_DELEGATION';
