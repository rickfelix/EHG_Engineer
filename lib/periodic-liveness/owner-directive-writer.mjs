/**
 * SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-1, FR-1b.
 *
 * Writes an ack-required session_coordination directive to the live role seat that owns a
 * laddered periodic process, instead of the process unconditionally reaching the chairman's
 * decision queue. Generalizes lib/coordinator/adam-action-ack.cjs's action_required/action_kind
 * (set at send) / actioned_at (set on genuine ack, distinct from read_at transport-only)
 * convention to an arbitrary target_session, and uses payload.kind='periodic_liveness_owner_directive'
 * -- a kind registered in lib/fleet/worker-status.cjs's DIRECTIVE_KINDS allowlist, so
 * scripts/hooks/coordination-inbox.cjs treats it deliver-not-consume (read_at stays null until a
 * genuine ack) and scripts/worker-ack-directive.cjs can stamp payload.actioned_at on it.
 *
 * KNOWN LIMITATION: this module only WRITES and READS directive rows; the FR-1b unacked-timeout
 * decision (climb.count >= LADDER_THRESHOLD + 3) is evaluated by the caller (the watcher), which
 * also owns re-deriving climb.count each tick -- this module does not itself track ticks.
 */

export const OWNER_DIRECTIVE_KIND = 'periodic_liveness_owner_directive';

/**
 * Pure: has this directive row been genuinely acked (not merely transport-delivered)?
 * Mirrors lib/coordinator/adam-action-ack.cjs's isActioned predicate.
 * @param {{payload?: {actioned_at?: string}}} row
 * @returns {boolean}
 */
export function isOwnerDirectiveActioned(row) {
  return !!row?.payload?.actioned_at;
}

/**
 * Build the session_coordination insert row for a new owner-directive.
 * Pure (no IO) so it is directly unit-testable.
 * @param {{targetSession:string, processKey:string, displayName?:string, signature?:string, requiredInvocation?:string|null}} args
 * @returns {object} row shape for supabase.from('session_coordination').insert(...)
 */
export function buildOwnerDirectiveRow({ targetSession, processKey, displayName, signature, requiredInvocation = null }) {
  if (!targetSession) throw new Error('buildOwnerDirectiveRow requires targetSession (a resolved, live peer session id)');
  if (!processKey) throw new Error('buildOwnerDirectiveRow requires processKey');
  const label = displayName || processKey;
  const body =
    `Periodic-liveness ladder: ${label} is OVERDUE past threshold and is owned by you. ` +
    (requiredInvocation ? `Required invocation: '${requiredInvocation}'. ` : '') +
    'Acknowledge once actioned via: node scripts/worker-ack-directive.cjs --id <this row id>.';
  return {
    sender_session: 'periodic-liveness-watcher',
    target_session: targetSession,
    message_type: 'INFO', // DIRECTIVE_KINDS classification lives in payload.kind, not message_type (no dedicated enum value exists)
    subject: `[PERIODIC_LIVENESS_OWNER_DIRECTIVE] ${label}`,
    body,
    payload: {
      kind: OWNER_DIRECTIVE_KIND,
      rung: 'owner_directive',
      process_key: processKey,
      display_name: label,
      signature: signature || 'unknown',
      required_invocation: requiredInvocation,
      sent_at: new Date().toISOString(),
    },
    sender_type: 'watcher',
  };
}

/**
 * Write (or refresh) an owner-directive row for a laddered process. Idempotent per process_key:
 * if an un-acked, un-resolved directive already exists for this process_key, it is left alone
 * (no duplicate row) -- the caller's tick loop re-evaluates FR-1b's timeout against the existing
 * row's climb.count, not against a new row's fresh age.
 *
 * @param {object} supabase
 * @param {{targetSession:string, processKey:string, displayName?:string, signature?:string, requiredInvocation?:string|null}} args
 * @param {{findExisting?: Function}} [deps] - injectable for tests
 * @returns {Promise<{written:boolean, id?:string, reused?:boolean, error?:string}>}
 */
export async function writeOwnerDirective(supabase, args, deps = {}) {
  const { findExisting = findExistingOwnerDirective } = deps;
  try {
    const existing = await findExisting(supabase, args.processKey);
    if (existing && !existing.payload?.ladder_resolved_at) {
      return { written: true, id: existing.id, reused: true };
    }
    const row = buildOwnerDirectiveRow(args);
    const { data, error } = await supabase.from('session_coordination').insert(row).select('id').single();
    if (error) {
      console.error(`[owner-directive-writer] insert failed for ${args.processKey}: ${error.message}`);
      return { written: false, error: error.message };
    }
    return { written: true, id: data.id, reused: false };
  } catch (e) {
    console.error(`[owner-directive-writer] writeOwnerDirective threw for ${args?.processKey}: ${e.message}`);
    return { written: false, error: e.message };
  }
}

/** Find an existing, unresolved owner-directive row for this process_key. Read-only, fail-soft to null. */
export async function findExistingOwnerDirective(supabase, processKey) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .eq('payload->>kind', OWNER_DIRECTIVE_KIND)
    .eq('payload->>process_key', processKey)
    .is('payload->>ladder_resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

/**
 * FR-3: mark an owner-directive row resolved on recovery (brief_data-equivalent
 * payload.ladder_resolved_at -- session_coordination has no resolved_at/status column,
 * mirroring chairman_decisions' own lack of a resolved_at column).
 * @param {object} supabase
 * @param {string} id
 * @returns {Promise<{resolved:boolean, error?:string}>}
 */
export async function resolveOwnerDirective(supabase, id) {
  try {
    const { data: row, error: readError } = await supabase
      .from('session_coordination')
      .select('payload')
      .eq('id', id)
      .single();
    if (readError || !row) return { resolved: false, error: readError?.message || 'not found' };
    const mergedPayload = { ...(row.payload || {}), ladder_resolved_at: new Date().toISOString() };
    const { error } = await supabase.from('session_coordination').update({ payload: mergedPayload }).eq('id', id);
    if (error) return { resolved: false, error: error.message };
    return { resolved: true };
  } catch (e) {
    console.error(`[owner-directive-writer] resolveOwnerDirective threw for id=${id}: ${e.message}`);
    return { resolved: false, error: e.message };
  }
}
