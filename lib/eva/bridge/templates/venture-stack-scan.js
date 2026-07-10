// venture-stack-scan — pure venture-stack compliance scanner (no test framework, no deps).
// SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001 (FR-3). Vendored into a venture alongside
// stack-compliance.test.js (the drop-in node:test wrapper). Mirrors the platform single
// source of truth lib/eva/standards/venture-stack-policy.js.
//
// WHY code-level (not just deps): forbidden "Replit Auth" is typically hand-rolled OIDC with
// NO flagged dependency (the DataDistill B1 incident shipped src/lib/auth/oidc.server.ts). So
// the scan reads IMPORTS + FILE PATHS, not only package.json.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Forbidden imports (positive usage in venture src).
export const FORBIDDEN_IMPORTS = [
  { id: 'supabase', re: /(?:from|import|require\()\s*['"]@supabase\//, why: '@supabase import — ventures use Replit Postgres, never Supabase' },
  { id: 'openid_client', re: /(?:from|import|require\()\s*['"]openid-client['"]/, why: 'openid-client — Replit Auth/OIDC is forbidden; auth is Clerk' },
];
// Hand-rolled Replit-Auth / OIDC artifacts, detectable by file path (the B1 class).
export const FORBIDDEN_FILE_RE = /(?:^|[\\/])(?:auth[\\/]oidc\.|oidc\.server\.|session\.server\.|api\.auth\.)/i;
// Required stack (at least one src file must evidence each).
// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-1): v1_metrics makes
// docs/03_protocols_and_standards/venture-metrics-standard.md's GET /v1/metrics
// endpoint a venture-template requirement, closing the "zero implementing
// ventures" gap. Matched two ways: (a) a route-path literal in source (Express
// `.get('/v1/metrics', ...)`, template-literal routes), OR (b) a file-based-
// routing path (Next.js App Router `.../v1/metrics/route.ts`, Pages Router
// `.../api/v1/metrics.ts`), since the URL there comes from the folder
// structure and the literal string never appears in content. KNOWN LIMITATION
// (adversarial review, PR #5774): a prefix-mounted-router split across two
// files (e.g. `app.use('/v1', router)` in one file, `router.get('/metrics', ...)`
// in another) is NOT detected — closing that would need cross-file mount
// tracking, out of scope for this content/path-only scanner.
const V1_METRICS_CONTENT_RE = /['"`]\/v1\/metrics['"`]/;
const V1_METRICS_FILE_PATH_RE = /(?:^|\/)(?:api\/)?v1\/metrics(?:\/route)?\.[jt]sx?$/i;
export const REQUIRED = [
  { id: 'clerk', test: (s) => /['"]@clerk\//.test(s), why: 'Clerk (@clerk/*) is the canonical venture auth' },
  { id: 'replit_postgres', test: (s) => /\bDATABASE_URL\b/.test(s) || /(?:from|import|require\()\s*['"](?:pg|drizzle-orm)/.test(s), why: 'Replit Postgres (DATABASE_URL / pg / drizzle)' },
  { id: 'v1_metrics', test: (s, file) => V1_METRICS_CONTENT_RE.test(s) || (file != null && V1_METRICS_FILE_PATH_RE.test(file)), why: 'GET /v1/metrics implementation (docs/03_protocols_and_standards/venture-metrics-standard.md) — no route/handler referencing "/v1/metrics" (by content or file-based route path) found in venture src' },
];
// Stateless-process factory rule (SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-E, deploy
// design §7 risk 6): venture app processes are STATELESS — durable state lives in the
// venture DB or an explicit external store. In-memory rate-limit/session/user stores
// silently evaporate under scale-to-zero and multi-instance fan-out (MarketLens shipped
// this class). WARN-class (observe-only-first, protocol default): results land in the
// scan's additive `warnings` array, never `violations` — PROMOTION CRITERION: treat as
// blocking only after calibration on the first fresh venture with zero false positives.
// Patterns target STORE shapes specifically (store: option absent; module-scope bindings
// NAMED like durable stores), not all in-memory structures.
export const STATELESS_PROCESS_CHECKS = [
  {
    id: 'rate_limit_memory_store',
    test: (s) => /(?:from|import|require\()\s*['"]express-rate-limit['"]/.test(s) && !/\bstore\s*:/.test(s),
    why: 'express-rate-limit without a store: option — default MemoryStore resets on cold start / diverges across instances',
  },
  {
    id: 'session_memory_store',
    test: (s) => /(?:from|import|require\()\s*['"]express-session['"]/.test(s) && !/\bstore\s*:/.test(s),
    why: 'express-session without an external store: — default MemoryStore evaporates sessions on cold start',
  },
  {
    id: 'module_scope_user_store',
    test: (s) => /^(?:export\s+)?(?:const|let|var)\s+(?:users?|sessions?|accounts?)\w*\s*=\s*(?:new\s+Map\s*\(|new\s+Set\s*\(|\{\s*\}|\[\s*\])/m.test(s),
    why: 'module-scope in-memory user/session/account store — durable state must live in the venture DB or an explicit store',
  },
];

const SRC_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/** Default real-fs IO: lists src-relative file paths (forward-slash) + reads them. */
export function realIo(root) {
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SRC_EXT.test(entry)) files.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(join(root, 'src'));
  return { files, read: (rel) => readFileSync(join(root, rel.split('/').join(sep)), 'utf8') };
}

/**
 * Pure scan. `ioOrFactory` is either an io object { files: string[], read(rel)->string }
 * or a factory (root)->io. Returns { violations:[{file,why}], requiredPresent:Set,
 * missing:string[], warnings:[{file,why,class}] } — `warnings` is ADDITIVE
 * (SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-E): observe-only stateless-process
 * findings that must never fail the vendored test wrapper; existing consumers
 * destructure the original keys unchanged.
 */
export function scanForStackViolations(root, ioOrFactory = realIo) {
  const io = typeof ioOrFactory === 'function' ? ioOrFactory(root) : ioOrFactory;
  const violations = [];
  const warnings = [];
  const requiredPresent = new Set();
  for (const file of io.files) {
    if (FORBIDDEN_FILE_RE.test(file)) {
      violations.push({ file, why: `forbidden auth/OIDC file path (Replit Auth class): ${file}` });
    }
    // File-path-only REQUIRED checks (e.g. Next.js file-based routing) can be satisfied
    // without reading content, so evaluate those even if the file read below fails.
    for (const r of REQUIRED) if (!requiredPresent.has(r.id) && r.test('', file)) requiredPresent.add(r.id);
    let src;
    try { src = io.read(file); } catch { continue; }
    for (const f of FORBIDDEN_IMPORTS) if (f.re.test(src)) violations.push({ file, why: f.why });
    for (const r of REQUIRED) if (!requiredPresent.has(r.id) && r.test(src, file)) requiredPresent.add(r.id);
    for (const c of STATELESS_PROCESS_CHECKS) if (c.test(src)) warnings.push({ file, why: c.why, class: 'stateless_process' });
  }
  const missing = REQUIRED.filter((r) => !requiredPresent.has(r.id)).map((r) => r.why);
  return { violations, requiredPresent, missing, warnings };
}

export default { FORBIDDEN_IMPORTS, FORBIDDEN_FILE_RE, REQUIRED, STATELESS_PROCESS_CHECKS, realIo, scanForStackViolations };
