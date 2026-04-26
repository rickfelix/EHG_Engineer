#!/usr/bin/env node
/**
 * audit-stage17-urls.mjs
 *
 * Cross-repo Stage 17 URL drift audit. Catches the QF-20260425-422 class:
 * frontend code referencing `/api/stage17/*` (or stale `/api/stitch/*`) URLs
 * that don't match the backend route registry.
 *
 * Backend registry: parses EHG_Engineer/server/routes/stage17.js for all
 * `router.<method>('<path>'` definitions, prepends `/api/stage17`.
 *
 * Frontend scan: greps EHG/src/** for /api/stage17/* and /api/stitch/* URL
 * literals. Compares each against the backend registry; mismatch = exit 1.
 *
 * SD-LEO-INFRA-STAGE17-CROSS-REPO-001 — Arm B
 *
 * Usage:
 *   node scripts/audit-stage17-urls.mjs                  # audit live repos
 *   node scripts/audit-stage17-urls.mjs --backend <path> --frontend <path>
 *
 * Exit codes:
 *   0  — all URLs match (or no URLs found)
 *   1  — one or more URL drift cases found (diff printed to stderr)
 *   2  — invocation error (paths missing, parse failure)
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';

const STAGE17_PREFIX = '/api/stage17';
const STALE_PREFIX = '/api/stitch';

/** Parse CLI flags `--key value`. */
function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}

/**
 * Extract registered routes from stage17.js.
 * Matches `router.<method>('<path>'` and converts `:ventureId` to a regex.
 *
 * Returns an array of { method, pathTemplate, regex } objects.
 */
export function parseBackendRoutes(stage17JsPath) {
  const src = readFileSync(stage17JsPath, 'utf8');
  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const routes = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, method, pathTemplate] = m;
    const fullPath = STAGE17_PREFIX + pathTemplate;
    const regex = new RegExp(
      '^' +
        fullPath.replace(/\//g, '\\/').replace(/:[a-zA-Z_]+/g, '[^/]+') +
        '$'
    );
    routes.push({ method: method.toUpperCase(), pathTemplate: fullPath, regex });
  }
  return routes;
}

/**
 * Walk a directory recursively, returning .ts/.tsx/.js/.jsx files.
 * Skips node_modules, dist, build, .git, .next, .vite, coverage.
 */
function walkSource(rootDir) {
  const SKIP = new Set([
    'node_modules', 'dist', 'build', '.git', '.next', '.vite',
    'coverage', '.cache', '.turbo'
  ]);
  const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (SKIP.has(ent.name)) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) {
        const dot = ent.name.lastIndexOf('.');
        if (dot > 0 && EXTS.has(ent.name.slice(dot))) out.push(full);
      }
    }
  }
  return out;
}

// Strip JS/TS comments from source so commented-out URLs don't trigger findings.
// Handles slash-slash line comments and slash-star block comments. Preserves
// line structure (blanks the comment text) so line numbers in findings stay
// correct. Not a full JS parser — false negatives possible if a URL appears
// inside a string that itself contains a slash-slash sequence.
export function stripComments(src) {
  let out = src;
  // Block comments: /* ... */ — replace each newline-preserving
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments: // ... to EOL — preserve the newline.
  // Negative lookbehind for ':' so URL schemes (http://, https://) are NOT eaten.
  out = out.replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

/**
 * Extract `/api/stage17/*` and `/api/stitch/*` URL literals from a file.
 * Captures static strings and template literals (substituting `:p` for ${...}).
 * Skips comments. Truncates query strings (`?...`) since they don't affect routing.
 *
 * Returns array of { url, line }.
 */
export function extractUrls(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const src = stripComments(raw);
  const lines = src.split('\n');
  const out = [];
  // Match `/api/stage17/...` or `/api/stitch/...` up to the first quote/backtick/whitespace/?
  const re = /(\/api\/(?:stage17|stitch)[^\s'"`)\\?]*)/g;
  for (let i = 0; i < lines.length; i++) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(lines[i])) !== null) {
      // Normalize template-literal interpolations:
      //   `/foo/${id}/bar`        -> `/foo/:p/bar`  (slash-bracketed = path segment)
      //   `/foo/bar${queryParam}` -> `/foo/bar`     (no leading slash = query suffix; drop)
      let url = m[1]
        .replace(/\/\$\{[^}]+\}/g, '/:p')   // slash-prefixed interpolation = path param
        .replace(/\$\{[^}]+\}.*$/, '');     // any remaining interpolation = query suffix; truncate
      if (url.length === 0) continue;
      out.push({ url, line: i + 1 });
    }
  }
  return out;
}

/**
 * Match a URL against backend routes. Treat `:p` (interpolation marker) and
 * `:ventureId` (route param) interchangeably for path-segment matching.
 *
 * Returns true if URL matches any registered route.
 */
export function urlMatchesAnyRoute(url, routes) {
  // Replace any `:p` interpolation with `:x` so the regex `[^/]+` matches it
  const normalized = url.replace(/:p/g, ':x');
  return routes.some((r) => r.regex.test(normalized));
}

/**
 * Main audit. Returns { ok, findings: [{file, line, url, reason}] }.
 */
export function audit({ backendPath, frontendRoot }) {
  if (!statSync(backendPath, { throwIfNoEntry: false })) {
    throw new Error(`Backend file not found: ${backendPath}`);
  }
  if (!statSync(frontendRoot, { throwIfNoEntry: false })) {
    throw new Error(`Frontend root not found: ${frontendRoot}`);
  }

  const routes = parseBackendRoutes(backendPath);
  if (routes.length === 0) {
    throw new Error(`No routes parsed from ${backendPath} — registry empty, refusing to audit`);
  }

  const findings = [];
  const files = walkSource(frontendRoot);
  for (const file of files) {
    const urls = extractUrls(file);
    for (const { url, line } of urls) {
      if (url.startsWith(STALE_PREFIX)) {
        findings.push({ file, line, url, reason: 'STALE_PREFIX' });
        continue;
      }
      if (!urlMatchesAnyRoute(url, routes)) {
        findings.push({ file, line, url, reason: 'UNREGISTERED_ROUTE' });
      }
    }
  }
  return { ok: findings.length === 0, findings, routeCount: routes.length, fileCount: files.length };
}

/**
 * Locate the sibling EHG repo's src/ by walking up from a starting dir.
 * Worktree-aware: handles both `_EHG/EHG_Engineer/...` and
 * `_EHG/EHG_Engineer/.worktrees/<sd>/...` callers.
 *
 * Returns the first existing `<dir>/ehg/src` ancestor or null.
 */
function findEhgFrontendRoot(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'ehg', 'src');
    if (statSync(candidate, { throwIfNoEntry: false })) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function main() {
  const args = parseArgs(argv.slice(2));
  // Resolve repo paths relative to this script's known layout
  const repoRoot = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
  const backendPath = args.backend
    ? resolve(args.backend)
    : join(repoRoot, 'server', 'routes', 'stage17.js');
  const frontendRoot = args.frontend
    ? resolve(args.frontend)
    : findEhgFrontendRoot(repoRoot);

  if (!frontendRoot) {
    stderr.write(
      `audit-stage17-urls: could not locate EHG frontend (looked for <ancestor>/ehg/src up from ${repoRoot}).\n` +
      `  Pass --frontend <path> to override.\n`
    );
    exit(2);
  }

  let result;
  try {
    result = audit({ backendPath, frontendRoot });
  } catch (err) {
    stderr.write(`audit-stage17-urls: ${err.message}\n`);
    exit(2);
  }

  if (result.ok) {
    stdout.write(
      `audit-stage17-urls: OK — ${result.routeCount} backend routes, ` +
      `${result.fileCount} frontend files scanned, no drift\n`
    );
    exit(0);
  }

  stderr.write(
    `audit-stage17-urls: DRIFT DETECTED — ${result.findings.length} finding(s)\n` +
    `(${result.routeCount} backend routes, ${result.fileCount} frontend files scanned)\n\n`
  );
  for (const f of result.findings) {
    stderr.write(`  ${f.reason}  ${f.file}:${f.line}\n    ${f.url}\n\n`);
  }
  stderr.write(`See docs/architecture/stage17-contracts.md §1 for the registered route set.\n`);
  exit(1);
}

// Only run main() when invoked directly (not when imported by tests)
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
      || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
  } catch { return false; }
})();
if (invokedDirectly) main();
