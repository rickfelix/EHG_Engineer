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

/**
 * FR-6 — outcome_sd_key drives the FORWARD reconciliation path and had no production writer.
 *
 * solomon-ledger-reconcile.cjs:64 skips every row lacking it ("no outcome_sd_key") and :70 resolves
 * the SD by it to derive an outcome. Measured: NULL on 1062 of 1109 rows, and the 47 populated ones
 * came from one-off scripts, not from any production path. That is why the reconciler is inert on
 * ~95% of the ledger — the same starvation as FR-5, on the other leg. Both mechanisms were built and
 * neither was fed.
 *
 * NOTE THE CORRECTION IN THE SD'S OWN RECORD: this SD originally asserted "zero writers, NULL on
 * 1094/1094". The table said 47, and so did the SD's own description body — it contradicted itself.
 */
describe('FR-6 — outcome_sd_key is derived when the artifact is an SD/QF key', () => {
  function capturingClient() {
    const rows = [];
    return {
      rows,
      from() {
        return {
          upsert(row) { rows.push(row); return Promise.resolve({ error: null }); },
          update() { return { in: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }; },
          select() { return { eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }; },
        };
      },
    };
  }

  it('populates outcome_sd_key from an SD-key artifact', async () => {
    const m = require_('../../scripts/coordinator-ack-adam.cjs');
    const c = capturingClient();
    await m.recordLedgerDecision(c, { correlationId: 'c1', disposition: 'accepted', outcomeRef: 'SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001' });
    expect(c.rows[0].outcome_sd_key).toBe('SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001');
    // DERIVED, never separately supplied: two hand-entered fields would drift and then disagree
    // about which artifact a decision tracked.
    expect(c.rows[0].outcome_ref).toBe(c.rows[0].outcome_sd_key);
  });

  it('leaves outcome_sd_key unset for a NON-SD artifact', async () => {
    // The negative control. Without it, "always copy outcome_ref into outcome_sd_key" would satisfy
    // the test above — and the reconciler would then look up SDs by a commit sha and find nothing,
    // turning an inert path into a noisy one.
    const m = require_('../../scripts/coordinator-ack-adam.cjs');
    const c = capturingClient();
    await m.recordLedgerDecision(c, { correlationId: 'c2', disposition: 'accepted', outcomeRef: 'https://github.com/rickfelix/ehg/pull/783' });
    expect(c.rows[0].outcome_ref).toBeTruthy();
    expect(c.rows[0].outcome_sd_key).toBeUndefined();
  });

  it('never derives a key from the NO_ARTIFACT sentinel', async () => {
    const m = require_('../../scripts/coordinator-ack-adam.cjs');
    const c = capturingClient();
    await m.recordLedgerDecision(c, { correlationId: 'c3', disposition: 'accepted', noArtifact: 'verbal ack' });
    expect(c.rows[0].outcome_ref).toMatch(/^NO_ARTIFACT/);
    expect(c.rows[0].outcome_sd_key).toBeUndefined();
  });
});
