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

    // Walk entire AST for require() calls (CJS)
    walkForRequire(ast, (specifier) => {
      addEdge(edges, specifier, filePath, rootDir);
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
 * Simple AST walker to find CallExpression nodes where callee is `require`.
 */
function walkForRequire(node, callback) {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal' &&
    typeof node.arguments[0].value === 'string'
  ) {
    callback(node.arguments[0].value);
  }

  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walkForRequire(item, callback);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walkForRequire(child, callback);
    }
  }
}
