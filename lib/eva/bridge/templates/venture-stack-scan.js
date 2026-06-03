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
export const REQUIRED = [
  { id: 'clerk', test: (s) => /['"]@clerk\//.test(s), why: 'Clerk (@clerk/*) is the canonical venture auth' },
  { id: 'replit_postgres', test: (s) => /\bDATABASE_URL\b/.test(s) || /(?:from|import|require\()\s*['"](?:pg|drizzle-orm)/.test(s), why: 'Replit Postgres (DATABASE_URL / pg / drizzle)' },
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
 * or a factory (root)->io. Returns { violations:[{file,why}], requiredPresent:Set, missing:string[] }.
 */
export function scanForStackViolations(root, ioOrFactory = realIo) {
  const io = typeof ioOrFactory === 'function' ? ioOrFactory(root) : ioOrFactory;
  const violations = [];
  const requiredPresent = new Set();
  for (const file of io.files) {
    if (FORBIDDEN_FILE_RE.test(file)) {
      violations.push({ file, why: `forbidden auth/OIDC file path (Replit Auth class): ${file}` });
    }
    let src;
    try { src = io.read(file); } catch { continue; }
    for (const f of FORBIDDEN_IMPORTS) if (f.re.test(src)) violations.push({ file, why: f.why });
    for (const r of REQUIRED) if (!requiredPresent.has(r.id) && r.test(src)) requiredPresent.add(r.id);
  }
  const missing = REQUIRED.filter((r) => !requiredPresent.has(r.id)).map((r) => r.why);
  return { violations, requiredPresent, missing };
}

export default { FORBIDDEN_IMPORTS, FORBIDDEN_FILE_RE, REQUIRED, realIo, scanForStackViolations };
