/**
 * CI invariant T2 — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-8.
 *
 * Supabase-write allowlist for eva-support code paths.
 *
 * Allowed write targets (literal table names only):
 *   - eva_support_decision_log     — Phase 2 envelope + Phase 3 audit rows
 *   - eva_todoist_intake           — Phase 1 intake + Phase 3 sd_refs column
 *   - eva_support_research_cache   — Phase 2 cache
 *
 * Forbidden write targets (most importantly):
 *   - strategic_directives_v2      — EVA must NEVER write to SDs (R4 mitigation)
 *   - any other table              — out of scope for eva-support
 *
 * Detection: regex scan for `.from('TABLE')` followed (in order on the chained
 * builder) by a write op `.insert / .update / .upsert / .delete`. Multi-line
 * chains are tolerated by scanning whole-file for the pattern.
 *
 * Non-literal .from(variable) is FLAGGED as a violation — we cannot statically
 * verify the table name, and the conservative posture is to require literals.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SCAN_DIRS = ['lib/eva-support', 'scripts/eva-support'];

const ALLOWED_WRITE_TABLES = new Set([
  'eva_support_decision_log',     // Phase 2 envelope + Phase 3 audit
  'eva_todoist_intake',           // Phase 1 intake + Phase 3 sd_refs column
  'eva_support_research_cache',   // Phase 2 cache
  'eva_friday_outcomes',          // Phase 2 Friday meeting integration (lib/eva-support/friday-outcome-bridge.js)
]);

// Match .from('TABLE') OR .from("TABLE"). Capture group 1 = table name.
const FROM_LITERAL_RE = /\.from\(\s*['"]([^'"]+)['"]\s*\)/g;
// Match .from(variable_name) — needs constant resolution before flagging.
const FROM_NON_LITERAL_RE = /\.from\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
const WRITE_OPS_RE = /\.(insert|update|upsert|delete)\s*\(/;
// Resolve obvious top-level string-literal constants. Matches:
//   const NAME = 'literal'
//   const NAME = "literal"
// Does NOT resolve template literals or expressions (those remain flagged).
const CONST_STRING_DECL_RE = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g;

function walkJSFiles(p, acc = []) {
  if (!existsSync(p)) return acc;
  const st = statSync(p);
  if (st.isFile()) {
    if (/\.(js|mjs|ts|cjs)$/.test(p)) acc.push(p);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  if (p.endsWith('node_modules')) return acc;
  for (const e of readdirSync(p)) walkJSFiles(join(p, e), acc);
  return acc;
}

/**
 * Resolve `const TABLE = 'literal'` declarations in source.
 * Returns Map<identifier, literalValue>.
 */
function resolveStringConstants(source) {
  const map = new Map();
  CONST_STRING_DECL_RE.lastIndex = 0;
  let m;
  while ((m = CONST_STRING_DECL_RE.exec(source))) {
    map.set(m[1], m[2]);
  }
  return map;
}

/**
 * For each `.from('TABLE')` in source, check whether ANY write op (insert,
 * update, upsert, delete) appears within a reasonable window after it.
 * The window is "up to next semicolon or end-of-file" — captures multi-line
 * chained queries.
 *
 * `.from(variable)` is resolved against in-file string-literal constants
 * before being flagged as non-literal.
 */
function findWriteTargets(source) {
  const targets = [];
  const constants = resolveStringConstants(source);
  let m;
  FROM_LITERAL_RE.lastIndex = 0;
  while ((m = FROM_LITERAL_RE.exec(source))) {
    const tableName = m[1];
    const startIdx = m.index;
    const slice = source.slice(startIdx, startIdx + 600);
    if (WRITE_OPS_RE.test(slice)) {
      targets.push({ tableName, startIdx, kind: 'literal' });
    }
  }
  FROM_NON_LITERAL_RE.lastIndex = 0;
  while ((m = FROM_NON_LITERAL_RE.exec(source))) {
    const varName = m[1];
    const startIdx = m.index;
    const slice = source.slice(startIdx, startIdx + 600);
    if (!WRITE_OPS_RE.test(slice)) continue;

    // Try to resolve the variable against in-file string-literal constants.
    if (constants.has(varName)) {
      targets.push({ tableName: constants.get(varName), startIdx, kind: 'resolved-constant', via: varName });
    } else {
      targets.push({ tableName: `<variable:${varName}>`, startIdx, kind: 'non-literal' });
    }
  }
  return targets;
}

describe('T2: eva-support — Supabase writes restricted to allowlist', () => {
  it('finds zero writes outside the allowlist (and zero non-literal .from(variable) write targets)', () => {
    const violations = [];

    for (const dir of SCAN_DIRS) {
      const dirPath = join(REPO_ROOT, dir);
      for (const file of walkJSFiles(dirPath)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
        if (rel.includes('/__tests__/')) continue;

        const content = readFileSync(file, 'utf8');
        const targets = findWriteTargets(content);
        for (const t of targets) {
          if (t.kind === 'non-literal') {
            violations.push({ file: rel, target: t.tableName, reason: 'non-literal .from(var) — table name cannot be statically verified (define as `const TABLE = "literal";` or inline the literal)' });
            continue;
          }
          if (!ALLOWED_WRITE_TABLES.has(t.tableName)) {
            const via = t.kind === 'resolved-constant' ? ` (via const ${t.via})` : '';
            violations.push({ file: rel, target: t.tableName, reason: `not in allowlist${via} — allowed: ${[...ALLOWED_WRITE_TABLES].join(', ')}` });
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  - ${v.file} → ${v.target}\n    ${v.reason}`).join('\n');
      throw new Error(
        `T2 invariant FAILED: ${violations.length} write(s) outside the eva-support allowlist.\n` +
        `EVA Support may write ONLY to: ${[...ALLOWED_WRITE_TABLES].join(', ')}.\n` +
        `In particular, strategic_directives_v2 writes are CRITICAL violations\n` +
        `(SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5 R4 mitigation).\n\nViolations:\n${message}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
