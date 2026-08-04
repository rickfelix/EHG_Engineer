/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-LANE-001 FR-1 — the chairman SMS lane as a COLD, READ-ONLY artifact.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Solomon's oversight duties name their sources explicitly, and no SMS surface appears in any of
 * them. Measured at LEAD, both halves confirmed against the files:
 *   - adam-chairman-sms.mjs:7 and adam-chairman-decision.mjs:11 both import sendChairmanSMS from
 *     the SAME gate, so outbound has one place to read, not two.
 *   - NEITHER file references chairman_decisions (0 occurrences each), so a decision packet sent
 *     by text leaves no row in any table the audit reads.
 * The lane is therefore not merely unread — it is unrecorded in every audited source. An oversight
 * duty grading escalation behaviour while blind to the primary escalation channel scores on a
 * biased sample, and the bias is not random: the matters that reach SMS are the consequential ones.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * READ-ONLY, ONE DIRECTION — FR-3
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * This module SELECTs. It exports no send path, imports no send helper, and must never acquire
 * one: a readable lane is one small step from a participating one. escalate_to_chairman and the
 * autonomy report remain the only chairman-facing channels. That boundary is enforced by
 * tests/unit/solomon/chairman-sms-no-send-path.test.js, which is two-sided — it fails if a send
 * import is introduced here — because prose alone does not stop the step.
 *
 * SOURCES (measured 2026-08-04):
 *   inbound  sms_relay_staging          296 rows  (body_raw, received_at, from_phone, to_phone)
 *   outbound sms_outbound_obligations   449 rows  (body, created_at, sent_at, recipient_phone, kind)
 */

/** Default window. Exported so a caller can widen it deliberately rather than by editing code. */
export const DEFAULT_WINDOW_HOURS = 48;

/**
 * Pure: fold a chronologically-sorted message list into exchanges.
 *
 * An EXCHANGE is an outbound message to the chairman plus the chairman's reply, when one exists.
 *
 * THE UNANSWERED CASE IS THE POINT. An outbound with no reply is returned with `reply: null`, not
 * filtered out — an unanswered chairman escalation is precisely what an oversight duty most needs
 * to see, and dropping it would bias the very sample this module exists to unbias.
 *
 * Correlation is CHRONOLOGICAL ADJACENCY per counterpart phone, not similarity: the first inbound
 * after an outbound, from that counterpart, before the next outbound to them. A message that
 * cannot be paired is emitted UNPAIRED rather than attached to its nearest neighbour — a confident
 * mispairing would produce a finding that cites the wrong exchange, which is worse than a gap.
 *
 * @param {Array<{direction:'in'|'out', at:string, body:string, counterpart:string}>} messages
 * @returns {Array<{outbound:object|null, reply:object|null, unpaired:boolean}>}
 */
export function foldIntoExchanges(messages = []) {
  const sorted = [...messages].sort((a, b) => new Date(a.at) - new Date(b.at));
  const exchanges = [];
  const pendingByPhone = new Map();

  for (const m of sorted) {
    if (m.direction === 'out') {
      // A second outbound before any reply closes the first as unanswered — it is not superseded,
      // it went unanswered, and that distinction is the signal.
      if (pendingByPhone.has(m.counterpart)) {
        exchanges.push({ outbound: pendingByPhone.get(m.counterpart), reply: null, unpaired: false });
      }
      pendingByPhone.set(m.counterpart, m);
      continue;
    }
    const open = pendingByPhone.get(m.counterpart);
    if (open) {
      exchanges.push({ outbound: open, reply: m, unpaired: false });
      pendingByPhone.delete(m.counterpart);
    } else {
      // Chairman-initiated: an inbound with no outbound it answers. Real and common — he texts
      // first. Emitted unpaired rather than silently dropped.
      exchanges.push({ outbound: null, reply: m, unpaired: true });
    }
  }
  for (const open of pendingByPhone.values()) {
    exchanges.push({ outbound: open, reply: null, unpaired: false });
  }
  return exchanges.sort((a, b) => {
    const at = (e) => new Date((e.outbound || e.reply).at);
    return at(a) - at(b);
  });
}

/** Normalise a phone for use as a correlation key (digits only — formats vary across providers). */
export function phoneKey(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

/**
 * Read the chairman SMS lane for an EXPLICITLY BOUNDED window.
 *
 * The bound is a parameter, never a hidden constant: an unbounded read would grow without limit
 * and quietly stop riding the existing Mode-B tick's budget, which the SD forbids.
 *
 * @param {object} supabase
 * @param {{windowHours?: number, now?: Date}} [opts]
 * @returns {Promise<{window:{since:string,until:string,hours:number}, exchanges:Array, counts:object}>}
 */
export async function readChairmanSmsExchanges(supabase, opts = {}) {
  const hours = Number.isFinite(opts.windowHours) ? opts.windowHours : DEFAULT_WINDOW_HOURS;
  if (!(hours > 0)) throw new Error('windowHours must be a positive number — an unbounded read is not permitted');
  const until = opts.now instanceof Date ? opts.now : new Date();
  const since = new Date(until.getTime() - hours * 3600 * 1000);

  const [inbound, outbound] = await Promise.all([
    supabase.from('sms_relay_staging')
      .select('id, from_phone, to_phone, body_raw, received_at')
      .gte('received_at', since.toISOString()).lte('received_at', until.toISOString())
      .order('received_at', { ascending: true }),
    supabase.from('sms_outbound_obligations')
      .select('id, recipient_phone, body, kind, status, created_at, sent_at')
      .gte('created_at', since.toISOString()).lte('created_at', until.toISOString())
      .order('created_at', { ascending: true }),
  ]);

  // A query error is NOT an empty lane. Returning [] on error would make "could not read" and
  // "nothing was said" indistinguishable — the failure this whole SD is about.
  if (inbound.error) throw new Error(`inbound read failed: ${inbound.error.message}`);
  if (outbound.error) throw new Error(`outbound read failed: ${outbound.error.message}`);

  const messages = [
    ...(inbound.data || []).map((r) => ({
      direction: 'in', at: r.received_at, body: r.body_raw,
      counterpart: phoneKey(r.from_phone), source: 'sms_relay_staging', id: r.id,
    })),
    ...(outbound.data || []).map((r) => ({
      direction: 'out', at: r.sent_at || r.created_at, body: r.body,
      counterpart: phoneKey(r.recipient_phone), source: 'sms_outbound_obligations',
      id: r.id, kind: r.kind, status: r.status,
    })),
  ];

  const exchanges = foldIntoExchanges(messages);
  return {
    window: { since: since.toISOString(), until: until.toISOString(), hours },
    exchanges,
    counts: {
      inbound: (inbound.data || []).length,
      outbound: (outbound.data || []).length,
      exchanges: exchanges.length,
      unanswered: exchanges.filter((e) => e.outbound && !e.reply).length,
      chairman_initiated: exchanges.filter((e) => e.unpaired).length,
    },
  };
}
