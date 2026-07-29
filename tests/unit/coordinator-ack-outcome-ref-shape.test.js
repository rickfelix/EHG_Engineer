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

/**
 * Findings from adversarial EXEC review — every one of these was ACCEPTED or WRONGLY REJECTED by my
 * first two versions of the rule. Kept as a named block because each is a live hole, not a theory.
 */
describe('FR-5 — placeholders, sentinel near-misses, and the bounds review broke', () => {
  it('rejects single-token PLACEHOLDERS, which are worse than the sentinel', () => {
    // n/a is STRICTLY worse than NO_ARTIFACT: selectNegativeBackprop SKIPS a NO_ARTIFACT ref because
    // it knows there is nothing to track, but carries 'n/a' as a genuine link that can never match.
    // My error message steers operators straight here ("supply the identifier, or --no-artifact"),
    // so someone with neither types this.
    for (const ref of ['n/a', 'N/A', 'na', 'none', 'None', 'nil', 'TBD', 'todo', 'unknown', 'moot',
      'done', 'merged', 'various', 'multiple', 'verbal', '-', '--', '...']) {
      expect(isMatchableRef(ref), ref).toBe(false);
    }
  });

  it('rejects NEAR-MISS spellings of the sentinel — the worst case of all', () => {
    // The operator believes they recorded "nothing to track"; isNoArtifactRef says otherwise, so the
    // row is billed as a real link, is permanently unmatchable, and is NOT skipped by the back-prop.
    for (const ref of ['no_artifact', 'NO-ARTIFACT', 'no-artifact', 'No_Artifact', 'noartifact']) {
      expect(isNoArtifactRef(ref), ref).toBe(false);       // the premise: these are NOT the sentinel
      expect(isMatchableRef(ref), ref).toBe(false);        // ...so they must be rejected
    }
    // ...while the exact sentinel keeps working.
    expect(isNoArtifactRef('NO_ARTIFACT')).toBe(true);
  });

  it('ACCEPTS a bare PR number — pr_number is one of the matcher own harvest keys', () => {
    // False rejection found by review: my 3-char floor swallowed '#7' and '42'. Rejecting a real
    // identifier is worse than the defect, because it blocks a legitimate accept at the CLI.
    for (const ref of ['42', '#7', '7', '6284', '#6284']) {
      expect(isMatchableRef(ref), ref).toBe(true);
    }
  });

  it('ACCEPTS a long signed CI-run URL — the 200-char ceiling was too tight', () => {
    const url = 'https://github.com/rickfelix/EHG_Engineer/actions/runs/1234567890/jobs/9876543210?check_suite_focus=true&sig=' + 'a'.repeat(120);
    expect(url.length).toBeGreaterThan(200);
    expect(isMatchableRef(url)).toBe(true);
  });
});

describe('FR-6 — only SD keys, only uppercase', () => {
  function capture() {
    const rows = [];
    return { rows, from: () => ({
      upsert(r) { rows.push(r); return Promise.resolve({ error: null }); },
      update: () => ({ in: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }),
    }) };
  }

  it('does NOT derive a key from a QF ref — quick fixes are not in strategic_directives_v2', async () => {
    // THE BLOCKER REVIEW FOUND. Only 2 of 5453 SDs carry a QF- key, so a QF-derived key never
    // resolves: the row is re-selected by every scheduled batch forever, burning a slot and logging
    // a skip. That is the "inert path becomes a noisy path" harm my earlier negative control was
    // written to prevent — it covered the commit-sha case and missed the case FR-6 actually adds.
    const m = require_('../../scripts/coordinator-ack-adam.cjs');
    const c = capture();
    await m.recordLedgerDecision(c, { correlationId: 'q1', disposition: 'accepted', outcomeRef: 'QF-20260728-112' });
    expect(c.rows[0].outcome_ref).toBe('QF-20260728-112');
    expect(c.rows[0].outcome_sd_key).toBeUndefined();
  });

  it('does NOT derive a key from a LOWERCASE sd key — sd_key is stored uppercase', async () => {
    const m = require_('../../scripts/coordinator-ack-adam.cjs');
    const c = capture();
    await m.recordLedgerDecision(c, { correlationId: 'q2', disposition: 'accepted', outcomeRef: 'sd-leo-infra-advice-outcome-ledger-001' });
    expect(c.rows[0].outcome_sd_key).toBeUndefined();
  });
});
