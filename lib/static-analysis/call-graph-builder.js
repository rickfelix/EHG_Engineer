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
 * @param {{ allowedRoots?: string[], resolveFileUrlIdiom?: boolean }} [opts] - OPTIONAL,
 *   opt-in only; both default to prior behavior so the two live merge-blocking gates
 *   that call this positionally are unaffected (SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001
 *   FR-2). The default param keeps Function.length === 2.
 *
 *   allowedRoots: repo-relative POSIX prefixes. When set, an edge is kept only if its
 *   RESOLVED target lies under one of them. This is SUBGRAPH RESTRICTION, deliberately
 *   NOT depth-bounding: hub modules (supabase client, shared utils) otherwise collapse
 *   the graph so that nearly everything "reaches" a transport (measured: 396 modules /
 *   201 entrypoints / ~1% precision). Depth-bounding was tested and is the wrong knob.
 *
 *   resolveFileUrlIdiom: also resolve `import(pathToFileURL(resolve('lit')).href)`.
 *   MUST stay opt-in: enabling it by default would add edges (loosening the live
 *   WIRE_CHECK_GATE) and would delete the CAUTION warnings that gate propagates.
 * @returns {{ graph: Map<string, Set<string>>, warnings: string[] }}
 */
export function buildCallGraph(filePaths, rootDir, opts = {}) {
  const graph = new Map();
  const warnings = [];
  const allowedRoots = Array.isArray(opts.allowedRoots) && opts.allowedRoots.length > 0
    ? opts.allowedRoots.map((r) => r.replace(/\\/g, '/').replace(/\/+$/, ''))
    : null;
  const rootPrefix = String(rootDir || '').replace(/\\/g, '/').replace(/\/+$/, '');

  /** Keep an edge only when its resolved target is inside the declared subgraph. */
  const withinAllowedRoots = (resolvedAbs) => {
    if (!allowedRoots) return true;
    const relPath = rootPrefix && resolvedAbs.startsWith(`${rootPrefix}/`)
      ? resolvedAbs.slice(rootPrefix.length + 1)
      : resolvedAbs;
    return allowedRoots.some((root) => relPath === root || relPath.startsWith(`${root}/`));
  };

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

    const add = (specifier) => addEdge(edges, specifier, filePath, rootDir, opts, withinAllowedRoots);

    // Walk top-level nodes for import/export declarations and require() calls
    for (const node of ast.body) {
      // ESM: import ... from 'source'
      if (node.type === 'ImportDeclaration' && node.source?.value) {
        add(node.source.value);
      }

      // ESM: export * from 'source' (barrel exports)
      if (node.type === 'ExportAllDeclaration' && node.source?.value) {
        add(node.source.value);
      }

      // ESM: export { ... } from 'source' (re-exports)
      if (node.type === 'ExportNamedDeclaration' && node.source?.value) {
        add(node.source.value);
      }
    }

    // Walk entire AST for require() calls (CJS) and dynamic import() calls (ESM).
    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-2: literal-specifier dynamic imports
    // are resolved as edges. Non-literal ones (e.g. `import(dynamicVar)`) surface a
    // CAUTION so operators can audit them without blocking the gate.
    walkForDynamicEdges(ast, {
      onRequire: (specifier) => add(specifier),
      onDynamicImport: (specifier) => add(specifier),
      onNonLiteralDynamicImport: (sourceNode) => {
        // OPT-IN (opts.resolveFileUrlIdiom): recover the very common
        // `import(pathToFileURL(resolve('lib/x.js')).href)` shape, whose source is a
        // computed MemberExpression and therefore "non-literal". Off by default so the
        // live WIRE_CHECK_GATE keeps both its edge set AND these CAUTION warnings.
        if (opts.resolveFileUrlIdiom) {
          const literal = extractFileUrlIdiomLiteral(sourceNode);
          if (literal !== null) {
            // resolve('lib/x.js') is repo-root-relative, so resolve against rootDir.
            addEdge(edges, `./${literal.replace(/^\.?\//, '')}`, `${rootPrefix}/_`, rootDir, opts, withinAllowedRoots);
            return;
          }
        }
        warnings.push(`${normalizedPath}: non-literal dynamic import() detected — reachability may be incomplete (CAUTION)`);
      }
    });
  }

  return { graph, warnings };
}

/**
 * Add a resolved edge to the edge set.
 *
 * `opts` and `withinAllowedRoots` are optional and default to prior behavior, so
 * the two internal call shapes stay equivalent when no options are supplied.
 */
function addEdge(edges, specifier, fromFile, rootDir, opts = {}, withinAllowedRoots = null) {
  const resolved = resolveModulePath(specifier, fromFile, rootDir, {
    allowFileUrl: Boolean(opts.resolveFileUrlIdiom),
  });
  if (!resolved) return;
  if (withinAllowedRoots && !withinAllowedRoots(resolved)) return;
  edges.add(resolved);
}

/**
 * Recover the string literal from `pathToFileURL(<lit>).href` or
 * `pathToFileURL(resolve(<lit>)).href` (also tolerating `join`/`path.resolve`).
 * Returns the literal, or null when the node is not that idiom.
 *
 * Measured: every occurrence of this idiom in the comms subgraph uses exactly this
 * shape, so a targeted match covers 100% of live sites without a general evaluator.
 */
function extractFileUrlIdiomLiteral(sourceNode) {
  if (!sourceNode || sourceNode.type !== 'MemberExpression') return null;
  if (sourceNode.property?.name !== 'href') return null;

  const call = sourceNode.object;
  const calleeName = (node) => node?.callee?.name || node?.callee?.property?.name || null;
  if (call?.type !== 'CallExpression' || calleeName(call) !== 'pathToFileURL') return null;

  const arg = call.arguments?.[0];
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;

  // pathToFileURL(resolve('lit')) / pathToFileURL(path.join('lit'))
  if (arg?.type === 'CallExpression' && ['resolve', 'join'].includes(calleeName(arg))) {
    const inner = arg.arguments?.[0];
    if (inner?.type === 'Literal' && typeof inner.value === 'string') return inner.value;
  }
  return null;
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
      // Pass the source node so an opt-in handler can recognize known computed
      // shapes (e.g. the pathToFileURL idiom) instead of only counting them.
      handlers.onNonLiteralDynamicImport?.(src);
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
