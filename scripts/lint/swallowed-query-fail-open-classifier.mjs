// swallowed-query-fail-open-classifier.mjs — SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2.
//
// FR-2's first deliverable: an enumerated list of every fail-open site (a swallowed-query hit
// whose nearest enclosing try/catch returns `passed: true` on failure, so converting the query
// to a throw alone would still be swallowed by the catch). The SD's "26" figure was a
// no-brace-matching heuristic estimate; this classifier does real AST analysis (espree, the
// parser ESLint itself uses) instead of guessing from surrounding text.
//
// Classification, per hit from swallowed-query-error-lint.mjs's scanTree():
//   fail_open   — the hit sits inside a try block whose catch handler contains a return
//                 statement with an object literal carrying `passed: true` (or a bare `true`
//                 identifier-shorthand is not applicable here; `passed:true` is the literal
//                 defect signature named by the SD's testing-agent finding).
//   has_catch   — inside a try block, but the catch does something else (log/rethrow/return
//                 passed:false/etc.) — still needs a behavioural test, but not the "gauge lies"
//                 class FR-2 exists for.
//   no_catch    — not inside any try block at the hit line.
//
// Usage: node scripts/lint/swallowed-query-fail-open-classifier.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import * as espree from 'espree';
import { scanTree, loadAllowlist } from './swallowed-query-error-lint.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Parse source into an ESTree AST, trying module then script sourceType. @param {string} src */
function parse(src) {
  const opts = { ecmaVersion: 2023, loc: true, range: true, allowReturnOutsideFunction: true };
  try {
    return espree.parse(src, { ...opts, sourceType: 'module' });
  } catch {
    return espree.parse(src, { ...opts, sourceType: 'script' });
  }
}

/**
 * Does this return statement carry a `passed: true` object literal anywhere in its argument
 * subtree? Covers both `return { passed: true, ... }` directly and the common
 * `return buildSemanticResult({ passed: true, ... })` helper-wrapped shape (verified live in
 * child-scope-coverage.js's catch, which returns `buildSemanticResult({ passed: true, score: 50,
 * ... })`, not a bare object literal).
 * @param {object} node
 */
function returnsPassedTrue(node) {
  if (node.type !== 'ReturnStatement' || !node.argument) return false;
  for (const obj of walk(node.argument)) {
    if (obj.type !== 'ObjectExpression') continue;
    const hit = obj.properties.some((p) => {
      if (p.type !== 'Property') return false;
      const key = p.key.name || p.key.value;
      return key === 'passed' && p.value.type === 'Literal' && p.value.value === true;
    });
    if (hit) return true;
  }
  return false;
}

/** Walk a subtree collecting all nodes (simple, allocation-heavy but the trees here are small). @param {object} node */
function* walk(node) {
  if (!node || typeof node.type !== 'string') return;
  yield node;
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) if (child && typeof child.type === 'string') yield* walk(child);
    } else if (val && typeof val.type === 'string') {
      yield* walk(val);
    }
  }
}

/**
 * Classify one hit line against a parsed AST.
 * @param {object} ast
 * @param {number} line 1-indexed
 * @returns {'fail_open'|'has_catch'|'no_catch'|'parse_error'}
 */
function classifyLine(ast, line) {
  let enclosing = null;
  for (const node of walk(ast)) {
    if (node.type !== 'TryStatement') continue;
    const tryBlock = node.block;
    if (line >= tryBlock.loc.start.line && line <= tryBlock.loc.end.line) {
      // Prefer the innermost (later-found-but-smaller) enclosing try.
      if (!enclosing || (tryBlock.loc.end.line - tryBlock.loc.start.line) < (enclosing.block.loc.end.line - enclosing.block.loc.start.line)) {
        enclosing = node;
      }
    }
  }
  if (!enclosing) return 'no_catch';
  if (!enclosing.handler) return 'no_catch'; // try/finally with no catch — nothing swallows the throw
  const catchesPassedTrue = [...walk(enclosing.handler.body)].some(returnsPassedTrue);
  return catchesPassedTrue ? 'fail_open' : 'has_catch';
}

export function classifyAll(root = ROOT) {
  const allow = loadAllowlist();
  const hits = scanTree(root).filter((h) => !(`${h.file}:${h.line}` in allow) && !(h.file in allow));
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  const results = [];
  for (const [file, fileHits] of byFile) {
    let ast;
    try {
      ast = parse(readFileSync(resolve(root, file), 'utf8'));
    } catch (e) {
      for (const h of fileHits) results.push({ ...h, classification: 'parse_error', parse_error: e.message });
      continue;
    }
    for (const h of fileHits) {
      results.push({ ...h, classification: classifyLine(ast, h.line) });
    }
  }
  results.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return results;
}

function main() {
  const results = classifyAll();
  const counts = results.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
  }, {});
  console.log(`[FAIL-OPEN-CLASSIFIER] ${results.length} total ungoverned sites classified:`, counts);
  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ generated_at: new Date().toISOString(), counts, results }, null, 2));
    console.log(`Written: ${process.argv[jsonIdx + 1]}`);
  } else {
    for (const r of results.filter((r) => r.classification === 'fail_open')) {
      console.log(`   FAIL-OPEN: ${r.file}:${r.line} [${r.kind}]`);
    }
  }
}

if (process.argv[1] && /swallowed-query-fail-open-classifier\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
