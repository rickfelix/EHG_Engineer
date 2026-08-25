import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// TS-9 / AC-5: automated self-check that zero \d, \w, \s, \m, \M escapes exist anywhere in the
// stage-census instrument's own source, asserted as a running test rather than a manual
// code-review convention. Scans the actual files, not a hand-copied string, so it fails the
// moment a future edit reintroduces the reproduced hazard class.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// scripts/audits/ is a SHARED directory (5+ other SDs' census instruments already live there,
// e.g. audit-stage-artifact-tagging.mjs, gitattributes-eol-census.mjs) -- this self-check must
// only cover THIS SD's own deliverable, not lint pre-existing, unrelated instruments it does not
// own. lib/audits/stage-census/ is exclusively this SD's own directory, so it is scanned whole;
// scripts/audits/ is scanned by exact filename only.
const INSTRUMENT_DIRS = [path.join(repoRoot, 'lib/audits/stage-census')];
const INSTRUMENT_FILES = [path.join(repoRoot, 'scripts/audits/stage-21-26-census.mjs')];
const FORBIDDEN_ESCAPE_RE = /\\[dwsmM]/;

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Strips // line comments and /* block comments *\/ so the forbidden-escape scan only sees
 * code the JS/regex engine actually executes -- this file's own descriptive comments legitimately
 * name \d/\w/\s/\m/\M in prose (explaining why they are banned), and a keyword-based exclusion
 * would create exactly the kind of loophole that could hide a real violation on a commented line.
 * Stripping comments first, then scanning what remains, has no such gap.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('stage-census instrument: forbidden regex escapes', () => {
  it('contains zero \\d/\\w/\\s/\\m/\\M escapes in executable code (comments stripped first)', () => {
    const files = [...INSTRUMENT_DIRS.flatMap(listSourceFiles), ...INSTRUMENT_FILES.filter((f) => fs.existsSync(f))];
    expect(files.length).toBeGreaterThan(0); // guard against a silently-empty scan

    const offenders = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, idx) => {
        if (FORBIDDEN_ESCAPE_RE.test(line)) {
          offenders.push(`${path.relative(repoRoot, file)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
