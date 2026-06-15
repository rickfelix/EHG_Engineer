/**
 * SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-3): one-step child linkage.
 *
 * Consolidates the THREE things a child SD needs that the canonical createChild()
 * path in scripts/leo-create-sd.js did NOT do in one place:
 *   1. parent_sd_id  (createChild already sets this — preserved here)
 *   2. relationship_type = 'child'  (createChild did NOT set it → children failed
 *      scripts/validate-child-sd-completeness.js which REQUIRES relationship_type==='child')
 *   3. registration in the parent's children registry  (no active code wrote this —
 *      it was done by manual DB surgery during Adam sourcing; the exact friction this
 *      SD removes).
 *
 * Design: a PURE core (computeChildLinkage — no DB/IO, fully unit-testable, the SD
 * activation test) + a thin governed IO wrapper (linkChild). The IO wrapper RE-FETCHES
 * the parent's current metadata immediately before merging so the registry write uses
 * fresh state (narrows the read-modify-write window). A fully path-atomic jsonb_set RPC
 * is the proper hardening for high-concurrency same-parent creation and is tracked as a
 * follow-up — see [[feedback-singleton-identity-atomic-jsonb-not-js-rmw]]; same-parent
 * child creation is effectively sequential today (orchestrator loops / Adam one-at-a-time).
 *
 * @module lib/sd/child-linkage
 */

/**
 * Derive the autonomy child suffix letter from a child key (…-001-F → 'F').
 * @param {string} childKey
 * @returns {string|null}
 */
export function deriveChildLetter(childKey) {
  const m = String(childKey || '').match(/-([A-Z])$/);
  return m ? m[1] : null;
}

/**
 * PURE: compute the child fields + the parent's new metadata for registration.
 * No DB, no I/O, deterministic (date/uuid/registrant supplied via opts).
 *
 * relationship_type is ALWAYS 'child' (a child is never an 'orchestrator' — that is a
 * coordination pattern, not a child work-type). parent_sd_id preserves the existing
 * createChild semantics (parent.id) with a stable fallback to uuid_id.
 *
 * Registry: an autonomy parent (metadata.autonomy_children present) gets a letter-keyed
 * entry matching the existing shape; any other parent gets an entry appended to a
 * `children` array. Registration is IDEMPOTENT — if the child sd_key is already present,
 * parentMetadata is null (no rewrite) and alreadyRegistered is true.
 *
 * @param {object} parent - parent SD row (id / uuid_id / sd_key / metadata)
 * @param {string} childKey - the child's sd_key
 * @param {object} [opts] - { role, status, registeredBy, today, childUuid, letter }
 * @returns {{ childFields: {parent_sd_id: any, relationship_type: 'child'},
 *             parentMetadata: object|null, registryKind: 'autonomy_children'|'children',
 *             alreadyRegistered: boolean }}
 */
export function computeChildLinkage(parent, childKey, opts = {}) {
  if (!parent || typeof parent !== 'object') throw new Error('computeChildLinkage: parent row object required');
  if (!childKey || typeof childKey !== 'string') throw new Error('computeChildLinkage: childKey (string) required');

  const parentRef = parent.id ?? parent.uuid_id ?? null;
  const childFields = { parent_sd_id: parentRef, relationship_type: 'child' };

  const meta = (parent.metadata && typeof parent.metadata === 'object' && !Array.isArray(parent.metadata))
    ? parent.metadata
    : {};

  const entry = {
    sd_key: childKey,
    role: opts.role ?? null,
    status: opts.status ?? 'draft',
    uuid_id: opts.childUuid ?? null,
    registered_by: opts.registeredBy ?? 'leo-create-sd',
    registered_on: opts.today ?? null,
  };

  // Autonomy parent → letter-keyed map; otherwise → `children` array.
  if (meta.autonomy_children && typeof meta.autonomy_children === 'object' && !Array.isArray(meta.autonomy_children)) {
    const existing = meta.autonomy_children;
    const alreadyRegistered = Object.values(existing).some((e) => e && e.sd_key === childKey);
    const letter = opts.letter || deriveChildLetter(childKey);
    if (alreadyRegistered || !letter) {
      return { childFields, parentMetadata: null, registryKind: 'autonomy_children', alreadyRegistered };
    }
    const parentMetadata = { ...meta, autonomy_children: { ...existing, [letter]: entry } };
    return { childFields, parentMetadata, registryKind: 'autonomy_children', alreadyRegistered: false };
  }

  const existing = Array.isArray(meta.children) ? meta.children : [];
  const alreadyRegistered = existing.some((e) => e && e.sd_key === childKey);
  if (alreadyRegistered) {
    return { childFields, parentMetadata: null, registryKind: 'children', alreadyRegistered: true };
  }
  const parentMetadata = { ...meta, children: [...existing, entry] };
  return { childFields, parentMetadata, registryKind: 'children', alreadyRegistered: false };
}

/**
 * Governed IO wrapper: wire a child to its parent in ONE step — set the child's
 * parent_sd_id + relationship_type='child' AND (idempotently) register the child in the
 * parent's registry. RE-FETCHES the parent's current metadata before merging so the
 * registry write is not based on a stale snapshot. Never throws silently — a registry
 * failure is surfaced (the child fields are the contract; the registry is best-effort
 * only if opts.registryOptional is set).
 *
 * @param {object} supabase - supabase client (.from().update().eq())
 * @param {object} parent - parent SD row (must include sd_key; id/uuid_id used for ref)
 * @param {string} childKey
 * @param {object} [opts] - forwarded to computeChildLinkage + { registryOptional }
 * @returns {Promise<{childKey:string, parentKey:string, relationship_type:'child',
 *                    registryKind:string, registered:boolean, alreadyRegistered:boolean}>}
 */
export async function linkChild(supabase, parent, childKey, opts = {}) {
  if (!supabase || typeof supabase.from !== 'function') throw new Error('linkChild: supabase client required');
  if (!parent?.sd_key) throw new Error('linkChild: parent.sd_key required');

  // Re-fetch the parent's CURRENT metadata so the registry merge uses fresh state.
  const { data: fresh, error: fErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, metadata')
    .eq('sd_key', parent.sd_key)
    .single();
  const parentNow = (!fErr && fresh) ? fresh : parent;

  const { childFields, parentMetadata, registryKind, alreadyRegistered } =
    computeChildLinkage(parentNow, childKey, opts);

  // 1) Child fields — parent_sd_id + relationship_type='child' (the linkage contract).
  const { error: cErr } = await supabase
    .from('strategic_directives_v2')
    .update(childFields)
    .eq('sd_key', childKey);
  if (cErr) throw new Error(`linkChild: failed to set child fields on ${childKey}: ${cErr.message}`);

  // 2) Parent registry — idempotent (parentMetadata null ⇒ already registered).
  let registered = false;
  if (parentMetadata) {
    const { error: pErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: parentMetadata })
      .eq('sd_key', parentNow.sd_key);
    if (pErr) {
      if (!opts.registryOptional) {
        throw new Error(`linkChild: failed to register ${childKey} in parent ${parentNow.sd_key}: ${pErr.message}`);
      }
      console.warn(`[linkChild] ⚠️  registry registration non-fatal: ${pErr.message}`);
    } else {
      registered = true;
    }
  }

  return {
    childKey,
    parentKey: parentNow.sd_key,
    relationship_type: 'child',
    registryKind,
    registered,
    alreadyRegistered,
  };
}

export default { computeChildLinkage, linkChild, deriveChildLetter };
