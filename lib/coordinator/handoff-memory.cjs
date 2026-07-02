/**
 * handoff-memory.cjs — SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B (FR-1)
 *
 * Pure normalize/shape functions for a relaunching singleton's handoff-memory artifact.
 * Scoped to state NOT already DB-backed via claude_sessions.metadata.working_context or
 * session_coordination (mid-reasoning context, a reply the old session intended to send but
 * had not, an item read but not yet actioned). An item that already has a session_coordination
 * row should carry session_coordination_row_id (cross-reference) rather than duplicating the
 * row's content — session_coordination rows already survive restart via the retargetStale*Inbound
 * / drain*Outbound layer (lib/coordinator/adam-identity.cjs, lib/coordinator/solomon-identity.cjs).
 *
 * PURE + injectable (no DB, no I/O) so it is unit-testable, mirroring lib/coordinator/working-context.cjs.
 * This module is CJS because the repo is type:module.
 *
 * Canonical shape:
 *   { items: [{ kind, correlation_id?, session_coordination_row_id?, counterpart?, summary, opened_at }],
 *     captured_at, predecessor_session_id }
 * Canonical item kinds: consult | directive | reply_owed | reasoning_context.
 */

const ITEM_KINDS = Object.freeze(['consult', 'directive', 'reply_owed', 'reasoning_context']);

function isoNow(nowMs) {
  return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
}

function pickStr(v) { return typeof v === 'string' ? v.trim() : ''; }

/** Normalize one item. Returns null if it has no usable `summary` (nothing worth preserving). */
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = pickStr(raw.summary) || pickStr(raw.description);
  if (!summary) return null;
  const kindRaw = pickStr(raw.kind).toLowerCase();
  const kind = ITEM_KINDS.includes(kindRaw) ? kindRaw : 'reasoning_context';
  const out = { kind, summary };
  const correlationId = pickStr(raw.correlation_id);
  if (correlationId) out.correlation_id = correlationId;
  const rowId = pickStr(raw.session_coordination_row_id);
  if (rowId) out.session_coordination_row_id = rowId;
  const counterpart = pickStr(raw.counterpart);
  if (counterpart) out.counterpart = counterpart;
  out.opened_at = typeof raw.opened_at === 'string' ? raw.opened_at : null;
  return out;
}

/**
 * Normalize a whole handoff-memory blob. Never throws; tolerates null/garbage.
 * Preserves unknown top-level keys so a normalize-persist cycle does not silently drop them.
 */
function normalizeHandoffMemory(hm, opts = {}) {
  const base = (hm && typeof hm === 'object' && !Array.isArray(hm)) ? hm : {};
  const items = Array.isArray(base.items) ? base.items.map(normalizeItem).filter(Boolean) : [];
  return {
    ...base,
    items,
    captured_at: typeof base.captured_at === 'string' ? base.captured_at : isoNow(opts.nowMs),
    predecessor_session_id: pickStr(base.predecessor_session_id) || null,
  };
}

module.exports = { ITEM_KINDS, normalizeItem, normalizeHandoffMemory };
