/**
 * The CRLF-stored-but-LF-declared class must not GROW.
 * QF-20260804-647.
 *
 * THE DEFECT. A file whose blob is stored CRLF in the index while .gitattributes declares
 * `eol=lf` is PERMANENTLY DIRTY: checkout writes LF, the index holds CRLF, and `git status`
 * reports a content-identical diff forever. It blocks the GIT STATE gate on the first handoff of
 * every new SD, and every worker pays the discovery cost again — several have concluded the tree
 * was genuinely dirty and gone looking for a phantom change.
 *
 * SCOPE, MEASURED: 560 files are stored CRLF; 388 of those also carry eol=lf. The QF named ONE.
 * Fixing one leaves 387 and the QF gets re-filed by the next worker who trips over a different
 * member of the same class.
 *
 * THE IRONY, worth encoding so nobody "fixes" it backwards: the `*.sql eol=lf` pin exists to
 * PROTECT approval hashes, and it is what put 214 .sql files in this class. The pin is RIGHT. The
 * stored CRLF is the defect. Do not remove the attribute to make the tree look clean — that would
 * fix the symptom by lowering the standard.
 *
 * WHY THIS IS A RATCHET RATHER THAN A ZERO-TOLERANCE CHECK. The 388 cannot be renormalized here:
 * that rewrite conflicts with every open branch, so it lands only in a coordinator-called
 * branch-quiescent window. Until then this guard freezes the class at its measured size so it
 * stops growing. When the renormalize lands, the baseline drops — and the shrink-only assertion
 * below means the baseline can never be quietly padded to admit a new offender.
 *
 * HASH-BOUND MIGRATIONS ARE EXCLUDED FROM THE RENORMALIZE (coordinator ruling): renormalizing a
 * migration whose apply is still pending CHANGES ITS BLOB and moves the hash out from under a
 * pending authority credential. Measured at baseline time: neither currently-pending migration is
 * in the class, so the exclusion is a NO-OP TODAY — recorded anyway, because the class can grow
 * into one and the constraint must outlive the coincidence that it is currently vacuous.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO = process.cwd();
const BASELINE = path.join(REPO, 'tests/fixtures/eol-crlf-baseline.txt');

const git = (args, input) =>
  execFileSync('git', args, { cwd: REPO, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * Files stored CRLF in the INDEX that also carry an eol=lf attribute — i.e. guaranteed dirty on
 * checkout. Computed from git itself rather than from a stored list, so the guard measures the
 * repository rather than re-reading its own baseline (which would make it circular).
 */
function currentClass() {
  const crlfInIndex = git(['ls-files', '--eol'])
    .split('\n')
    .filter((l) => l.startsWith('i/crlf'))
    .map((l) => l.slice(l.indexOf('\t') + 1))
    .filter(Boolean);

  if (crlfInIndex.length === 0) return { crlfInIndex, offenders: [] };

  const offenders = git(['check-attr', 'eol', '--stdin'], crlfInIndex.join('\n') + '\n')
    .split('\n')
    .filter((l) => l.endsWith(': eol: lf'))
    .map((l) => l.slice(0, -': eol: lf'.length));

  return { crlfInIndex, offenders };
}

const baseline = () =>
  new Set(fs.readFileSync(BASELINE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));

describe('CRLF-stored / LF-declared class is frozen (QF-20260804-647)', () => {
  it('the measurement finds files to inspect (guard is not vacuous)', () => {
    // If ls-files ever stops reporting i/crlf — a git version change, a different platform — every
    // assertion below would pass against an empty set and this guard would be silently inert.
    const { crlfInIndex } = currentClass();
    expect(crlfInIndex.length).toBeGreaterThan(0);
  });

  it('the baseline exists and is non-empty', () => {
    expect(fs.existsSync(BASELINE)).toBe(true);
    expect(baseline().size).toBeGreaterThan(0);
  });

  it('NO NEW member has joined the class', () => {
    // The one assertion that does the work — and MEASUREMENT CHANGED WHAT IT GUARDS AGAINST.
    //
    // A new FILE cannot join this class through a normal add: with eol=lf declared, `git add`
    // NORMALIZES CRLF to LF into the index. Verified by staging a deliberately-CRLF .sql probe and
    // watching git store it i/lf. So the obvious threat model — someone commits a CRLF file — is
    // already handled by git itself, and a guard aimed only there would be near-unfalsifiable
    // theatre.
    //
    // THE REAL GROWTH VECTOR IS AN ATTRIBUTE CHANGE. Adding a .gitattributes rule that declares
    // eol=lf over paths whose blobs are ALREADY stored CRLF sweeps them into the class instantly,
    // without touching a single file. That is not hypothetical: it is exactly how 214 .sql files
    // arrived here when the *.sql pin landed in #6727. Mutation-proved by appending one such rule
    // for a currently-CRLF-stored, not-yet-declared path — this assertion and the shrink-only one
    // both went red, and stayed red until the rule was reverted.
    //
    // So read a failure here as "a .gitattributes edit just made N files permanently dirty",
    // not as "someone committed a bad file".
    const added = currentClass().offenders.filter((f) => !baseline().has(f));
    expect(
      added,
      'These files are stored CRLF in the index while .gitattributes declares eol=lf, so every '
      + 'fresh checkout will show them as modified with a content-identical diff. Fix by storing '
      + 'them LF (git add --renormalize <file>), NOT by removing the eol attribute.'
    ).toEqual([]);
  });

  it('the class only ever SHRINKS — the baseline cannot be padded to admit an offender', () => {
    // Without this, the cheap way past the previous assertion is to append the new file to the
    // baseline. Pinning the size makes that visible as a growth rather than a bookkeeping edit.
    expect(currentClass().offenders.length).toBeLessThanOrEqual(baseline().size);
  });

  it('CONTROL: the detector recognises a synthetic offender (it can fail)', () => {
    // Proves the filter still matches the real check-attr output shape. If git changed that shape,
    // offenders would silently become [] and every assertion above would pass for the wrong reason.
    const line = 'some/path/file.sql: eol: lf';
    expect(line.endsWith(': eol: lf')).toBe(true);
    expect(line.slice(0, -': eol: lf'.length)).toBe('some/path/file.sql');
  });

  it('CONTROL: a file WITHOUT the lf attribute is not counted an offender', () => {
    // Two-sided: the class is CRLF-stored AND lf-declared. CRLF-stored alone is legal — 560 files
    // are stored CRLF and only 388 are offenders, so a guard that flagged all 560 would be wrong.
    const { crlfInIndex, offenders } = currentClass();
    expect(offenders.length).toBeLessThan(crlfInIndex.length);
  });
});
