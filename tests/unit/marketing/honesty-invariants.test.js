/**
 * SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001 FR-1 — per-send honesty invariants.
 *
 * Two-sided throughout: every invariant is proven to BLOCK the dishonest send (a gate that
 * only passes is camouflage) AND to PASS the clean one (a gate that only blocks cannot
 * discriminate). The broadcast exemption gets its own narrowness control, because an
 * exemption nobody tests is indistinguishable from a global bypass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn().mockResolvedValue({ recorded: true, id: 'decision-1' }),
}));

// SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: checkStageGate()'s armed param defaults to
// isEnabled(), which opens its OWN live Supabase client from process.env (ignoring the
// injected test double) -- unmocked, every test here would make a real network call.
// Mocked to false (the safe, shadow-mode default) to keep this suite hermetic.
vi.mock('../../../lib/feature-flags/evaluator.js', () => ({ isEnabled: vi.fn().mockResolvedValue(false) }));

import { isEnabled } from '../../../lib/feature-flags/evaluator.js';
import {
  HONESTY_INVARIANTS,
  checkSuppressionInvariant,
  checkConsentInvariant,
  checkNonFabricationInvariant,
  checkAupVolumeInvariant,
  evaluateHonestyInvariants,
  checkPublishAuthorization,
} from '../../../lib/marketing/autonomy-gate.js';

/**
 * @param suppressed rows returned by the campaign_enrollments suppression query
 * @param contentRow  the marketing_content row (null = content unknown)
 * @param writeBudget the get_venture_write_budget_status RPC payload
 */
function makeSupabase({
  suppressed = [], suppressionError = null,
  contentRow = { lifecycle_state: 'SCHEDULE' }, contentError = null,
  writeBudget = { is_over_budget: false, writes_used: 1, writes_remaining: 99 }, writeBudgetError = null,
  autonomyState = 'autonomous', insertData = { id: 'ledger-1' }, insertError = null,
  // SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: undefined (the pre-existing default) leaves
  // current_lifecycle_stage absent, which fails checkStageGate CLOSED (unresolvable_stage) --
  // harmless for every pre-existing test here since armed defaults to isEnabled()=false
  // (mocked). Pass a number to exercise the call-site suppression tests below.
  ventureStage,
} = {}) {
  const enrollmentsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(() => Promise.resolve({ data: suppressed, error: suppressionError })),
  };
  const contentChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: contentRow, error: contentError })),
  };
  const autonomyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: autonomyState ? { autonomy_state: autonomyState } : null, error: null })),
  };
  const ledgerChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: insertError ? null : insertData, error: insertError })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const venturesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: { is_demo: false, name: 'Real Venture', launch_mode: 'live', current_lifecycle_stage: ventureStage },
      error: null,
    })),
  };
  // SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: checkStageGate() writes an audit_log row on
  // every in-scope evaluation. Own chain, matching the ventures pattern above -- sharing
  // ledgerChain would register as a spurious ledgerChain.insert call and corrupt this
  // file's "writes NO ledger row" assertions.
  const auditLogChain = { insert: vi.fn(() => Promise.resolve({ error: null })) };

  return {
    from: vi.fn((table) => {
      if (table === 'campaign_enrollments') return enrollmentsChain;
      if (table === 'marketing_content') return contentChain;
      if (table === 'venture_channel_autonomy') return autonomyChain;
      if (table === 'ventures') return venturesChain;
      if (table === 'audit_log') return auditLogChain;
      return ledgerChain;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: [writeBudget], error: writeBudgetError })),
    enrollmentsChain,
    contentChain,
    ledgerChain,
  };
}

const DIRECTED = 'email';           // NOT on the broadcast list — gets the strict path
const AUDIENCE = ['lead@example.com'];
const WITNESSES = { 'lead@example.com': 'cap-123' };

beforeEach(() => vi.clearAllMocks());

describe('FR-1 invariant 1 — suppression / opt-out', () => {
  it('BLOCKS a send to a suppressed recipient on a directed channel', async () => {
    const supabase = makeSupabase({ suppressed: [{ lead_email: 'lead@example.com' }] });
    const r = await checkSuppressionInvariant({ supabase, channelType: DIRECTED, audience: AUDIENCE });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('SUPPRESSION_LIST_HIT');
  });

  it('PASSES a send to a recipient with no opt-out on record', async () => {
    const supabase = makeSupabase({ suppressed: [] });
    const r = await checkSuppressionInvariant({ supabase, channelType: DIRECTED, audience: AUDIENCE });
    expect(r.ok).toBe(true);
    expect(r.basis).toBe('NO_SUPPRESSION_HIT');
  });

  it('reads the opt-out state as email-campaigns defines it, not a re-declared literal', async () => {
    const supabase = makeSupabase();
    await checkSuppressionInvariant({ supabase, channelType: DIRECTED, audience: AUDIENCE });
    expect(supabase.enrollmentsChain.eq).toHaveBeenCalledWith('status', 'unsubscribed');
  });

  it('fails CLOSED when the audience cannot be enumerated — an unknown audience is not an empty one', async () => {
    const supabase = makeSupabase();
    for (const audience of [undefined, [], ['ok@example.com', ''], 'not-an-array']) {
      const r = await checkSuppressionInvariant({ supabase, channelType: DIRECTED, audience });
      expect(r.ok).toBe(false);
      expect(r.refusal).toBe('SUPPRESSION_AUDIENCE_UNRESOLVED');
    }
  });

  it('fails CLOSED with a DISTINCT name when the suppression list cannot be read', async () => {
    const supabase = makeSupabase({ suppressionError: { message: 'db down' } });
    const r = await checkSuppressionInvariant({ supabase, channelType: DIRECTED, audience: AUDIENCE });
    expect(r.ok).toBe(false);
    // "could not check" must never be reported as "checked and clean".
    expect(r.refusal).toBe('SUPPRESSION_LOOKUP_FAILED');
  });

  it('records a broadcast channel as structurally inapplicable, not as a silent pass', async () => {
    const supabase = makeSupabase();
    const r = await checkSuppressionInvariant({ supabase, channelType: 'x', audience: undefined });
    expect(r.ok).toBe(true);
    expect(r.basis).toBe('NOT_APPLICABLE_BROADCAST_CHANNEL');
  });

  it('NARROWNESS CONTROL: the broadcast exemption does not leak to unlisted channels', async () => {
    const supabase = makeSupabase();
    // If BROADCAST_CHANNELS were ever widened to a catch-all, this is the arm that reds.
    const r = await checkSuppressionInvariant({ supabase, channelType: 'some-new-channel', audience: undefined });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('SUPPRESSION_AUDIENCE_UNRESOLVED');
  });
});

describe('FR-1 invariant 2 — consent / opt-in', () => {
  it('BLOCKS a recipient with no capture-record witness', () => {
    const r = checkConsentInvariant({ channelType: DIRECTED, audience: AUDIENCE, consentWitnesses: {} });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('CONSENT_WITNESS_MISSING');
    expect(r.detail).toBe('lead@example.com');
  });

  it('BLOCKS when only SOME recipients are witnessed — one unconsented recipient is enough', () => {
    const r = checkConsentInvariant({
      channelType: DIRECTED,
      audience: ['a@example.com', 'b@example.com'],
      consentWitnesses: { 'a@example.com': 'cap-1' },
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('b@example.com');
  });

  it('PASSES when every recipient carries a capture-record reference', () => {
    const r = checkConsentInvariant({ channelType: DIRECTED, audience: AUDIENCE, consentWitnesses: WITNESSES });
    expect(r.ok).toBe(true);
    expect(r.basis).toBe('CAPTURE_RECORD_WITNESSED');
  });

  it('delegates the witness rule to guardSequenceSend — a blank reference is refused there, not here', () => {
    const r = checkConsentInvariant({ channelType: DIRECTED, audience: AUDIENCE, consentWitnesses: { 'lead@example.com': '   ' } });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('CONSENT_WITNESS_MISSING');
  });
});

describe('FR-1 invariant 3 — content non-fabrication', () => {
  it('BLOCKS content that has not cleared REVIEW', async () => {
    for (const state of ['IDEATE', 'GENERATE', 'REVIEW']) {
      const supabase = makeSupabase({ contentRow: { lifecycle_state: state } });
      const r = await checkNonFabricationInvariant({ supabase, contentId: 'c-1' });
      expect(r.ok).toBe(false);
      expect(r.refusal).toBe('NON_FABRICATION_CONTENT_UNREVIEWED');
      expect(r.detail).toBe(`lifecycle_state=${state}`);
    }
  });

  it('PASSES content that has cleared REVIEW — but reports the depth it did NOT verify', async () => {
    const supabase = makeSupabase({ contentRow: { lifecycle_state: 'SCHEDULE' } });
    const r = await checkNonFabricationInvariant({ supabase, contentId: 'c-1' });
    expect(r.ok).toBe(true);
    // The pass means REVIEWED, never CLAIM-VERIFIED. claims_registry is absent, and this
    // annotation is what stops a reader over-reading the pass.
    expect(r.unverifiedDepth).toContain('claims_registry_absent');
  });

  it('fails CLOSED with DISTINCT names for unknown content vs an unreadable lookup', async () => {
    const unknown = await checkNonFabricationInvariant({ supabase: makeSupabase({ contentRow: null }), contentId: 'c-1' });
    expect(unknown.refusal).toBe('NON_FABRICATION_CONTENT_UNKNOWN');

    const errored = await checkNonFabricationInvariant({ supabase: makeSupabase({ contentError: { message: 'db down' } }), contentId: 'c-1' });
    expect(errored.refusal).toBe('NON_FABRICATION_LOOKUP_FAILED');

    const unnamed = await checkNonFabricationInvariant({ supabase: makeSupabase(), contentId: '  ' });
    expect(unnamed.refusal).toBe('NON_FABRICATION_CONTENT_UNIDENTIFIED');
  });
});

describe('FR-1 invariant 4 — AUP volume', () => {
  it('BLOCKS a send over the standing write cap', async () => {
    const supabase = makeSupabase({ writeBudget: { is_over_budget: true, writes_used: 500, writes_remaining: 0 } });
    const r = await checkAupVolumeInvariant({ supabase, ventureId: 'v-1' });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('AUP_VOLUME_EXCEEDED');
  });

  it('PASSES a send under the cap', async () => {
    const r = await checkAupVolumeInvariant({ supabase: makeSupabase(), ventureId: 'v-1' });
    expect(r.ok).toBe(true);
  });

  it('fails CLOSED with a DISTINCT name when the cap itself cannot be read', async () => {
    const supabase = makeSupabase({ writeBudgetError: { message: 'rpc exploded' } });
    const r = await checkAupVolumeInvariant({ supabase, ventureId: 'v-1', logger: { warn: vi.fn() } });
    expect(r.ok).toBe(false);
    // Over-the-cap and cannot-read-the-cap are different facts and must not share a name.
    expect(r.refusal).toBe('AUP_VOLUME_LOOKUP_FAILED');
  });
});

describe('FR-1 runner — evaluateHonestyInvariants', () => {
  it('reports EVERY failing invariant, not just the first', async () => {
    const supabase = makeSupabase({
      contentRow: { lifecycle_state: 'GENERATE' },
      writeBudget: { is_over_budget: true, writes_used: 500, writes_remaining: 0 },
    });
    const r = await evaluateHonestyInvariants({ supabase, ventureId: 'v-1', channelType: DIRECTED, contentId: 'c-1', send: {} });
    expect(r.ok).toBe(false);
    expect(r.failedInvariants).toEqual(['suppression', 'consent', 'non_fabrication', 'aup_volume']);
  });

  it('passes only when all four invariants pass', async () => {
    const supabase = makeSupabase();
    const r = await evaluateHonestyInvariants({
      supabase, ventureId: 'v-1', channelType: DIRECTED, contentId: 'c-1',
      send: { audience: AUDIENCE, consentWitnesses: WITNESSES },
    });
    expect(r.ok).toBe(true);
    expect(r.failedInvariants).toEqual([]);
    expect(Object.keys(r.results).sort()).toEqual([...HONESTY_INVARIANTS].sort());
  });
});

describe('FR-1 enforcement inside checkPublishAuthorization', () => {
  it('an autonomous channel is REFUSED when an honesty invariant fails', async () => {
    const supabase = makeSupabase({ contentRow: { lifecycle_state: 'GENERATE' } });
    const r = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('AUTONOMOUS_HONESTY_INVARIANT_FAILED');
    expect(r.honesty.failedInvariants).toEqual(['non_fabrication']);
  });

  it('a refused autonomous attempt writes NO ledger row — no row may claim it was accepted', async () => {
    const supabase = makeSupabase({ contentRow: { lifecycle_state: 'GENERATE' } });
    await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
  });

  it('an autonomous channel is ALLOWED when every invariant passes', async () => {
    const supabase = makeSupabase();
    const r = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(r.allowed).toBe(true);
    expect(supabase.ledgerChain.insert).toHaveBeenCalled();
  });

  it('a DIRECTED autonomous channel is refused without an audience, and allowed with a clean consented one', async () => {
    const blocked = await checkPublishAuthorization({
      supabase: makeSupabase(), ventureId: 'v-1', channelType: DIRECTED, contentId: 'c-1',
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.honesty.failedInvariants).toEqual(['suppression', 'consent']);

    const allowed = await checkPublishAuthorization({
      supabase: makeSupabase(), ventureId: 'v-1', channelType: DIRECTED, contentId: 'c-1',
      send: { audience: AUDIENCE, consentWitnesses: WITNESSES },
    });
    expect(allowed.allowed).toBe(true);
  });

  it('SCOPE CONTROL: propose_and_approve is untouched — it still denies for its own reason, never the honesty one', async () => {
    const supabase = makeSupabase({ autonomyState: 'propose_and_approve', contentRow: { lifecycle_state: 'GENERATE' } });
    const r = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('AUTONOMY_APPROVAL_REQUIRED');
    expect(r.reason).not.toContain('HONESTY');
    // The invariants never even ran on this branch — the human is still the check here.
    expect(supabase.contentChain.maybeSingle).not.toHaveBeenCalled();
  });
});

describe('SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: stage-gate call-site suppression (FR-3)', () => {
  it('an armed + blocked stage gate suppresses BEFORE the venture_channel_autonomy lookup — the honesty invariants never even run', async () => {
    isEnabled.mockResolvedValueOnce(true); // armed
    const supabase = makeSupabase({ ventureStage: 1 }); // below the S24 requirement
    const r = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('STAGE_GATE_BLOCKED');
    expect(supabase.contentChain.maybeSingle).not.toHaveBeenCalled();
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
  });

  it('an armed but PASSING stage gate (venture already at S24) falls through to normal authorization', async () => {
    isEnabled.mockResolvedValueOnce(true); // armed
    const supabase = makeSupabase({ ventureStage: 24 });
    const r = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(r.allowed).toBe(true);
  });
});
