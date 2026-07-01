/**
 * Symbol Diff — Blast-Radius Consumer Analysis (Phase 1)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Detects which EXPORTED symbols changed between a base ref and the current
 * working tree, via AST-identified declaration boundaries rather than a
 * whole-file line diff. Comparing only each export's own source-text span
 * means an unrelated formatting change elsewhere in the file (e.g. a comment
 * reformatted above a different function) never flags an untouched export.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import traverseImport from '@babel/traverse';
import { parseSource, MAX_ANALYZABLE_BYTES } from './ast-parse.js';

// See consumer-index.js for why this fallback is required (@babel/traverse
// ESM/CJS interop wrapping differs between plain Node and bundler/test runners).
const traverse = traverseImport.default || traverseImport;

const SOURCE_FILE_RE = /\.(js|mjs|cjs|jsx|ts|tsx)$/;

/**
 * `git show` reads straight from git's object store, which is always
 * LF-normalized text (git internally stores LF regardless of autocrlf);
 * `fs.readFileSync` reads the checked-out working-tree file, which on a
 * Windows checkout with core.autocrlf=true has CRLF line endings. Comparing
 * those two forms of the SAME logical content byte-for-byte would flag every
 * multi-line export as "modified" on every Windows checkout, regardless of
 * any real change. Normalize both sides to LF before span comparison.
 */
function normalizeLineEndings(content) {
  return content === null ? null : content.replace(/\r\n/g, '\n');
}

/**
 * Read a file's content at a given git ref via argv-array execFileSync
 * (never shell-string interpolation, per SECURITY TR-1). Returns null when
 * the path did not exist at that ref (new file) or git show otherwise fails.
 */
function getContentAtRef(ref, relPath, rootDir) {
  try {
    const content = execFileSync('git', ['show', `${ref}:${relPath}`], {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: MAX_ANALYZABLE_BYTES,
      // A new file not existing at `ref` is an EXPECTED, handled outcome (caught
      // below), not a real error -- suppress git's own "fatal: path ... not in
      // <ref>" stderr so it doesn't read as a crash in handoff/gate logs.
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return normalizeLineEndings(content);
  } catch {
    return null;
  }
}

function getWorkingTreeContent(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.size > MAX_ANALYZABLE_BYTES) return { content: null, oversized: true };
    return { content: normalizeLineEndings(fs.readFileSync(absPath, 'utf-8')), oversized: false };
  } catch {
    return { content: null, oversized: false }; // deleted file
  }
}

/**
 * Extract each exported symbol's own source-text span, keyed by export name.
 * @returns {Map<string, string>}
 */
function extractExportSpans(ast, source) {
  const spans = new Map();

  traverse(ast, {
    ExportNamedDeclaration(nodePath) {
      const node = nodePath.node;
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.declarations) {
          // export const foo = ..., bar = ...
          for (const d of decl.declarations) {
            if (d.id?.name) spans.set(d.id.name, source.slice(d.start, d.end));
          }
        } else if (decl.id?.name) {
          // export function foo() {} / export class Foo {}
          spans.set(decl.id.name, source.slice(decl.start, decl.end));
        }
      } else if (node.specifiers?.length) {
        // export { foo, bar as baz }
        for (const spec of node.specifiers) {
          spans.set(spec.exported.name, source.slice(spec.start, spec.end));
        }
      }
    },
    ExportDefaultDeclaration(nodePath) {
      const decl = nodePath.node.declaration;
      spans.set('default', source.slice(decl.start, decl.end));
    },
  });

  return spans;
}

function safeExtractSpans(source, relPath, warnings) {
  if (source === null) return new Map();
  try {
    return extractExportSpans(parseSource(source, relPath), source);
  } catch (err) {
    warnings.push(`Failed to parse ${relPath}: ${err.message}`);
    return new Map();
  }
}

/**
 * Detect modified/removed/added exported symbols across a set of changed files.
 *
 * @param {string} mainRef - Base git ref (e.g. 'origin/main')
 * @param {string[]} changedFiles - Repo-relative paths (forward slashes) of changed files
 * @param {string} rootDir - Project root
 * @returns {{ modifiedExports: Array<{file: string, exportName: string, changeType: 'modified'|'removed'|'added'}>, warnings: string[] }}
 */
export function detectModifiedExports(mainRef, changedFiles, rootDir) {
  const results = [];
  const warnings = [];

  for (const relPath of changedFiles) {
    if (!SOURCE_FILE_RE.test(relPath)) continue;

    try {
      const absPath = path.resolve(rootDir, relPath);
      const beforeSource = getContentAtRef(mainRef, relPath, rootDir);
      const { content: afterSource, oversized } = getWorkingTreeContent(absPath);

      if (oversized) {
        warnings.push(`Skipped ${relPath}: exceeds ${MAX_ANALYZABLE_BYTES}-byte analysis cap`);
        continue;
      }

      const beforeSpans = safeExtractSpans(beforeSource, relPath, warnings);
      const afterSpans = safeExtractSpans(afterSource, relPath, warnings);

      const allNames = new Set([...beforeSpans.keys(), ...afterSpans.keys()]);
      for (const name of allNames) {
        const beforeText = beforeSpans.get(name);
        const afterText = afterSpans.get(name);

        if (beforeText !== undefined && afterText === undefined) {
          results.push({ file: relPath, exportName: name, changeType: 'removed' });
        } else if (beforeText === undefined && afterText !== undefined) {
          results.push({ file: relPath, exportName: name, changeType: 'added' });
        } else if (beforeText !== afterText) {
          results.push({ file: relPath, exportName: name, changeType: 'modified' });
        }
      }
    } catch (err) {
      warnings.push(`Failed to diff ${relPath}: ${err.message}`);
    }
  }

  return { modifiedExports: results, warnings };
}
