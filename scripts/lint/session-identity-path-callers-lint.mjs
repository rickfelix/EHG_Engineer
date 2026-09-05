#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-4) — advisory: flag modules that
 * reference the `.claude/session-identity` marker path without importing anything from the
 * SSOT (lib/fleet/cc-pid-liveness.cjs).
 *
 * THE BUG THIS GUARDS AGAINST RECURRING: this SD's own root cause was 6+ call sites re-deriving
 * or reading the marker directory through paths OTHER than the shared markerDirs()/
 * getMarkerSessionIds()/getAliveCcPids() union, each independently defaulting to a single
 * local directory and silently misreading a live session in a different git worktree checkout
 * as could-not-determine/dead. Two MORE independent hand-rolled re-derivations
 * (scripts/fleet-liveness-mc.cjs's old resolveMarkerDir, scripts/stale-session-sweep.cjs's
 * detectIdentityCollisions) were found only by manual code review during this SD, not by any
 * automated check. This lint is that automated check, going forward.
 *
 * SIGNATURE MATCHED: a file whose (comment-blanked) text mentions the session-identity path
 * literal (`.claude/session-identity` or a `'session-identity'`/`"session-identity"` path
 * segment) but does not import anything from lib/fleet/cc-pid-liveness.cjs. A file that imports
 * ANY export from that module (MARKER_DIR, markerDirs, getMarkerSessionIds, getAliveCcPids,
 * isProcessRunning, mainWorktreeMarkerDir) is presumed to be delegating path resolution to the
 * SSOT correctly and is not flagged, even if it also mentions the path literal elsewhere (e.g.
 * a comment, or a DIFFERENT sub-path like the `current` session pointer file).
 *
 * DELIBERATELY EXCLUDED, not a re-derivation defect:
 *   - lib/fleet/cc-pid-liveness.cjs itself (the SSOT).
 *   - scripts/hooks/capture-session-id.cjs (the canonical WRITER — by design, a writer only
 *     ever writes to its OWN checkout's local directory; the host-wide union problem this SD
 *     fixes is a READER concern, not a writer one).
 *
 * KNOWN LIMITATION (text scan, not an AST pass, same tradeoff as this repo's sibling lints):
 * the path-literal gate cannot distinguish "reads/writes the PID marker files this SD's defect
 * class concerns" from "reads/writes an unrelated file under the same session-identity
 * directory" (e.g. the `current` session-id pointer file, or a per-session fleet-identity
 * file) — a file doing only the latter would still be flagged as a false positive. This is why
 * FR-4 is wired ADVISORY-ONLY (never blocking): a human reviews the printed list rather than
 * CI auto-failing on it. No hardcoded expected count is asserted anywhere in this file or its
 * CI wiring, mirroring lib/governance/orphan-writers-registry.js's live-predicate-counting
 * precedent (a baked-in baseline silently drifts from what the live predicate finds).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', 'one-off', 'one-time', 'temp', 'archive', 'archived-sd-scripts']);
// Compared against a slash-normalized filePath (below) — safe on both POSIX and Windows
// (join() on Windows produces backslashes, and callers/tests may pass either separator).
const EXCLUDED_FILES = new Set([
  'lib/fleet/cc-pid-liveness.cjs',
  'scripts/hooks/capture-session-id.cjs',
]);
const PATH_LITERAL_RE = /\.claude[\\/]session-identity|['"]session-identity['"]/;
const SSOT_IMPORT_RE = /cc-pid-liveness\.cjs/;

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {boolean} true iff this file should be flagged (mentions the path, no SSOT import)
 */
export function referencesSessionIdentityPathWithoutSsot(source, filePath) {
  if (EXCLUDED_FILES.has(String(filePath || '').replace(/\\/g, '/'))) return false;
  const text = String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  if (!PATH_LITERAL_RE.test(text)) return false;
  return !SSOT_IMPORT_RE.test(text);
}

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry.startsWith('.') || EXCLUDED_DIR_SEGMENTS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function main() {
  const exts = ['.js', '.mjs', '.cjs'];
  const files = [...walk('lib', exts), ...walk('scripts', exts)];
  const findings = [];
  for (const file of files) {
    let source;
    try { source = readFileSync(file, 'utf8'); } catch { continue; }
    if (referencesSessionIdentityPathWithoutSsot(source, file)) findings.push(file);
  }
  console.log(`session-identity-path-callers-lint (ADVISORY, never blocking): ${findings.length} module(s) reference the session-identity path without importing lib/fleet/cc-pid-liveness.cjs.`);
  for (const f of findings) console.log(`  - ${f}`);
  // Always exits 0 — advisory only, per FR-4's explicit acceptance criteria. Blocking mode is a
  // future SD's decision once a human has reviewed a real baseline, not something this file
  // should flip on its own.
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
