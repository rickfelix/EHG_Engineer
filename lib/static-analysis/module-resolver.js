/**
 * Module Resolver — Static Analysis
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * Resolves ESM import and CJS require paths to absolute file paths.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Extensions to try when resolving bare specifiers */
const EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx'];
/** Index files to try when resolving directory imports */
const INDEX_FILES = ['index.js', 'index.mjs', 'index.ts', 'index.tsx'];

/**
 * Resolve a module specifier to an absolute file path.
 *
 * @param {string} importPath - The import/require specifier (e.g. './foo', '../bar')
 * @param {string} fromFile - Absolute path of the file containing the import
 * @param {string} rootDir - Project root directory
 * @param {{ allowFileUrl?: boolean }} [opts] - OPTIONAL, opt-in only.
 *   allowFileUrl: resolve `file://` specifiers (produced by the
 *   `pathToFileURL(resolve(LIT)).href` idiom). Defaults FALSE so every existing
 *   positional caller keeps byte-identical behavior — see
 *   SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001 FR-2, which requires this to be
 *   opt-in because enabling it by default would loosen the live merge-blocking
 *   WIRE_CHECK_GATE. Note the default param keeps Function.length === 3.
 * @returns {string|null} Absolute resolved path or null if not found
 */
export function resolveModulePath(importPath, fromFile, rootDir, opts = {}) {
  let specifier = importPath;

  // OPT-IN: file:// URL specifiers. Off by default (see opts.allowFileUrl above).
  if (opts.allowFileUrl && specifier.startsWith('file://')) {
    try {
      const absolute = fileURLToPath(specifier);
      const normalizedAbs = absolute.replace(/\\/g, '/');
      // CONTAINMENT: a file:// specifier is an ABSOLUTE path, so without this a
      // scanned source containing import("file:///C:/Windows/win.ini") would inject
      // an out-of-repo node into the graph. Nothing is ever read or executed here,
      // but a fabricated node means fabricated reachability — which matters because
      // these primitives feed a live merge-blocking gate. Refuse anything outside
      // rootDir. statSync stays inside this try so a TOCTOU delete or EPERM cannot
      // throw uncaught.
      const rootNormalized = String(rootDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (rootNormalized && !normalizedAbs.startsWith(`${rootNormalized}/`)) return null;
      return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? normalizedAbs : null;
    } catch {
      return null;
    }
  }

  // Skip bare specifiers (npm packages) — they are not project files
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }
  const importPathResolved = specifier;

  const fromDir = path.dirname(fromFile);
  const basePath = path.resolve(fromDir, importPathResolved);

  // Normalize to forward slashes for consistency
  const normalize = (p) => p.replace(/\\/g, '/');

  // 1. Exact match (already has extension)
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return normalize(basePath);
  }

  // 2. Try appending extensions
  for (const ext of EXTENSIONS) {
    const withExt = basePath + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return normalize(withExt);
    }
  }

  // 3. Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const indexPath = path.join(basePath, indexFile);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return normalize(indexPath);
    }
  }

  return null;
}
