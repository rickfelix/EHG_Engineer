#!/usr/bin/env node
/**
 * metadata.is_* Orphan / Phantom Flag Lint
 * SD-LEO-INFRA-LINT-METADATA-ORPHAN-001
 *
 * Codifies the one-time audit SD-LEO-INFRA-AUDIT-METADATA-ORPHAN-001 into a
 * recurring lint. Statically classifies every `metadata.is_*` boolean flag by
 * pairing its production WRITERS and READERS:
 *
 *   HEALTHY          writers >= 1 AND readers >= 1
 *   ORPHAN           writers >= 1 AND readers == 0   (written, never read — dead write)
 *   PHANTOM          writers == 0 AND readers >= 1   (read, never written — always undefined)
 *   SCAFFOLDING-ONLY writers == 0 AND readers == 0   (defensive; not collected)
 *
 * Fails (exit 1) on any ORPHAN or PHANTOM flag not in the allow-list.
 *
 * Metadata-SCOPED matching keeps it low-noise: only `metadata.is_x` /
 * `metadata->>'is_x'` reads and `is_x:` keys INSIDE a metadata object literal /
 * jsonb writes count. Identically-named table columns (sd.is_active),
 * plpgsql locals (is_venture_agent), and local result-objects
 * (details: { is_orchestrator: true }) are NOT metadata flags and are ignored.
 *
 * Usage:
 *   node scripts/lint/metadata-flag-lint.mjs [--json] [--root <dir>]
 *   npm run lint:metadata-flags
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.join(__dirname, 'metadata-flag-allowlist.json');

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.sql']);

// Non-production paths: their writes/reads do NOT count toward classification.
const EXCLUDE_DIR_SEGMENTS = [
  'node_modules', '.git', '.worktrees', '.cursor', 'archive', 'one-off',
  '__tests__', 'tests', 'test', 'coverage', 'dist', 'build', 'applications',
  'press-kit', '.next', 'playwright-report',
  'lint', // this tool + its allow-list/docs are not production metadata usage
];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;

/** Strip comments so doc/example mentions of metadata.is_* never count as code. */
export function stripComments(src, ext) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' '); // block comments (JS + SQL)
  if (ext === '.sql') out = out.replace(/--[^\n]*/g, ' '); // SQL line comments
  else out = out.replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1'); // JS line comments (guard :// and strings)
  return out;
}

const FLAG = 'is_[a-z0-9_]+';

// ── Pure extraction (exported for unit tests) ────────────────────────────────

/** Capture the balanced {...} body starting at the first '{' at/after openFrom. */
function extractBalanced(src, openFrom) {
  const openIdx = src.indexOf('{', openFrom);
  if (openIdx < 0) return '';
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx);
}

/** Object-literal bodies that ARE a metadata value (metadata: {...}, metadata = {...}, {...metadata, ...}). */
function metadataObjectBodies(src) {
  const bodies = [];
  for (const re of [/\bmetadata\s*:\s*\{/g, /\bmetadata\s*=\s*\{/g]) {
    let m;
    while ((m = re.exec(src))) bodies.push(extractBalanced(src, m.index + m[0].length - 1));
  }
  // Spread of an existing metadata value into a new object literal. Recognizes
  // `{ ...metadata }`, `{ ...row.metadata }`, and `{ ...(row?.metadata || {}) }`
  // — the last form is common in update paths (e.g. coordinator.is_coordinator)
  // and was previously a false-negative source.
  const spread = /\{\s*\.\.\.\s*\(?\s*[\w$?.]*\bmetadata\b/g;
  let s;
  while ((s = spread.exec(src))) bodies.push(extractBalanced(src, s.index));
  return bodies;
}

/** Extract metadata.is_* reads + writes from JS/TS source. Returns {reads:Set, writes:Set}. */
export function extractFromJs(src) {
  const reads = new Set();
  const writes = new Set();

  // READS: metadata.is_x / metadata?.is_x  (not the LHS of an assignment)
  for (const m of src.matchAll(new RegExp(`\\bmetadata\\s*\\??\\.\\s*(${FLAG})\\b(?!\\s*=(?!=))`, 'gi'))) {
    reads.add(m[1]);
  }
  // WRITES (assignment): metadata.is_x = ...
  for (const m of src.matchAll(new RegExp(`\\bmetadata\\s*\\??\\.\\s*(${FLAG})\\s*=(?!=)`, 'gi'))) {
    writes.add(m[1]);
  }
  // WRITES (object literal): is_x: ... or shorthand is_x , / } inside a metadata object body
  for (const body of metadataObjectBodies(src)) {
    for (const m of body.matchAll(new RegExp(`\\b(${FLAG})\\s*[:,}]`, 'gi'))) writes.add(m[1]);
  }
  return { reads, writes };
}

/** Extract metadata.is_* reads + writes from SQL source. Returns {reads:Set, writes:Set}. */
export function extractFromSql(src) {
  const reads = new Set();
  const writes = new Set();
  // READS: metadata->>'is_x' / metadata->'is_x'. The leading \b prevents matching the
  // tail of a DIFFERENT jsonb column such as governance_metadata->>'is_x'.
  for (const m of src.matchAll(new RegExp(`\\bmetadata\\s*->>?\\s*'(${FLAG})'`, 'gi'))) reads.add(m[1]);
  // WRITES (jsonb_build_object): count only when the object is assigned into a metadata
  // column, NOT a bare function-return payload (e.g. RETURN jsonb_build_object('is_claimed',
  // ...)). Require a `metadata` token within the preceding window.
  for (const m of src.matchAll(new RegExp(`jsonb_build_object\\s*\\(\\s*'(${FLAG})'`, 'gi'))) {
    if (/\bmetadata\b/i.test(src.slice(Math.max(0, m.index - 80), m.index))) writes.add(m[1]);
  }
  // WRITES (jsonb_set path '{is_x}' and jsonb object literal "is_x":) — these forms occur
  // only inside metadata-shaped jsonb (jsonb_set(metadata,'{is_x}',...) / '{"is_x": ...}').
  for (const m of src.matchAll(new RegExp(`'\\{\\s*(${FLAG})\\s*\\}'`, 'gi'))) writes.add(m[1]);
  for (const m of src.matchAll(new RegExp(`"(${FLAG})"\\s*:`, 'gi'))) writes.add(m[1]);
  return { reads, writes };
}

// ── Pure classifier (exported for unit tests) ────────────────────────────────

export const CLASSIFICATIONS = { HEALTHY: 'HEALTHY', ORPHAN: 'ORPHAN', PHANTOM: 'PHANTOM', SCAFFOLDING: 'SCAFFOLDING-ONLY' };

/**
 * @param {Map<string,number>|Object} writerCounts flag -> #writers
 * @param {Map<string,number>|Object} readerCounts flag -> #readers
 * @param {Set<string>} allow flags suppressed by the (validated) allow-list
 * @returns {Array<{flag,writers,readers,classification,allowlisted,fail}>}
 */
export function classifyFlags(writerCounts, readerCounts, allow = new Set()) {
  const w = writerCounts instanceof Map ? writerCounts : new Map(Object.entries(writerCounts));
  const r = readerCounts instanceof Map ? readerCounts : new Map(Object.entries(readerCounts));
  const flags = new Set([...w.keys(), ...r.keys()]);
  const rows = [];
  for (const flag of [...flags].sort()) {
    const writers = w.get(flag) || 0;
    const readers = r.get(flag) || 0;
    let classification;
    if (writers > 0 && readers > 0) classification = CLASSIFICATIONS.HEALTHY;
    else if (writers > 0) classification = CLASSIFICATIONS.ORPHAN;
    else if (readers > 0) classification = CLASSIFICATIONS.PHANTOM;
    else classification = CLASSIFICATIONS.SCAFFOLDING;
    const offending = classification === CLASSIFICATIONS.ORPHAN || classification === CLASSIFICATIONS.PHANTOM;
    const allowlisted = allow.has(flag);
    rows.push({ flag, writers, readers, classification, allowlisted, fail: offending && !allowlisted });
  }
  return rows;
}

// ── Allow-list loading (exported) ────────────────────────────────────────────

/** Load + validate the allow-list. Every entry must carry a non-empty reason (AC-4). */
export function loadAllowlist(p = ALLOWLIST_PATH) {
  if (!fs.existsSync(p)) return { allow: new Set(), errors: [] };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { allow: new Set(), errors: [`allow-list is not valid JSON: ${e.message}`] }; }
  const allow = new Set();
  const errors = [];
  for (const entry of parsed.allow || []) {
    if (!entry || !entry.flag) { errors.push(`allow-list entry missing "flag": ${JSON.stringify(entry)}`); continue; }
    if (!entry.reason || !String(entry.reason).trim()) { errors.push(`allow-list entry "${entry.flag}" missing a non-empty "reason"`); continue; }
    allow.add(entry.flag);
  }
  return { allow, errors };
}

// ── Scanner ──────────────────────────────────────────────────────────────────

function isExcluded(rel) {
  const segs = rel.split(/[\\/]/);
  if (segs.some((s) => EXCLUDE_DIR_SEGMENTS.includes(s))) return true;
  if (EXCLUDE_FILE_RE.test(rel)) return true;
  return false;
}

function* walk(dir, root) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full);
    if (e.isDirectory()) {
      if (EXCLUDE_DIR_SEGMENTS.includes(e.name)) continue;
      yield* walk(full, root);
    } else if (SCAN_EXTENSIONS.has(path.extname(e.name)) && !isExcluded(rel)) {
      yield full;
    }
  }
}

/** Scan the tree and return {writers:Map, readers:Map} of metadata.is_* flags. */
export function scanTree(root = REPO_ROOT) {
  const writers = new Map();
  const readers = new Map();
  const bump = (map, flag) => map.set(flag, (map.get(flag) || 0) + 1);
  for (const file of walk(root, root)) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!src.includes('metadata')) continue;
    const ext = path.extname(file);
    const code = stripComments(src, ext);
    const { reads, writes } = ext === '.sql' ? extractFromSql(code) : extractFromJs(code);
    for (const f of reads) bump(readers, f);
    for (const f of writes) bump(writers, f);
  }
  return { writers, readers };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : REPO_ROOT;

  const { allow, errors: allowErrors } = loadAllowlist();
  const { writers, readers } = scanTree(root);
  const rows = classifyFlags(writers, readers, allow);
  const failing = rows.filter((r) => r.fail);

  if (asJson) {
    console.log(JSON.stringify({ rows, allowErrors, failing: failing.map((r) => r.flag) }, null, 2));
  } else {
    console.log('metadata.is_* flag classification\n' + '─'.repeat(64));
    for (const r of rows) {
      const tag = r.allowlisted ? ' [allow-listed]' : r.fail ? '  ❌ FAIL' : '';
      console.log(`  ${r.classification.padEnd(16)} ${r.flag.padEnd(28)} w=${r.writers} r=${r.readers}${tag}`);
    }
    console.log('─'.repeat(64));
    if (allowErrors.length) {
      console.log('Allow-list errors:');
      for (const e of allowErrors) console.log(`  ❌ ${e}`);
    }
    if (failing.length) {
      console.log(`\n❌ ${failing.length} un-allow-listed ORPHAN/PHANTOM flag(s): ${failing.map((r) => r.flag).join(', ')}`);
      console.log('   Resolve (add a writer / remove the dead reader) or add a justified allow-list entry.');
    } else {
      console.log('\n✅ No un-allow-listed ORPHAN/PHANTOM metadata flags.');
    }
  }

  process.exit(failing.length > 0 || allowErrors.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'))) {
  main();
}
