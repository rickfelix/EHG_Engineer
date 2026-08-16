// SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001, FR-7.
//
// strategic_directives_v2.progress is a dead-twin column (superseded by progress_percentage;
// the enforce_progress_on_completion() BEFORE-UPDATE trigger only maintains the latter — see
// database/migrations/20251211_fix_progress_trigger_rls_access.sql:334-356). The column is not
// dropped (no DDL in this SD's scope), so it still silently accepts reads and writes. This is a
// RATCHET guard, not a zero-tolerance one: a fresh census at authoring time found 32 pre-existing
// bare-`progress` sites outside this SD's own repointed files (frozen in
// tests/unit/hygiene/progress-column-baseline.json). The guard blocks any NEW site beyond that
// baseline; the baseline may only shrink over time as future SDs clean up the remainder.
//
// Three AST-scoped rule shapes, all requiring the call chain to also contain
// .from('strategic_directives_v2') (single-chain, syntactic — same precedent as
// lib/static-analysis/consumer-index.js, no deep taint tracking):
//   RULE A (readers) — a PostgREST query-builder method (.select/.order/.eq/.neq/.gt/.gte/.lt/
//           .lte/.is) whose column-name string argument is EXACTLY "progress" (.select splits
//           its comma-separated argument first; the rest take a single column name). Exact-token
//           matching, not substring, so progress_percentage and progress_pct never match.
//   RULE B (writers) — .update({...}) / .insert({...}) object literal with a top-level key
//           exactly named "progress".
//   RULE C (readers, partial coverage) — a bare `x.progress` property read where `x` is a
//           SAME-SCOPE, SAME-STATEMENT variable directly initialized from a chain containing
//           .from('strategic_directives_v2') (e.g. `const { data: sd } = await supabase.from(...)
//           .select(...); ...sd.progress`).
//
// KNOWN LIMITATION (measured, not guessed): RULE C only resolves a single-hop direct
// declarator-init binding. It does NOT trace through function parameters (e.g.
// scripts/modules/audit/audit-runner.js's `evaluate: (sd, _config) => ...` — sd arrives from a
// caller elsewhere in the file), array indexing after a reassignment (e.g.
// scripts/get-working-on-sd.js's `workingOn = spotlight; ... sd = workingOn[0]`), or
// cross-function resolver calls (e.g. scripts/generate-retrospective.js's sd argument, sourced
// from a separate resolver). Full interprocedural dataflow tracing would close this but is out
// of proportion to this SD's scope and inconsistent with the codebase's own single-hop static-
// analysis precedent. COMPENSATING CONTROL for the files this SD actually touched: every
// repointed read site was verified by direct grep + Read against its own select-clause during
// EXEC (never repointed blind), and the two pinned regression tests
// (tests/unit/eva-support/sd-reader.test.js, tests/unit/sd-revert.test.js) assert the exact
// column name each source now selects. A future SD extending RULE C to trace parameters/
// reassignment would close the remaining gap for files added after this one.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import traverseImport from '@babel/traverse';
import { parseSource, MAX_ANALYZABLE_BYTES } from '../../lib/static-analysis/ast-parse.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// See lib/static-analysis/consumer-index.js for why this fallback is needed (ESM vs CJS interop).
const traverse = traverseImport.default || traverseImport;

export const TABLE = 'strategic_directives_v2';
export const DEAD_COLUMN = 'progress';

// PostgREST query-builder methods whose first argument is a single column-name string.
// `select` is comma-separated and handled specially, not included here.
const SINGLE_COLUMN_FILTER_METHODS = new Set(['order', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is']);

export const SELF_PATHS = new Set([
  'scripts/lint/progress-column-lint.mjs',
  'tests/unit/hygiene/no-bare-progress-column.test.js',
]);

// Tracked but not live production source for this guard's purposes: historical one-off/archive
// scripts (already executed, not maintained), test files (synthetic fixtures legitimately use
// arbitrary field names including "progress"), docs, and worktree checkouts of other SDs.
export const PATH_EXCLUDE_PREFIXES = [
  'tests/',
  '.artifacts/',
  'scripts/one-off/',
  'scripts/archive/',
  'scripts/temp/',
  'docs/',
  '.worktrees/',
];

export function isExcludedPath(filePath, prefixes = PATH_EXCLUDE_PREFIXES) {
  return prefixes.some((p) => filePath.startsWith(p));
}

const INCLUDE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

/** Walk leftward through a call/member chain looking for `.from(tableName)` anywhere in it. */
function chainContainsFromTable(node, tableName) {
  let current = node;
  while (current) {
    if (current.type === 'CallExpression') {
      const callee = current.callee;
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'from' &&
        current.arguments.length > 0 &&
        current.arguments[0].type === 'StringLiteral' &&
        current.arguments[0].value === tableName
      ) {
        return true;
      }
      current = callee.type === 'MemberExpression' ? callee.object : null;
    } else if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Scan one file's source text for RULE A / RULE B / RULE C violations.
 *
 * @param {string} content
 * @param {string} filePath - used only to decide jsx/ts parser plugins
 * @returns {Array<{line: number, rule: 'A'|'B'|'C', method: string, snippet: string}>}
 */
export function scanSource(content, filePath) {
  const findings = [];
  let ast;
  try {
    ast = parseSource(content, filePath);
  } catch {
    return findings; // unparsable file — per-file isolation, not this guard's concern
  }

  traverse(ast, {
    CallExpression(nodePath) {
      const { node } = nodePath;
      const callee = node.callee;
      if (callee.type !== 'MemberExpression' || callee.computed) return;
      if (callee.property.type !== 'Identifier') return;
      const methodName = callee.property.name;

      if (methodName === 'select') {
        if (!chainContainsFromTable(callee.object, TABLE)) return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'StringLiteral') return;
        const cols = arg.value.split(',').map((s) => s.trim());
        if (cols.includes(DEAD_COLUMN)) {
          findings.push({ line: node.loc?.start?.line ?? 0, rule: 'A', method: 'select', snippet: arg.value });
        }
      } else if (SINGLE_COLUMN_FILTER_METHODS.has(methodName)) {
        if (!chainContainsFromTable(callee.object, TABLE)) return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'StringLiteral') return;
        if (arg.value === DEAD_COLUMN) {
          findings.push({ line: node.loc?.start?.line ?? 0, rule: 'A', method: methodName, snippet: `${methodName}('${arg.value}', ...)` });
        }
      } else if (methodName === 'update' || methodName === 'insert') {
        if (!chainContainsFromTable(callee.object, TABLE)) return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression') return;
        for (const prop of arg.properties) {
          if (
            prop.type === 'ObjectProperty' &&
            !prop.computed &&
            ((prop.key.type === 'Identifier' && prop.key.name === DEAD_COLUMN) ||
              (prop.key.type === 'StringLiteral' && prop.key.value === DEAD_COLUMN))
          ) {
            findings.push({ line: node.loc?.start?.line ?? 0, rule: 'B', method: methodName, snippet: `${methodName}({ ${DEAD_COLUMN}: ... })` });
          }
        }
      }
    },

    MemberExpression(nodePath) {
      const { node } = nodePath;
      if (node.computed) return;
      if (node.property.type !== 'Identifier' || node.property.name !== DEAD_COLUMN) return;
      if (node.object.type !== 'Identifier') return;

      const binding = nodePath.scope.getBinding(node.object.name);
      if (!binding) return;

      let declaratorPath = binding.path;
      while (declaratorPath && declaratorPath.node.type !== 'VariableDeclarator') {
        declaratorPath = declaratorPath.parentPath;
      }
      if (!declaratorPath) return;
      let init = declaratorPath.node.init;
      if (!init) return;
      if (init.type === 'AwaitExpression') init = init.argument;
      if (!chainContainsFromTable(init, TABLE)) return;

      findings.push({ line: node.loc?.start?.line ?? 0, rule: 'C', method: 'property-read', snippet: `${node.object.name}.${DEAD_COLUMN}` });
    },
  });

  return findings;
}

/**
 * Pure evaluator over already-loaded {path, content} pairs, so tests can exercise rule-shape
 * detection without depending on live repo state or git (matches
 * scripts/lint/no-connection-string-literals-lint.mjs's evaluateFiles precedent).
 */
export function evaluateFiles(files, { selfPaths = SELF_PATHS, excludePrefixes = PATH_EXCLUDE_PREFIXES } = {}) {
  const findings = [];
  for (const { path: filePath, content } of files) {
    if (selfPaths.has(filePath)) continue;
    if (isExcludedPath(filePath, excludePrefixes)) continue;
    for (const finding of scanSource(content, filePath)) {
      findings.push({ file: filePath, ...finding });
    }
  }
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return { findings, ok: findings.length === 0 };
}

export function loadTrackedFiles() {
  // -z: NUL-delimited, sidesteps core.quotePath escaping of non-ASCII paths (same rationale as
  // scripts/lint/no-connection-string-literals-lint.mjs's loadTrackedFiles).
  const raw = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const paths = raw.split('\0').filter(Boolean)
    .filter((p) => INCLUDE_EXT.has(p.slice(p.lastIndexOf('.'))))
    .filter((p) => !isExcludedPath(p) && !SELF_PATHS.has(p));
  const files = [];
  const skippedFiles = [];
  for (const p of paths) {
    try {
      const buf = readFileSync(p);
      if (buf.length > MAX_ANALYZABLE_BYTES) {
        skippedFiles.push({ path: p, bytes: buf.length });
        continue;
      }
      files.push({ path: p, content: buf.toString('utf8') });
    } catch {
      continue; // binary/deleted-since-ls-files/permission error — not a violation
    }
  }
  return { files, skippedFiles };
}

function main() {
  const { files, skippedFiles } = loadTrackedFiles();
  const result = evaluateFiles(files);

  console.log(`[progress-column-lint] scanned ${files.length} tracked source file(s)`);
  if (skippedFiles.length > 0) {
    console.log(`⚠ skipped ${skippedFiles.length} file(s) over the ${MAX_ANALYZABLE_BYTES}-byte cap (not scanned):`);
    for (const s of skippedFiles) console.log(`   ${s.path} (${s.bytes} bytes)`);
  }
  console.log(`Found ${result.findings.length} bare-"${DEAD_COLUMN}"-column site(s) on ${TABLE} chains.`);
  for (const f of result.findings) {
    console.log(`   [RULE ${f.rule}] ${f.file}:${f.line} (${f.method}) — ${f.snippet}`);
  }

  const writeIdx = process.argv.indexOf('--write-baseline');
  if (writeIdx !== -1 && process.argv[writeIdx + 1]) {
    const baselinePath = process.argv[writeIdx + 1];
    const baseline = {
      generated_note: 'Frozen allowlist for SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001 FR-7 ratchet guard. Regenerate via: node scripts/lint/progress-column-lint.mjs --write-baseline tests/unit/hygiene/progress-column-baseline.json. Must only shrink over time (see tests/unit/hygiene/no-bare-progress-column.test.js).',
      table: TABLE,
      dead_column: DEAD_COLUMN,
      count: result.findings.length,
      sites: result.findings,
    };
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`\nWrote baseline: ${baselinePath}`);
  }

  process.exitCode = 0; // reporting tool; the baseline-subset check (not this CLI) enforces pass/fail
}

if (isMainModule(import.meta.url)) {
  main();
}
