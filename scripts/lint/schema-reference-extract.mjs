/**
 * Schema-reference extractor — PURE module (no fs, no DB, no process).
 * SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 (FR-1).
 *
 * Ports the proven parser rules from the chairman-directed data-layer scan
 * (.claude/data-layer-scan-20260610.mjs) that found ~30 live-path phantom
 * tables and 782 phantom-column refs: extract supabase from(<table>) refs,
 * select(<literal>) columns, insert/update/upsert object-literal keys, and
 * raw-SQL FROM / INSERT INTO / UPDATE refs.
 *
 * Skip rules encoded here (each unit-tested):
 *  - select literals: `alias:col` → col; embedded relations `rel(cols)` are
 *    relation names, not columns; json operators `col->x` / `col->>x` → col;
 *    `*` and spaced fragments skipped.
 *  - insert/update/upsert: top-level object keys only (balanced-brace walk,
 *    nested structures flattened away); spreads are lossy by design; the
 *    SECOND argument (option object: onConflict / ignoreDuplicates / count /
 *    defaultToNull / returning) is never treated as columns.
 *  - raw SQL: keyword/pg_catalog skip list; identifiers <4 chars skipped.
 *  - any line containing `schema-lint-disable-line` is skipped entirely.
 */

export const SQL_KEYWORDS = new Set([
  'select', 'where', 'values', 'set', 'returning', 'information_schema',
  'unnest', 'jsonb_each', 'jsonb_array_elements', 'generate_series', 'now',
  'lateral', 'the', 'this', 'each', 'only', 'into', 'temp', 'temporary',
]);

const OPTION_KEYS = new Set(['onConflict', 'ignoreDuplicates', 'count', 'defaultToNull', 'returning']);

const FROM_RE = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
const SQL_REF_RE = /(?:FROM|INSERT\s+INTO|UPDATE)\s+(?:public\.)?([a-z][a-z0-9_]{2,})/g;
const PRAGMA = 'schema-lint-disable-line';

/** Line number (1-based) of a character offset. @private */
function lineAt(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/** True when the line containing offset idx carries the disable pragma. @private */
function pragmaAt(text, idx) {
  const start = text.lastIndexOf('\n', idx) + 1;
  const end = text.indexOf('\n', idx);
  return text.slice(start, end === -1 ? text.length : end).includes(PRAGMA);
}

/**
 * Extract top-level object keys from the FIRST argument after startIdx.
 * Balanced-brace walk capped at 4000 chars; nested structures flattened so
 * only top-level keys surface. Returns null when no object literal is close.
 * @private
 */
function extractObjectKeys(text, startIdx) {
  const open = text.indexOf('{', startIdx);
  if (open === -1 || open - startIdx > 60) return null;
  let depth = 0, end = -1;
  for (let i = open; i < Math.min(text.length, open + 4000); i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  const body = text.slice(open + 1, end);
  let flat = '', d = 0;
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') d++;
    else if (ch === '}' || ch === ']' || ch === ')') d--;
    else if (d === 0) flat += ch;
  }
  const keys = [];
  const KEY_RE = /(?:^|,)\s*['"`]?([a-zA-Z_][a-zA-Z0-9_]*)['"`]?\s*:/g;
  let m;
  while ((m = KEY_RE.exec(flat))) keys.push(m[1]);
  return keys.length ? { keys, objEnd: end } : null;
}

/**
 * Parse a `.select('…')` literal into candidate column names.
 * @private
 */
function selectColumns(literal) {
  const cols = [];
  if (literal.includes('*')) return cols;
  for (let raw of literal.split(',')) {
    let col = raw.trim();
    if (!col) continue;
    // alias:col → col (PostgREST renaming)
    col = col.split(':').pop().trim();
    // embedded relation rel(cols) — the part before '(' is a RELATION name, not a column
    if (col.includes('(')) { cols.push({ name: col.split('(')[0].trim(), embedded: true }); continue; }
    // json operators col->x / col->>x and dotted refs
    col = col.split('->')[0].split('.')[0].trim();
    if (!col || col === '*' || col.includes(' ') || col.includes(')')) continue;
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) cols.push({ name: col, embedded: false });
  }
  return cols;
}

/**
 * Extract schema references from source text.
 *
 * @param {string} text - file contents
 * @param {string} [relPath] - repo-relative path (carried through to refs)
 * @returns {Array<{type:'table'|'column', table:string, column?:string, line:number, kind:string, file?:string, embedded?:boolean}>}
 */
export function extractReferences(text, relPath = '') {
  const refs = [];

  FROM_RE.lastIndex = 0;
  let m;
  while ((m = FROM_RE.exec(text))) {
    if (pragmaAt(text, m.index)) continue;
    const table = m[1];
    const line = lineAt(text, m.index);
    refs.push({ type: 'table', table, line, kind: 'from', file: relPath });

    // Look ahead in the same chain (600 chars) for select/insert/update/upsert —
    // bounded at the NEXT .from( so an adjacent chain's calls are never
    // attributed to this table (cross-chain leak found during smoke).
    let ahead = text.slice(m.index, m.index + 600);
    const nextFrom = ahead.indexOf('.from(', 6);
    if (nextFrom !== -1) ahead = ahead.slice(0, nextFrom);

    const sel = ahead.match(/\.select\(\s*['"`]([^'"`]+)['"`]/);
    if (sel && !pragmaAt(text, m.index + sel.index)) {
      const selLine = lineAt(text, m.index + sel.index);
      for (const col of selectColumns(sel[1])) {
        refs.push({
          type: 'column', table, column: col.name, line: selLine,
          kind: 'select', file: relPath, embedded: col.embedded,
        });
      }
    }

    const ins = ahead.match(/\.(insert|update|upsert)\(/);
    if (ins && !pragmaAt(text, m.index + ins.index)) {
      const insLine = lineAt(text, m.index + ins.index);
      const extracted = extractObjectKeys(ahead, ins.index + ins[0].length - 1);
      if (extracted) {
        for (const k of extracted.keys) {
          if (OPTION_KEYS.has(k)) continue; // defensive — options usually live in arg 2
          refs.push({ type: 'column', table, column: k, line: insLine, kind: ins[1], file: relPath });
        }
        // The SECOND argument (option object) is intentionally not parsed:
        // extractObjectKeys stops at the first balanced object.
      }
    }
  }

  // Raw SQL references in template strings / inline SQL.
  SQL_REF_RE.lastIndex = 0;
  while ((m = SQL_REF_RE.exec(text))) {
    if (pragmaAt(text, m.index)) continue;
    const t = m[1].toLowerCase();
    if (SQL_KEYWORDS.has(t) || t.startsWith('pg_') || t.length < 4) continue;
    refs.push({ type: 'table', table: t, line: lineAt(text, m.index), kind: 'sql', file: relPath });
  }

  return refs;
}

/**
 * Compare extracted refs against a schema snapshot.
 *
 * @param {Array} refs - output of extractReferences
 * @param {{tables: Object<string,string[]>, views?: Object<string,string[]>}} snapshot
 * @returns {Array} violations — refs whose table/column is absent from the snapshot
 */
export function findViolations(refs, snapshot) {
  const tables = snapshot.tables || {};
  const views = snapshot.views || {};
  const relCols = (name) => tables[name] || views[name] || null;
  const allRelations = new Set([...Object.keys(tables), ...Object.keys(views)]);

  const violations = [];
  for (const ref of refs) {
    if (ref.type === 'table') {
      // raw-SQL refs only flag when CLEARLY a relation miss; from() refs always checked
      if (!allRelations.has(ref.table)) {
        if (ref.kind === 'sql') continue; // raw SQL too noisy for blocking — from() is the contract
        violations.push({ ...ref, missing: ref.table });
      }
      continue;
    }
    // column ref
    const cols = relCols(ref.table);
    if (!cols) continue; // table itself missing — already flagged by its from() ref
    if (cols.includes(ref.column)) continue;
    // embedded relation names in select literals are relations, not columns
    if (ref.embedded && allRelations.has(ref.column)) continue;
    // non-embedded but matches a live relation: PostgREST implicit embed — skip (scan rule)
    if (allRelations.has(ref.column)) continue;
    violations.push({ ...ref, missing: `${ref.table}.${ref.column}` });
  }
  return violations;
}
