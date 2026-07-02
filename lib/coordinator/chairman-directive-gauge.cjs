/**
 * Chairman-directive per-role ack/compliance gauge.
 *
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1.
 *
 * Mirrors the pure-core + fail-open + flag-gated SHAPE of lib/coordinator/relay-drop-gauge.cjs
 * EXACTLY. Where that gauge correlates one inbound row to one outbound confirm, this gauge tracks,
 * per directive_id and per applies_to ROLE, whether a chairman_directive_ack (with actioned_at)
 * exists. Reproduces the confirmed incident shape: a chairman directive that no role acked, ~2h with
 * nothing flagging that a role was non-compliant.
 *
 * SUPERSEDES semantics: for a given directive_id, only the LATEST issued_at directive is tracked (the
 * chairman reversed effort low->high->low; the stale earlier directive must not out-rank the newer one
 * and must not be counted OUTSTANDING).
 *
 * CommonJS (.cjs) so a .cjs coordinator tick / the fleet dashboard can require() it, mirroring
 * relay-drop-gauge.cjs's module format.
 *
 * @module lib/coordinator/chairman-directive-gauge
 */

'use strict';

const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');

const CHAIRMAN_DIRECTIVE_KIND = PAYLOAD_KINDS.CHAIRMAN_DIRECTIVE; // 'chairman_directive'
const CHAIRMAN_DIRECTIVE_ACK_KIND = 'chairman_directive_ack';

/** Default compliance window: 5 min — the chairman-baseline cadence the incident silently missed. */
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Env flag gating the write-side of any tick (default ON — read/report is always live). Callers MUST
 * check the returned `enabled` before writing; this function only computes the flag (mirrors
 * relay-drop-gauge.gaugeEnabled).
 */
function gaugeEnabled(env) {
  env = env || process.env;
  return String(env.CHAIRMAN_DIRECTIVE_GAUGE_V1 ?? 'true').toLowerCase() !== 'false';
}

/** Resolve the compliance window (ms) from env, falling back to the default. */
function resolveWindowMs(env) {
  env = env || process.env;
  const min = Number(env.CHAIRMAN_DIRECTIVE_GAUGE_WINDOW_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_WINDOW_MS;
}

function tsMs(ts) {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * CORE — pure, dependency-injected per-role compliance decision. Zero IO. Given chairman_directive
 * rows and chairman_directive_ack rows, for each directive_id keeps ONLY the latest issued_at
 * (SUPERSEDES), then per applies_to role reports ACKED (an ack row with actioned_at) vs OUTSTANDING.
 *
 * @param {object} args
 * @param {Array<object>} args.directives - session_coordination rows, payload.kind='chairman_directive'
 * @param {Array<object>} args.acks       - rows, payload.kind='chairman_directive_ack'
 * @param {number} [args.now=Date.now()]
 * @param {number} [args.windowMs=DEFAULT_WINDOW_MS]
 * @returns {Array<object>} one row per (directive_id × applies_to role):
 *   { directiveId, role, status:'acked'|'outstanding', issuedAt, ageMs, ackedAt }
 */
function decideChairmanDirectiveCompliance({ directives, acks, now, windowMs } = {}) {
  now = Number.isFinite(now) ? now : Date.now();
  windowMs = Number.isFinite(windowMs) ? windowMs : DEFAULT_WINDOW_MS;

  // SUPERSEDES: per directive_id keep the row with the greatest issued_at (latest wins).
  const latestByDir = new Map();
  for (const d of (directives || [])) {
    const p = d && d.payload;
    if (!p || p.kind !== CHAIRMAN_DIRECTIVE_KIND || !p.directive_id) continue;
    const prev = latestByDir.get(p.directive_id);
    if (!prev || tsMs(p.issued_at) >= tsMs(prev.payload.issued_at)) latestByDir.set(p.directive_id, d);
  }

  // Index acks by directive_id -> role -> latest actioned_at.
  const ackByDir = new Map();
  for (const a of (acks || [])) {
    const p = a && a.payload;
    if (!p || p.kind !== CHAIRMAN_DIRECTIVE_ACK_KIND || !p.directive_id || !p.actioned_at) continue;
    if (!ackByDir.has(p.directive_id)) ackByDir.set(p.directive_id, new Map());
    const roleMap = ackByDir.get(p.directive_id);
    const role = String(p.role || '');
    const prev = roleMap.get(role);
    if (!prev || tsMs(p.actioned_at) >= tsMs(prev)) roleMap.set(role, p.actioned_at);
  }

  const out = [];
  for (const [directiveId, d] of latestByDir) {
    const p = d.payload;
    const roles = Array.isArray(p.applies_to) ? p.applies_to : [];
    const roleMap = ackByDir.get(directiveId) || new Map();
    const ageMs = now - tsMs(p.issued_at);
    for (const role of roles) {
      const ackedAt = roleMap.get(String(role)) || null;
      out.push({
        directiveId,
        role: String(role),
        status: ackedAt ? 'acked' : 'outstanding',
        issuedAt: p.issued_at || null,
        ageMs,
        ackedAt,
      });
    }
  }
  return out;
}

/** IO: load recent chairman_directive rows. FAIL-SOFT: [] on error. */
async function loadDirectives(supabase, opts = {}) {
  const { windowLookbackMs = 24 * 60 * 60 * 1000, now = Date.now() } = opts;
  try {
    const since = new Date(now - windowLookbackMs).toISOString();
    const { data } = await supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .eq('payload->>kind', CHAIRMAN_DIRECTIVE_KIND)
      .gte('created_at', since)
      .limit(200);
    return data || [];
  } catch (_) {
    return [];
  }
}

/** IO: load recent chairman_directive_ack rows. FAIL-SOFT: [] on error. */
async function loadAcks(supabase, opts = {}) {
  const { windowLookbackMs = 24 * 60 * 60 * 1000, now = Date.now() } = opts;
  try {
    const since = new Date(now - windowLookbackMs).toISOString();
    const { data } = await supabase
      .from('session_coordination')
      .select('id, payload, created_at')
      .eq('payload->>kind', CHAIRMAN_DIRECTIVE_ACK_KIND)
      .gte('created_at', since)
      .limit(400);
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Convenience for a ROLE inbox (adam/coordinator/solomon): compute this role's per-directive
 * compliance rows (latest issued_at per directive_id, this role's ack status). READ-ONLY / non-
 * consuming (never mutates target_session — a broadcast chairman_directive must survive so every role
 * surfaces it). FAIL-OPEN: returns [] on any error. Rendered first-class by each role's inbox.
 * @returns {Promise<Array<object>>} rows for `role`: { directiveId, role, status, issuedAt, ageMs, ackedAt }
 */
async function loadRoleDirectiveStatus(supabase, role, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const [directives, acks] = await Promise.all([
      loadDirectives(supabase, { now }),
      loadAcks(supabase, { now }),
    ]);
    const rows = decideChairmanDirectiveCompliance({ directives, acks, now, windowMs: resolveWindowMs(opts.env || process.env) });
    return rows.filter((r) => r.role === String(role));
  } catch (_) {
    return [];
  }
}

/**
 * Tick entry point. FAIL-OPEN end to end — never throws. Read/report always runs; gaugeEnabled() only
 * gates whether callers should act on 'outstanding' rows — this module performs no writes.
 * @returns {Promise<{ enabled, rows, outstanding, acked }>}
 */
async function planChairmanDirectiveCompliance(supabase, opts = {}) {
  const env = opts.env || process.env;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const [directives, acks] = await Promise.all([
      loadDirectives(supabase, { now }),
      loadAcks(supabase, { now }),
    ]);
    const rows = decideChairmanDirectiveCompliance({ directives, acks, now, windowMs: resolveWindowMs(env) });
    return {
      enabled: gaugeEnabled(env),
      rows,
      outstanding: rows.filter((r) => r.status === 'outstanding').length,
      acked: rows.filter((r) => r.status === 'acked').length,
    };
  } catch (e) {
    return { enabled: gaugeEnabled(env), rows: [], outstanding: 0, acked: 0, error: String((e && e.message) || e) };
  }
}

module.exports = {
  decideChairmanDirectiveCompliance, // pure core (unit-testable in isolation)
  gaugeEnabled,
  resolveWindowMs,
  loadDirectives,
  loadAcks,
  loadRoleDirectiveStatus,
  planChairmanDirectiveCompliance,
  CHAIRMAN_DIRECTIVE_KIND,
  CHAIRMAN_DIRECTIVE_ACK_KIND,
  DEFAULT_WINDOW_MS,
};
