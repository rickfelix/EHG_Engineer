// Unit tests for the design-fidelity activation (SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001).
// OBSERVE-ONLY-FIRST: the gate observes/logs would-rejects and NEVER blocks. These cover the
// pure detector, the swallow-all witness recorder, the dormant-scorer live dispatch (spy-proven),
// the no-false-reject fence, and the DESIGN_FIDELITY_GATE_MODE fail-safe allowlist.
// NOTE: vitest.config.js excludes **/.worktrees/**, so run this from inside the worktree by file
// path: npx vitest run tests/unit/eva/bridge/design-fidelity-observe.test.js
import { describe, it, expect, vi } from 'vitest';
import {
  isCustomerFacingLanding, isVentureAppTarget, hasDesignPass, resolveDesignFidelityGateMode,
  CUSTOMER_FACING_LANDING_RE,
} from '../../../../lib/eva/bridge/customer-facing-design-detector.js';
import {
  observeDesignFidelityWouldReject, dispatchDesignFidelityScorer, observeVentureCompletionDesignPass,
  DESIGN_FIDELITY_GATE_ID,
} from '../../../../lib/eva/bridge/design-fidelity-observe.js';

// ---- (1) isCustomerFacingLanding: TRUE on a MarketLens-style landing, FALSE on a backend leaf ----
describe('isCustomerFacingLanding — detects venture landings, fences backend leaves (no false-reject)', () => {
  it('TRUE: MarketLens landing (venture target + landing signal)', () => {
    expect(isCustomerFacingLanding(
      { target_application: 'marketlens' },
      'rebuild the MarketLens landing page hero and marketing sections',
      'MarketLens Landing Rebuild',
    )).toBe(true);
  });
  it('TRUE: customer-facing / homepage / marketing-site wording', () => {
    expect(isCustomerFacingLanding({ target_application: 'venturex' }, 'the customer-facing homepage', 'x')).toBe(true);
    expect(isCustomerFacingLanding({ target_application: 'venturex' }, 'public marketing site', 'x')).toBe(true);
  });
  it('FALSE: a genuine backend leaf on a venture app (no landing signal) — the no-false-reject fence', () => {
    expect(isCustomerFacingLanding(
      { target_application: 'datadistill' },
      'the D1 distillation engine / worker that processes the ingest queue',
      'DataDistill D1 distillation engine',
    )).toBe(false);
  });
  it('FALSE: a backend worker mentioning hero-image / landing zone (FR-1 — page-noun required, not bare hero/landing)', () => {
    expect(isCustomerFacingLanding(
      { target_application: 'datadistill' },
      'the hero-image worker that warms the landing thumbnail cache in the landing zone',
      'DataDistill hero-image worker',
    )).toBe(false);
  });
  it('TRUE: front page / product page (FR-4 recall)', () => {
    expect(isCustomerFacingLanding({ target_application: 'venturex' }, 'rebuild the product page', 'x')).toBe(true);
    expect(isCustomerFacingLanding({ target_application: 'venturex' }, 'the front page redesign', 'x')).toBe(true);
  });
  it('FALSE: EHG_Engineer harness target is never a customer-facing landing', () => {
    expect(isCustomerFacingLanding({ target_application: 'EHG_Engineer' }, 'a landing page', 'landing')).toBe(false);
  });
  it('FALSE: no target application (unknown surface)', () => {
    expect(isCustomerFacingLanding({ target_application: null }, 'landing page', 'landing')).toBe(false);
  });
  it('isVentureAppTarget: venture yes, EHG_Engineer/empty no (case-insensitive)', () => {
    expect(isVentureAppTarget('MarketLens')).toBe(true);
    expect(isVentureAppTarget('ehg_engineer')).toBe(false);
    expect(isVentureAppTarget('EHG_ENGINEER')).toBe(false);
    expect(isVentureAppTarget('')).toBe(false);
    expect(isVentureAppTarget(null)).toBe(false);
  });
  it('CUSTOMER_FACING_LANDING_RE is exported for review', () => {
    expect(CUSTOMER_FACING_LANDING_RE).toBeInstanceOf(RegExp);
  });
});

// ---- (6) DESIGN_FIDELITY_GATE_MODE ALLOWLIST TABLE — only exact 'bind' blocks (fail-open guard) ----
describe('resolveDesignFidelityGateMode — allowlist, fails SAFE to observe (release-blocking guard)', () => {
  const cases = [
    ['bind', 'bind'],
    ['observe', 'observe'],
    [undefined, 'observe'],
    ['', 'observe'],
    ['BIND ', 'observe'],   // trailing space -> not exact
    ['binding', 'observe'], // superstring -> not exact
    ['Bind', 'observe'],    // case -> not exact
    ['BIND', 'observe'],
    ['1', 'observe'],
    ['true', 'observe'],
    ['garbage', 'observe'],
  ];
  for (const [input, expected] of cases) {
    it(`DESIGN_FIDELITY_GATE_MODE=${JSON.stringify(input)} -> ${expected}`, () => {
      expect(resolveDesignFidelityGateMode({ DESIGN_FIDELITY_GATE_MODE: input })).toBe(expected);
    });
  }
  it('missing env object -> observe (fail-safe)', () => {
    expect(resolveDesignFidelityGateMode()).toBe('observe');
    expect(resolveDesignFidelityGateMode({})).toBe('observe');
  });
});

// ---- (2)+(FR-4) hasDesignPass permutations ----
describe('hasDesignPass — Stitch/S17 artifact OR completed design child, each path independent', () => {
  it('Stitch artifact alone -> true', () => {
    expect(hasDesignPass({ designArtifacts: [{ artifact_type: 'stitch_export' }], childSds: [] })).toBe(true);
  });
  it('S17 design stage artifact alone -> true', () => {
    expect(hasDesignPass({ designArtifacts: [{ stage: 'S17', name: 'design tokens' }], childSds: [] })).toBe(true);
  });
  it('completed design child alone -> true', () => {
    expect(hasDesignPass({ designArtifacts: [], childSds: [{ sd_type: 'feature', title: 'landing design pass', status: 'completed' }] })).toBe(true);
  });
  it('both paths present -> true', () => {
    expect(hasDesignPass({ designArtifacts: [{ artifact_type: 'design' }], childSds: [{ title: 'page-quality', status: 'completed' }] })).toBe(true);
  });
  it('a design child that is NOT completed -> false', () => {
    expect(hasDesignPass({ designArtifacts: [], childSds: [{ title: 'design', status: 'in_progress' }] })).toBe(false);
  });
  it('no artifact and no design child -> false (the MarketLens case)', () => {
    expect(hasDesignPass({ designArtifacts: [], childSds: [{ sd_type: 'feature', title: 'backend api', status: 'completed' }] })).toBe(false);
  });
});

// ---- (3) observeDesignFidelityWouldReject — records, skips, SWALLOW-ALL ----
describe('observeDesignFidelityWouldReject — records via witness sink; skips safely; swallow-all', () => {
  it('records a verdict=rejected witness event for a real judged session', async () => {
    const rec = vi.fn().mockResolvedValue({ id: 'w1' });
    const r = await observeDesignFidelityWouldReject(
      { judgedSessionId: 'sess-A', reason: 'no design pass' },
      { recordWitnessEvent: rec, supabase: {} },
    );
    expect(r).toEqual({ recorded: true, skipped: false });
    expect(rec).toHaveBeenCalledTimes(1);
    const arg = rec.mock.calls[0][1];
    expect(arg.gateId).toBe(DESIGN_FIDELITY_GATE_ID);
    expect(arg.verdict).toBe('rejected');
    expect(arg.witnessSessionId).toBe('gate-harness');
    expect(arg.judgedSessionId).toBe('sess-A');
  });
  it('SKIPS (no record) when there is no judged session', async () => {
    const rec = vi.fn();
    const r = await observeDesignFidelityWouldReject({ judgedSessionId: null, reason: 'x' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r.skipped).toBe(true);
    expect(rec).not.toHaveBeenCalled();
  });
  it('SKIPS when judged session IS the witness identity (a session cannot witness itself)', async () => {
    const rec = vi.fn();
    const r = await observeDesignFidelityWouldReject({ judgedSessionId: 'gate-harness', reason: 'x' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r.skipped).toBe(true);
    expect(rec).not.toHaveBeenCalled();
  });
  it('SWALLOW-ALL: a throwing witness write returns recorded=false and does NOT throw', async () => {
    const rec = vi.fn().mockRejectedValue(new Error('insert failed / RLS denial'));
    const r = await observeDesignFidelityWouldReject({ judgedSessionId: 'sess-A', reason: 'x' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r.recorded).toBe(false);
    expect(r.skipped).toBe(false); // it attempted, but the failure was swallowed
  });
});

// ---- (4) dispatchDesignFidelityScorer — spy-proven LIVE dispatch, fence, null->would-reject, observe toggle ----
describe('dispatchDesignFidelityScorer — the dormant scorer gets a LIVE call site (spy-proven)', () => {
  const landing = { target_application: 'marketlens', title: 'MarketLens Landing Rebuild' };
  const landingCtx = { scopeText: 'the MarketLens landing page', titleText: 'MarketLens Landing Rebuild', judgedSessionId: 'sess-A' };

  it('FENCED: a non-customer-facing SD does not dispatch the scorer', async () => {
    const scorer = vi.fn();
    const r = await dispatchDesignFidelityScorer({ target_application: 'ehg_engineer' }, { scopeText: 'backend', judgedSessionId: 'sess-A' }, { scoreDesignFidelity: scorer });
    expect(r.dispatched).toBe(false);
    expect(scorer).not.toHaveBeenCalled();
  });
  it('LIVE DISPATCH: the scorer function IS invoked for a customer-facing landing (spy)', async () => {
    const scorer = vi.fn().mockReturnValue(null); // Stitch deprecated -> null
    const rec = vi.fn().mockResolvedValue({ id: 'w' });
    const r = await dispatchDesignFidelityScorer(landing, landingCtx, { scoreDesignFidelity: scorer, recordWitnessEvent: rec, supabase: {} });
    expect(scorer).toHaveBeenCalledTimes(1); // <-- proves the scorer is no longer dormant
    expect(r.dispatched).toBe(true);
    expect(r.wouldReject).toBe(true); // FR-2: null is NOT a silent pass
    expect(rec).toHaveBeenCalledTimes(1);
  });
  it('null result -> would-reject; a high score -> NOT a would-reject', async () => {
    const rec = vi.fn().mockResolvedValue({});
    const low = await dispatchDesignFidelityScorer(landing, landingCtx, { scoreDesignFidelity: () => ({ score: 20 }), recordWitnessEvent: rec, supabase: {} });
    expect(low.wouldReject).toBe(true);
    const high = await dispatchDesignFidelityScorer(landing, landingCtx, { scoreDesignFidelity: () => ({ score: 90 }), recordWitnessEvent: rec, supabase: {} });
    expect(high.wouldReject).toBe(false);
  });
  it('observe:false -> live dispatch WITHOUT recording (caller owns recording)', async () => {
    const scorer = vi.fn().mockReturnValue(null);
    const rec = vi.fn();
    const r = await dispatchDesignFidelityScorer(landing, landingCtx, { scoreDesignFidelity: scorer, recordWitnessEvent: rec, supabase: {}, observe: false });
    expect(scorer).toHaveBeenCalledTimes(1); // still a live call site
    expect(r.wouldReject).toBe(true);
    expect(rec).not.toHaveBeenCalled();      // but no recording
  });
  it('a throwing scorer is treated as null (would-reject), never propagates', async () => {
    const rec = vi.fn().mockResolvedValue({});
    const r = await dispatchDesignFidelityScorer(landing, landingCtx, { scoreDesignFidelity: () => { throw new Error('boom'); }, recordWitnessEvent: rec, supabase: {} });
    expect(r.wouldReject).toBe(true);
    expect(r.score).toBeNull();
  });
});

// ---- (FR-4) observeVentureCompletionDesignPass — exit check, gated on hasDesignPass (no false-reject) ----
describe('observeVentureCompletionDesignPass — records only when a landing lacks a design pass', () => {
  const landing = { target_application: 'marketlens', title: 'MarketLens Landing' };
  it('landing with NO design pass -> would-reject recorded', async () => {
    const rec = vi.fn().mockResolvedValue({});
    const r = await observeVentureCompletionDesignPass(landing, { designArtifacts: [], childSds: [], scopeText: 'landing page', judgedSessionId: 'sess-A' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r).toEqual({ applicable: true, wouldReject: true });
    expect(rec).toHaveBeenCalledTimes(1);
  });
  it('landing WITH a completed design child -> NO would-reject (no false-reject)', async () => {
    const rec = vi.fn();
    const r = await observeVentureCompletionDesignPass(landing, { designArtifacts: [], childSds: [{ title: 'design pass', status: 'completed' }], scopeText: 'landing page', judgedSessionId: 'sess-A' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r.wouldReject).toBe(false);
    expect(rec).not.toHaveBeenCalled();
  });
  it('a non-landing SD is not applicable (fenced)', async () => {
    const rec = vi.fn();
    const r = await observeVentureCompletionDesignPass({ target_application: 'ehg_engineer' }, { scopeText: 'backend', judgedSessionId: 'sess-A' }, { recordWitnessEvent: rec, supabase: {} });
    expect(r.applicable).toBe(false);
    expect(rec).not.toHaveBeenCalled();
  });
});

// ---- (7) pure/never-throws contract on malformed/null input (mirrors classifyBackendLeaf) ----
describe('detector functions are pure and NEVER throw on malformed input', () => {
  it('isCustomerFacingLanding survives null/undefined/non-string input', () => {
    expect(() => isCustomerFacingLanding(null, null, null)).not.toThrow();
    expect(() => isCustomerFacingLanding(undefined, 123, {})).not.toThrow();
    expect(isCustomerFacingLanding({}, undefined, undefined)).toBe(false);
  });
  it('hasDesignPass survives null/undefined/non-array input', () => {
    expect(() => hasDesignPass(null)).not.toThrow();
    expect(() => hasDesignPass({ designArtifacts: 'nope', childSds: 42 })).not.toThrow();
    expect(hasDesignPass()).toBe(false);
  });
  it('resolveDesignFidelityGateMode survives null/undefined', () => {
    expect(() => resolveDesignFidelityGateMode(null)).not.toThrow();
    expect(resolveDesignFidelityGateMode(null)).toBe('observe');
  });
});
