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
  const text = String(source || '');
  if (!text.includes('strategic_directives_v2')) return findings; // file-level gate

  for (const m of text.matchAll(/\.update\s*\(\s*\{/g)) {
    // Bounded window: the object literal body rarely exceeds a few hundred chars in this
    // codebase's call sites; capping avoids runaway scans on a malformed/huge file.
    const windowEnd = Math.min(text.length, m.index + 800);
    const window = text.slice(m.index, windowEnd);
    if (!/\bmetadata\s*:/.test(window)) continue;
    if (!window.includes('...')) continue; // the spread is the defect signature

    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (lineText.includes(DISABLE_MARKER)) continue;

    findings.push({
      file: filePath,
      line: text.slice(0, m.index).split('\n').length,
      message: '.update({ metadata: { ...spread, ... } }) against strategic_directives_v2 — a client-side '
        + 'read-then-full-blob-replace write silently clobbers a concurrent writer\'s key (SD-LEO-FIX-'
        + 'STRATEGIC-DIRECTIVES-UPDATED-001). Use lib/coordinator/safe-metadata-merge.mjs\'s '
        + `mergeMetadataKeys()/removeMetadataKey() instead, or suppress with a trailing '${DISABLE_MARKER}' `
        + 'comment if this is genuinely not strategic_directives_v2.',
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

async function main() {
  const exts = ['.js', '.mjs', '.cjs'];
  const files = process.argv.includes('--diff')
    ? (changedFiles(exts) ?? [...walk('lib', exts), ...walk('scripts', exts)])
    : [...walk('lib', exts), ...walk('scripts', exts)];

  let total = 0;
  for (const file of files) {
    let source;
    try { source = readFileSync(file, 'utf8'); } catch { continue; }
    for (const f of findUnsafeMetadataFullBlobWrite(source, file)) {
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
