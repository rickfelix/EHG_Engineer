/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-5 / TS-9 — outcome_ref must be matchable, not prose.
 *
 * The FR-4 negative back-propagation attributes ONLY through EXACT equality (correct — a heuristic
 * would mis-attribute a revert to the wrong advice). But resolveOutcomeRef accepted any non-empty
 * string, and `--outcome-ref <artifact-id>` was a hint rather than a rule, so operators typed
 * sentences.
 *
 * MEASURED ON THE LIVE TABLE, 2026-07-29: of 170 populated refs, exactly FIVE are matchable tokens
 * and 165 are prose (median 134 chars, longest 1260). The production selector returns zero matches.
 * A prose ref is the worst of both worlds — it satisfies the FR-3 mandatory-linkage check, so the
 * row is BILLED as linked, while being permanently unreachable by the thing that linkage exists for.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { isMatchableRef, resolveOutcomeRef, isNoArtifactRef } = require_('../../scripts/coordinator-ack-adam.cjs');

describe('FR-5 — the token/sentence discriminant', () => {
  it('accepts every identifier scheme in live use, including ones no allow-list anticipated', () => {
    // MY FIRST VERSION ENUMERATED SCHEMES and rejected 'PR-6284' — a real identifier already used in
    // the existing suite. A false rejection is worse than the defect: it blocks a legitimate accept
    // and teaches operators to route around the check. The matcher compares by exact equality and
    // does not care about scheme, so neither does this.
    for (const ref of [
      'PR-6284', 'SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001', 'QF-20260728-112',
      '9f38f8200d5', '2f2355337d3a4b5c6d7e8f90123456789abcdef0',
      '81263948-ffa4-49ac-8173-d7e030ef1f3e', '#783',
      'https://github.com/rickfelix/ehg/pull/783',
      'SOME-SCHEME-NOBODY-HAS-INVENTED-YET-42',
    ]) {
      expect(isMatchableRef(ref), ref).toBe(true);
    }
  });

  it('rejects prose — including the actual shapes found in the live table', () => {
    for (const ref of [
      'followed (dispatch pressed) — later found moot: target already merged',
      'Solomon 07-20 18:51 ground read on -A (SESSION-VIEW-BROWSER)',
      'accepted the recommendation and will track it in the next review',
      '   ', '', 'x',
    ]) {
      expect(isMatchableRef(ref), JSON.stringify(ref)).toBe(false);
    }
  });

  it('rejects a prose ref at the WRITE point, with guidance rather than a silent pass', () => {
    const r = resolveOutcomeRef('accepted', { outcomeRef: 'we shipped it as part of the sweep' });
    expect(r.error).toBeTruthy();
    expect(r.ref).toBeUndefined();
    // The message must name what to supply. An error that only says "invalid" trains people to
    // reach for --no-artifact, which converts a linkable row into a permanently unlinkable one.
    expect(r.error).toMatch(/exact equality/i);
    expect(r.error).toMatch(/no-artifact/);
  });

  it('the NO_ARTIFACT sentinel is exempt — deliberately unmatchable and it says so', () => {
    // The sentinel exists to record "there is genuinely nothing to track". It must keep working, or
    // the only escape from the new check would be to invent a fake identifier.
    expect(isNoArtifactRef('NO_ARTIFACT')).toBe(true);
    const r = resolveOutcomeRef('accepted', { noArtifact: 'verbal chairman ack' });
    expect(r.error).toBeUndefined();
    expect(r.ref).toBe('NO_ARTIFACT: verbal chairman ack');
  });

  it('a matchable ref still passes end to end', () => {
    // Negative control for the four above: without this, rejecting EVERYTHING would satisfy them.
    const r = resolveOutcomeRef('accepted', { outcomeRef: 'SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001' });
    expect(r.error).toBeUndefined();
    expect(r.ref).toBe('SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001');
  });

  it('applies to rejected/deferred too, where linkage is optional but a stray ref is still recorded', () => {
    // The optional-linkage path also writes outcome_ref when one is supplied, so prose could enter
    // through it and be just as unmatchable.
    expect(resolveOutcomeRef('rejected', { outcomeRef: 'did not agree with the approach' }).error).toBeTruthy();
    expect(resolveOutcomeRef('rejected', { outcomeRef: 'PR-6284' }).ref).toBe('PR-6284');
    expect(resolveOutcomeRef('rejected', {}).ref).toBeNull();
  });
});
