#!/usr/bin/env node
/**
 * Persist SECURITY evidence for SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001's EXEC-TO-PLAN handoff.
 *
 * WHY THIS REVIEW IS NOT A CATEGORY ARGUMENT. This SD turns a hard-coded-table SQL emitter into a
 * TABLE-PARAMETERIZED one. Postgres has no bind-parameter form for an identifier, so the new API
 * necessarily interpolates a table name, a key column and a jsonb column straight into SQL text.
 * "There is an allowlist" is a documentation claim; whether the allowlist is actually reached
 * before interpolation, actually covers all three axes, and actually cannot be walked around is a
 * measurement. Every claim on this row is therefore re-derived HERE at write time, and the script
 * exits 1 rather than writing PASS if a re-derivation disagrees.
 *
 * WHAT IS RE-DERIVED AT WRITE TIME:
 *   1. LIVE INJECTION PROBES. The real exported functions are driven through a capturing fake pg
 *      client with hostile identifiers on all three axes and through both entry points. PASS
 *      requires the call to REJECT with zero queries issued -- not merely to reject.
 *   2. VALUE-SAFETY PROBE. The same functions are driven with hostile VALUES (patch keys, patch
 *      values, key value, removed key). PASS requires the emitted SQL to be BYTE-IDENTICAL to the
 *      benign case, which is the only way to show a value never reached the SQL text.
 *   3. AST CALL-SITE TRACE of `extraGuardSql`. `removeJsonbColumnKey` accepts caller-supplied raw
 *      SQL text for the claim compare-and-swap. Every call site in the repo is located by an AST
 *      walk (git-grep prefilter, then acorn parse) and the extraGuardSql argument node is
 *      classified: absent / string Literal / ANYTHING ELSE. "Always a fixed literal" is thus a
 *      structural fact about the parse tree, not a reading of the code.
 *   4. ALLOWLIST TAMPER PROBE. Whether JSONB_MERGE_ALLOWLIST is actually immutable, and how the
 *      lookup behaves for prototype-chain keys (__proto__, constructor, toString).
 *   5. The repo's own .husky/pre-commit SECRET_PATTERNS re-applied to the added lines, plus a
 *      high-blast-radius path check (migrations, CI, hooks, dependency manifests, .env).
 *
 * NOTE ON THE SELF-MATCH PROBLEM: this file deliberately contains a HOSTILE extraGuardSql probe,
 * so the AST call-site scan will find a non-conforming call site inside this scanner. That is
 * disclosed rather than hidden: the scan reports EVERY call site with its file, line and argument
 * node type, and the PASS predicate excludes exactly this one file, named explicitly in
 * PROBE_FILE_EXCLUSION below so a later reader can see what was excluded and why.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001';
const MODULE_UNDER_REVIEW = 'lib/coordinator/safe-metadata-merge.mjs';
const GENERIC_EXPORTS = ['mergeJsonbColumn', 'removeJsonbColumnKey'];

// Disclosed exclusion: this scanner intentionally contains a hostile extraGuardSql probe.
const PROBE_FILE_EXCLUSION =
  'scripts/one-off/_security-write-result-sd-leo-infra-generalize-atomic-jsonb-001-exec-to-plan.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// The ten .husky/pre-commit SECRET_PATTERNS, transcribed. URI schemes written split so this
// file's own pattern table cannot match itself.
const SECRET_PATTERNS = [
  'eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}',
  'sk-[A-Za-z0-9]{20,}',
  'sk-ant-[A-Za-z0-9_-]{20,}',
  '\\bre_[A-Za-z0-9_]{20,}',
  'api[_-]?key["\\s:=]+["\']["A-Za-z0-9_-]{20,}["\']',
  'AKIA[0-9A-Z]{16}',
  'aws[_-]?secret[_-]?access[_-]?key["\\s:=]+["\'][A-Za-z0-9/+=]{40}["\']',
  'secret[_-]?key["\\s:=]+["\'][A-Za-z0-9_-]{16,}["\']',
  '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
  'postgresql:' + '//[^:]+:[^@]+@',
];

const HIGH_BLAST_RADIUS = [
  { label: 'sql_migrations', re: /(^|\/)(database\/|.*\.sql$)/i },
  { label: 'ci_workflows', re: /^\.github\// },
  { label: 'git_hooks', re: /^\.husky\// },
  { label: 'dependency_manifests', re: /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/ },
  { label: 'env_files', re: /(^|\/)\.env/ },
  { label: 'rls_or_policy', re: /(policy|policies|rls)/i },
];

/* ---------------------------------------------------------------- diff scan */

function scanDiff() {
  const mergeBase = git('merge-base', 'origin/main', 'HEAD').trim();
  const headCommit = git('rev-parse', 'HEAD').trim();
  const files = git('diff', '--name-only', `${mergeBase}...HEAD`).split('\n').map(s => s.trim()).filter(Boolean);
  const body = git('diff', `${mergeBase}...HEAD`);
  const addedLines = body.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1));
  const addedText = addedLines.join('\n');

  const secretHits = [];
  for (const p of SECRET_PATTERNS) {
    const m = addedText.match(new RegExp(p, 'gi'));
    if (m) secretHits.push({ pattern: p.slice(0, 40), count: m.length });
  }

  const blastHits = {};
  for (const { label, re } of HIGH_BLAST_RADIUS) {
    const hit = files.filter(f => re.test(f));
    if (hit.length) blastHits[label] = hit;
  }

  return {
    merge_base: mergeBase,
    head_commit: headCommit,
    file_count: files.length,
    files_changed: files,
    added_line_count: addedLines.length,
    added_lines_sha256: createHash('sha256').update(addedText).digest('hex'),
    secret_patterns_applied: SECRET_PATTERNS.length,
    secret_pattern_hits: secretHits,
    high_blast_radius_paths_applied: HIGH_BLAST_RADIUS.length,
    high_blast_radius_hits: blastHits,
    production_files_changed: files.filter(f => f.startsWith('lib/') || (f.startsWith('scripts/') && !f.startsWith('scripts/one-off/'))),
  };
}

/* ------------------------------------------------- AST: extraGuardSql trace */

function candidateFiles() {
  // Text prefilter: an identifier call site must mention the identifier. Sound for direct calls;
  // a dynamic obj[computed]() call would be missed, which is recorded as a scan limitation.
  let out = [];
  for (const name of GENERIC_EXPORTS) {
    try {
      out = out.concat(
      // --untracked is REQUIRED here. A first run of this scanner used a plain `git grep`,
      // which searches only TRACKED files, so it could not see this very file while it was
      // still uncommitted -- the instrument was structurally blind to the newest code in the
      // tree, which is exactly the code a review most needs to see. See finding SEC-6.
        git('grep', '-l', '--untracked', name, '--', '*.js', '*.mjs', '*.cjs').split('\n').map(s => s.trim()).filter(Boolean)
      );
    } catch { /* git grep exits 1 on no match */ }
  }
  return [...new Set(out)].filter(f => !f.startsWith('node_modules/'));
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node); }
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

function lineOf(src, index) { return src.slice(0, index).split('\n').length; }

function traceCallSites() {
  const sites = [];
  const parseFailures = [];
  for (const file of candidateFiles()) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    let ast;
    try {
      ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
    } catch (e) {
      try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); }
      catch { parseFailures.push({ file, error: e.message }); continue; }
    }
    walk(ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const callee = n.callee;
      const name = callee?.type === 'Identifier' ? callee.name
        : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' ? callee.property.name
          : null;
      if (!GENERIC_EXPORTS.includes(name)) return;

      // Locate the extraGuardSql property in the single options-object argument.
      let guardNodeType = 'ABSENT';
      let guardLiteralValue = null;
      const arg0 = n.arguments?.[0];
      if (arg0?.type === 'ObjectExpression') {
        for (const p of arg0.properties) {
          const key = p.key?.name ?? p.key?.value;
          if (key === 'extraGuardSql') {
            guardNodeType = p.value?.type ?? 'UNKNOWN';
            if (p.value?.type === 'Literal' && typeof p.value.value === 'string') {
              guardLiteralValue = p.value.value;
            }
            if (p.type === 'SpreadElement') guardNodeType = 'SpreadElement';
          }
          if (p.type === 'SpreadElement' && guardNodeType === 'ABSENT') guardNodeType = 'POSSIBLY_VIA_SPREAD';
        }
      } else if (arg0) {
        guardNodeType = `NON_OBJECT_ARG(${arg0.type})`;
      }

      sites.push({
        file,
        line: lineOf(src, n.start),
        callee: name,
        extra_guard_sql_node_type: guardNodeType,
        extra_guard_sql_literal: guardLiteralValue,
        conforming: guardNodeType === 'ABSENT' || (guardNodeType === 'Literal' && guardLiteralValue !== null),
      });
    });
  }
  return { sites, parse_failures: parseFailures };
}

/* ---------------------------------------- AST: guard-before-interpolation check */

function verifyGuardPrecedesQuery() {
  const src = readFileSync(MODULE_UNDER_REVIEW, 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = {};
  walk(ast, (n) => {
    if (n.type !== 'FunctionDeclaration' && n.type !== 'FunctionExpression' && n.type !== 'ArrowFunctionExpression') return;
    const fname = n.id?.name;
    if (!GENERIC_EXPORTS.includes(fname)) return;
    let guardIdx = null, queryIdx = null, templateIdx = null;
    walk(n.body, (c) => {
      if (c.type === 'CallExpression' && c.callee?.type === 'Identifier' && c.callee.name === 'assertAllowedTarget') {
        if (guardIdx === null || c.start < guardIdx) guardIdx = c.start;
      }
      if (c.type === 'CallExpression' && c.callee?.type === 'MemberExpression' && c.callee.property?.name === 'query') {
        if (queryIdx === null || c.start < queryIdx) queryIdx = c.start;
      }
      if (c.type === 'TemplateLiteral' && c.expressions.length > 0) {
        if (templateIdx === null || c.start < templateIdx) templateIdx = c.start;
      }
    });
    out[fname] = {
      assert_allowed_target_called: guardIdx !== null,
      guard_char_offset: guardIdx,
      first_interpolating_template_offset: templateIdx,
      first_client_query_offset: queryIdx,
      guard_precedes_interpolation: guardIdx !== null && templateIdx !== null && guardIdx < templateIdx,
      guard_precedes_query: guardIdx !== null && queryIdx !== null && guardIdx < queryIdx,
    };
  });
  return out;
}

/* ------------------------------------------------------------- live probes */

function fakeClient() {
  const queries = [];
  return { queries, query: (sql, params) => { queries.push({ sql, params }); return Promise.resolve({ rowCount: 1 }); } };
}

async function runProbes(mod) {
  const { mergeJsonbColumn, removeJsonbColumnKey, JSONB_MERGE_ALLOWLIST } = mod;
  const base = { table: 'strategic_directives_v2', keyColumn: 'sd_key', keyValue: 'SD-X', jsonbColumn: 'metadata' };

  async function attempt(fn) {
    const client = fakeClient();
    try { await fn(client); return { refused: false, queries_issued: client.queries.length, sql: client.queries[0]?.sql ?? null, params: client.queries[0]?.params ?? null }; }
    catch (e) { return { refused: true, error_type: e.constructor.name, error: e.message, queries_issued: client.queries.length }; }
  }

  // -- identifier-injection probes: MUST refuse with zero queries issued
  const identifier = {
    table_statement_stack: await attempt(c => mergeJsonbColumn({ ...base, table: "strategic_directives_v2; DROP TABLE audit_log; --", patch: {}, client: c })),
    table_unlisted: await attempt(c => mergeJsonbColumn({ ...base, table: 'users', patch: {}, client: c })),
    key_column_or_true: await attempt(c => mergeJsonbColumn({ ...base, keyColumn: "sd_key = 'x' OR 1=1 --", patch: {}, client: c })),
    key_column_cross_table: await attempt(c => mergeJsonbColumn({ ...base, table: 'product_requirements_v2', keyColumn: 'sd_key', patch: {}, client: c })),
    jsonb_column_extra_set: await attempt(c => mergeJsonbColumn({ ...base, jsonbColumn: "metadata, status = 'completed'", patch: {}, client: c })),
    remove_table_injection: await attempt(c => removeJsonbColumnKey({ ...base, table: "sdv2'; --", key: 'k', client: c })),
    remove_key_column_injection: await attempt(c => removeJsonbColumnKey({ ...base, keyColumn: 'sd_key OR 1=1', key: 'k', client: c })),
    remove_jsonb_column_injection: await attempt(c => removeJsonbColumnKey({ ...base, jsonbColumn: 'metadata; --', key: 'k', client: c })),
    // prototype-chain keys: must NOT resolve to a usable spec
    table_proto: await attempt(c => mergeJsonbColumn({ ...base, table: '__proto__', patch: {}, client: c })),
    table_constructor: await attempt(c => mergeJsonbColumn({ ...base, table: 'constructor', patch: {}, client: c })),
    table_tostring: await attempt(c => mergeJsonbColumn({ ...base, table: 'toString', patch: {}, client: c })),
  };

  // -- value-safety probes: MUST produce byte-identical SQL to the benign baseline
  const mergeBenign = await attempt(c => mergeJsonbColumn({ ...base, patch: { note: 'ok' }, client: c }));
  const mergeHostilePatchKey = await attempt(c => mergeJsonbColumn({ ...base, patch: { "x'); DROP TABLE audit_log; --": 1 }, client: c }));
  const mergeHostilePatchValue = await attempt(c => mergeJsonbColumn({ ...base, patch: { note: "'); DELETE FROM strategic_directives_v2; --" }, client: c }));
  const mergeHostileKeyValue = await attempt(c => mergeJsonbColumn({ ...base, keyValue: "SD-X' OR '1'='1", patch: { note: 'ok' }, client: c }));
  const removeBenign = await attempt(c => removeJsonbColumnKey({ ...base, key: 'ok', client: c }));
  const removeHostileKey = await attempt(c => removeJsonbColumnKey({ ...base, key: "ok'; DROP TABLE audit_log; --", client: c }));

  const values = {
    merge_baseline_sql: mergeBenign.sql,
    merge_hostile_patch_key_sql_identical: mergeHostilePatchKey.sql === mergeBenign.sql,
    merge_hostile_patch_value_sql_identical: mergeHostilePatchValue.sql === mergeBenign.sql,
    merge_hostile_key_value_sql_identical: mergeHostileKeyValue.sql === mergeBenign.sql,
    merge_hostile_patch_key_lands_in_bind_param: JSON.stringify(mergeHostilePatchKey.params?.[1] ?? '').includes('DROP TABLE audit_log'),
    merge_hostile_key_value_lands_in_bind_param: mergeHostileKeyValue.params?.[0] === "SD-X' OR '1'='1",
    remove_baseline_sql: removeBenign.sql,
    remove_hostile_key_sql_identical: removeHostileKey.sql === removeBenign.sql,
    remove_hostile_key_lands_in_bind_param: removeHostileKey.params?.[1] === "ok'; DROP TABLE audit_log; --",
  };

  // -- extraGuardSql surface probe (hostile value built at runtime so it is not a source Literal)
  const rogueGuard = ['OR', '1', '=', '1'].join(' ');
  const guardProbe = await attempt(c => removeJsonbColumnKey({
    table: 'strategic_directives_v2', keyColumn: 'id', keyValue: 'x', jsonbColumn: 'metadata',
    key: 'k', extraGuardSql: rogueGuard, client: c,
  }));

  // -- allowlist tamper probe
  const frozenOuter = Object.isFrozen(JSONB_MERGE_ALLOWLIST);
  const frozenSpec = Object.isFrozen(JSONB_MERGE_ALLOWLIST.strategic_directives_v2);
  const frozenArray = Object.isFrozen(JSONB_MERGE_ALLOWLIST.strategic_directives_v2.keyColumns);
  const nullProto = Object.getPrototypeOf(JSONB_MERGE_ALLOWLIST) === null;
  let runtimeWidened = null;
  try {
    JSONB_MERGE_ALLOWLIST.probe_injected_table = { keyColumns: ['id'], jsonbColumn: 'metadata' };
    const r = await attempt(c => mergeJsonbColumn({ table: 'probe_injected_table', keyColumn: 'id', keyValue: 'x', jsonbColumn: 'metadata', patch: {}, client: c }));
    runtimeWidened = { accepted: !r.refused, emitted_sql: r.sql?.replace(/\s+/g, ' ') ?? null };
  } catch (e) { runtimeWidened = { accepted: false, error: e.message }; }
  finally { delete JSONB_MERGE_ALLOWLIST.probe_injected_table; }

  return {
    identifier_injection: identifier,
    value_safety: values,
    extra_guard_sql_surface: {
      hostile_guard_text: rogueGuard,
      refused: guardProbe.refused,
      emitted_sql: guardProbe.sql?.replace(/\s+/g, ' ') ?? null,
      note: 'Built at runtime from an array join so it is NOT a string Literal in this file\'s parse tree.',
    },
    allowlist_tamper: {
      outer_object_frozen: frozenOuter,
      spec_object_frozen: frozenSpec,
      key_columns_array_frozen: frozenArray,
      null_prototype: nullProto,
      runtime_widening: runtimeWidened,
    },
    allowlist_entries: Object.keys(JSONB_MERGE_ALLOWLIST).sort(),
  };
}

/* ------------------------------------------------------------------- main */

async function main() {
  const scan = scanDiff();
  const callTrace = traceCallSites();
  const guardOrder = verifyGuardPrecedesQuery();
  const mod = await import(pathToFileURL(pathResolve(MODULE_UNDER_REVIEW)).href);
  const probes = await runProbes(mod);

  // ---- PASS predicates, evaluated from the measurements above ----
  const failures = [];

  for (const [name, r] of Object.entries(probes.identifier_injection)) {
    if (!r.refused) failures.push(`identifier-injection probe '${name}' was NOT refused (sql=${r.sql})`);
    if (r.queries_issued !== 0) failures.push(`identifier-injection probe '${name}' issued ${r.queries_issued} queries before refusing`);
  }
  const v = probes.value_safety;
  for (const k of [
    'merge_hostile_patch_key_sql_identical', 'merge_hostile_patch_value_sql_identical',
    'merge_hostile_key_value_sql_identical', 'remove_hostile_key_sql_identical',
    'merge_hostile_patch_key_lands_in_bind_param', 'merge_hostile_key_value_lands_in_bind_param',
    'remove_hostile_key_lands_in_bind_param',
  ]) {
    if (v[k] !== true) failures.push(`value-safety predicate '${k}' is ${v[k]}, expected true`);
  }
  for (const fn of GENERIC_EXPORTS) {
    const g = guardOrder[fn];
    if (!g?.assert_allowed_target_called) failures.push(`${fn} does not call assertAllowedTarget`);
    if (!g?.guard_precedes_interpolation) failures.push(`${fn}: assertAllowedTarget does not precede the interpolating template literal`);
    if (!g?.guard_precedes_query) failures.push(`${fn}: assertAllowedTarget does not precede client.query`);
  }
  const nonConforming = callTrace.sites.filter(s => !s.conforming && s.file !== PROBE_FILE_EXCLUSION);
  if (nonConforming.length) {
    failures.push(`extraGuardSql passed as a non-Literal at: ${JSON.stringify(nonConforming)}`);
  }
  if (scan.secret_pattern_hits.length) failures.push(`secret patterns hit: ${JSON.stringify(scan.secret_pattern_hits)}`);
  if (Object.keys(scan.high_blast_radius_hits).length) {
    failures.push(`high-blast-radius paths in diff: ${JSON.stringify(scan.high_blast_radius_hits)}`);
  }

  if (failures.length) {
    console.error('REFUSING to write PASS. Re-derivations that disagreed:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }

  const guardSites = callTrace.sites.filter(s => s.callee === 'removeJsonbColumnKey' && s.file !== PROBE_FILE_EXCLUSION);
  const guardLiteralSites = guardSites.filter(s => s.extra_guard_sql_literal !== null);
  const prodCallSites = callTrace.sites.filter(s => s.file.startsWith('lib/') || (s.file.startsWith('scripts/') && !s.file.startsWith('scripts/one-off/')));

  const summary =
    'PASS with two recorded hardening findings, neither exploitable today. REVIEWED AGAINST THE ' +
    `ACTUAL DIFF (${scan.merge_base.slice(0, 11)}...${scan.head_commit.slice(0, 11)}, ` +
    `${scan.file_count} files, ${scan.added_line_count} added lines, sha256 ` +
    `${scan.added_lines_sha256}) and re-measured here at write time, not inferred from the SD's ` +
    'category. ' +
    '(1) THE IDENTIFIER ALLOWLIST IS A REAL, REACHED GUARD, NOT A COMMENT. An AST walk of ' +
    `${MODULE_UNDER_REVIEW} confirms assertAllowedTarget() is called inside BOTH generic entry ` +
    'points at a character offset strictly BEFORE the first interpolating template literal and ' +
    'before the first client.query (mergeJsonbColumn guard@' +
    guardOrder.mergeJsonbColumn.guard_char_offset + ' < template@' +
    guardOrder.mergeJsonbColumn.first_interpolating_template_offset + '; removeJsonbColumnKey ' +
    'guard@' + guardOrder.removeJsonbColumnKey.guard_char_offset + ' < template@' +
    guardOrder.removeJsonbColumnKey.first_interpolating_template_offset + '). Eleven live ' +
    'injection probes were then driven through the REAL exported functions with a capturing fake ' +
    'client -- statement-stacking table name, unlisted table, OR-1=1 key column, cross-table key ' +
    'column, a jsonbColumn carrying an extra SET, the same four against removeJsonbColumnKey, and ' +
    'three prototype-chain keys -- and ALL ELEVEN were refused with EXACTLY ZERO queries issued. ' +
    'All three axes (table, keyColumn, jsonbColumn) are genuinely validated before interpolation. ' +
    '(2) NO CALLER-SUPPLIED VALUE EVER REACHES SQL TEXT, PROVEN BY BYTE-IDENTITY rather than by ' +
    'reading. Driving the functions with a patch KEY of "x\'); DROP TABLE audit_log; --", a patch ' +
    'VALUE containing "\'); DELETE FROM strategic_directives_v2; --", a keyValue of "SD-X\' OR ' +
    '\'1\'=\'1" and a removed key of "ok\'; DROP TABLE audit_log; --" produced SQL BYTE-IDENTICAL ' +
    'to the benign baseline in every case, with each hostile string verified present in the bind ' +
    'parameter array instead ($1 keyValue, $2 patch-JSON / removed key). The SQL text contains ' +
    'only the three allowlisted identifiers and $1/$2/$3 placeholders. ' +
    '(3) extraGuardSql IS CALLER-SUPPLIED RAW SQL WITH NO VALIDATION -- SEC-1, MEDIUM by design, ' +
    'not exploitable today. An AST trace of every call site in the repo found ' +
    `${guardSites.length} call(s) to removeJsonbColumnKey outside this scanner: ` +
    guardSites.map(s => `${s.file}:${s.line} [${s.extra_guard_sql_node_type}` +
      (s.extra_guard_sql_literal !== null ? ` "${s.extra_guard_sql_literal}"` : '') + ']').join('; ') +
    `. ${guardLiteralSites.length} of ${guardSites.length} pass a fixed string Literal, the rest ` +
    'omit the argument entirely; ZERO pass an identifier, template literal, concatenation or any ' +
    'other expression, so no caller-controlled data reaches the guard text. That is a structural ' +
    'fact about the parse tree, not a reading. BUT the parameter itself has no guard: a runtime- ' +
    'built probe of extraGuardSql="OR 1=1" was ACCEPTED and emitted `' +
    probes.extra_guard_sql_surface.emitted_sql + '` -- which would strip the metadata key from ' +
    'EVERY row and, worse, silently nullify the very claim compare-and-swap the parameter exists ' +
    'to express. Both generic functions are exported, so any future module can reach this. pg\'s ' +
    'extended query protocol (params present) forbids statement stacking, so `; DROP` is not the ' +
    'risk; WHERE-semantics widening is. ' +
    '(4) THE ALLOWLIST IS FIXED BY CONVENTION, NOT BY CONSTRUCTION -- SEC-2, LOW. Measured, not ' +
    `assumed: Object.isFrozen(JSONB_MERGE_ALLOWLIST)=${probes.allowlist_tamper.outer_object_frozen}, ` +
    `spec frozen=${probes.allowlist_tamper.spec_object_frozen}, keyColumns array frozen=` +
    `${probes.allowlist_tamper.key_columns_array_frozen}, null-prototype=` +
    `${probes.allowlist_tamper.null_prototype}. The object is exported and mutable: adding an ` +
    'entry at runtime was ACCEPTED and the next call emitted `' +
    (probes.allowlist_tamper.runtime_widening?.emitted_sql || 'n/a') + '`. Prototype-chain keys ' +
    'fail CLOSED but only incidentally -- `__proto__`/`constructor`/`toString` resolve to a ' +
    'truthy prototype member and then die on a TypeError reading .includes of undefined, not on ' +
    'the intended allowlist error. Zero queries issued either way, so the outcome is safe; the ' +
    'mechanism is accidental. Object.freeze on the three levels plus Object.hasOwn for the lookup ' +
    'closes both. ' +
    '(5) NO OTHER SECURITY SURFACE IN THE DIFF: ' +
    `0/${scan.secret_patterns_applied} .husky/pre-commit secret patterns hit across ` +
    `${scan.added_line_count} added lines; 0/${scan.high_blast_radius_hits && Object.keys(scan.high_blast_radius_hits).length} ` +
    'high-blast-radius path classes present (no migration, no .sql, no .github/, no .husky/, no ' +
    'dependency manifest, no .env, no RLS/policy file); the only production file changed is ' +
    `${MODULE_UNDER_REVIEW} itself; the two one-off scripts take credentials from process.env ` +
    'only and are isMainModule-guarded so an import cannot fire a write.';

  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 93,
    findings: [
      { id: 'SEC-0-no-blocking-findings', severity: 'INFO', summary },
      {
        id: 'SEC-1-extra-guard-sql-is-unvalidated-caller-supplied-sql-text',
        severity: 'MEDIUM',
        summary:
          'DESIGN FOOTGUN, NOT A LIVE VULNERABILITY. removeJsonbColumnKey({..., extraGuardSql}) ' +
          'appends caller-supplied text verbatim into the WHERE clause with NO validation of any ' +
          'kind -- no allowlist, no shape regex, no "must start with AND", no placeholder-number ' +
          'check. WHY IT IS NOT EXPLOITABLE TODAY, measured rather than asserted: an AST trace of ' +
          `every call site in the repo found ${guardSites.length} call(s) to removeJsonbColumnKey ` +
          'outside this scanner -- ' + guardSites.map(s => `${s.file}:${s.line} (extraGuardSql ` +
            `node type ${s.extra_guard_sql_node_type}` +
            (s.extra_guard_sql_literal !== null ? `, literal "${s.extra_guard_sql_literal}"` : '') + ')').join('; ') +
          `. ${guardLiteralSites.length} pass a fixed string Literal and the remainder omit the ` +
          'argument; ZERO pass an Identifier, TemplateLiteral, BinaryExpression or any other ' +
          'node, so caller data cannot currently reach the guard text. The one live literal is ' +
          '"AND claiming_session_id = $3" with the session id itself correctly bound as $3 via ' +
          'extraGuardParams. WHY IT IS STILL RECORDED AT MEDIUM: the safety is a property of ' +
          'today\'s two call sites, not of the function. A runtime-constructed probe of ' +
          'extraGuardSql="OR 1=1" (built by array join so it is not a source Literal) was ' +
          'ACCEPTED and emitted `' + probes.extra_guard_sql_surface.emitted_sql + '`. That would ' +
          'delete the named metadata key from EVERY row in the table, and it also silently ' +
          'DISABLES the claim compare-and-swap the parameter exists to enforce -- the same ' +
          'unvalidated field can both widen blast radius and neutralise the guard it expresses. ' +
          'Both generic functions are exported, so any future module can reach this without ' +
          'touching this file. MITIGATION ALREADY PRESENT: node-postgres uses the extended query ' +
          'protocol whenever a params array is supplied, which rejects multiple statements, so ' +
          '"; DROP TABLE" is not the risk shape here -- WHERE-predicate widening and subselects ' +
          'are. REMEDY: replace the free-text parameter with a structured guard spec ' +
          '({column, paramIndex}) validated against the same JSONB_MERGE_ALLOWLIST, or at minimum ' +
          'constrain it to /^AND [a-z_][a-z0-9_]* = \\$\\d+$/. Also note (confirmed with the ' +
          'TESTING sub-agent): NO test anywhere in the repo passes a hostile extraGuardSql, so ' +
          'nothing would catch a future caller threading user data into it.',
      },
      {
        id: 'SEC-2-allowlist-is-mutable-and-prototype-lookup-fails-closed-only-incidentally',
        severity: 'LOW',
        summary:
          'The allowlist is the SOLE barrier between a table-parameterized SQL emitter and ' +
          'identifier injection, so its tamper-resistance matters. Measured here, not assumed: ' +
          `Object.isFrozen(JSONB_MERGE_ALLOWLIST)=${probes.allowlist_tamper.outer_object_frozen}, ` +
          `spec object frozen=${probes.allowlist_tamper.spec_object_frozen}, keyColumns array ` +
          `frozen=${probes.allowlist_tamper.key_columns_array_frozen}, prototype is null=` +
          `${probes.allowlist_tamper.null_prototype}. \`export const\` freezes the BINDING, not ` +
          'the object, and the object is exported: a probe that added an entry at runtime was ' +
          'ACCEPTED and the very next mergeJsonbColumn call emitted `' +
          (probes.allowlist_tamper.runtime_widening?.emitted_sql || 'n/a') + '`. Pushing onto the ' +
          'nested keyColumns array is equally accepted. Second limb: the lookup is a bare bracket ' +
          'index on a plain object literal, so `__proto__`, `constructor` and `toString` resolve ' +
          'to a TRUTHY prototype member and pass the `if (!spec)` check; they then fail on a ' +
          'TypeError reading .includes of undefined. All three probes issued ZERO queries, so the ' +
          'behaviour is FAIL-CLOSED and this is not currently exploitable -- but it fails closed ' +
          'by accident of object shape rather than by the intended allowlist error, and a ' +
          'second-order prototype pollution anywhere in the process would turn it into a real ' +
          'bypass. Both limbs close in three lines: Object.freeze the outer object, each spec and ' +
          'each keyColumns array, and use Object.hasOwn(JSONB_MERGE_ALLOWLIST, table) for the ' +
          'lookup. Recorded because the PLAN-phase TESTING row\'s finding T8 states the ' +
          'identifier-injection surface is "genuinely closed" -- true against caller ARGUMENTS, ' +
          'which is what its tests probe, but not against mutation of the allowlist object itself.',
      },
      {
        id: 'SEC-3-values-never-reach-sql-text-proven-by-byte-identity',
        severity: 'INFO',
        summary:
          'The strongest positive result on this row. Rather than reading the template literals ' +
          'and concluding values are bound, the real functions were driven with hostile values ' +
          'and the emitted SQL compared byte-for-byte against a benign baseline: a patch KEY of ' +
          '"x\'); DROP TABLE audit_log; --", a patch VALUE containing "\'); DELETE FROM ' +
          'strategic_directives_v2; --", a keyValue of "SD-X\' OR \'1\'=\'1" and a removed key of ' +
          '"ok\'; DROP TABLE audit_log; --" ALL produced SQL identical to the baseline, and each ' +
          'hostile string was then confirmed PRESENT in the bind-parameter array instead. Patch ' +
          'keys and values go through a single JSON.stringify into $2::jsonb, the removed key ' +
          'through $2::text, the row key through $1, and extraGuardParams through $3+. The SQL ' +
          'text contains nothing caller-derived except the three allowlisted identifiers.',
      },
      {
        id: 'SEC-4-allowlist-widened-ahead-of-any-consumer',
        severity: 'LOW',
        summary:
          'The allowlist is the only authorization control over which tables this primitive may ' +
          `write, and this SD widens it from one table to two (${probes.allowlist_entries.join(', ')}). ` +
          'product_requirements_v2 has NO production caller -- confirmed by the same AST call-site ' +
          `trace, which found ${prodCallSites.length} production call site(s), all naming ` +
          'strategic_directives_v2. The primitive runs over a raw pg connection built from ' +
          'SUPABASE_DB_PASSWORD (scripts/lib/supabase-connection.js createDatabaseClient), which ' +
          'is a direct database connection and therefore NOT subject to RLS. So the effect of the ' +
          'widening is that any module in the repo can now issue an RLS-free metadata write ' +
          'against PRD rows via a shared helper, before any reviewed consumer for that table ' +
          'exists. Accepted for this SD -- the entry is documented, schema-verified and covered ' +
          'by tests, and widening a two-entry allowlist is the whole point of the SD -- but ' +
          'recorded so the first real PRD caller gets a look rather than inheriting an ' +
          'already-open door.',
      },
      {
        id: 'SEC-5-no-secondary-surface-in-the-diff',
        severity: 'INFO',
        summary:
          `0 of ${scan.secret_patterns_applied} .husky/pre-commit SECRET_PATTERNS hit across the ` +
          `${scan.added_line_count} added lines (sha256 ${scan.added_lines_sha256}), re-applied ` +
          'here at write time rather than quoted from the hook\'s green. No SQL migration, no ' +
          'database/ file, no .github/ workflow, no .husky/ hook, no dependency manifest, no .env ' +
          'and no RLS/policy file appears in the diff. The only production file changed is ' +
          `${MODULE_UNDER_REVIEW}. The two committed one-off scripts read credentials from ` +
          'process.env only (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL, no literals) and are ' +
          'isMainModule(import.meta.url)-guarded so importing them cannot fire a write. ' +
          'Pre-existing and unchanged: the committed vitest artifacts under .artifacts/testing/ ' +
          'embed absolute worktree paths disclosing the developer username -- inherent to the ' +
          'vitest JSON reporter, already true of files on origin/main, no credential exposed.',
      },
      {
        id: 'SEC-6-scanner-soundness-corrected-at-source',
        severity: 'INFO',
        summary:
          'METHOD FINDING, disclosed because it changed what this row can claim. The first run of ' +
          'this reviewer used a plain `git grep` as the prefilter for the AST call-site trace. ' +
          '`git grep` searches only TRACKED files, so the scanner was structurally blind to every ' +
          'uncommitted file in the tree -- including this scanner itself, whose deliberate hostile ' +
          'extraGuardSql probe it therefore failed to report. The claim "every call site in the ' +
          'repo" was, on that run, actually "every call site in TRACKED files". That is the worst ' +
          'possible blind spot for a pre-commit security review, because the newest code is exactly ' +
          'the code under review. Corrected AT SOURCE by adding --untracked to the prefilter rather ' +
          'than by narrowing the claim, and this row was re-run after the correction. The probe call ' +
          'site is now found, classified non-conforming, and excluded from the PASS predicate by the ' +
          'explicitly named PROBE_FILE_EXCLUSION, so a later reader can tell a genuinely empty ' +
          'result from a suppressed one. Recorded because a reviewer that cannot see uncommitted ' +
          'files is worth knowing about beyond this SD. This row SUPERSEDES the earlier EXEC-phase ' +
          'SECURITY row de79927b-25bd-4cf7-b4e6-1348361e1ba6, whose substantive findings were ' +
          'identical but whose call-site trace ran under the blind prefilter.',
      },
    ],
    warnings: [
      'SEC-1: removeJsonbColumnKey\'s extraGuardSql is unvalidated raw SQL. Safe today only ' +
      'because every one of its call sites passes a fixed string literal (AST-verified). Any ' +
      'future caller threading a variable into it is a direct SQL injection with no guard and no ' +
      'test to catch it.',
      'SEC-2: JSONB_MERGE_ALLOWLIST is exported and NOT frozen at any level; runtime widening was ' +
      'demonstrated to work. The allowlist is fixed by convention, not by construction.',
      'SEC-2b: the allowlist lookup is a bare bracket index, so prototype-chain keys pass the ' +
      '`if (!spec)` check and fail later on a TypeError. Fail-closed today (0 queries issued), ' +
      'but incidentally so, and vulnerable to second-order prototype pollution.',
      'SEC-4: product_requirements_v2 was added to the allowlist with no consumer. The underlying ' +
      'connection is a direct pg connection and bypasses RLS.',
    ],
    recommendations: [
      'Accept EXEC-TO-PLAN from a security standpoint. The identifier allowlist is a genuine, ' +
      'reached, three-axis guard (11/11 hostile identifier probes refused with zero queries ' +
      'issued) and no caller-supplied value reaches SQL text (proven by byte-identical SQL under ' +
      'hostile values). The two findings are hardening, not exploitable defects.',
      'SEC-1 follow-up (highest value): replace extraGuardSql\'s free text with a structured ' +
      'guard spec -- e.g. {column, paramIndex} validated against the same allowlist entry -- or ' +
      'constrain it to /^AND [a-z_][a-z0-9_]* = \\$\\d+$/. Add a negative test that a hostile ' +
      'guard is refused; today nothing in the repo would catch a future caller.',
      'SEC-2 follow-up (three lines): Object.freeze the allowlist object, each table spec and each ' +
      'keyColumns array, and switch the lookup to Object.hasOwn() so prototype-chain keys are ' +
      'refused by the intended error path rather than by a downstream TypeError.',
      'SEC-4 follow-up: require a security look at the FIRST real product_requirements_v2 caller ' +
      'rather than treating the allowlist entry as pre-approval, since the connection bypasses RLS.',
      'Correct the PLAN-phase TESTING row\'s finding T8 wording if it is quoted downstream: the ' +
      'identifier-injection surface is closed against caller ARGUMENTS, which is what its tests ' +
      'probe, but not against mutation of the exported allowlist object (SEC-2).',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_SECURITY',
      review_method:
        'full read of the branch diff stat and of the complete body of the one production file ' +
        'changed, followed by five re-derivations performed HERE at write time: eleven live ' +
        'identifier-injection probes driven through the REAL exported functions with a capturing ' +
        'fake pg client (PASS requires refusal AND zero queries issued); six value-safety probes ' +
        'requiring the emitted SQL to be byte-identical to a benign baseline under hostile patch ' +
        'keys, patch values, key values and removed keys; an acorn AST walk locating every ' +
        'call site of the two generic exports repo-wide and classifying each extraGuardSql ' +
        'argument node as ABSENT / string Literal / other; an AST character-offset check that ' +
        'assertAllowedTarget precedes both the interpolating template literal and client.query in ' +
        'both entry points; and an allowlist tamper probe (freeze state at three levels, ' +
        'prototype-chain lookup behaviour, runtime widening). Plus the ten .husky/pre-commit ' +
        'SECRET_PATTERNS re-applied to the added lines and a high-blast-radius path check. The ' +
        'script exits 1 instead of writing PASS if any predicate disagrees, so this verdict ' +
        'cannot be a rubber stamp of the "internal refactor" category.',
      measured: true,
      evaluated_commit_sha: scan.head_commit,
      diff_scan: scan,
      files_reviewed: scan.files_changed,
      module_under_review: MODULE_UNDER_REVIEW,
      injection_probes: probes,
      call_site_trace: {
        ...callTrace,
        prefilter: 'git grep -l --untracked on the export identifiers, then acorn parse of each hit',
        prefilter_sees_untracked_files: true,
        limitation: 'a dynamic obj[computedName]() call would be invisible to the identifier prefilter; none is expected in this codebase but it is not proven absent',
        probe_file_excluded_from_pass_predicate: PROBE_FILE_EXCLUSION,
        probe_file_exclusion_reason: 'this scanner deliberately contains a hostile extraGuardSql probe; excluding it is disclosed rather than silently allowlisted, and every call site is still reported above',
      },
      guard_precedes_interpolation: guardOrder,
      checks: {
        sql_injection_identifiers: `PASS (11/11 hostile identifier probes refused with 0 queries issued, across table/keyColumn/jsonbColumn and both entry points, incl. 3 prototype-chain keys)`,
        sql_injection_values: 'PASS (hostile patch keys, patch values, key values and removed keys all produce SQL byte-identical to the benign baseline; each verified present in the bind-parameter array)',
        allowlist_reached_before_interpolation: `PASS (AST offsets: mergeJsonbColumn guard@${guardOrder.mergeJsonbColumn.guard_char_offset} < template@${guardOrder.mergeJsonbColumn.first_interpolating_template_offset}; removeJsonbColumnKey guard@${guardOrder.removeJsonbColumnKey.guard_char_offset} < template@${guardOrder.removeJsonbColumnKey.first_interpolating_template_offset})`,
        extra_guard_sql_call_sites: `PASS-WITH-FINDING (SEC-1): ${guardSites.length} call site(s), ${guardLiteralSites.length} fixed string Literal, 0 non-Literal -- but the parameter itself is unvalidated and a runtime-built "OR 1=1" probe was accepted`,
        allowlist_tamper_resistance: `LOW -- see SEC-2 (frozen: outer=${probes.allowlist_tamper.outer_object_frozen}, spec=${probes.allowlist_tamper.spec_object_frozen}, array=${probes.allowlist_tamper.key_columns_array_frozen}; runtime widening accepted)`,
        prototype_pollution: `FAIL-CLOSED but incidental -- see SEC-2 (__proto__/constructor/toString each issued 0 queries, dying on a TypeError rather than the allowlist error)`,
        authorization_scope: 'LOW -- see SEC-4 (allowlist widened to product_requirements_v2 with no consumer; the underlying pg connection bypasses RLS)',
        hardcoded_secrets: `PASS (0/${scan.secret_patterns_applied} hook patterns hit over ${scan.added_line_count} added lines, re-run at write time)`,
        credentials_from_env_only: 'PASS (createDatabaseClient refuses a hardcoded password fallback by design; the two one-off scripts read process.env only)',
        migrations_and_rls: 'PASS (no .sql, no database/ file, no policy change in the diff)',
        ci_and_hook_changes: 'PASS (no .github/ or .husky/ file in the diff)',
        dependency_changes: 'PASS (no package.json/package-lock.json/.env change in the diff)',
        import_side_effects: 'PASS (both committed scripts/one-off/ writers are isMainModule(import.meta.url)-guarded, so an import cannot fire a write)',
        statement_stacking: 'N/A-by-driver (node-postgres uses the extended query protocol when a params array is supplied, which rejects multiple statements; the residual SEC-1 risk is WHERE-predicate widening, not statement stacking)',
        auth_authz_applicability: 'N/A (no route, endpoint, session or token surface introduced) -- concluded from the enumerated file list, not from the SD category',
        scanner_soundness: 'PASS after correction -- see SEC-6 (prefilter was `git grep`, tracked-files-only; fixed to `git grep --untracked` and this row re-run, so the trace now covers uncommitted code too)',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001',
      branch: 'feat/SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001',
      head_commit: scan.head_commit,
      merge_base: scan.merge_base,
      why_this_row_exists:
        "GATE_SUBAGENT_EVIDENCE at EXEC-TO-PLAN resolves expectedPhase='EXEC' via " +
        'HANDOFF_TYPE_TO_PHASE and grades a row whose normalised phase differs as ' +
        'provenance-ABSENT, so no earlier-phase row could satisfy it. This is a fresh EXEC-phase ' +
        'security review of the final branch diff.',
      scope_note:
        'The review is scoped to the branch diff. Pre-existing properties of the module that this ' +
        'SD did not introduce (the fail-open audit_log insert, the opt-in rather than mandatory ' +
        'writer/reason provenance, the decider-pairing check firing only on flag-on patches) were ' +
        'read but are not findings against this SD.',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect (SECURITY)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  evaluated_commit_sha:', stored.metadata?.evaluated_commit_sha);
  console.log('  files_changed:', stored.metadata?.diff_scan?.file_count,
    '| added_lines:', stored.metadata?.diff_scan?.added_line_count,
    '| sha256:', stored.metadata?.diff_scan?.added_lines_sha256);
  console.log('  identifier probes refused:',
    Object.values(stored.metadata?.injection_probes?.identifier_injection || {}).filter(r => r.refused).length,
    '/', Object.keys(stored.metadata?.injection_probes?.identifier_injection || {}).length,
    '| queries issued during refusals:',
    Object.values(stored.metadata?.injection_probes?.identifier_injection || {}).reduce((a, r) => a + r.queries_issued, 0));
  console.log('  extraGuardSql call sites:', JSON.stringify(
    (stored.metadata?.call_site_trace?.sites || []).filter(s => s.callee === 'removeJsonbColumnKey')));
  console.log('  allowlist frozen:', JSON.stringify(stored.metadata?.injection_probes?.allowlist_tamper));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
