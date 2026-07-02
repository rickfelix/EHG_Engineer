/**
 * Shared peer-target resolution for --to/--direct flags on advisory scripts.
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-4.
 *
 * Incident #2 root cause: scripts/adam-advisory.cjs and scripts/solomon-advisory.cjs
 * both hardcoded `target = coordinatorId || 'broadcast-coordinator'` — a reply could
 * never target the asker session directly, so a Solomon consult-reply to Adam's
 * board-consult silently stranded at the coordinator lane. This module is the SINGLE
 * shared source of truth both scripts import (no duplicated resolution logic).
 *
 * Two peer classes:
 *   session — {adam, solomon, coordinator}: a live session_id always exists (or can
 *             fail loud). Resolves via the existing role resolvers.
 *   relay   — {eva, ceo}: no live session_id exists (confirmed: zero claude_sessions
 *             rows with metadata.role in ('eva','ceo')). The caller must enqueue via
 *             FR-1's relay-queue instead of a direct insert.
 *
 * @module lib/coordinator/peer-target
 */

'use strict';

const defaultResolvers = require('./resolve.cjs');
const defaultAdamIdentity = require('./adam-identity.cjs');
const defaultSolomonIdentity = require('./solomon-identity.cjs');

/** Registry of known peers and their class. Frozen — the single source of truth. */
const PEER_KINDS = Object.freeze({
  adam: { class: 'session', sentinel: 'broadcast-adam' },
  solomon: { class: 'session', sentinel: 'broadcast-solomon' },
  coordinator: { class: 'session', sentinel: 'broadcast-coordinator' },
  eva: { class: 'relay', sentinel: null },
  ceo: { class: 'relay', sentinel: null },
});

/**
 * Resolve a --to <peer> value to a delivery target.
 *
 * Deps are injectable (default to the real modules) rather than hardcoded requires,
 * per the "testable seam" convention used throughout this codebase's coordinator
 * modules (receipts.cjs, pending-question-timer.cjs) — lets tests inject fixture
 * resolvers instead of mocking nested CJS requires.
 *
 * @param {object} supabase
 * @param {string} peer - one of PEER_KINDS' keys (case-insensitive)
 * @param {object} [opts]
 * @param {string|null} [opts.originator] - when set, this call is answering a specific
 *   inbound row (a --reply-to flow); session-class peers then use the resolve*ReplyTarget
 *   variant (prefer-live-singleton + stale-originator retarget) rather than the plain
 *   getActive*Id, matching the incident #2 fix exactly. When absent (a fresh --to send,
 *   not a reply), the plain getActive*Id resolver is used.
 * @param {object} [deps] - injectable resolvers, default the real modules
 * @returns {Promise<{kind:'session'|'relay', target:(string|null), sentinel:(string|null), peer:string, live:boolean, retargeted:boolean, relayVia:(string|null)}>}
 */
async function resolvePeerTarget(supabase, peer, opts = {}, deps = {}) {
  const { originator = null } = opts;
  const {
    getActiveCoordinatorId = defaultResolvers.getActiveCoordinatorId,
    getActiveAdamId = defaultAdamIdentity.getActiveAdamId,
    resolveAdamReplyTarget = defaultAdamIdentity.resolveAdamReplyTarget,
    getActiveSolomonId = defaultSolomonIdentity.getActiveSolomonId,
    resolveSolomonReplyTarget = defaultSolomonIdentity.resolveSolomonReplyTarget,
  } = deps;

  const key = String(peer || '').trim().toLowerCase();
  const entry = PEER_KINDS[key];

  if (!entry) {
    const known = Object.keys(PEER_KINDS).join(', ');
    throw new Error(`resolvePeerTarget: unknown peer "${peer}" (known peers: ${known})`);
  }

  if (entry.class === 'relay') {
    // No live session ever exists for a relay-class peer — always route via the
    // coordinator's relay-request queue (FR-1), never a direct insert.
    return { kind: 'relay', target: null, sentinel: null, peer: key, live: false, retargeted: false, relayVia: 'coordinator' };
  }

  // Session-class: resolve a live session_id.
  if (key === 'adam') {
    if (originator) {
      const r = await resolveAdamReplyTarget(supabase, originator, {});
      return { kind: 'session', target: r.target, sentinel: entry.sentinel, peer: key, live: Boolean(r.live), retargeted: r.retargeted, relayVia: null };
    }
    const live = await getActiveAdamId(supabase, {});
    return { kind: 'session', target: live || entry.sentinel, sentinel: entry.sentinel, peer: key, live: Boolean(live), retargeted: false, relayVia: null };
  }

  if (key === 'solomon') {
    if (originator) {
      const r = await resolveSolomonReplyTarget(supabase, originator, {});
      return { kind: 'session', target: r.target, sentinel: entry.sentinel, peer: key, live: Boolean(r.live), retargeted: r.retargeted, relayVia: null };
    }
    const live = await getActiveSolomonId(supabase, {});
    return { kind: 'session', target: live || entry.sentinel, sentinel: entry.sentinel, peer: key, live: Boolean(live), retargeted: false, relayVia: null };
  }

  // coordinator
  const live = await getActiveCoordinatorId(supabase);
  return { kind: 'session', target: live || entry.sentinel, sentinel: entry.sentinel, peer: key, live: Boolean(live), retargeted: false, relayVia: null };
}

module.exports = { resolvePeerTarget, PEER_KINDS };
