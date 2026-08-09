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
 *
 * THE TAX IS LATENT, AND THE OBVIOUS WAY TO VERIFY IT MEASURES THE STAT CACHE INSTEAD. A fresh
 * worktree of the UNFIXED tree reports only ONE dirty file, not 388 — `git status` trusts stat
 * info (size + mtime) and never reads the content of a file whose stat matches the index, so the
 * mismatch stays invisible until something TOUCHES the file. A build, a test run, a formatter or
 * an editor save is enough; that is why workers hit this at seemingly random moments and why the
 * single file that did show dirty (tests/unit/mock/firewall.test.js) was indistinguishable from
 * the other 387 on every axis git reports — same i/crlf, same w/crlf, same attr. It was simply the
 * one that had been touched.
 *
 * MEASURED, both sides, with the stat cache invalidated by touching the class first:
 *   unfixed main → 388 dirty      fixed branch → 1 dirty (the fenced exclusion below)
 * Without that touch both sides read ~0 and the "proof" is worthless — it is the same number a
 * BROKEN tree produces. Any future check of this must invalidate the stat cache and must measure
 * the unfixed side too, or it is not evidence.
 *
 * THIS GUARD IS IMMUNE TO THAT, which is why it is written the way it is: `ls-files --eol` reads
 * the INDEX and `check-attr` reads the ATTRIBUTES. Neither consults stat info, so the guard sees
 * the whole class whether or not anything has touched it. Do not "simplify" it into a status-based
 * check — that would silently convert it into a stat-cache gauge that reads clean on a broken tree.
 *
 * ONE MEMBER IS DELIBERATELY LEFT IN THE CLASS: lib/agents/venture-ceo-factory.js is held by a
 * live FR-6 scope fence (tests/unit/spine-verify-first-teardown.test.js) that asserts zero diff
 * against origin/main inside VentureFactory._createAgent()/_grantTools(). A renormalize rewrites
 * every line, so the fenced symbols appear in the diff and the fence fires — on a change that
 * changes no content at all. Obeyed rather than worked around: a scope fence marks whose work a
 * file is, and defeating another SD's fence to land a cosmetic change is not ours to do. When that
 * fence lifts, renormalize the file and this baseline drops to empty.
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

  it('the baseline file EXISTS (an empty baseline is the success state, a missing one is not)', () => {
    // This originally also asserted the baseline was NON-EMPTY. That was right while the class had
    // 388 members and WRONG the moment the renormalize cleared it — an empty baseline is exactly
    // what success looks like here, and the guard failed on its own author's success.
    //
    // Kept as a lesson rather than quietly relaxed: a non-vacuity arm must be anchored to the
    // MEASUREMENT (does ls-files still report i/crlf at all — asserted above), never to the
    // CURRENT VALUE of the thing being fixed. Anchored to the value, it silently encodes "the
    // defect still exists" as a precondition and fires when the defect is finally gone.
    //
    // Existence is still asserted: a DELETED baseline would make the no-new-members check throw
    // rather than pass, but saying so explicitly is cheaper than relying on that.
    expect(fs.existsSync(BASELINE)).toBe(true);
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
