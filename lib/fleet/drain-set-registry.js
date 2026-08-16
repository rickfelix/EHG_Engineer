/**
 * drain-set-registry.js — SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A / substrate, FR-2).
 *
 * Fail-open reader for the STAGED role_drain_sets table (migration
 * 20260720_role_drain_sets_STAGED.sql — chairman-gated, NOT applied by this SD).
 * Structurally modeled on lib/eval/routing-consumption.mjs's fail-open pattern
 * (injected supabase client, pure filtering, never throws) with one addition:
 * a LOUD stderr canary on every fallback, so the unapplied state is observable
 * rather than silently indistinguishable from "the table has no rows for this
 * role" — the "STAGED absence visible, never silent" principle this SD's own
 * migration and prior sibling SDs establish.
 *
 * FALLBACK SSOT: lib/fleet/worker-status.cjs's DRAIN_SETS constant — imported,
 * never re-derived, so a fallback read is byte-identical to today's behavior.
 */
import DRAIN_SETS_MODULE from './worker-status.cjs';

const { DRAIN_SETS, TERMINAL_REPLY_KINDS } = DRAIN_SETS_MODULE;

const REGISTRY_TABLE = 'role_drain_sets';

function canary(role) {
  console.error(
    `[drain-set-registry] ${REGISTRY_TABLE} UNAPPLIED — failing open to hard-coded DRAIN_SETS for role '${role}'.`
  );
}

/**
 * Resolve the recognized kinds for a role. Fail-open to DRAIN_SETS[role] (with
 * a loud stderr canary) on any query error, missing table, or supabase=null —
 * never throws.
 * @param {{supabase: object|null, role: string}} args
 * @returns {Promise<string[]>}
 */
export async function resolveRecognizedKinds({ supabase = null, role } = {}) {
  const fallback = DRAIN_SETS[String(role).toLowerCase()] || [];
  if (!supabase || !role) {
    canary(role);
    return fallback;
  }
  try {
    const { data, error } = await supabase
      .from(REGISTRY_TABLE)
      .select('kind')
      .eq('role', role)
      .eq('status', 'active')
      .eq('direction', 'inbound');
    if (error) {
      canary(role);
      return fallback;
    }
    return Array.isArray(data) ? data.map((r) => r.kind) : fallback;
  } catch {
    canary(role);
    return fallback;
  }
}

/**
 * Canary probe: is role_drain_sets applied? Never throws.
 * @param {object|null} supabase
 * @returns {Promise<{applied: boolean, table: string}>}
 */
export async function assertRegistryTablesExist(supabase) {
  if (!supabase) return { applied: false, table: REGISTRY_TABLE };
  try {
    const { error } = await supabase.from(REGISTRY_TABLE).select('id').limit(1);
    return { applied: !error, table: REGISTRY_TABLE };
  } catch {
    return { applied: false, table: REGISTRY_TABLE };
  }
}

/**
 * Registry-backed replacement for lib/fleet/worker-status.cjs's warnIfUndrainedKind
 * (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B FR-3). Same warn-and-never-block contract
 * (terminal-reply-kind exemption, WARN-only log line, never throws) but the
 * recognized-kinds set comes from resolveRecognizedKinds() instead of indexing
 * DRAIN_SETS directly, so it stays correct once a chairman applies the migration.
 * @param {{supabase?: object|null, targetRole?: string|null, kind?: string|null, log?: Function}} args
 * @returns {Promise<boolean>} true iff a target-drain warning was emitted
 */
export async function warnIfUndrainedKindViaRegistry({ supabase = null, targetRole, kind, log = console.warn } = {}) {
  if (!kind || !targetRole) return false;
  // Preserve warnIfUndrainedKind's "unrecognized role -> silent" guard (worker-status.cjs
  // `if (!set) return false;`) so an unresolvable/unknown role hint never becomes a false
  // WARN. DRAIN_SETS stays the SSOT for "is this a known role" during the STAGED period,
  // matching FR-3's byte-identical-behavior requirement.
  if (!DRAIN_SETS[String(targetRole).toLowerCase()]) return false;
  if (TERMINAL_REPLY_KINDS.includes(kind)) return false;
  const recognized = await resolveRecognizedKinds({ supabase, role: targetRole });
  if (recognized.includes(kind)) return false;
  log(
    `[target-drain] WARN: kind '${kind}' is not in role '${targetRole}' drain set — ` +
    `this delivery may orphan at the target (drained kinds: ${recognized.join(', ')}). ` +
    'Send proceeds (warn-only, SD-LEO-INFRA-SEND-TIME-TARGET-001).'
  );
  return true;
}

export default { resolveRecognizedKinds, assertRegistryTablesExist, warnIfUndrainedKindViaRegistry };
