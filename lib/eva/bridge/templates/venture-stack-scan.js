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
// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C (FR-5): SEO-basics venture-template
// requirements, following the v1_metrics precedent above — each is matched two ways:
// (a) a content pattern (Next.js Metadata API openGraph field, a static <meta property
// ="og:...">, a JSON-LD script tag, a hand-rolled route handler), OR (b) a file-based-
// routing path for Next.js App Router's dynamic sitemap.ts/robots.ts generators. KNOWN
// LIMITATION (mirrors the v1_metrics limitation above): a genuinely static file served
// straight from a `public/` directory OUTSIDE `src/`/`lib/` is not seen by this scanner
// (see WALK_ROOTS / realIo below) — closing that would need a third root, out of
// scope for this content/path-only scanner.
const SITEMAP_CONTENT_RE = /['"`]\/sitemap\.xml['"`]/;
const SITEMAP_FILE_PATH_RE = /(?:^|\/)sitemap\.[jt]sx?$/i;
const ROBOTS_CONTENT_RE = /['"`]\/robots\.txt['"`]/;
const ROBOTS_FILE_PATH_RE = /(?:^|\/)robots\.[jt]sx?$/i;
const OG_META_CONTENT_RE = /\bopenGraph\s*:|property=["']og:/;
const STRUCTURED_DATA_CONTENT_RE = /application\/ld\+json|schema\.org/;
// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D: usage-event wiring, mirroring the v1_metrics N+1
// check above. Matched by an RPC-CALL SHAPE anywhere in venture src/lib (not a file-path
// check) because the call site's location is venture-specific (AltifyAI's witness lands in
// lib/, not src/ -- the reason realIo() below walks lib/ too, not just src/, reversing the
// scope decision recorded at the "second root, out of scope" comments above). The RPC name is
// fixed portfolio-wide by the shared venture_usage_events sink -- Child SDs that build/call
// that RPC (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A/-E) MUST use exactly this exported
// constant's value, not re-type the literal.
// KNOWN LIMITATION (adversarial TESTING review): a bare identifier match (no call-shape anchor)
// is satisfied by a comment merely mentioning the RPC, or by vendoring this very file's own
// constant declaration into a venture -- the exact zero-yield failure mode option (b) was
// rejected for above. Anchored instead to two call SHAPES: the RPC identifier immediately
// followed by an opening call-parenthesis (a direct or raw-SQL invocation), or an opening
// call-parenthesis immediately followed by the identifier as a quoted-string argument (a
// wrapped-call shape). This file's own declaration line assigns the identifier to a quoted
// string with neither shape adjacent, so it does not self-satisfy the check on that line alone.
// SELF-MATCHING-REGEX HAZARD: this comment block must NEVER spell out a literal worked example
// pairing the real identifier with a parenthesis (e.g. as sample "code"), because that literal
// text would itself satisfy the regex once this file is vendored into a venture's src/ or lib/
// -- not hypothetical, TESTING reproduced exactly this by vendoring an earlier draft of this
// very comment and watching a venture with zero real RPC calls go green. A sufficiently
// deliberate string can still fake either shape on purpose; this check proves absence of a
// real call, not proof of one. The exact call-shape anchor is also PROVISIONAL pending Child
// A/E's real invocation interface (HTTP fetch vs. raw SQL vs. a wrapper -- not yet decided);
// see this SD's PRD risk entry on that open question.
export const USAGE_EVENT_RPC_NAME = 'fn_submit_venture_usage_event';
const USAGE_EVENT_RPC_NAME_ESCAPED = USAGE_EVENT_RPC_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const USAGE_EVENT_CONTENT_RE = new RegExp(
  `${USAGE_EVENT_RPC_NAME_ESCAPED}\\s*\\(|\\(\\s*['"\`]${USAGE_EVENT_RPC_NAME_ESCAPED}['"\`]`,
);
export const REQUIRED = [
  { id: 'clerk', test: (s) => /['"]@clerk\//.test(s), why: 'Clerk (@clerk/*) is the canonical venture auth' },
  { id: 'replit_postgres', test: (s) => /\bDATABASE_URL\b/.test(s) || /(?:from|import|require\()\s*['"](?:pg|drizzle-orm)/.test(s), why: 'Replit Postgres (DATABASE_URL / pg / drizzle)' },
  { id: 'v1_metrics', test: (s, file) => V1_METRICS_CONTENT_RE.test(s) || (file != null && V1_METRICS_FILE_PATH_RE.test(file)), why: 'GET /v1/metrics implementation (docs/03_protocols_and_standards/venture-metrics-standard.md) — no route/handler referencing "/v1/metrics" (by content or file-based route path) found in venture src' },
  { id: 'sitemap', test: (s, file) => SITEMAP_CONTENT_RE.test(s) || (file != null && SITEMAP_FILE_PATH_RE.test(file)), why: 'sitemap.xml — no route/handler referencing "/sitemap.xml" and no sitemap.ts generator found in venture src' },
  { id: 'robots_txt', test: (s, file) => ROBOTS_CONTENT_RE.test(s) || (file != null && ROBOTS_FILE_PATH_RE.test(file)), why: 'robots.txt — no route/handler referencing "/robots.txt" and no robots.ts generator found in venture src' },
  { id: 'og_meta', test: (s) => OG_META_CONTENT_RE.test(s), why: 'OpenGraph/meta tags — no openGraph metadata field or <meta property="og:..."> tag found in venture src' },
  { id: 'structured_data', test: (s) => STRUCTURED_DATA_CONTENT_RE.test(s), why: 'structured data (JSON-LD) — no application/ld+json script or schema.org reference found in venture src' },
  { id: 'usage_events', test: (s) => USAGE_EVENT_CONTENT_RE.test(s), why: `usage-event RPC (${USAGE_EVENT_RPC_NAME}) — no call to the shared venture-usage-event RPC found in venture src/lib` },
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
// Second root added for SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D (usage_events REQUIRED check):
// AltifyAI's witness call lands in lib/, not src/. See scanForStackViolations below for how
// lib/-rooted files are treated asymmetrically (REQUIRED-eligible, but FORBIDDEN findings
// there are advisory-only, not build-breaking) so this does not retroactively hard-fail CI
// for ventures with pre-existing, previously-unscanned lib/ content.
// PROMOTION CRITERION (adversarial SECURITY review, evidence f27688bb-ee56-4e29-8f56-e17f7644d4da):
// the lib/-exemption is justified by migration safety for content that predates this scanner's
// adoption -- but is currently PERMANENT and UNCONDITIONAL, while zero ventures vendor this
// scanner today, so no lib/ content is actually grandfathered yet. A greenfield venture that
// vendors this scanner next month and later adds a genuinely NEW forbidden file under lib/ gets
// the same permanently-weakened advisory-only treatment as pre-existing legacy content, with no
// expiry or ratchet. Mirrors the existing STATELESS_PROCESS_CHECKS promotion-criterion pattern
// above: PROMOTE lib_root_forbidden findings to build-breaking violations once a venture has
// vendored this scanner and its lib/ tree has been calibrated clean at least once (i.e. treat
// the exemption as a one-time migration grace period per venture, not a permanent carve-out) --
// tracked as a fast-follow, not blocking this SD (see PRD risk entry).
export const WALK_ROOTS = ['src', 'lib'];

/** Default real-fs IO: lists WALK_ROOTS-relative file paths (forward-slash) + reads them. */
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
  for (const r of WALK_ROOTS) walk(join(root, r));
  return { files, read: (rel) => readFileSync(join(root, rel.split('/').join(sep)), 'utf8') };
}

/**
 * Pure scan. `ioOrFactory` is either an io object { files: string[], read(rel)->string }
 * or a factory (root)->io. Returns { violations:[{file,why}], requiredPresent:Set,
 * missing:string[], warnings:[{file,why,class}] } — `warnings` is ADDITIVE
 * (SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-E): observe-only stateless-process
 * findings that must never fail the vendored test wrapper; existing consumers
 * destructure the original keys unchanged.
 *
 * ASYMMETRIC lib/ TREATMENT (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D): realIo() now walks
 * both src/ and lib/ so REQUIRED[] content checks (e.g. usage_events) can see a witness that
 * lives in lib/. FORBIDDEN checks stay build-breaking (violations) for src/ only; a
 * would-be forbidden finding rooted in lib/ downgrades to the additive warnings array
 * instead, so broadening the walk cannot retroactively hard-fail CI for a venture with
 * pre-existing, previously-unscanned lib/ content it never had a chance to fix.
 */
export function scanForStackViolations(root, ioOrFactory = realIo) {
  const io = typeof ioOrFactory === 'function' ? ioOrFactory(root) : ioOrFactory;
  const violations = [];
  const warnings = [];
  const requiredPresent = new Set();
  for (const file of io.files) {
    const isLibRooted = file.startsWith('lib/');
    if (FORBIDDEN_FILE_RE.test(file)) {
      const entry = { file, why: `forbidden auth/OIDC file path (Replit Auth class): ${file}` };
      if (isLibRooted) warnings.push({ ...entry, class: 'lib_root_forbidden' }); else violations.push(entry);
    }
    // File-path-only REQUIRED checks (e.g. Next.js file-based routing) can be satisfied
    // without reading content, so evaluate those even if the file read below fails.
    for (const r of REQUIRED) if (!requiredPresent.has(r.id) && r.test('', file)) requiredPresent.add(r.id);
    let src;
    try { src = io.read(file); } catch { continue; }
    for (const f of FORBIDDEN_IMPORTS) {
      if (f.re.test(src)) {
        const entry = { file, why: f.why };
        if (isLibRooted) warnings.push({ ...entry, class: 'lib_root_forbidden' }); else violations.push(entry);
      }
    }
    for (const r of REQUIRED) if (!requiredPresent.has(r.id) && r.test(src, file)) requiredPresent.add(r.id);
    for (const c of STATELESS_PROCESS_CHECKS) if (c.test(src)) warnings.push({ file, why: c.why, class: 'stateless_process' });
  }
  const missing = REQUIRED.filter((r) => !requiredPresent.has(r.id)).map((r) => r.why);
  return { violations, requiredPresent, missing, warnings };
}

export default { FORBIDDEN_IMPORTS, FORBIDDEN_FILE_RE, REQUIRED, STATELESS_PROCESS_CHECKS, WALK_ROOTS, USAGE_EVENT_RPC_NAME, realIo, scanForStackViolations };
