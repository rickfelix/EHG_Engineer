// @wire-check-exempt: foundation metering surface (SD-A fleet-launcher substrate). Pure aggregation
// built first; the metering-surface consumer + manifest-drift wiring is the activation follow-up.
// Consumed today by its unit tests (incl. the metering→manifest-drift contract test).
/**
 * Fleet session-metering surface — SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 (FR-4).
 *
 * Pure aggregation over the session-registry SSOT (FR-1 joined identities): live-session counts by
 * role / model / identity-namespace, for the fleet metering surface (observability). This is the
 * ACTUAL side that pairs with the FR-3 DESIRED manifest — computeManifestDrift consumes the by-role
 * counts produced here to surface actual-vs-desired drift.
 *
 * PURE (data-in / verdict-out, no DB). `roleOf` / `modelOf` are injected accessors so the aggregation
 * stays decoupled from where role (SET_IDENTITY rows) and model (claude_sessions.metadata.model) live.
 */

/**
 * Aggregate joined session identities into a metering snapshot.
 * @param {Array<object>} joined - session identities (from joinSessionIdentity, FR-1)
 * @param {{ roleOf?: (s:object)=>string|null, modelOf?: (s:object)=>string|null }} [accessors]
 * @returns {{ total:number, byRole:Record<string,number>, byModel:Record<string,number>, byNamespace:{session_id:number,terminal_id:number,pid:number,callsign:number} }}
 */
export function meterSessions(joined = [], { roleOf, modelOf } = {}) {
  const list = Array.isArray(joined) ? joined : [];
  const byRole = {};
  const byModel = {};
  const byNamespace = { session_id: 0, terminal_id: 0, pid: 0, callsign: 0 };
  for (const s of list) {
    if (!s) continue;
    const role = (roleOf ? roleOf(s) : s.role) || 'unknown';
    byRole[role] = (byRole[role] || 0) + 1;
    const model = (modelOf ? modelOf(s) : s.model) || 'unknown';
    byModel[model] = (byModel[model] || 0) + 1;
    for (const ns of ['session_id', 'terminal_id', 'pid', 'callsign']) {
      if (s[ns] != null && s[ns] !== '') byNamespace[ns] += 1;
    }
  }
  return { total: list.length, byRole, byModel, byNamespace };
}

/**
 * Reduce a metering snapshot's byRole map to the actual-per-role counts computeManifestDrift expects
 * (identity passthrough — kept explicit so the metering→manifest-drift contract is named + testable).
 * @param {ReturnType<typeof meterSessions>} snapshot
 * @returns {Record<string,number>}
 */
export function actualByRole(snapshot) {
  return (snapshot && snapshot.byRole) || {};
}

/**
 * Reduce joined session identities to the actual-per-NAME slot map computeSlotDrift expects
 * (SD-LEO-INFRA-LEO-COMPLETION-001-B, FR-1/FR-2 desired-state slot schema). Slot identity is keyed
 * by `name` (the chairman-editable slot identifier), not role — a live session's name/color/role/
 * account_profile/model/effort/worktree/resume_uuid are read via the injected accessors so this stays
 * decoupled from where each field actually lives (SET_IDENTITY row, claude_sessions.metadata, etc.).
 * @param {Array<object>} joined - session identities (from joinSessionIdentity, FR-1)
 * @param {{ nameOf?:(s:object)=>string|null, slotOf?:(s:object)=>object }} [accessors]
 * @returns {Record<string, object>}
 */
export function actualByName(joined = [], { nameOf, slotOf } = {}) {
  const list = Array.isArray(joined) ? joined : [];
  const byName = {};
  for (const s of list) {
    if (!s) continue;
    const name = nameOf ? nameOf(s) : s.name;
    if (!name) continue;
    byName[name] = slotOf ? slotOf(s) : s;
  }
  return byName;
}
