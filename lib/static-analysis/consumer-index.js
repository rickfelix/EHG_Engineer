/**
 * Consumer Index — Blast-Radius Consumer Analysis (Phase 1)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Builds a REVERSE index (definingFile+exportName -> consumer sites) from a
 * single forward AST pass over the repo's tracked source files. Extends the
 * existing dependency-analyzer.js forward pass by also capturing WHICH named
 * specifiers each import statement pulls in (that pass only recorded the
 * module source, never the imported names) -- this is what makes reverse
 * lookup possible without a second parse.
 */

import fs from 'fs';
import path from 'path';
import traverseImport from '@babel/traverse';
import { parseSource, MAX_ANALYZABLE_BYTES } from './ast-parse.js';
import { resolveModulePath } from './module-resolver.js';

// @babel/traverse's default export is wrapped differently under plain Node
// ESM (traverseImport.default is the callable) vs. bundler/test-runner CJS
// interop (traverseImport itself is already callable) -- same fallback used
// by scripts/modules/handoff/validation/oiv/OIVVerifier.js.
const traverse = traverseImport.default || traverseImport;

/**
 * @typedef {Object} Consumer
 * @property {string} file - Consumer file, relative to rootDir (forward slashes)
 * @property {number} line - 1-based source line of the import/require site
 * @property {string} kind - 'named' | 'default' | 'namespace' | 'require' | 'side-effect'
 */

/**
 * Build the reverse consumer index.
 *
 * @param {string[]} filePaths - Absolute paths of files to analyze
 * @param {string} rootDir - Project root (for relative-path reporting)
 * @returns {{ index: { named: Map<string, Map<string, Consumer[]>>, wholeModule: Map<string, Consumer[]> }, warnings: string[] }}
 */
export function buildConsumerIndex(filePaths, rootDir) {
  const named = new Map();
  const wholeModule = new Map();
  const warnings = [];

  const addNamed = (definingFile, exportName, consumer) => {
    if (!named.has(definingFile)) named.set(definingFile, new Map());
    const byName = named.get(definingFile);
    if (!byName.has(exportName)) byName.set(exportName, []);
    byName.get(exportName).push(consumer);
  };

  const addWhole = (definingFile, consumer) => {
    if (!wholeModule.has(definingFile)) wholeModule.set(definingFile, []);
    wholeModule.get(definingFile).push(consumer);
  };

  for (const filePath of filePaths) {
    // Per-file isolation (TR-2): one malformed/oversized file must not abort
    // the whole index build.
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_ANALYZABLE_BYTES) {
        warnings.push(`Skipped ${filePath}: exceeds ${MAX_ANALYZABLE_BYTES}-byte analysis cap`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const ast = parseSource(content, filePath);
      const relFile = path.relative(rootDir, filePath).replace(/\\/g, '/');

      traverse(ast, {
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value;
          const definingFile = resolveModulePath(source, filePath, rootDir);
          if (!definingFile) return; // external package or unresolved specifier
          const line = nodePath.node.loc?.start?.line ?? 0;

          for (const spec of nodePath.node.specifiers) {
            if (spec.type === 'ImportSpecifier') {
              addNamed(definingFile, spec.imported.name, { file: relFile, line, kind: 'named' });
            } else if (spec.type === 'ImportDefaultSpecifier') {
              addNamed(definingFile, 'default', { file: relFile, line, kind: 'default' });
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              addWhole(definingFile, { file: relFile, line, kind: 'namespace' });
            }
          }

          if (nodePath.node.specifiers.length === 0) {
            addWhole(definingFile, { file: relFile, line, kind: 'side-effect' });
          }
        },
        CallExpression(nodePath) {
          if (
            nodePath.node.callee.name === 'require' &&
            nodePath.node.arguments.length > 0 &&
            nodePath.node.arguments[0].type === 'StringLiteral'
          ) {
            const source = nodePath.node.arguments[0].value;
            const definingFile = resolveModulePath(source, filePath, rootDir);
            if (!definingFile) return;
            const line = nodePath.node.loc?.start?.line ?? 0;
            addWhole(definingFile, { file: relFile, line, kind: 'require' });
          }
        },
      });
    } catch (err) {
      warnings.push(`Failed to analyze ${filePath}: ${err.message}`);
    }
  }

  return { index: { named, wholeModule }, warnings };
}

/**
 * Find all consumers of a given export from a given defining file.
 *
 * Includes whole-module consumers (namespace/require/side-effect imports)
 * conservatively, since such a consumer MAY reference any export of the
 * module and static analysis cannot rule it out without deeper (non-Phase-1)
 * property-access tracing.
 *
 * @param {{named: Map, wholeModule: Map}} index - Index from buildConsumerIndex
 * @param {string} definingFile - Absolute path (forward slashes) of the defining file
 * @param {string} exportName - Exported symbol name (or 'default')
 * @returns {Consumer[]}
 */
export function findConsumers(index, definingFile, exportName) {
  const named = index.named.get(definingFile)?.get(exportName) || [];
  const whole = index.wholeModule.get(definingFile) || [];
  return [...named, ...whole];
}
