/**
 * AST-based static guard for lib/worktree-manager.js (internal scope).
 *
 * Complements tests/unit/lib/worktree-rmsync-junction-safety.test.js which
 * scans scripts/ for raw fs.rmSync({recursive:true}) without junction safety.
 * That guard is scoped to scripts/ only — this one targets the lib/ file
 * itself with AST precision (catches multi-line, extracted-opts, and
 * destructured-rmSync evasion patterns the regex-based scripts/ guard
 * doesn't address).
 *
 * SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001 FR-2.
 *
 * Anchored on the safeRecursiveRm function declaration's source position
 * (NOT hardcoded line numbers) — a future code shuffle that moves the
 * helper still works.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_FILE = path.resolve(__dirname, '../../../lib/worktree-manager.js');

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walkAst(c, visit);
    } else if (child && typeof child === 'object' && child.type) {
      walkAst(child, visit);
    }
  }
}

function resolveCalleeName(callee) {
  if (!callee) return null;
  if (callee.type === 'MemberExpression') {
    const obj = callee.object?.name;
    const prop = callee.property?.name ?? callee.property?.value;
    if (obj && prop) return `${obj}.${prop}`;
  }
  if (callee.type === 'Identifier') return callee.name;
  return null;
}

function objectHasRecursiveTrue(objectExpr) {
  if (objectExpr?.type !== 'ObjectExpression') return false;
  for (const prop of objectExpr.properties || []) {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') continue;
    const keyName = prop.key?.name ?? prop.key?.value;
    const v = prop.value;
    const isTrue =
      (v?.type === 'BooleanLiteral' && v.value === true) ||
      (v?.type === 'Literal' && v.value === true);
    if (keyName === 'recursive' && isTrue) return true;
  }
  return false;
}

function findVariableInit(name, ast) {
  let result = null;
  walkAst(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init) {
      result = node.init;
    }
  });
  return result;
}

function findRecursiveRmSyncCalls(ast) {
  const matches = [];
  walkAst(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const calleeName = resolveCalleeName(node.callee);
    if (!['fs.rmSync', 'rmSync'].includes(calleeName)) return;
    const args = node.arguments || [];
    if (args.length < 2) return;
    const opts = args[1];
    let recursive = false;
    if (opts.type === 'ObjectExpression') {
      recursive = objectHasRecursiveTrue(opts);
    } else if (opts.type === 'Identifier') {
      const init = findVariableInit(opts.name, ast);
      if (init && init.type === 'ObjectExpression') {
        recursive = objectHasRecursiveTrue(init);
      }
    }
    if (recursive) matches.push(node);
  });
  return matches;
}

function findSafeRecursiveRmRange(ast) {
  let range = null;
  walkAst(ast, (node) => {
    const fn =
      node.type === 'FunctionDeclaration' && node.id?.name === 'safeRecursiveRm'
        ? node
        : node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'FunctionDeclaration' &&
          node.declaration.id?.name === 'safeRecursiveRm'
        ? node.declaration
        : null;
    if (fn) range = { start: fn.start, end: fn.end };
  });
  return range;
}

describe('lib/worktree-manager.js internal fs.rmSync({recursive:true}) AST guard', () => {
  it('every recursive fs.rmSync sits within safeRecursiveRm body', () => {
    const src = fs.readFileSync(TARGET_FILE, 'utf8');
    const ast = parse(src, { sourceType: 'module', errorRecovery: false });

    const safeRange = findSafeRecursiveRmRange(ast);
    expect(safeRange, 'safeRecursiveRm export not found').not.toBeNull();

    const calls = findRecursiveRmSyncCalls(ast);
    const violations = [];
    for (const node of calls) {
      const inSafeHelper = node.start >= safeRange.start && node.end <= safeRange.end;
      if (inSafeHelper) continue;
      const before = src.slice(0, node.start).split('\n');
      const line = before.length;
      const col = before[before.length - 1].length + 1;
      violations.push({
        line,
        col,
        snippet: src.slice(node.start, Math.min(node.end, node.start + 120)).replace(/\s+/g, ' '),
      });
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${TARGET_FILE}:${v.line}:${v.col} — ${v.snippet}`)
        .join('\n');
      throw new Error(
        `[WORKTREE_RAW_RM_OUTSIDE_SAFE_HELPER] ${violations.length} raw fs.rmSync({recursive:true}) call(s) in lib/worktree-manager.js OUTSIDE the safeRecursiveRm function body:\n${formatted}\n\nUse safeRecursiveRm(path, { force: true }) instead.`
      );
    }
  });

  function runGuardOnSource(source) {
    const ast = parse(source, { sourceType: 'module', errorRecovery: false });
    const safeRange = findSafeRecursiveRmRange(ast);
    const calls = findRecursiveRmSyncCalls(ast);
    let outside = 0;
    for (const node of calls) {
      if (!safeRange || node.start < safeRange.start || node.end > safeRange.end) {
        outside++;
      }
    }
    return outside;
  }

  it('catches multi-line {recursive:true} call', () => {
    expect(
      runGuardOnSource(`
        import fs from 'node:fs';
        function bad() {
          fs.rmSync(
            '/some/path',
            {
              recursive: true,
              force: true,
            }
          );
        }
      `)
    ).toBe(1);
  });

  it('catches extracted opts variable', () => {
    expect(
      runGuardOnSource(`
        import fs from 'node:fs';
        function bad() {
          const opts = { recursive: true, force: true };
          fs.rmSync('/some/path', opts);
        }
      `)
    ).toBe(1);
  });

  it('catches destructured rmSync from fs', () => {
    expect(
      runGuardOnSource(`
        import { rmSync } from 'node:fs';
        function bad() {
          rmSync('/some/path', { recursive: true, force: true });
        }
      `)
    ).toBe(1);
  });

  it('does NOT flag non-recursive fs.rmSync calls', () => {
    expect(
      runGuardOnSource(`
        import fs from 'node:fs';
        function ok() {
          fs.rmSync('/some/path', { force: true });
          fs.rmSync('/file.txt');
        }
      `)
    ).toBe(0);
  });

  it('does NOT flag calls inside safeRecursiveRm helper definition', () => {
    expect(
      runGuardOnSource(`
        import fs from 'node:fs';
        export function safeRecursiveRm(targetPath, options = {}) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      `)
    ).toBe(0);
  });
});
