// lib/michael/cowork-retirement-grep.mjs — step 5 of the _Cowork retirement (docs/michael/02-SPEC.md
// §8): a clean grep proves nothing outside the recognized Michael-cowork files still references
// _Cowork. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I.
//
// CORRECTS the spec's own literal predicate before this was ever run: `grep -r "_Cowork\|Dropbox"
// lib scripts .github docs` is unsatisfiable as written — measured against live main, the bare
// "Dropbox" alternation produces 30 hits, all in the unrelated EHG ideas-intake pipeline
// documentation (docs/06_deployment/strategic-intake-pipeline-v1.md and 10 other files), none
// Cowork-related. This scans for "_Cowork" ALONE, with an explicit allow-list for the files that
// legitimately and permanently reference it.
//
// Implemented as a pure Node fs walk (never a shelled-out `grep -r`) per PLAN-TO-EXEC TESTING
// finding Q4 (testing-agent:a4cc2b598c73322da): a win32 vitest process shelling out to `grep` is a
// known fragility class in this repo.
import fs from 'node:fs';
import path from 'node:path';

/** Directories scanned for a lingering _Cowork reference (widened from the spec's own 4 to include tests/ and database/, per TESTING Q4). */
export const SCAN_ROOTS = Object.freeze(['lib', 'scripts', '.github', 'docs', 'tests', 'database']);

/** Case-sensitive by design — the real folder/name is `_Cowork`. */
export const PATTERN = /_Cowork/;

/** The files that legitimately and permanently reference _Cowork; everything under docs/michael/ is allow-listed as a whole prefix (module-level, not inside isAllowListed, so it stays a plain readable list). */
export const ALLOW_LIST = Object.freeze([
  'scripts/michael/import-cowork-memory.mjs',
  'scripts/michael/import-cowork-memory.test.js',
  'scripts/michael/retire-cowork.mjs',
  'scripts/michael/retire-cowork.test.js',
  'lib/michael/cowork-manifest.mjs',
  'lib/michael/cowork-manifest.test.js',
  'lib/michael/cowork-parse.mjs',
  'lib/michael/cowork-parse.test.js',
  'lib/michael/cowork-write.mjs',
  'lib/michael/cowork-write.test.js',
  'lib/michael/cowork-retirement-grep.mjs',
  'lib/michael/cowork-retirement-grep.test.js',
  'lib/michael/retirement-window.mjs',
  'tests/unit/michael-cowork-retirement-grep.test.js',
]);

const ALLOW_PREFIX = 'docs/michael/';

/** Pure: is this repo-relative path (forward-slash form) allowed to reference _Cowork? */
export function isAllowListed(relPath) {
  const norm = String(relPath).split(path.sep).join('/');
  return norm.startsWith(ALLOW_PREFIX) || ALLOW_LIST.includes(norm);
}

function walk(dir, fsImpl, out) {
  let entries;
  try { entries = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      walk(full, fsImpl, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/**
 * Scans SCAN_ROOTS under repoRoot for PATTERN. Returns { hits, violations, allowListedHits } — every
 * hit carries {file, line, text}; violations are hits NOT covered by ALLOW_LIST/docs/michael/.
 * fsImpl is injectable so this is unit-testable against a synthetic tree without touching disk.
 */
export function scanForCoworkReferences(repoRoot, { fsImpl = fs, scanRoots = SCAN_ROOTS } = {}) {
  const files = [];
  for (const root of scanRoots) walk(path.join(repoRoot, root), fsImpl, files);
  const hits = [];
  for (const full of files) {
    let text;
    try { text = fsImpl.readFileSync(full, 'utf8'); } catch { continue; }
    if (!PATTERN.test(text)) continue;
    const relPath = path.relative(repoRoot, full).split(path.sep).join('/');
    text.split('\n').forEach((lineText, idx) => {
      if (PATTERN.test(lineText)) hits.push({ file: relPath, line: idx + 1, text: lineText.trim() });
    });
  }
  return {
    hits,
    violations: hits.filter((h) => !isAllowListed(h.file)),
    allowListedHits: hits.filter((h) => isAllowListed(h.file)),
  };
}
