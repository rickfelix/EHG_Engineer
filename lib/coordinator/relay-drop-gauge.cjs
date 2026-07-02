/**
 * Unactioned relay/decision/review drop gauge.
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-3.
 *
 * Mirrors the pure-core + fail-open + flag-gated SHAPE of
 * lib/coordinator/pending-question-timer.cjs, with one structural delta: that module
 * decides per-row over ONE set; this gauge is a CORRELATION — an inbound row implying
 * a RELAY/DECISION/REVIEW action is flagged only if NO matching outbound row (a
 * relay_confirm, or a decision-reply) exists within N minutes. Reproduces confirmed
 * incident #1's exact shape: a relay-request acked-without-actioning, no outbound
 * confirm, ~2h with nothing flagging the drop.
 *
 * CommonJS (.cjs) so a .cjs coordinator tick can require() it, mirroring
 * pending-question-timer.cjs's module format.
 *
 * @module lib/coordinator/relay-drop-gauge
 */

'use strict';

const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');

/** Default drop-detection window: ~15min per the chairman inbox baseline (FR-3). */
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Env flag gating the write-side of the tick (default ON — read/report is always live
 * regardless of this flag; RELAY_DROP_GAUGE_V1=false is the operator kill-switch for the
 * write side only, e.g. to silence writes mid-incident). Callers MUST check the returned
 * `enabled` before writing (see scripts/coordinator-relay-drop-gauge.cjs's main()) — this
 * function only computes the flag, it does not enforce it.
 */
function gaugeEnabled(env) {
  env = env || process.env;
  return String(env.RELAY_DROP_GAUGE_V1 ?? 'true').toLowerCase() !== 'false';
}

/** Resolve the drop-detection window (ms) from env, falling back to the default. */
function resolveWindowMs(env) {
  env = env || process.env;
  const min = Number(env.RELAY_DROP_GAUGE_WINDOW_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_WINDOW_MS;
}

function tsMs(ts) {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/** Inbound payload.kind values this gauge tracks (relay/decision/review action requests). */
const TRACKED_INBOUND_KINDS = Object.freeze([
  PAYLOAD_KINDS.RELAY_REQUEST,
  'decision_request',
  'review_request',
]);

/**
 * Does this inbound row imply a RELAY/DECISION/REVIEW action the gauge should track?
 * @param {object} row
 * @returns {boolean}
 */
function isTrackedInbound(row) {
  const kind = row && row.payload && row.payload.kind;
  return TRACKED_INBOUND_KINDS.includes(kind);
}

/**
 * The correlation id an inbound row is satisfied by, if any outbound row echoes it.
 * @param {object} row
 * @returns {string|null}
 */
function correlationOf(row) {
  const p = row && row.payload;
  return (p && (p.correlation_id || p.id)) || (row && row.id) || null;
}

/**
 * Does this outbound row satisfy a tracked inbound row (a relay_confirm referencing
 * confirm_relay_of/correlation_id, or a decision/review reply echoing reply_to)?
 * @param {object} row
 * @returns {string|null} the correlation id it satisfies, or null if it satisfies nothing
 */
function satisfiesCorrelation(row) {
  const p = row && row.payload;
  if (!p) return null;
  if (p.kind === PAYLOAD_KINDS.RELAY_CONFIRM) return p.correlation_id || p.confirm_relay_of || null;
  if (p.reply_to || p.in_reply_to) return p.reply_to || p.in_reply_to;
  return null;
}

/**
 * CORE — pure, dependency-injected correlation decision. Given inbound rows (candidate
 * relay/decision/review requests) and outbound rows (candidate confirms/replies), flags
 * any inbound row aged past the window with NO matching outbound. Zero IO.
 *
 * @param {Array<object>} inboundRows
 * @param {Array<object>} outboundRows
 * @param {object} [opts] - { now=Date.now(), windowMs=DEFAULT_WINDOW_MS }
 * @returns {Array<object>} decisions, one per tracked inbound row:
 *   { action:'flag'|'ok'|'pending', id, correlationId, ageMs, reason }
 */
function decideRelayDrops(inboundRows, outboundRows, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : DEFAULT_WINDOW_MS;

  const satisfiedCorrelations = new Set(
    (outboundRows || [])
      .map(satisfiesCorrelation)
      .filter(Boolean)
  );

  const out = [];
  for (const row of (inboundRows || [])) {
    if (!isTrackedInbound(row)) continue;
    const id = row && row.id != null ? row.id : null;
    const correlationId = correlationOf(row);
    const ageMs = now - tsMs(row.created_at);

    if (correlationId && satisfiedCorrelations.has(correlationId)) {
      out.push({ action: 'ok', id, correlationId, ageMs, reason: 'matching outbound found' });
      continue;
    }

    if (ageMs < windowMs) {
      out.push({ action: 'pending', id, correlationId, ageMs, reason: 'below window, not yet flaggable' });
      continue;
    }

    out.push({ action: 'flag', id, correlationId, ageMs, reason: `no matching outbound within ${Math.round(windowMs / 60000)}min` });
  }
  return out;
}

/**
 * IO: load candidate inbound rows (tracked kinds only, DB-side filter via .in()).
 * FAIL-SOFT: [] on error.
 */
async function loadInboundCandidates(supabase, opts = {}) {
  const { windowLookbackMs = 24 * 60 * 60 * 1000, now = Date.now() } = opts;
  try {
    const since = new Date(now - windowLookbackMs).toISOString();
    const { data } = await supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .in('payload->>kind', TRACKED_INBOUND_KINDS)
      .gte('created_at', since)
      .limit(200);
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * IO: load candidate outbound rows (relay_confirm rows, in the same lookback window).
 * FAIL-SOFT: [] on error. Reply-kind rows (decision/review replies) are not payload.kind
 * scoped in this codebase — callers that also want those should pass them in via the
 * pure core directly rather than relying on this loader alone.
 */
async function loadOutboundCandidates(supabase, opts = {}) {
  const { windowLookbackMs = 24 * 60 * 60 * 1000, now = Date.now() } = opts;
  try {
    const since = new Date(now - windowLookbackMs).toISOString();
    const { data } = await supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .eq('payload->>kind', PAYLOAD_KINDS.RELAY_CONFIRM)
      .gte('created_at', since)
      .limit(200);
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Tick entry point. FAIL-OPEN end to end — never throws. Read/report always runs;
 * gaugeEnabled() only gates whether callers should act on 'flag' decisions (e.g. by
 * writing a durable feedback row) — this module itself performs no writes.
 * @param {object} supabase
 * @param {object} [opts] - { env, now }
 * @returns {Promise<{ enabled, decisions, flagged, ok, pending }>}
 */
async function planRelayDrops(supabase, opts = {}) {
  const env = opts.env || process.env;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const [inbound, outbound] = await Promise.all([
      loadInboundCandidates(supabase, { now }),
      loadOutboundCandidates(supabase, { now }),
    ]);
    const decisions = decideRelayDrops(inbound, outbound, { now, windowMs: resolveWindowMs(env) });
    return {
      enabled: gaugeEnabled(env),
      decisions,
      flagged: decisions.filter((d) => d.action === 'flag').length,
      ok: decisions.filter((d) => d.action === 'ok').length,
      pending: decisions.filter((d) => d.action === 'pending').length,
    };
  } catch (e) {
    return { enabled: gaugeEnabled(env), decisions: [], flagged: 0, ok: 0, pending: 0, error: String((e && e.message) || e) };
  }
}

module.exports = {
  decideRelayDrops,
  isTrackedInbound,
  correlationOf,
  satisfiesCorrelation,
  gaugeEnabled,
  resolveWindowMs,
  loadInboundCandidates,
  loadOutboundCandidates,
  planRelayDrops,
  TRACKED_INBOUND_KINDS,
  DEFAULT_WINDOW_MS,
};
