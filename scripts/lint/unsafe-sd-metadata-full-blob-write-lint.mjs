#!/usr/bin/env node
/**
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001 (FR-4) — forbid a NEW client-side
 * read-then-full-blob-replace write of strategic_directives_v2.metadata.
 *
 * THE BUG THIS GUARDS: `.update({ metadata: { ...someLocallyReadObject, key: val } })` against
 * strategic_directives_v2 is a classic TOCTOU race — a concurrent writer's key, set between this
 * call's earlier read and this write, is silently clobbered when the whole locally-merged object
 * replaces the column. Measured live (2026-09): 8 call sites in lib/ did exactly this. All 8 were
 * migrated to lib/coordinator/safe-metadata-merge.mjs's mergeMetadataKeys()/removeMetadataKey()
 * (an atomic Postgres jsonb `||`/`-` operation touching ONLY the patched key(s), no client read
 * required). This lint stops a NEW instance of the fixed pattern from being introduced.
 *
 * SIGNATURE MATCHED: a `.update({ ... })` call whose object literal contains BOTH a `metadata`
 * key AND an object-spread (`...`) — the exact shape every one of the 8 real defects had. A pure
 * literal `.update({ metadata: { onlyThisKey: val } })` with no spread is a different (much
 * rarer, usually intentional full-reset) shape and is NOT flagged — narrow signal over broad,
 * matching this repo's other narrow-scope lints (ilike-on-uuid-lint, session-coordination-insert
 * -classguard-lint).
 *
 * KNOWN LIMITATION (text scan, not an AST pass, same tradeoff as this repo's sibling lints): the
 * file-level gate ("does this file mention strategic_directives_v2 at all") is a heuristic, not
 * exact call-chain proximity — a file that also updates an unrelated table's metadata column
 * with a spread could false-positive. Escape hatch: a trailing comment containing
 * `metadata-fullblob-lint-disable-line` suppresses that one line.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process'; // never execSync — argv-array form only, matches shell-injection-argv-lint

const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', 'one-off', 'one-time', 'temp', 'archive', 'archived-sd-scripts']);
const DISABLE_MARKER = 'metadata-fullblob-lint-disable-line';

/**
 * Findings: { file, line, message }.
 * @param {string} source
 * @param {string} filePath
 * @returns {Array<{file:string,line:number,message:string}>}
 */
export function findUnsafeMetadataFullBlobWrite(source, filePath = '<source>') {
  const findings = [];
  const original = String(source || '');
  // Comments blanked first (not deleted, so line numbers stay true) — a comment DESCRIBING this
  // exact pattern (e.g. "this used to do .update({ metadata: {...spread} })") is not a live
  // defect, and this SD's own migration commits added many such comments. Mirrors
  // ilike-on-uuid-lint.mjs's identical precaution. The escape-hatch marker is checked against
  // `original` below, NOT this blanked copy — it lives inside a trailing comment.
  const text = original
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  if (!text.includes('strategic_directives_v2')) return findings; // file-level gate (blanked text — a comment-only mention doesn't count)

  for (const m of text.matchAll(/\.update\s*\(\s*\{/g)) {
    // Bounded window: the object literal body rarely exceeds a few hundred chars in this
    // codebase's call sites; capping avoids runaway scans on a malformed/huge file.
    const windowEnd = Math.min(text.length, m.index + 800);
    const window = text.slice(m.index, windowEnd);
    if (!/\bmetadata\s*:/.test(window)) continue;
    if (!window.includes('...')) continue; // the spread is the defect signature

    const lineStart = original.lastIndexOf('\n', m.index) + 1;
    const lineEnd = original.indexOf('\n', m.index);
    const lineText = original.slice(lineStart, lineEnd === -1 ? original.length : lineEnd);
    if (lineText.includes(DISABLE_MARKER)) continue;

    findings.push({
      file: filePath,
      line: text.slice(0, m.index).split('\n').length,
      // Deliberately does NOT spell out the flagged syntax verbatim (a literal
      // ".update({" + "metadata:" + "..." run inside this message would self-match when this
      // lint scans its own source file — string literals, unlike comments, are never blanked).
      message: 'A write-call here sets an object-spread-merged metadata field against '
        + 'strategic_directives_v2 — a client-side read-then-full-blob-replace write silently '
        + 'clobbers a concurrent writer\'s key (SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001). Use '
        + `lib/coordinator/safe-metadata-merge.mjs's mergeMetadataKeys()/removeMetadataKey() instead, `
        + `or suppress with a trailing '${DISABLE_MARKER}' comment if this is genuinely not strategic_directives_v2.`,
    });
  }
  return findings;
}

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry.startsWith('.') || EXCLUDED_DIR_SEGMENTS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Diff-only mode: only files changed vs the PR base, so a pre-existing backlog never blocks an unrelated PR. */
function changedFiles(exts) {
  const base = process.env.METADATA_FULLBLOB_LINT_BASE || 'origin/main';
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], { encoding: 'utf8' });
    return out.split('\n').filter((f) => f
      && exts.some((e) => f.endsWith(e))
      && (f.startsWith('lib/') || f.startsWith('scripts/'))
      && ![...EXCLUDED_DIR_SEGMENTS].some((seg) => f.includes(`/${seg}/`)));
  } catch (e) {
    console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to a full sweep (advisory backlog included).`);
    return null;
  }
}

/**
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001: the diff-only mode above named files, not
 * LINES — `changedFiles()` includes any file with ANY line touched, and main() then scanned that
 * file's WHOLE content. A PR editing one function in a large, frequently-touched file (e.g.
 * scripts/stale-session-sweep.cjs) inherited every PRE-EXISTING violation anywhere else in that
 * same file as a "new" finding, defeating this function's own stated purpose ("so a pre-existing
 * backlog never blocks an unrelated PR" — measured breaking this promise on PR #8226, three
 * unrelated findings at lines the PR never touched). Returns the set of NEW-file line numbers
 * actually added/changed for `file` per `git diff -U0`, so findings can be scoped to the real
 * diff hunks instead of the whole file. Returns null (caller falls back to the old, unfiltered
 * behavior) when the diff is unavailable, matching changedFiles()'s own fail-open convention.
 * @param {string} file
 * @param {string} base
 * @returns {Set<number>|null}
 */
export function changedLineNumbers(file, base) {
  try {
    const out = execFileSync('git', ['diff', '-U0', '--diff-filter=ACMR', `${base}...HEAD`, '--', file], { encoding: 'utf8' });
    const lines = new Set();
    for (const line of out.split('\n')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) lines.add(start + i);
    }
    return lines;
  } catch {
    return null;
  }
}

async function main() {
  const exts = ['.js', '.mjs', '.cjs'];
  const isDiffMode = process.argv.includes('--diff');
  const base = process.env.METADATA_FULLBLOB_LINT_BASE || 'origin/main';
  const files = isDiffMode
    ? (changedFiles(exts) ?? [...walk('lib', exts), ...walk('scripts', exts)])
    : [...walk('lib', exts), ...walk('scripts', exts)];

  let total = 0;
  for (const file of files) {
    let source;
    try { source = readFileSync(file, 'utf8'); } catch { continue; }
    const allowedLines = isDiffMode ? changedLineNumbers(file, base) : null;
    for (const f of findUnsafeMetadataFullBlobWrite(source, file)) {
      if (allowedLines && !allowedLines.has(f.line)) continue; // pre-existing, outside this PR's actual diff
      console.error(`${f.file}:${f.line}  ${f.message}`);
      total++;
    }
  }
  if (total > 0) {
    console.error(`\n${total} unsafe strategic_directives_v2.metadata full-blob write finding(s).`);
    process.exit(1);
  }
  console.log(`unsafe-sd-metadata-full-blob-write-lint: clean (${files.length} files scanned).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
