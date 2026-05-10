/**
 * AST conformance test for `_lead-enrich-*.mjs` scripts.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-3.
 *
 * Scans the repo for `_lead-enrich-*.mjs` and asserts each file either:
 *   (a) imports `lead-precheck-helpers` AND has ≥1 verify* call, OR
 *   (b) contains a `// PRECHECK_EXEMPT: <rationale ≥30 chars>` comment block.
 *
 * Uses acorn for AST detection of BOTH static and dynamic imports.
 * Rubber-stamp blocklist rejects /^(TODO|fix later|no time|temporary|tbd)$/i
 * rationales even at ≥30 chars (full match check).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');

const VERIFY_FN_NAMES = new Set([
  'verifyOriginMainPremise',
  'verifyJoinShape',
  'verifyHelperCoverage',
]);

const PRECHECK_EXEMPT_RE = /\/\/\s*PRECHECK_EXEMPT:\s*(.+)$/m;
const RUBBER_STAMP_BLOCKLIST = /^(TODO|fix later|no time|temporary|tbd|placeholder)\b/i;
const RATIONALE_MIN_CHARS = 30;

const SCAN_DIRS = ['scripts', 'tests'];
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.worktrees', 'archived-prd-scripts', 'archived-sd-scripts']);

// The canonical template itself is exempt by allowlist (not by annotation,
// though it carries one belt-and-suspenders).
const TEMPLATE_ALLOWLIST = new Set(['scripts/templates/_lead-enrich-template.mjs']);

function findLeadEnrichFiles(rootAbs) {
  const matches = [];
  function walk(dirAbs) {
    let ents;
    try { ents = readdirSync(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        if (ent.name.startsWith('archived-')) continue;
        walk(join(dirAbs, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      // Match _lead-enrich-*.mjs files (template name is _lead-enrich-template.mjs and is allowlisted)
      if (/^_lead-enrich-.+\.mjs$/.test(ent.name)) {
        matches.push(join(dirAbs, ent.name));
      }
    }
  }
  for (const sub of SCAN_DIRS) {
    const dirAbs = resolve(rootAbs, sub);
    try {
      const st = statSync(dirAbs);
      if (st.isDirectory()) walk(dirAbs);
    } catch { /* skip missing */ }
  }
  return matches;
}

/**
 * Parse source with acorn; walk AST to detect:
 *  - static imports of lead-precheck-helpers
 *  - dynamic imports (await import('...lead-precheck-helpers...'))
 *  - calls to verify* functions
 */
function analyzeAst(source) {
  const result = {
    hasHelperImport: false,
    hasVerifyCall: false,
    parseError: null,
  };
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
  } catch (e) {
    result.parseError = e.message;
    return result;
  }

  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    // Static import: `import { verifyXxx } from '.../lead-precheck-helpers.js'`
    if (node.type === 'ImportDeclaration') {
      if (typeof node.source?.value === 'string' && node.source.value.includes('lead-precheck-helpers')) {
        result.hasHelperImport = true;
      }
    }
    // Dynamic import: `await import('.../lead-precheck-helpers.js')`
    if (node.type === 'ImportExpression') {
      if (node.source?.type === 'Literal' && typeof node.source.value === 'string' && node.source.value.includes('lead-precheck-helpers')) {
        result.hasHelperImport = true;
      }
    }
    // Call expressions: verifyOriginMainPremise(...), verifyJoinShape(...), verifyHelperCoverage(...)
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee?.type === 'Identifier' && VERIFY_FN_NAMES.has(callee.name)) {
        result.hasVerifyCall = true;
      }
      if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' && VERIFY_FN_NAMES.has(callee.property.name)) {
        result.hasVerifyCall = true;
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) visit(c, node);
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        visit(child, node);
      }
    }
  }
  visit(ast, null);
  return result;
}

function checkPrecheckExempt(source) {
  const m = source.match(PRECHECK_EXEMPT_RE);
  if (!m) return { hasExempt: false, rationale: null, valid: false, reason: 'missing-annotation' };
  const rationale = m[1].trim();
  if (rationale.length < RATIONALE_MIN_CHARS) {
    return { hasExempt: true, rationale, valid: false, reason: 'rationale-too-short' };
  }
  if (RUBBER_STAMP_BLOCKLIST.test(rationale)) {
    return { hasExempt: true, rationale, valid: false, reason: 'rubber-stamp-blocklist' };
  }
  return { hasExempt: true, rationale, valid: true, reason: 'ok' };
}

describe('SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-3 — _lead-enrich-*.mjs conformance', () => {
  const files = findLeadEnrichFiles(repoRoot);

  it('scan finds at least the canonical template', () => {
    const relPaths = files.map((f) => relative(repoRoot, f).replaceAll(sep, '/'));
    expect(relPaths.length, `expected ≥1 _lead-enrich-*.mjs file. Found: ${JSON.stringify(relPaths)}`).toBeGreaterThan(0);
  });

  for (const fileAbs of files) {
    const relPath = relative(repoRoot, fileAbs).replaceAll(sep, '/');
    const allowlisted = TEMPLATE_ALLOWLIST.has(relPath);
    it(`${relPath} — conforms (helpers+verify OR PRECHECK_EXEMPT) ${allowlisted ? '[template-allowlisted]' : ''}`, () => {
      const src = readFileSync(fileAbs, 'utf8');
      const ast = analyzeAst(src);
      const exempt = checkPrecheckExempt(src);

      if (allowlisted) {
        // Template still must be parseable
        expect(ast.parseError, `template parse error: ${ast.parseError}`).toBeNull();
        return;
      }

      const helpersOk = ast.hasHelperImport && ast.hasVerifyCall;
      const exemptOk = exempt.valid;

      const reason = [
        `parseError=${ast.parseError ?? 'none'}`,
        `hasHelperImport=${ast.hasHelperImport}`,
        `hasVerifyCall=${ast.hasVerifyCall}`,
        `exempt=${exempt.hasExempt}/${exempt.reason}/${exempt.rationale ? `${exempt.rationale.length}ch` : 'none'}`,
      ].join(' | ');

      expect(
        helpersOk || exemptOk,
        `${relPath} fails FR-3 conformance: ${reason}`
      ).toBe(true);
    });
  }
});
