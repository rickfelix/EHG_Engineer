/**
 * Golden-reference isolation law — static import-boundary scanner
 * SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-A (scaffold child)
 *
 * References must be consumable without estate context, so they may import
 * ONLY: node: builtins + a small vetted npm set. Anything resolving into the
 * repo's own source tree is a violation, and NON-LITERAL specifiers
 * (import(variable) / require(expr)) are conservatively flagged — if the
 * scanner cannot statically clear it, it fails (precedent:
 * tests/ci/eva-support-supabase-write-allowlist.test.js).
 *
 * Exported as a lib module (not test-local) so domain children's tests and
 * the tiered orchestrator can reuse the same law.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

export const ALLOWED_NPM = Object.freeze(['@supabase/supabase-js', 'dotenv', 'vitest']);
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

// Literal static/dynamic import + require specifiers.
const LITERAL_SPEC = /(?:import\s+(?:[\s\S]*?from\s+)?|import\s*\(\s*|require\s*\(\s*)(['"])([^'"]+)\1/g;
// Non-literal dynamic forms: import( or require( NOT immediately followed by a
// string literal — cannot be statically cleared, so they are violations.
const NON_LITERAL = /(?:\bimport|\brequire)\s*\(\s*(?!['")])/g;

/** Classify one specifier against the allowlist. */
export function classifySpecifier(spec) {
  if (BUILTINS.has(spec)) return 'builtin';
  if (ALLOWED_NPM.some((p) => spec === p || spec.startsWith(p + '/'))) return 'vetted_npm';
  if (spec.startsWith('.') || spec.startsWith('/')) return 'violation:relative_or_absolute';
  return 'violation:unvetted_package';
}

/** Scan one file's content. CRLF-safe (regexes are line-agnostic). */
export function scanContent(content, filePath) {
  const violations = [];
  let m;
  LITERAL_SPEC.lastIndex = 0;
  while ((m = LITERAL_SPEC.exec(content)) !== null) {
    const verdict = classifySpecifier(m[2]);
    if (verdict.startsWith('violation')) violations.push({ file: filePath, specifier: m[2], kind: verdict });
  }
  NON_LITERAL.lastIndex = 0;
  while ((m = NON_LITERAL.exec(content)) !== null) {
    violations.push({ file: filePath, specifier: '<non-literal>', kind: 'violation:non_literal_import' });
  }
  return violations;
}

/** Walk a directory of reference files and scan each. */
export function scanReferencesDir(rootDir, relDir = 'golden-references') {
  const violations = [];
  const files = [];
  (function walk(rel) {
    let entries;
    try { entries = readdirSync(join(rootDir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.(m?c?js|ts)$/.test(e.name)) files.push(r);
    }
  })(relDir);
  for (const rel of files) {
    let content;
    try { content = readFileSync(join(rootDir, rel), 'utf8'); } catch { continue; }
    violations.push(...scanContent(content, rel));
  }
  return { scanned_files: files.length, violations };
}
