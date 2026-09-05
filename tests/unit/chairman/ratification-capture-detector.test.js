/**
 * QF-20260830-628 — writer-side upsert fix for lib/chairman/ratification-capture-detector.mjs.
 * Bug: persistRow was a bare insert; a re-evaluation of the same corpus item every sweep cycle
 * appended a new feedback row instead of bumping occurrence_count/last_seen on the existing one
 * (~13.7k accumulated rows across ratification_capture_candidate + ratification_capture_miss).
 *
 * QF-20260903-023 — corpus correction. The corpus source (a) used to be session_coordination rows
 * of payload.kind adam_advisory/solomon_consult, which measured ZERO chairman-authored rows (a 7d
 * sender_type census: 100% inter-agent traffic) — the detector was scanning the fleet's own
 * chatter, not chairman content, and its miss count rose with traffic volume rather than with
 * actual governance capture gaps. Corrected to sms_relay_staging, gated on a verified chairman
 * phone number (phoneKey match) and a valid Twilio signature — see the module's own header note.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectCaptureMisses } from '../../../lib/chairman/ratification-capture-detector.mjs';

const CHAIRMAN_PHONE = '+15551234567';

function makeFakeSupabase({ smsRelayStaging = [], chairmanDecisions = [] } = {}) {
  const feedbackRows = [];
  const smsRelayEqCalls = [];
  let nextId = 1;
  return {
    _feedbackRows: feedbackRows,
    _smsRelayEqCalls: smsRelayEqCalls,
    from(table) {
      if (table === 'sms_relay_staging') {
        return {
          select: () => ({
            eq: (col, val) => {
              smsRelayEqCalls.push([col, val]);
              return {
                gte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: smsRelayStaging, error: null }),
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: chairmanDecisions, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'feedback') {
        return {
          select() {
            const filters = {};
            const builder = {
              eq(col, val) {
                filters[col] = val;
                return builder;
              },
              limit() {
                return builder;
              },
              maybeSingle() {
                const match = feedbackRows.find(
                  (r) => r.source_id === filters.source_id && r.category === filters.category
                );
                return Promise.resolve({ data: match || null, error: null });
              },
            };
            return builder;
          },
          insert(row) {
            const stored = { id: `fb-${nextId++}`, ...row };
            feedbackRows.push(stored);
            return Promise.resolve({ error: null });
          },
          update(patch) {
            return {
              eq(col, val) {
                const target = feedbackRows.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANDIDATE_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  from_phone: CHAIRMAN_PHONE,
  body_raw: 'The chairman ruled on this: no named target here',
  signature_valid: true,
  received_at: '2026-08-30T00:00:00Z',
};

describe('ratification-capture-detector writer upsert (QF-20260830-628)', () => {
  const priorChairmanPhone = process.env.CHAIRMAN_PHONE;
  beforeEach(() => { process.env.CHAIRMAN_PHONE = CHAIRMAN_PHONE; });
  afterEach(() => { process.env.CHAIRMAN_PHONE = priorChairmanPhone; });

  it('two-sided: same message evaluated twice yields ONE row with occurrence_count=2, a new message still inserts', async () => {
    const sb = makeFakeSupabase({ smsRelayStaging: [CANDIDATE_ITEM] });

    const first = await detectCaptureMisses(sb, 24);
    expect(first.candidates).toHaveLength(1);
    expect(sb._feedbackRows).toHaveLength(1);
    expect(sb._feedbackRows[0].occurrence_count).toBe(1);
    expect(sb._feedbackRows[0].source_id).toMatch(UUID_RE); // must satisfy feedback.source_id's UUID column type

    // Same message, re-evaluated on the next sweep cycle (unchanged corpus).
    const second = await detectCaptureMisses(sb, 24);
    expect(second.candidates).toHaveLength(1);
    expect(sb._feedbackRows).toHaveLength(1); // no new row appended
    expect(sb._feedbackRows[0].occurrence_count).toBe(2);
    expect(sb._feedbackRows[0].last_seen).toBeTruthy();

    // A genuinely new message still inserts as its own row.
    const newItem = { ...CANDIDATE_ITEM, id: '22222222-2222-4222-8222-222222222222' };
    const sb2 = makeFakeSupabase({ smsRelayStaging: [CANDIDATE_ITEM, newItem] });
    // Seed sb2 with the already-persisted first-message row to simulate accumulated state.
    sb2._feedbackRows.push({ ...sb._feedbackRows[0] });
    await detectCaptureMisses(sb2, 24);
    expect(sb2._feedbackRows).toHaveLength(2);
    const ids = sb2._feedbackRows.map((r) => r.source_id);
    expect(ids).toContain(CANDIDATE_ITEM.id);
    expect(ids).toContain(newItem.id);
  });

  it('regression: one full cycle on an unchanged population adds zero net rows', async () => {
    const sb = makeFakeSupabase({ smsRelayStaging: [CANDIDATE_ITEM] });
    await detectCaptureMisses(sb, 24);
    const countAfterFirst = sb._feedbackRows.length;
    await detectCaptureMisses(sb, 24);
    await detectCaptureMisses(sb, 24);
    expect(sb._feedbackRows.length).toBe(countAfterFirst);
  });
});

describe('QF-20260903-023: the corpus can actually contain what it detects', () => {
  const priorChairmanPhone = process.env.CHAIRMAN_PHONE;
  beforeEach(() => { process.env.CHAIRMAN_PHONE = CHAIRMAN_PHONE; });
  afterEach(() => { process.env.CHAIRMAN_PHONE = priorChairmanPhone; });

  it('returns zero on a corpus with no chairman content (an inter-agent-only sms_relay_staging population)', async () => {
    const notChairman = { ...CANDIDATE_ITEM, id: '33333333-3333-4333-8333-333333333333', from_phone: '+19998887777' };
    const sb = makeFakeSupabase({ smsRelayStaging: [notChairman] });
    const result = await detectCaptureMisses(sb, 24);
    expect(result.count).toBe(0);
    expect(result.candidates).toHaveLength(0);
    expect(sb._feedbackRows).toHaveLength(0);
  });

  it('is non-zero on a corpus containing a known un-captured chairman ruling with a named target', async () => {
    const rulingWithTarget = {
      id: '44444444-4444-4444-8444-444444444444',
      from_phone: CHAIRMAN_PHONE,
      body_raw: 'I ruled that lib/chairman/ratification-capture-detector.mjs must be fixed.',
      signature_valid: true,
      received_at: '2026-09-04T00:00:00Z',
    };
    const sb = makeFakeSupabase({ smsRelayStaging: [rulingWithTarget] });
    const result = await detectCaptureMisses(sb, 24);
    expect(result.count).toBe(1);
    expect(result.captureMisses[0].id).toBe(rulingWithTarget.id);
  });

  it('the corpus query itself filters on signature_valid=true, not merely a trusting caller', async () => {
    const sb = makeFakeSupabase({ smsRelayStaging: [CANDIDATE_ITEM] });
    await detectCaptureMisses(sb, 24);
    expect(sb._smsRelayEqCalls).toContainEqual(['signature_valid', true]);
  });

  it('a chairman-phone SMS is still excluded if it does not match phoneKey exactly (formatting must not create a false match)', async () => {
    const almostChairman = { ...CANDIDATE_ITEM, id: '55555555-5555-4555-8555-555555555555', from_phone: '+1555123456' }; // one digit short
    const sb = makeFakeSupabase({ smsRelayStaging: [almostChairman] });
    const result = await detectCaptureMisses(sb, 24);
    expect(result.count).toBe(0);
    expect(result.candidates).toHaveLength(0);
  });
});
