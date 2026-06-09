#!/usr/bin/env node
/**
 * venture_artifacts write-path lint
 * SD-FDBK-FIX-FIX-RESIDUAL-VENTURE-001
 *
 * Codifies the residual-silent-fail audit into a recurring lint. venture_artifacts has
 * NOT-NULL columns (venture_id, lifecycle_stage, artifact_type, title) and a strict
 * artifact_type CHECK. A stage template that omits `title` (or sets a disallowed artifact_type,
 * or references a non-existent column) inserts ZERO rows and SWALLOWS the error — a latent
 * silent data-loss bug (the S21 visual_assets_skipped marker was one such case).
 *
 * This lint statically scans every `.from('venture_artifacts').insert(...|upsert(...)` object
 * literal and FAILS (exit 1) when it:
 *   - omits the NOT-NULL `title` field, OR
 *   - omits the NOT-NULL `lifecycle_stage` field, OR
 *   - references a column that does NOT exist on venture_artifacts (e.g. artifact_id, stage_number).
 * (artifact_type CHECK membership is intentionally NOT statically enforced here — values are often
 * dynamic; that gap is covered by the DB CHECK at runtime and the per-site fixes.)
 *
 * Known-defective sites that need a deeper per-site redesign (non-existent columns + missing
 * NOT-NULL cols + an additive artifact_type CHECK migration) are tracked in the ALLOWLIST below so
 * this lint passes today while preventing NEW regressions and keeping the debt visible. Remove an
 * entry from the allowlist as each site is fixed in the follow-up.
 *
 * Usage: node scripts/lint/venture-artifacts-write-lint.mjs [--json]
 *        npm run lint:venture-artifacts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The real venture_artifacts columns (probed from the live table). An inserted key NOT in this
// set is a non-existent-column defect (the insert errors / silently fails).
export const VENTURE_ARTIFACTS_COLUMNS = new Set([
  'id', 'venture_id', 'lifecycle_stage', 'artifact_type', 'title', 'content', 'file_url',
  'version', 'is_current', 'metadata', 'created_at', 'created_by', 'updated_at', 'quality_score',
  'validation_status', 'validated_at', 'validated_by', 'epistemic_classification',
  'epistemic_evidence', 'artifact_embedding', 'embedding_model', 'embedding_updated_at',
  'indexing_status', 'source', 'artifact_data', 'supports_vision_key', 'supports_plan_key', 'platform',
]);

export const REQUIRED_NOT_NULL = ['venture_id', 'lifecycle_stage', 'artifact_type', 'title'];

// Tracked tech-debt: sites that reference non-existent columns / omit NOT-NULL cols and need a
// deeper redesign + an additive artifact_type CHECK migration (srip_quality_check, blueprint_go_live).
// Follow-up: see the completion-flag on SD-FDBK-FIX-FIX-RESIDUAL-VENTURE-001.
export const ALLOWLIST = new Set([
  'scripts/eva/srip/quality-checker.mjs',
  'scripts/eva/srip/venture-integration.mjs',
  'server/routes/stage24.js',
]);

const SCAN_DIRS = ['lib/eva', 'scripts/eva', 'server/routes', 'lib/proving-companion'];
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.ts']);
const EXCLUDE_RE = /(\.test\.|\.spec\.|node_modules|\.worktrees|archive|one-off)/i;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    // Test exclusions against the path RELATIVE to REPO_ROOT — the absolute path may itself sit
    // inside a `.worktrees/<sd>` checkout, which would otherwise exclude everything.
    const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
    if (EXCLUDE_RE.test(rel)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

// Strip `//` line comments and `/* */` block comments, respecting string literals (so a `//`
// inside a string isn't treated as a comment). Keeps lengths/keys intact for static parsing.
export function stripComments(src) {
  let out = '';
  let str = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (str) {
      out += c;
      if (c === '\\') { out += (n ?? ''); i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { str = c; out += c; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

// Extract the object literal passed to .insert(/.upsert( immediately after .from('venture_artifacts').
// Returns an array of { objText, index } for each venture_artifacts write in the file.
export function extractVentureArtifactWrites(content) {
  const writes = [];
  const re = /\.from\(\s*['"]venture_artifacts['"]\s*\)\s*\.(insert|upsert)\(\s*\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    // brace-match from the '{' that re consumed (last char of the match), skipping string
    // literals so a '}' INSIDE a string does not prematurely close the object.
    let depth = 1;
    let i = re.lastIndex;
    let str = null;
    for (; i < content.length && depth > 0; i++) {
      const c = content[i];
      if (str) {
        if (c === '\\') { i++; continue; }
        if (c === str) str = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { str = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    writes.push({ objText: content.slice(re.lastIndex, i - 1), index: m.index });
  }
  return writes;
}

// Top-level keys of an object literal — handles BOTH `key: value` and ES6 property shorthand
// (`key,` / `key}`). Nested {}/[]/() are skipped via depth tracking so only depth-0 keys count.
export function topLevelKeys(objText) {
  const keys = [];
  // Record the char positions that are at object depth 0 (outside any nested {}/[]/()).
  // Skip string-literal contents so brackets/parens INSIDE strings (e.g. 'foo (bar)') don't
  // corrupt the depth count.
  const depthZero = new Set();
  let d = 0;
  let str = null; // current string-quote char, or null
  for (let i = 0; i < objText.length; i++) {
    const c = objText[i];
    if (str) {
      if (c === '\\') { i++; continue; }       // skip escaped char
      if (c === str) str = null;               // close string
      continue;                                 // inside a string: ignore brackets
    }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (d === 0) depthZero.add(i);
  }
  // `key:` (explicit) OR shorthand `key` followed by `,` / end-of-object / newline-then-`,`.
  const re = /([A-Za-z_$][\w$]*)\s*(:|,|$)/gm;
  let mm;
  while ((mm = re.exec(objText)) !== null) {
    if (!depthZero.has(mm.index)) continue;
    // Skip the value side of an explicit `key: value` (e.g. `is_current: true` — `true` is not a key).
    // A real key is preceded (ignoring whitespace) by `{`, `,`, or start-of-object.
    const before = objText.slice(0, mm.index).replace(/\s+$/, '');
    const prev = before.length ? before[before.length - 1] : '{';
    if (prev === '{' || prev === ',') keys.push(mm[1]);
  }
  return keys;
}

export function lintFile(relPath, content) {
  const violations = [];
  for (const w of extractVentureArtifactWrites(stripComments(content))) {
    const keys = topLevelKeys(w.objText);
    const keySet = new Set(keys);
    for (const req of REQUIRED_NOT_NULL) {
      if (!keySet.has(req)) violations.push(`${relPath}: venture_artifacts write missing NOT-NULL '${req}'`);
    }
    for (const k of keys) {
      if (!VENTURE_ARTIFACTS_COLUMNS.has(k)) {
        violations.push(`${relPath}: venture_artifacts write references non-existent column '${k}'`);
      }
    }
  }
  return violations;
}

function main() {
  const json = process.argv.includes('--json');
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(REPO_ROOT, d)));
  const allViolations = [];
  const allowlisted = [];
  for (const f of files) {
    const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
    const content = fs.readFileSync(f, 'utf8');
    const v = lintFile(rel, content);
    if (v.length === 0) continue;
    if (ALLOWLIST.has(rel)) allowlisted.push(...v);
    else allViolations.push(...v);
  }
  if (json) {
    console.log(JSON.stringify({ violations: allViolations, allowlisted }, null, 2));
  } else {
    console.log(`venture_artifacts write-path lint — scanned ${files.length} files`);
    if (allowlisted.length) {
      console.log(`\n  ${allowlisted.length} ALLOWLISTED (tracked tech-debt, see SD-FDBK-FIX-FIX-RESIDUAL-VENTURE-001 follow-up):`);
      for (const v of allowlisted) console.log(`    ~ ${v}`);
    }
    if (allViolations.length) {
      console.log(`\n  ❌ ${allViolations.length} VIOLATION(S):`);
      for (const v of allViolations) console.log(`    - ${v}`);
      console.log('\n  Fix: every venture_artifacts insert/upsert must set venture_id, lifecycle_stage, artifact_type, AND title, and only real columns.');
    } else {
      console.log('  ✅ No new venture_artifacts write-path violations.');
    }
  }
  process.exit(allViolations.length > 0 ? 1 : 0);
}

const invokedPath = process.argv[1];
if (invokedPath && (import.meta.url === `file://${invokedPath}` || import.meta.url === `file:///${invokedPath.replace(/\\/g, '/')}`)) {
  main();
}
