// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 — a source file containing a raw NUL byte (0x00) is
// INVISIBLE to every ripgrep-based search in this repo.
//
// WHY THIS EXISTS. The FR-1 fix in lib/learning/issue-knowledge-base.js shipped with a raw 0x00 as
// the fingerprint field separator. The source appeared to join on a single space and actually
// joined on a control byte. Runtime behaviour was fine, which is exactly why nothing caught it:
// every property-based check (ids distinct, collision arithmetic, determinism) passed.
//
// The real damage was to the TOOLING. MEASURED here, not assumed: ripgrep reports "binary file
// matches" for the file instead of the matching lines, and in a multi-file search it omits the
// file from the results entirely — a sibling file matching the same pattern came back while this
// one silently did not. So this SD's own AC-2 and AC-9 absence checks ("no live sequential PAT-
// generator anywhere") were run with an instrument that could not read the single most important
// file in the SD. Re-run with a NUL-immune scanner the conclusions held — but they had been
// asserted by a blind check, which is the precise failure class this SD is about.
//
// PRECISION, inherited from SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 FR-7, which met this bug
// before and documented it carefully: the hazard is MODE-DEPENDENT, not a blanket skip. GNU grep's
// COUNT mode still counts correctly; it is CONTENT mode that suppresses the lines. Stating it as
// "grep ignores the file" sends a future auditor chasing a reproduction they will not get.
//
// WHY THIS IS REPO-WIDE AND THAT FR WAS NOT. That SD fixed one file and pinned it with a one-file
// test. This is the FOURTH independent instance of the same defect in this tree (solomon-advisory,
// the first-revenue rollup, this SD's fingerprint, and that FR's own test file). Each was found by
// accident, and a per-file test cannot find the next one. The list below is the standing census.
//
// A grep that cannot see a file does not report an error. It reports NOTHING, which reads exactly
// like a clean result. That is why this is a test and not a convention.
//
// NOTE ON STYLE: every control character below is built with String.fromCharCode(). Writing them
// as backslash escapes is how the original defect got introduced in the first place — an escape
// typed into a file-writing tool can arrive as the raw byte it denotes, and the difference is
// invisible on screen. Constructing them in code makes the source unambiguous and keeps THIS file
// from tripping the very rule it enforces.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** True for bytes that must never appear raw in source: C0 controls other than tab/LF/CR. */
const isForbiddenControlByte = (b) => b < 9 || (b > 13 && b < 32);

// Known offenders that predate this guard, listed EXPLICITLY rather than pattern-excluded.
// The assertion below is exact-set equality, so this list cannot rot in either direction: a new
// offender fails, and REMOVING a listed file (i.e. fixing it) also fails until it is delisted.
// A carve-out you can forget about is not a guard.
const KNOWN_NUL_FILES = [
  // Deliberately uses 0x00 as a group-key delimiter ("delimiter cannot appear in a uuid, the enum
  // entry_type, or a currency code" — a sound instinct about collisions, unaware of the ripgrep
  // consequence). Belongs to SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-A (78e006d164b), not to
  // this SD; the fix is mechanical (write the byte as an escape, which is byte-identical at
  // runtime) but it is another SD's file, so it is routed as an incidental finding, not edited here.
  'lib/income/first-revenue-rollup-aggregator.js',

  // The test that enforces "no literal NUL" in solomon-advisory.cjs carries a raw one in its own
  // prose, at the line describing the escape. Its ASSERTIONS are correct and use the escaped form;
  // only the comment holds the byte, so the file it guards is clean while the guard itself is
  // grep-invisible. Belongs to SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 (1a62ac54ee1). Also
  // routed rather than edited — same reason, and it is the sharpest available argument for why
  // this rule needs to be enforced mechanically instead of remembered.
  'tests/unit/solomon-advisory-no-literal-nul.test.js',
];

const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

function trackedSourceFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out
    .toString('utf8')
    .split(NUL)
    .filter(Boolean)
    .filter((f) => SOURCE_EXT.has(path.extname(f)));
}

describe('no raw NUL bytes in tracked source files', () => {
  const files = trackedSourceFiles();

  it('finds a non-trivial number of files to check (control)', () => {
    // Without this, a broken git invocation would return zero files and the guard below would pass
    // while checking nothing at all — a green light from an instrument that never ran.
    expect(files.length).toBeGreaterThan(500);
  });

  it('detects a NUL when one is genuinely present (control)', () => {
    // Proves the detector can produce a positive. An absence claim from a check never shown to
    // fire is worth nothing.
    const synthetic = Buffer.from(`const sep = '${NUL}';`, 'utf8');
    expect(synthetic.includes(0)).toBe(true);
    expect([...synthetic].some(isForbiddenControlByte)).toBe(true);
  });

  it('no source file outside the known list contains a NUL byte', () => {
    const offenders = files.filter((f) => {
      try {
        return readFileSync(path.join(REPO_ROOT, f)).includes(0);
      } catch {
        return false; // deleted-but-tracked, symlink, etc.
      }
    });

    expect(offenders.sort()).toEqual([...KNOWN_NUL_FILES].sort());
  });

  it('the file this SD fixed stays clean and greppable', () => {
    // Pinned by name: this is the file whose NUL made it binary, and re-introducing one would
    // silently re-blind every repo-wide search that touches the learning loop.
    const buf = readFileSync(path.join(REPO_ROOT, 'lib/learning/issue-knowledge-base.js'));
    expect(buf.includes(0)).toBe(false);
    expect([...buf].some(isForbiddenControlByte)).toBe(false);

    // ...and the separator is still written as a visible escape rather than the raw byte, so the
    // source says what it does.
    const expected = `const FIELD_SEP = '${BACKSLASH}u001f';`;
    expect(buf.toString('utf8')).toContain(expected);
  });

  it('this guard file is itself clean (no raw control bytes)', () => {
    // The failure mode being guarded against is one where the source and its rendering disagree.
    // A guard written with the same hazard it polices would be the fourth instance of this bug in
    // one SD, so it is asserted rather than assumed.
    const self = readFileSync(fileURLToPath(import.meta.url));
    expect(self.includes(0)).toBe(false);
    expect([...self].some(isForbiddenControlByte)).toBe(false);
  });
});
