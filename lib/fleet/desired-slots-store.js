/**
 * Fleet desired-state slot STORE — SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-1/FR-2/FR-3).
 *
 * Sibling B shipped the pure slot core (session-manifest.js normalizeDesiredSlots/computeSlotDrift)
 * and the live-drift adapter (session-registry-adapter.js loadLiveSlotIdentity), but nothing STORED
 * the desired set — so a reboot (zero live sessions) had no manifest to read. This module is the
 * missing persistence + translation layer that reboot-respawn (FR-5) consumes:
 *
 *   FR-1  loadDesiredSlots(supabase)      → the frozen desired manifest, in normalizeDesiredSlots shape
 *   FR-1  upsertDesiredSlot(supabase,slot)→ chairman/operator writes one desired slot
 *   FR-2  captureResumeUuid(supabase,...) → get-then-merge metadata.resume_uuid on a live session
 *   FR-3  slotsToRoster(slots)            → the FLEET_SUPERVISOR_ROSTER JSON the supervisor consumes
 *
 * FAIL-SOFT contract (mirrors loadLiveSlotIdentity): a missing fleet_desired_slots table (this SD's
 * migration is chairman-gated DDL, merged-but-unapplied) degrades loadDesiredSlots to [] with a loud
 * one-time stderr canary, so the whole reboot-respawn mechanism is deliverable and drill-able before
 * the chairman gate has fired (against a fixture or manually-seeded manifest).
 */
import { normalizeDesiredSlots } from './session-manifest.js';

const TABLE = 'fleet_desired_slots';

// One-time loud canary so an unapplied migration is observable, not silent (mirrors the
// merged-but-unapplied posture documented in the STAGED migration header). Deduped per-process.
let _tableAbsentWarned = false;
function warnTableAbsent(where, detail) {
  if (_tableAbsentWarned) return;
  _tableAbsentWarned = true;
  try {
    console.warn(`   ⚠️  [FLEET_DESIRED_SLOTS_ABSENT] ${where}: ${detail} — reboot-respawn is reading an EMPTY desired manifest until the chairman-gated migration 20260720_fleet_desired_slots_STAGED.sql is applied (non-fatal).`);
  } catch { /* best effort */ }
}

/**
 * FR-1: read the frozen desired-state slot manifest. Returns rows ALREADY in the exact
 * normalizeDesiredSlots shape `{name,color,role,account_profile,model,effort,worktree,resume_uuid}`
 * so computeSlotDrift / the reboot-respawn runner consume it without transformation. Only enabled
 * slots are returned (disabled slots must not be respawned). FAIL-SOFT: [] on table-absent / any
 * query error.
 * @param {object} supabase
 * @returns {Promise<Array<{name:string, color:string|null, role:string|null, account_profile:string|null, model:string|null, effort:string|null, worktree:string|null, resume_uuid:string|null}>>}
 */
export async function loadDesiredSlots(supabase) {
  if (!supabase || typeof supabase.from !== 'function') return [];
  let res;
  try {
    res = await supabase
      .from(TABLE)
      .select('name, color, role, account_profile, model, effort, worktree, resume_uuid, enabled');
  } catch (e) {
    warnTableAbsent('loadDesiredSlots', (e && e.message) || String(e));
    return [];
  }
  const { data, error } = res || {};
  if (error) {
    warnTableAbsent('loadDesiredSlots', error.message || 'query error');
    return [];
  }
  // enabled=false slots are excluded here (never respawned); normalizeDesiredSlots then drops any
  // nameless row and canonicalizes the shape (its output does not carry `enabled`).
  const enabled = (data || []).filter((r) => r && r.enabled !== false);
  return normalizeDesiredSlots(enabled);
}

/**
 * FR-1: upsert ONE desired slot (chairman/operator edit). Conflict target is the `name` PK. Bumps
 * updated_at. FAIL-SOFT: returns {ok:false, error} rather than throwing on table-absent / write error.
 * @param {object} supabase
 * @param {{name:string, color?:string, role?:string, account_profile?:string, model?:string, effort?:string, worktree?:string, resume_uuid?:string, enabled?:boolean}} slot
 * @returns {Promise<{ok:boolean, error?:string|null}>}
 */
export async function upsertDesiredSlot(supabase, slot = {}) {
  if (!slot || !slot.name) return { ok: false, error: 'upsertDesiredSlot: slot.name is required' };
  const row = {
    name: slot.name,
    color: slot.color ?? null,
    role: slot.role ?? null,
    account_profile: slot.account_profile ?? null,
    model: slot.model ?? null,
    effort: slot.effort ?? null,
    worktree: slot.worktree ?? null,
    resume_uuid: slot.resume_uuid ?? null,
    enabled: slot.enabled === undefined ? true : !!slot.enabled,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'name' });
    return { ok: !error, error: error ? error.message : null };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * FR-2: capture a live session's real Claude Code resume token — claude_sessions.session_id, the
 * value captured by scripts/hooks/capture-session-id.cjs — into metadata.resume_uuid so a reboot can
 * `claude --resume <uuid>` the RIGHT session. GET-then-MERGE scoped to the exact session_id (never a
 * bare replace) so coordinator-stamped fleet_identity/callsign/tier_rank/role survive — the same
 * discipline spawn-control.js's handle-capture write uses.
 *
 * The resume token IS the session UUID (Claude Code's `--resume` takes the session id), so
 * metadata.resume_uuid := sessionId. When `name` (the slot callsign) is supplied, best-effort also
 * mirror the token onto fleet_desired_slots.resume_uuid (fail-soft: the table may be unapplied).
 * @param {object} supabase
 * @param {{name?:string, sessionId:string}} args
 * @returns {Promise<{ok:boolean, error?:string|null}>}
 */
export async function captureResumeUuid(supabase, { name, sessionId } = {}) {
  if (!sessionId) return { ok: false, error: 'captureResumeUuid: sessionId is required' };
  try {
    const { data: current, error: readErr } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    const baseMeta = (current && current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata))
      ? current.metadata
      : {};
    const merged = { ...baseMeta, resume_uuid: sessionId };
    const { error: writeErr } = await supabase
      .from('claude_sessions')
      .update({ metadata: merged })
      .eq('session_id', sessionId);

    // Best-effort mirror onto the desired-slots row (FR-2 "and/or the fleet_desired_slots.resume_uuid
    // column"). Fail-soft: the chairman-gated table may be absent; never let this block the primary
    // metadata write's outcome.
    if (name) {
      try {
        await supabase.from(TABLE)
          .update({ resume_uuid: sessionId, updated_at: new Date().toISOString() })
          .eq('name', name);
      } catch { /* fail-soft: table absent / no matching slot */ }
    }
    return { ok: !writeErr, error: writeErr ? writeErr.message : null };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * FR-3: translate stored/normalized desired slots into the roster JSON shape the resident supervisor
 * (scripts/fleet/fleet-supervisor.cjs) parses from FLEET_SUPERVISOR_ROSTER (line 182):
 * `{role, callsign, accountProfile}`. `name`→`callsign`, `account_profile`→`accountProfile`.
 * `resume_uuid` is carried through as an EXTRA key so the reboot-respawn runner can thread it into
 * the FR-4 `--resume` spawn path (the supervisor itself ignores unknown keys).
 *
 * Slots with `enabled=false` are excluded (raw input may still carry the flag); normalizeDesiredSlots
 * then drops any nameless slot. The serialized array parses cleanly via JSON.parse exactly as the
 * supervisor consumes it.
 * @param {Array<object>} desiredSlots - raw OR normalizeDesiredSlots-shaped slots
 * @returns {Array<{role:string, callsign:string, accountProfile:string|null, resume_uuid:string|null}>}
 */
export function slotsToRoster(desiredSlots = []) {
  const list = Array.isArray(desiredSlots) ? desiredSlots : [];
  // enabled=false explicitly excluded; undefined/true kept (normalized slots never carry `enabled`).
  const kept = list.filter((s) => s && s.enabled !== false);
  return normalizeDesiredSlots(kept).map((s) => ({
    role: s.role || 'worker',
    callsign: s.name,
    accountProfile: s.account_profile || null,
    resume_uuid: s.resume_uuid || null,
  }));
}
