/**
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C — retraction has a lane.
 *
 * A safety retraction could not be posted on the correlation that carried the error: the send-time
 * dedup guard refused ANY second message on a correlation, so the correction had to mint a fresh
 * correlation and name the old ids by hand while two agents had already endorsed the withdrawn
 * prescription. These tests pin the narrowed guard.
 *
 * TESTING-EVIDENCE NOTE (why the fakes here are not the ones already in the repo): the existing
 * mocks in tests/unit/solomon-advisory.test.js and tests/unit/solomon-consult-originator-cc.test.js
 * return FIXED data regardless of which filters were applied. A discriminator test written against
 * those would pass even if the implementation ignored the discriminator entirely — a test that
 * cannot fail. Every discriminator assertion below therefore uses a FILTERING fake that records
 * .eq() predicates and actually applies them to seeded rows.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { alreadyAnswered } = require_('../../../lib/coordinator/reply-class.cjs');
const { groupMultiPartAdvisories } = require_('../../../lib/coordinator/multi-part-reply.cjs');
const solomon = require_('../../../scripts/solomon-advisory.cjs');

/**
 * Filtering fake: applies recorded .eq() predicates to seeded rows, so a dropped or ignored
 * discriminator changes the result. `payload->>x` filters match payload.x; bare columns match
 * top-level fields. Comparison is string-wise, mirroring PostgREST's ->> text extraction.
 */
function filteringSb(rows) {
  const chain = (filters) => ({
    eq: (col, val) => chain({ ...filters, [col]: val }),
    limit: async () => ({
      data: rows.filter((r) => Object.entries(filters).every(([col, val]) => {
        const actual = col.startsWith('payload->>')
          ? (r.payload || {})[col.slice('payload->>'.length)]
          : r[col];
        return actual != null && String(actual) === String(val);
      })),
      error: null,
    }),
  });
  return { from: () => ({ select: () => chain({}) }) };
}

/** A plain answered consult: kind=adam_advisory, no message_kind. */
const PLAIN_ANSWER = { id: 'ans-1', payload: { reply_to: 'c1', kind: 'adam_advisory' } };

describe('alreadyAnswered — the guard NARROWS, it never widens (FR-2, AC-3)', () => {
  it('TS-1: with no discriminator, keeps the legacy 2-eq shape and still returns true', async () => {
    // Deliberately the DUMB fixed-depth mock from the pre-existing suite: exactly two chained .eq()
    // then .limit(). If the implementation ever appends a third .eq() unconditionally, `.eq` on
    // `{limit}` is undefined and this throws. That is the point — this test IS the byte-identity
    // enforcement for the default path.
    const legacyShapedSb = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: 'x' }], error: null }) }) }) }),
      }),
    };
    expect(await alreadyAnswered(legacyShapedSb, 'c1')).toBe(true);
  });

  it('TS-3: a duplicate plain advisory on an answered correlation is STILL refused', async () => {
    const sb = filteringSb([PLAIN_ANSWER]);
    expect(await alreadyAnswered(sb, 'c1')).toBe(true);
  });

  it('TS-2: a retraction is NOT deduped against the plain answer it retracts', async () => {
    const sb = filteringSb([PLAIN_ANSWER]);
    expect(await alreadyAnswered(sb, 'c1', { messageKind: 'retraction' })).toBe(false);
  });

  it('TS-2b: but a SECOND retraction on that correlation IS refused', async () => {
    // Without this, TS-2 would also pass an implementation that returns false for every
    // discriminator — i.e. one that disabled the guard rather than narrowing it.
    const sb = filteringSb([
      PLAIN_ANSWER,
      { id: 'retr-1', payload: { reply_to: 'c1', kind: 'adam_advisory', message_kind: 'retraction' } },
    ]);
    expect(await alreadyAnswered(sb, 'c1', { messageKind: 'retraction' })).toBe(true);
  });

  it('negative control: the same seeded data yields true undiscriminated and false discriminated', async () => {
    // Proves TS-2 is sensitive to the discriminator rather than vacuously true — the two calls
    // differ ONLY by the argument under test.
    const sb = filteringSb([PLAIN_ANSWER]);
    expect(await alreadyAnswered(sb, 'c1')).toBe(true);
    expect(await alreadyAnswered(sb, 'c1', { messageKind: 'retraction' })).toBe(false);
  });

  it('an explicitly undefined discriminator behaves exactly like omitting it (no clause dropped)', async () => {
    // The silent-widening trap: if an undefined value caused the kind clause to be dropped instead
    // of simply not adding one, this would match a foreign-kind row and the guard would widen.
    const sb = filteringSb([{ id: 'ping-1', payload: { reply_to: 'c1', kind: 'ping_on_silence' } }]);
    expect(await alreadyAnswered(sb, 'c1', { messageKind: undefined })).toBe(false);
    expect(await alreadyAnswered(sb, 'c1')).toBe(false);
  });

  it('TS-5: part 2 rides while a duplicate part 1 is refused (FR-3)', async () => {
    const sb = filteringSb([
      { id: 'p1', payload: { reply_to: 'c1', kind: 'adam_advisory', part_index: 1, part_total: 2 } },
    ]);
    expect(await alreadyAnswered(sb, 'c1', { partIndex: 1 })).toBe(true);
    expect(await alreadyAnswered(sb, 'c1', { partIndex: 2 })).toBe(false);
  });
});

describe('buildAdvisoryPayload — correction discriminator (FR-1, FR-4, AC-4)', () => {
  it('TS-6: honors the retraction discriminator while STILL forcing an unrelated kind on a reply', () => {
    // The conflicting `kind` is load-bearing for this assertion: without it the test would pass even
    // if the kind-force were deleted outright, since the untouched default is already adam_advisory.
    const p = solomon.buildAdvisoryPayload({
      body: 'retracting the earlier prescription',
      replyTo: 'consult-corr',
      kind: 'chairman_directive',
      messageKind: 'retraction',
    });
    expect(p.kind).toBe('adam_advisory');
    expect(p.message_kind).toBe('retraction');
    expect(p.reply_to).toBe('consult-corr');
    expect(p.correlation_id).toBe('consult-corr');
  });

  it('omits message_kind entirely when not supplied (byte-identical for existing senders)', () => {
    const p = solomon.buildAdvisoryPayload({ body: 'ordinary answer', replyTo: 'consult-corr' });
    expect('message_kind' in p).toBe(false);
    expect(p.kind).toBe('adam_advisory');
  });

  it('rejects an unrecognized discriminator loudly rather than minting an undrained lane', () => {
    expect(() => solomon.buildAdvisoryPayload({ body: 'x', messageKind: 'bogus' }))
      .toThrow(/INVALID_MESSAGE_KIND/);
  });

  it('rejects a part_total above MAX_PARTS (the relaxed bound must stay finite)', () => {
    // Security review of PR #6553: the part dimension deliberately relaxes "one answer per
    // correlation". Unbounded, that is not a narrowing at all — a sender could post arbitrarily many
    // rows on one correlation just by incrementing part_index. Enforced in the builder, not only in
    // the CLI, because buildAdvisoryPayload is exported and the CLI is not its only caller.
    expect(() => solomon.buildAdvisoryPayload({ body: 'x', replyTo: 'c1', partIndex: 1, partTotal: 5000 }))
      .toThrow(/INVALID_PART/);
    expect(() => solomon.buildAdvisoryPayload({ body: 'x', replyTo: 'c1', partIndex: 3, partTotal: 2 }))
      .toThrow(/INVALID_PART/);
    // The boundary itself stays legal.
    expect(solomon.buildAdvisoryPayload({ body: 'x', replyTo: 'c1', partIndex: 1, partTotal: 20 }).part_total).toBe(20);
  });

  it('stamps part_index/part_total only when BOTH are supplied', () => {
    const both = solomon.buildAdvisoryPayload({ body: 'x', replyTo: 'c1', partIndex: 2, partTotal: 2 });
    expect(both.part_index).toBe(2);
    expect(both.part_total).toBe(2);
    // A half-pair is unorderable by the reader, so it must not be stamped at all.
    const halfPair = solomon.buildAdvisoryPayload({ body: 'x', replyTo: 'c1', partIndex: 2 });
    expect('part_index' in halfPair).toBe(false);
  });
});

describe('groupMultiPartAdvisories — one correlation, no subject regex (FR-3, AC-2)', () => {
  it('TS-4: parts 1/2 and 2/2 on ONE correlation_id reassemble in order', () => {
    // Subjects carry NO parseable N/M marker on purpose. If the fixture used "VERDICT 1/2", the OLD
    // subject-regex path would group these correctly too and the test would pass whether or not the
    // payload part path was ever wired in.
    const rows = [
      { id: 'row-2', subject: 'RETRACTION NOTICE', target_session: 't', sender_session: 's', payload: { correlation_id: 'corr-1', part_index: 2, part_total: 2, body: 'second half' } },
      { id: 'row-1', subject: 'RETRACTION NOTICE', target_session: 't', sender_session: 's', payload: { correlation_id: 'corr-1', part_index: 1, part_total: 2, body: 'first half' } },
    ];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].isMultiPart).toBe(true);
    expect(groups[0].isComplete).toBe(true);
    // Ordered by part_index, NOT arrival order (the fixture is deliberately reversed).
    expect(groups[0].rows.map((r) => r.id)).toEqual(['row-1', 'row-2']);
    expect(groups[0].body).toBe('first half\n\nsecond half');
  });

  it('an incomplete series is grouped but reported incomplete', () => {
    const rows = [
      { id: 'only-1', subject: 'RETRACTION NOTICE', target_session: 't', sender_session: 's', payload: { correlation_id: 'corr-9', part_index: 1, part_total: 2, body: 'first' } },
    ];
    const [g] = groupMultiPartAdvisories(rows);
    expect(g.isMultiPart).toBe(true);
    expect(g.isComplete).toBe(false);
  });

  it('legacy subject-marker rows still group (the regex path remains a fallback)', () => {
    const rows = [
      { id: 'l1', subject: '[SOLOMON_ORACLE] COMMISSION VERDICT 1/2 -- alpha', target_session: 't', sender_session: 's', payload: { correlation_id: 'x1', body: 'a' } },
      { id: 'l2', subject: '[SOLOMON_ORACLE] COMMISSION VERDICT 2/2 -- beta', target_session: 't', sender_session: 's', payload: { correlation_id: 'x2', body: 'b' } },
    ];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].isComplete).toBe(true);
  });
});

describe('relay-drain payload boundary — explicit pick, never a spread (FR-4)', () => {
  const { makeSendRelay } = require_('../../../scripts/coordinator-relay-drain.cjs');

  /** Captures the row handed to session_coordination.insert(). */
  function capturingSb(sink) {
    return { from: () => ({ insert: async (row) => { sink.push(row); return { error: null }; } }) };
  }

  /** Forces the SESSION-class branch — the one that actually performs the relay insert. */
  const sessionResolver = async () => ({ kind: 'session', target: 'peer-session-1', peer: 'adam', live: true });

  it('forwards the correction discriminators across the relay hop', async () => {
    const inserted = [];
    const sendRelay = makeSendRelay(capturingSb(inserted), { resolvePeerTarget: sessionResolver });
    const res = await sendRelay({
      sender_session: 'origin-session',
      target_session: 'coordinator-session',
      payload: { relay_to: 'adam', body: 'retracting the earlier prescription', correlation_id: 'corr-1', message_kind: 'retraction', part_index: 1, part_total: 2 },
    });
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.kind).toBe('adam_advisory');
    expect(inserted[0].payload.message_kind).toBe('retraction');
    expect(inserted[0].payload.part_index).toBe(1);
    expect(inserted[0].payload.part_total).toBe(2);
  });

  it('DROPS fields that must not cross the boundary, even when present on the queued row', async () => {
    // The relayed row is stamped sender_type='coordinator', so a forwarded field impersonates
    // COORDINATOR INTENT rather than merely carrying bad body text. drainRelayQueue performs no
    // sender-role check at drain time, so row.payload is untrusted input. signal_type/intent_action
    // are the sharpest: buildAdvisoryPayload documents "no signal_type, no intent_action" as an
    // invariant precisely because the friction-signal router and deconfliction sweep scoop them.
    const inserted = [];
    const sendRelay = makeSendRelay(capturingSb(inserted), { resolvePeerTarget: sessionResolver });
    await sendRelay({
      sender_session: 'origin-session',
      target_session: 'coordinator-session',
      payload: {
        relay_to: 'adam', body: 'b', correlation_id: 'corr-2',
        signal_type: 'stuck', intent_action: 'escalate', expects_reply: true,
        oracle: true, via: 'direct', sender_callsign: 'spoofed', reply_class: 'live-handshake',
      },
    });
    const p = inserted[0].payload;
    for (const forbidden of ['signal_type', 'intent_action', 'expects_reply', 'oracle', 'via', 'sender_callsign', 'reply_class', 'relay_to']) {
      expect(p, `${forbidden} must not cross the relay boundary`).not.toHaveProperty(forbidden);
    }
    // The intended fields still arrive.
    expect(p.kind).toBe('adam_advisory');
    expect(p.correlation_id).toBe('corr-2');
    expect(p.relayed_from).toBe('origin-session');
  });

  it('a relay-class peer short-circuits before any insert (unchanged behaviour)', async () => {
    const inserted = [];
    const sendRelay = makeSendRelay(capturingSb(inserted), { resolvePeerTarget: async () => ({ kind: 'relay', target: null }) });
    const res = await sendRelay({ sender_session: 's', target_session: 't', payload: { relay_to: 'eva', body: 'b', correlation_id: 'c' } });
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(0);
  });
});

describe('ensureOriginatorCc — the retraction must reach the person who was misled (FR-5)', () => {
  const CONSULT_CORR = 'consult-corr';
  const ORIGINATOR = 'originator-session';

  /** Filtering fake for the CC path: resolves the consult, then filters the idempotence probe. */
  function ccSb(existingCcRows) {
    return {
      from(table) {
        const filters = {};
        const api = {
          select() { return this; },
          eq(col, val) { filters[col] = val; return this; },
          order() { return this; },
          // resolveConsultOriginator scopes the CC to CONSULTS only — payload.kind must be
          // solomon_consult or it returns null and ensureOriginatorCc short-circuits before the
          // idempotence probe. Getting this wrong makes BOTH CC tests pass for the wrong reason
          // (a null originator also yields inserted:false), so the kind is load-bearing here.
          maybeSingle: async () => (table === 'claude_sessions'
            ? { data: null, error: null }
            : { data: { sender_session: ORIGINATOR, payload: { kind: 'solomon_consult', correlation_id: CONSULT_CORR } }, error: null }),
          limit: async () => ({
            data: existingCcRows.filter((r) => Object.entries(filters).every(([col, val]) => {
              const actual = col.startsWith('payload->>')
                ? (r.payload || {})[col.slice('payload->>'.length)]
                : r[col];
              return actual != null && String(actual) === String(val);
            })),
            error: null,
          }),
        };
        return api;
      },
    };
  }

  const priorPlainCc = { id: 'cc-1', target_session: ORIGINATOR, payload: { reply_to: CONSULT_CORR } };

  it('TS-7: a retraction is still CC-ed even though the original answer already CC-ed the originator', async () => {
    const inserts = [];
    const res = await solomon.ensureOriginatorCc(
      ccSb([priorPlainCc]),
      {
        replyRef: CONSULT_CORR,
        replyTo: CONSULT_CORR,
        target: 'coordinator-session',
        sessionId: 'solomon-session',
        subject: 'RETRACTION NOTICE',
        payload: { body: 'retracting', message_kind: 'retraction' },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        getLiveAdamId: async () => null,
        insertRow: async (_sb, row) => { inserts.push(row); return { error: null }; },
      },
    );
    expect(res.inserted).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.message_kind).toBe('retraction');
  });

  it('but an ordinary answer is still deduped against that same prior CC (idempotence preserved)', async () => {
    const inserts = [];
    const res = await solomon.ensureOriginatorCc(
      ccSb([priorPlainCc]),
      {
        replyRef: CONSULT_CORR,
        replyTo: CONSULT_CORR,
        target: 'coordinator-session',
        sessionId: 'solomon-session',
        subject: 'ordinary answer',
        payload: { body: 'answer' },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        getLiveAdamId: async () => null,
        insertRow: async (_sb, row) => { inserts.push(row); return { error: null }; },
      },
    );
    expect(res.inserted).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
