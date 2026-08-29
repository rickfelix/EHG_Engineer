#!/usr/bin/env node
/**
 * QF-20260829-440 — forbid `.ilike()`/`.like()` on a uuid-typed column in Supabase query chains.
 *
 * THE TRAP (ILIKE-ON-UUID=FALSE-0ROWS, three seats bitten multiple times this week): Postgres
 * has no `~~`/`~~*` operator for `uuid`, so `.ilike('id', 'abc%')` throws "operator does not
 * exist: uuid ~~* unknown" in the best case — and in an error-swallowed path (a bare
 * `.then(({data}) => ...)` that never checks `error`), it silently reads as a genuine
 * zero-row result instead of a broken query. A written note has not prevented recurrence;
 * this makes the mistake an impossibility to author.
 *
 * The uuid column list is a READ-ONLY, empirically-measured census (database/uuid-columns
 * -census.json, regenerate via scripts/db/uuid-column-census.mjs) — never a naming guess like
 * "every *_id column is a uuid", which would both over- and under-fire against this schema's
 * real column types.
 *
 * ESCAPE HATCH: a genuinely text-typed column that happens to share a name with a uuid column
 * in another table (e.g. a `metadata->>'id'` alias) can suppress a specific line with a trailing
 * comment containing `ilike-uuid-lint-disable-line`.
 *
 * KNOWN LIMITATION, stated concretely: this is a text scan (like the sibling
 * or-filter-must-project.mjs), not an AST pass — a column name built from a variable
 * (`.ilike(col, ...)`) is invisible, and that is a silent miss, never a false alarm.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process'; // never execSync — argv-array form only, matches shell-injection-argv-lint

/** Findings: { file, line, column, message }. */
export function findIlikeOnUuid(source, uuidColumns, filePath = '<source>') {
  const findings = [];
  const original = String(source || '');
  // Comments blanked first (not deleted, so line numbers stay true) — a comment mentioning
  // `.ilike('id', ...)` as an example is not a live defect. The escape-hatch marker itself is
  // checked against `original` below, NOT this blanked copy — it lives inside a trailing
  // comment, so blanking it here before the check would strip the very marker it looks for.
  const text = original
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const uuidSet = uuidColumns instanceof Set ? uuidColumns : new Set(uuidColumns);

  for (const m of text.matchAll(/\.(ilike|like)\s*\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g)) {
    const column = m[2];
    if (!uuidSet.has(column)) continue;
    const lineStart = original.lastIndexOf('\n', m.index) + 1;
    const lineEnd = original.indexOf('\n', m.index);
    const lineText = original.slice(lineStart, lineEnd === -1 ? original.length : lineEnd);
    if (lineText.includes('ilike-uuid-lint-disable-line')) continue;
    findings.push({
      file: filePath,
      line: text.slice(0, m.index).split('\n').length,
      column,
      message: `.${m[1]}('${column}', ...) — '${column}' is a uuid-typed column (database/uuid-columns-census.json); `
        + 'Postgres has no ~~/~~* operator for uuid, so this throws (or silently reads as zero rows behind a '
        + "swallowed error). Use .eq()/.in() or a text cast, or suppress with a trailing 'ilike-uuid-lint-disable-line' "
        + 'comment if this column is genuinely text-typed here.',
    });
  }
  return findings;
}

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Files changed vs the PR base, filtered to the scanned extensions/dirs. Diff-only so the
 * pre-existing backlog (24 findings, mostly in scripts/archive/ + scripts/one-off/, measured
 * 2026-08-29) never blocks a PR that didn't touch them — same tradeoff schema-reference-lint
 * makes for the identical reason. Fails soft to a full sweep if the base is unresolvable.
 */
function changedFiles(exts) {
  const base = process.env.ILIKE_UUID_LINT_BASE || 'origin/main';
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], { encoding: 'utf8' });
    return out.split('\n').filter((f) => f && exts.some((e) => f.endsWith(e)) && (f.startsWith('scripts/') || f.startsWith('lib/')));
  } catch (e) {
    console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to a full sweep (advisory backlog included).`);
    return null;
  }
}

async function main() {
  const census = JSON.parse(readFileSync('database/uuid-columns-census.json', 'utf8'));
  const uuidColumns = new Set(census.columns);
  const exts = ['.js', '.mjs', '.cjs'];
  const files = process.argv.includes('--diff')
    ? (changedFiles(exts) ?? [...walk('scripts', exts), ...walk('lib', exts)])
    : [...walk('scripts', exts), ...walk('lib', exts)];

  let total = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const f of findIlikeOnUuid(source, uuidColumns, file)) {
      console.error(`${f.file}:${f.line}  ${f.message}`);
      total++;
    }
  }
  if (total > 0) {
    console.error(`\n${total} ilike/like-on-uuid finding(s).`);
    process.exit(1);
  }
  console.log(`ilike-on-uuid-lint: clean (${files.length} files scanned, ${uuidColumns.size} known uuid columns).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
