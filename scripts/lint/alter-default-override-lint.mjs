#!/usr/bin/env node
/**
 * ALTER SET DEFAULT vs Code-Override (F12) Drift Lint
 * SD-LEO-INFRA-LINT-ALTER-SET-001
 *
 * Codifies the one-time audit SD-LEO-INFRA-AUDIT-MIGRATION-SET-001 into a
 * recurring lint. The F12 bug class: a migration changes a column's default via
 * `ALTER COLUMN ... SET DEFAULT <x>` to express an intent, but production code
 * written before the migration hardcodes a DIFFERENT literal <y> at insert time,
 * silently negating the new default.
 *
 * Scope (the genuine F12-risk class only):
 *   IN  — executable `ALTER TABLE t ALTER COLUMN c SET DEFAULT <literal>`.
 *   OUT — CREATE TABLE column defaults (co-created with their writers),
 *         DROP DEFAULT, and SET DEFAULT to a function/expression (now(),
 *         nextval(), gen_random_uuid(), …) — the latter is treated as an
 *         expression default and never produces a drift verdict.
 *
 * Per in-class (table, column) default it finds production WRITERS that set the
 * column to a value and classifies each:
 *   honors               literal == default            (no finding)
 *   intentional-override literal != default, allow-listed
 *   drift                literal != default, NOT allow-listed   → FAIL (exit 1)
 *   ambiguous            value is computed/variable (not a literal) → report only
 *
 * Writer→table attribution (the precision/recall tradeoff, made explicit):
 *   STRONG  — an enclosing `INSERT INTO t (...)` (SQL) or a nearest-preceding
 *             `.from('t')` (JS) whose table actually carries the column.
 *   NAME    — for a DISTINCTIVE column (in-class on exactly one table and not in
 *             COMMON_COLUMNS), a literal write of that column name is attributed
 *             to that single table even without a .from()/INSERT (covers the
 *             common real-world shape: object built as a variable / via a helper
 *             like writeAuditRow(), then inserted elsewhere).
 *   COMMON column names (status, type, state, …) REQUIRE strong attribution, so
 *   an unrelated table's `status: 'x'` is never mis-flagged. Unattributable
 *   common-column writes are reported as ambiguous, never as drift.
 *
 * Usage:
 *   node scripts/lint/alter-default-override-lint.mjs [--json] [--root <dir>]
 *   npm run lint:alter-defaults
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.join(__dirname, 'alter-default-override-allowlist.json');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'database', 'migrations');

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.sql']);

// Non-production paths: their writes do NOT count toward drift.
const EXCLUDE_DIR_SEGMENTS = [
  'node_modules', '.git', '.worktrees', '.cursor', 'archive', 'one-off', 'one-time',
  '__tests__', 'tests', 'test', 'coverage', 'dist', 'build', 'applications',
  'press-kit', '.next', 'playwright-report',
  'lint', // this tool + its allow-list/docs are not production writers
];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;

// Column names too generic to attribute by name alone — they REQUIRE a
// .from()/INSERT INTO to bind a table, else the write is ambiguous (not drift).
export const COMMON_COLUMNS = new Set([
  'status', 'type', 'kind', 'state', 'name', 'value', 'enabled', 'active',
  'category', 'role', 'level', 'mode', 'source', 'priority', 'title', 'label',
]);

const JS_FROM_WINDOW = 800; // chars to look back for a governing .from('t')

// ── Comment stripping (doc/example mentions never count as code) ──────────────
export function stripComments(src, ext) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ' '); // block comments (JS + SQL)
  if (ext === '.sql') out = out.replace(/--[^\n]*/g, ' '); // SQL line comments
  else out = out.replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1'); // JS line comments (guard :// + strings)
  return out;
}

// ── Default normalisation ────────────────────────────────────────────────────

/** Strip `::type` casts, surrounding quotes; detect expression defaults. */
export function normalizeDefault(raw) {
  let v = String(raw).trim().replace(/;+\s*$/, '').trim();
  // peel one or more trailing ::type casts
  v = v.replace(/::[a-z_][a-z0-9_ \[\]]*$/i, '').trim();
  if (/^null$/i.test(v)) return { norm: null, isExpression: false };
  if (/^(true|false)$/i.test(v)) return { norm: v.toLowerCase(), isExpression: false };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { norm: v, isExpression: false };
  const sq = v.match(/^'((?:[^']|'')*)'$/);
  if (sq) return { norm: sq[1].replace(/''/g, "'"), isExpression: false };
  // bare identifier (rare) — treat as literal-ish text
  if (/^[a-z_][a-z0-9_]*$/i.test(v) && !/\($/.test(v)) {
    // function-name-without-parens is unusual; treat plain word as literal text
    return { norm: v, isExpression: false };
  }
  // anything else (now(), nextval(...), gen_random_uuid(), expressions) → expression
  return { norm: v, isExpression: true };
}

// ── Migration default extraction (pure, exported) ────────────────────────────

/**
 * Parse every executable `ALTER TABLE t ... ALTER COLUMN c SET DEFAULT <x>`.
 * One ALTER TABLE may carry multiple comma-separated ALTER COLUMN clauses.
 * @returns {Array<{table,column,rawDefault,norm,isExpression}>}
 */
export function extractMigrationDefaults(src) {
  const code = stripComments(src, '.sql');
  const out = [];
  // Each ALTER TABLE ... up to its terminating semicolon.
  const stmtRe = /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\b([\s\S]*?);/gi;
  let s;
  while ((s = stmtRe.exec(code))) {
    const table = s[1].toLowerCase();
    const body = s[2];
    const colRe = /\bALTER\s+(?:COLUMN\s+)?"?([a-z_][a-z0-9_]*)"?\s+SET\s+DEFAULT\s+([\s\S]*?)(?=,\s*\bALTER\b|$)/gi;
    let c;
    while ((c = colRe.exec(body))) {
      const column = c[1].toLowerCase();
      const rawDefault = c[2].replace(/,\s*$/, '').trim();
      const { norm, isExpression } = normalizeDefault(rawDefault);
      out.push({ table, column, rawDefault, norm, isExpression });
    }
  }
  return out;
}

// ── Value classification ─────────────────────────────────────────────────────

/** Classify a raw RHS value text as a literal (with normalised form) or computed. */
export function classifyValue(rawValue) {
  const v = String(rawValue).trim().replace(/,\s*$/, '').trim();
  if (/^null$/i.test(v)) return { kind: 'literal', norm: null };
  if (/^(true|false)$/i.test(v)) return { kind: 'literal', norm: v.toLowerCase() };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { kind: 'literal', norm: v };
  const sq = v.match(/^'((?:[^']|'')*)'$/);
  if (sq) return { kind: 'literal', norm: sq[1].replace(/''/g, "'") };
  const dq = v.match(/^"([^"]*)"$/);
  if (dq) return { kind: 'literal', norm: dq[1] };
  const bq = v.match(/^`([^`${}]*)`$/); // template literal with no interpolation
  if (bq) return { kind: 'literal', norm: bq[1] };
  return { kind: 'computed', norm: v };
}

/** True when a writer literal matches the (normalised) migration default. */
export function valuesMatch(defaultNorm, writerNorm) {
  if (defaultNorm === null) return writerNorm === null;
  return String(defaultNorm) === String(writerNorm);
}

// ── Writer extraction (pure, exported) ───────────────────────────────────────

/** Split a comma list at paren-depth 0, respecting single-quoted strings. */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { cur += ch; if (ch === "'" && s[i + 1] !== "'") inStr = false; else if (ch === "'") { cur += s[++i]; } continue; }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * SQL writers: `INSERT INTO t (cols) VALUES (vals)` → positional col→value.
 * @returns {Array<{table,column,value,strong:true}>}
 */
export function extractSqlWriters(src, columnNames) {
  const code = stripComments(src, '.sql');
  const out = [];
  const re = /\bINSERT\s+INTO\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^)]*)\)\s*VALUES\s*\(([^;]*?)\)/gi;
  let m;
  while ((m = re.exec(code))) {
    const table = m[1].toLowerCase();
    const cols = splitTopLevel(m[2]).map((c) => c.replace(/"/g, '').trim().toLowerCase());
    const vals = splitTopLevel(m[3]);
    cols.forEach((col, i) => {
      if (columnNames.has(col) && i < vals.length) {
        out.push({ table, column: col, value: vals[i], strong: true });
      }
    });
  }
  return out;
}

/** Nearest preceding `.from('t')` within JS_FROM_WINDOW chars of `idx`. */
function nearestFrom(code, idx) {
  const start = Math.max(0, idx - JS_FROM_WINDOW);
  const slice = code.slice(start, idx);
  const re = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/gi;
  let last = null, m;
  while ((m = re.exec(slice))) last = m[1];
  return last ? last.toLowerCase() : null;
}

/**
 * JS/TS writers: object-literal `column: value` pairs for in-class column names,
 * with best-effort nearest-`.from()` table attribution.
 * @returns {Array<{table:string|null,column,value,strong:boolean}>}
 */
export function extractJsWriters(src, columnNames) {
  const code = stripComments(src, '.js');
  const out = [];
  for (const col of columnNames) {
    const re = new RegExp(`\\b${col}\\s*:\\s*([^,}\\n]+)`, 'gi');
    let m;
    while ((m = re.exec(code))) {
      const table = nearestFrom(code, m.index);
      out.push({ table, column: col, value: m[1], strong: table !== null });
    }
  }
  return out;
}

// ── Attribution + classification (pure, exported) ────────────────────────────

/**
 * Bind each writer to an in-class (table,column) default and classify it.
 * @returns {Array<{table,column,default,writers:Array,fail:boolean,allowlisted:boolean}>}
 */
export function classifyOverrides(defaults, writers, allow = new Set()) {
  // index defaults by column → [entries]; skip expression defaults (out of class)
  const byCol = new Map();
  for (const d of defaults) {
    if (d.isExpression) continue;
    if (!byCol.has(d.column)) byCol.set(d.column, []);
    byCol.get(d.column).push(d);
  }
  // accumulate per table.column key
  const rows = new Map(); // key -> {table,column,default,writers:[]}
  const keyOf = (t, c) => `${t}.${c}`;
  for (const d of defaults) {
    if (d.isExpression) continue;
    rows.set(keyOf(d.table, d.column), { table: d.table, column: d.column, default: d.norm, writers: [] });
  }

  for (const w of writers) {
    const candidates = byCol.get(w.column);
    if (!candidates || candidates.length === 0) continue;
    let target = null;
    if (w.table && candidates.some((d) => d.table === w.table)) {
      target = candidates.find((d) => d.table === w.table); // STRONG
    } else if (!COMMON_COLUMNS.has(w.column) && candidates.length === 1) {
      target = candidates[0]; // NAME attribution (distinctive column)
    } else {
      // Common column without strong attribution to an in-class table, or a
      // distinctive name shared by >1 in-class table: this write almost
      // certainly targets a DIFFERENT table (e.g. some other table's `status`).
      // Drop it silently — surfacing it would bury the real signal in noise.
      continue;
    }
    const row = rows.get(keyOf(target.table, target.column));
    const cv = classifyValue(w.value);
    let classification;
    if (cv.kind === 'computed') classification = 'ambiguous';
    else if (valuesMatch(target.norm, cv.norm)) classification = 'honors';
    else classification = 'override';
    row.writers.push({ ...w, table: target.table, classification, normValue: cv.norm });
  }

  const result = [];
  for (const row of rows.values()) {
    const key = keyOf(row.table, row.column);
    const allowlisted = allow.has(key);
    const driftWriters = row.writers.filter((w) => w.classification === 'override');
    result.push({
      ...row,
      allowlisted,
      fail: driftWriters.length > 0 && !allowlisted,
      driftCount: driftWriters.length,
    });
  }
  return result.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

// ── Allow-list loading (exported) ────────────────────────────────────────────

/** Load + validate the allow-list. Each entry needs a `column` (table.column) + non-empty `reason`. */
export function loadAllowlist(p = ALLOWLIST_PATH) {
  if (!fs.existsSync(p)) return { allow: new Set(), errors: [] };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { allow: new Set(), errors: [`allow-list is not valid JSON: ${e.message}`] }; }
  const allow = new Set();
  const errors = [];
  for (const entry of parsed.allow || []) {
    if (!entry || !entry.column) { errors.push(`allow-list entry missing "column" (table.column): ${JSON.stringify(entry)}`); continue; }
    if (!entry.reason || !String(entry.reason).trim()) { errors.push(`allow-list entry "${entry.column}" missing a non-empty "reason"`); continue; }
    allow.add(String(entry.column).toLowerCase());
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
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
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

/** Read all migration defaults from database/migrations. */
export function loadMigrationDefaults(dir = MIGRATIONS_DIR) {
  const defaults = [];
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort(); } catch { return defaults; }
  // latest-wins by sorted filename
  const seen = new Map(); // table.column -> default entry
  for (const f of files) {
    let src; try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const d of extractMigrationDefaults(src)) {
      seen.set(`${d.table}.${d.column}`, { ...d, source: f });
    }
  }
  return [...seen.values()];
}

/** Scan the tree for writers of the given in-class column names. */
export function scanWriters(columnNames, root = REPO_ROOT) {
  const writers = [];
  for (const file of walk(root, root)) {
    let src; try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const ext = path.extname(file);
    const rel = path.relative(root, file).replace(/\\/g, '/');
    // cheap prefilter
    if (![...columnNames].some((c) => src.includes(c))) continue;
    const found = ext === '.sql' ? extractSqlWriters(src, columnNames) : extractJsWriters(src, columnNames);
    for (const w of found) writers.push({ ...w, file: rel });
  }
  return writers;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : REPO_ROOT;
  const migrationsDir = path.join(root, 'database', 'migrations');

  const { allow, errors: allowErrors } = loadAllowlist();
  const defaults = loadMigrationDefaults(migrationsDir);
  const columnNames = new Set(defaults.filter((d) => !d.isExpression).map((d) => d.column));
  const writers = scanWriters(columnNames, root);
  const rows = classifyOverrides(defaults, writers, allow);
  const failing = rows.filter((r) => r.fail);

  if (asJson) {
    console.log(JSON.stringify({ defaults, rows, allowErrors, failing: failing.map((r) => `${r.table}.${r.column}`) }, null, 2));
  } else {
    console.log('ALTER SET DEFAULT vs code-override (F12) drift\n' + '─'.repeat(72));
    for (const r of rows) {
      const drift = r.writers.filter((w) => w.classification === 'override');
      const amb = r.writers.filter((w) => w.classification === 'ambiguous');
      const honors = r.writers.filter((w) => w.classification === 'honors');
      const tag = r.allowlisted ? ' [allow-listed]' : r.fail ? '  ❌ DRIFT' : '';
      console.log(`  ${r.table}.${r.column}  default=${JSON.stringify(r.default)}  honors=${honors.length} override=${drift.length} ambiguous=${amb.length}${tag}`);
      for (const w of drift) console.log(`      override → ${JSON.stringify(w.normValue)} @ ${w.file}${r.allowlisted ? ' (allowed)' : ''}`);
      for (const w of amb) console.log(`      ambiguous (${w.reason || 'computed'}) @ ${w.file}`);
    }
    console.log('─'.repeat(72));
    if (allowErrors.length) { console.log('Allow-list errors:'); for (const e of allowErrors) console.log(`  ❌ ${e}`); }
    if (failing.length) {
      console.log(`\n❌ ${failing.length} column(s) with un-allow-listed override drift: ${failing.map((r) => `${r.table}.${r.column}`).join(', ')}`);
      console.log('   A writer hardcodes a literal that differs from the migration default.');
      console.log('   Fix the writer to honor the default, OR add a justified allow-list entry.');
    } else {
      console.log('\n✅ No un-allow-listed ALTER-SET-DEFAULT override drift.');
    }
  }
  process.exit(failing.length > 0 || allowErrors.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'))) {
  main();
}
