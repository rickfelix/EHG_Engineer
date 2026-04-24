/**
 * Call Graph Builder — Static Analysis
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * Uses acorn to parse JS files and extract import/require edges.
 * Produces a directed graph: file -> Set<resolved dependency files>.
 */

import fs from 'fs';
import * as acorn from 'acorn';
import { resolveModulePath } from './module-resolver.js';

/**
 * Build a call graph (dependency graph) from a set of JS files.
 *
 * @param {string[]} filePaths - Absolute paths to JS files (forward slashes)
 * @param {string} rootDir - Project root directory
 * @returns {{ graph: Map<string, Set<string>>, warnings: string[] }}
 */
export function buildCallGraph(filePaths, rootDir) {
  const graph = new Map();
  const warnings = [];

  for (const filePath of filePaths) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const edges = new Set();
    graph.set(normalizedPath, edges);

    let source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (readErr) {
      warnings.push(`Could not read ${normalizedPath}: ${readErr.message}`);
      continue;
    }

    let ast;
    try {
      ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
      });
    } catch (parseErr) {
      warnings.push(`Parse error in ${normalizedPath}: ${parseErr.message}`);
      continue;
    }

    // Walk top-level nodes for import/export declarations and require() calls
    for (const node of ast.body) {
      // ESM: import ... from 'source'
      if (node.type === 'ImportDeclaration' && node.source?.value) {
        addEdge(edges, node.source.value, filePath, rootDir);
      }

      // ESM: export * from 'source' (barrel exports)
      if (node.type === 'ExportAllDeclaration' && node.source?.value) {
        addEdge(edges, node.source.value, filePath, rootDir);
      }

      // ESM: export { ... } from 'source' (re-exports)
      if (node.type === 'ExportNamedDeclaration' && node.source?.value) {
        addEdge(edges, node.source.value, filePath, rootDir);
      }
    }

    // Walk entire AST for require() calls (CJS) and dynamic import() calls (ESM).
    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-2: literal-specifier dynamic imports
    // are resolved as edges. Non-literal ones (e.g. `import(dynamicVar)`) surface a
    // CAUTION so operators can audit them without blocking the gate.
    walkForDynamicEdges(ast, {
      onRequire: (specifier) => addEdge(edges, specifier, filePath, rootDir),
      onDynamicImport: (specifier) => addEdge(edges, specifier, filePath, rootDir),
      onNonLiteralDynamicImport: () => {
        warnings.push(`${normalizedPath}: non-literal dynamic import() detected — reachability may be incomplete (CAUTION)`);
      }
    });
  }

  return { graph, warnings };
}

/**
 * Add a resolved edge to the edge set.
 */
function addEdge(edges, specifier, fromFile, rootDir) {
  const resolved = resolveModulePath(specifier, fromFile, rootDir);
  if (resolved) {
    edges.add(resolved);
  }
}

/**
 * AST walker that finds CJS require() and ESM dynamic import() call sites.
 *
 * Handlers:
 *   - onRequire(specifier)                  — CommonJS `require("./x")` with string literal
 *   - onDynamicImport(specifier)            — ESM `import("./x")` with string literal
 *   - onNonLiteralDynamicImport()           — ESM `import(variable)` — cannot resolve statically
 */
function walkForDynamicEdges(node, handlers) {
  if (!node || typeof node !== 'object') return;

  // CJS: require("./x")
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal' &&
    typeof node.arguments[0].value === 'string'
  ) {
    handlers.onRequire?.(node.arguments[0].value);
  }

  // ESM dynamic import: acorn with ecmaVersion:'latest' emits ImportExpression.
  if (node.type === 'ImportExpression') {
    const src = node.source;
    if (src?.type === 'Literal' && typeof src.value === 'string') {
      handlers.onDynamicImport?.(src.value);
    } else {
      handlers.onNonLiteralDynamicImport?.();
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walkForDynamicEdges(item, handlers);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walkForDynamicEdges(child, handlers);
    }
  }
}
