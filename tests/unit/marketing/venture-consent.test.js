/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7 — consent is derived, fresh, and unfakeable.
 *
 * The case that matters most is the ENROLL-TO-SEND GAP: an opt-out recorded after enrollment but
 * before the send fires. That single case is what distinguishes a FRESH check from a CACHED one,
 * and the old code could not pass it — it read `enrollment.status` off the record its caller had
 * already loaded.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSENT_EVENT,
  SEND_REFUSAL,
  normalizeRecipient,
  recordConsentEvent,
  resolveSendPermission,
  resolveCaptureWitness,
} from '../../../lib/marketing/venture-consent.js';
import { createEmailCampaigns } from '../../../lib/marketing/ai/email-campaigns.js';

const VENTURE = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const OTHER_VENTURE = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'lead@example.com';

/** Test double over an in-memory event log, ordered newest-first like the real query. */
function fakeSupabase({ events = [], readError = null, insertError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table !== 'venture_consent_events') throw new Error(`unexpected table ${table}`);
      let filters = {};
      const b = {
        select: () => b,
        eq: (col, val) => { filters[col] = val; return b; },
        order: () => b,
        limit: async () => {
          if (readError) return { data: null, error: readError };
          const rows = events
            .filter((e) => (filters.venture_id ? e.venture_id === filters.venture_id : true))
            .filter((e) => (filters.recipient_email ? e.recipient_email === filters.recipient_email : true))
            .sort((a, z) => new Date(z.occurred_at) - new Date(a.occurred_at));
          return { data: rows.slice(0, 1), error: null };
        },
        maybeSingle: async () => {
          if (readError) return { data: null, error: readError };
          return { data: events.find((e) => e.id === filters.id) || null, error: null };
        },
        insert: (row) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => insertError
                ? { data: null, error: insertError }
                : { data: { id: 'evt-new', occurred_at: '2026-08-09T12:00:00Z' }, error: null },
            }),
          };
        },
      };
      return b;
    },
  };
}

const optIn = (at, over = {}) => ({ id: 'evt-in', venture_id: VENTURE, recipient_email: EMAIL, event_type: CONSENT_EVENT.OPT_IN, provenance: 'landing form', occurred_at: at, ...over });
const optOut = (at, over = {}) => ({ id: 'evt-out', venture_id: VENTURE, recipient_email: EMAIL, event_type: CONSENT_EVENT.OPT_OUT, provenance: 'unsubscribe link', occurred_at: at, ...over });

describe('FR-7: send permission is DERIVED from the event log', () => {
  it('PERMITS a send when the latest event is a real opt_in — the accept case', async () => {
    const res = await resolveSendPermission({ supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z')] }), ventureId: VENTURE, email: EMAIL });
    expect(res.permitted).toBe(true);
    expect(res.reason).toBeNull();
  });

  // THE ENROLL-TO-SEND GAP.
  it('SUPPRESSES when an opt_out was recorded AFTER the opt_in but before the send', async () => {
    const res = await resolveSendPermission({
      supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z'), optOut('2026-08-05T00:00:00Z')] }),
      ventureId: VENTURE,
      email: EMAIL,
    });
    expect(res.permitted).toBe(false);
    expect(res.reason).toBe(SEND_REFUSAL.SUPPRESSED_BY_OPT_OUT);
  });

  it('re-PERMITS after a later opt_in — latest event wins, in both directions', async () => {
    const res = await resolveSendPermission({
      supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z'), optOut('2026-08-05T00:00:00Z'), optIn('2026-08-07T00:00:00Z', { id: 'evt-in2' })] }),
      ventureId: VENTURE,
      email: EMAIL,
    });
    expect(res.permitted).toBe(true);
  });

  it('REFUSES with no consent history at all — absence is not permission', async () => {
    const res = await resolveSendPermission({ supabase: fakeSupabase({ events: [] }), ventureId: VENTURE, email: EMAIL });
    expect(res.permitted).toBe(false);
    expect(res.reason).toBe(SEND_REFUSAL.NO_CONSENT_ON_RECORD);
  });

  it('FAILS CLOSED when the consent store is unreadable', async () => {
    const res = await resolveSendPermission({ supabase: fakeSupabase({ readError: { message: 'timeout' } }), ventureId: VENTURE, email: EMAIL });
    expect(res.permitted).toBe(false);
    expect(res.reason).toBe(SEND_REFUSAL.CONSENT_UNREADABLE);
  });

  it('distinguishes NEVER-CONSENTED from WITHDREW — different facts about a person', async () => {
    const never = await resolveSendPermission({ supabase: fakeSupabase({ events: [] }), ventureId: VENTURE, email: EMAIL });
    const withdrew = await resolveSendPermission({ supabase: fakeSupabase({ events: [optOut('2026-08-05T00:00:00Z')] }), ventureId: VENTURE, email: EMAIL });
    expect(never.reason).not.toBe(withdrew.reason);
  });

  it('scopes consent per venture — an opt_in for one venture does not authorize another', async () => {
    const res = await resolveSendPermission({ supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z')] }), ventureId: OTHER_VENTURE, email: EMAIL });
    expect(res.permitted).toBe(false);
  });

  it('normalizes the recipient so two spellings cannot disagree', async () => {
    expect(normalizeRecipient('  Lead@Example.COM ')).toBe(EMAIL);
    const res = await resolveSendPermission({ supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z')] }), ventureId: VENTURE, email: '  Lead@Example.COM ' });
    expect(res.permitted).toBe(true);
  });
});

describe('FR-7: the capture witness must resolve, not merely be non-empty', () => {
  it('ACCEPTS a witness that resolves to a real opt_in for this venture and recipient', async () => {
    const res = await resolveCaptureWitness({ supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z')] }), captureRecordId: 'evt-in', ventureId: VENTURE, email: EMAIL });
    expect(res.resolved).toBe(true);
  });

  // This is the exact case the previous check let through: any non-empty string passed.
  it('REFUSES a well-formed id that resolves to no consent event', async () => {
    const res = await resolveCaptureWitness({ supabase: fakeSupabase({ events: [] }), captureRecordId: '9f1d2c3b-0000-0000-0000-000000000000', ventureId: VENTURE, email: EMAIL });
    expect(res.resolved).toBe(false);
    expect(res.reason).toBe(SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE);
  });

  it('REFUSES an arbitrary non-empty string, which the old witness accepted', async () => {
    const res = await resolveCaptureWitness({ supabase: fakeSupabase({ events: [] }), captureRecordId: 'cap-123', ventureId: VENTURE, email: EMAIL });
    expect(res.resolved).toBe(false);
  });

  it('REFUSES a REAL consent event belonging to a different recipient — existing is not witnessing the right thing', async () => {
    const res = await resolveCaptureWitness({ supabase: fakeSupabase({ events: [optIn('2026-08-01T00:00:00Z')] }), captureRecordId: 'evt-in', ventureId: VENTURE, email: 'someone.else@example.com' });
    expect(res.resolved).toBe(false);
  });

  it('REFUSES an opt_out used as a capture witness', async () => {
    const res = await resolveCaptureWitness({ supabase: fakeSupabase({ events: [optOut('2026-08-05T00:00:00Z')] }), captureRecordId: 'evt-out', ventureId: VENTURE, email: EMAIL });
    expect(res.resolved).toBe(false);
  });
});

describe('FR-7: the send path itself is suppressed, not just the resolver', () => {
  // The resolver being correct proves nothing if nothing calls it — an uninvoked check is
  // indistinguishable from an absent one. These drive the REAL processStep.
  function campaignSupabase(events) {
    // MUST sort newest-first: the real query is .order('occurred_at', {ascending:false}) and
    // "latest event wins" is the entire rule. A double that returned array order would let this
    // suite pass while the production ordering was wrong — a control that cannot observe its subject.
    const consent = {
      select: () => consent, eq: () => consent, order: () => consent,
      limit: async () => ({
        data: [...events].sort((a, z) => new Date(z.occurred_at) - new Date(a.occurred_at)).slice(0, 1),
        error: null,
      }),
    };
    const enrollments = { update: () => ({ eq: async () => ({ error: null }) }) };
    return { from: (t) => (t === 'venture_consent_events' ? consent : enrollments) };
  }

  const enrollment = {
    id: 'e-1', status: 'active', current_step: 0, opened_previous: true,
    venture_id: VENTURE, lead_email: EMAIL, campaign_id: 'c-1',
  };
  const steps = [{ subject: 'hi', htmlA: '<p>a</p>', htmlB: '<p>b</p>', delayHours: 48 }];

  it('SENDS when a captured opt_in is on record', async () => {
    let sent = 0;
    const ec = createEmailCampaigns({
      supabase: campaignSupabase([optIn('2026-08-01T00:00:00Z')]),
      resendClient: { emails: { send: async () => { sent += 1; return { id: 'msg-1' }; } } },
    });
    const res = await ec.processStep(enrollment, steps);
    expect(res.action).toBe('sent');
    expect(sent).toBe(1);
  });

  it('SUPPRESSES the send when an opt_out landed after enrollment — and NO email is dispatched', async () => {
    let sent = 0;
    const ec = createEmailCampaigns({
      supabase: campaignSupabase([optIn('2026-08-01T00:00:00Z'), optOut('2026-08-05T00:00:00Z')]),
      resendClient: { emails: { send: async () => { sent += 1; return { id: 'msg-1' }; } } },
    });
    // NOTE the enrollment object still says status:'active' — the stale value the old code trusted.
    const res = await ec.processStep(enrollment, steps);
    expect(res.action).toBe('suppressed');
    expect(res.reason).toBe(SEND_REFUSAL.SUPPRESSED_BY_OPT_OUT);
    expect(sent).toBe(0); // the assertion that matters: no mail left the building
  });

  it('SUPPRESSES when there is no consent on record at all', async () => {
    let sent = 0;
    const ec = createEmailCampaigns({
      supabase: campaignSupabase([]),
      resendClient: { emails: { send: async () => { sent += 1; return { id: 'msg-1' }; } } },
    });
    const res = await ec.processStep(enrollment, steps);
    expect(res.action).toBe('suppressed');
    expect(sent).toBe(0);
  });
});

describe('FR-7: recording requires real provenance', () => {
  it('records an opt_in and never supplies its own timestamp', async () => {
    const sb = fakeSupabase({});
    await recordConsentEvent({ supabase: sb, ventureId: VENTURE, email: '  Lead@Example.COM ', eventType: CONSENT_EVENT.OPT_IN, provenance: 'landing form submission #42' });
    expect(sb.inserted).toHaveLength(1);
    expect(sb.inserted[0].recipient_email).toBe(EMAIL);
    // ordering decides permission, so a writer-supplied time could backdate an opt_in past an opt_out
    expect(sb.inserted[0]).not.toHaveProperty('occurred_at');
  });

  it('REFUSES to record without provenance', async () => {
    const sb = fakeSupabase({});
    await expect(recordConsentEvent({ supabase: sb, ventureId: VENTURE, email: EMAIL, eventType: CONSENT_EVENT.OPT_IN, provenance: '   ' }))
      .rejects.toThrow(/provenance is required/);
    expect(sb.inserted).toHaveLength(0);
  });

  it('REFUSES an event type outside the closed vocabulary', async () => {
    const sb = fakeSupabase({});
    await expect(recordConsentEvent({ supabase: sb, ventureId: VENTURE, email: EMAIL, eventType: 'implied', provenance: 'x' }))
      .rejects.toThrow(/opt_in or opt_out/);
    expect(sb.inserted).toHaveLength(0);
  });
});
