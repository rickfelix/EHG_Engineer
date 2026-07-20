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
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001: linkChild() now also computes a non-blocking
 * scope-coverage snapshot (lib/sd/scope-coverage.js) after registration and stores it at
 * metadata.scope_coverage, logging a loud (but never throwing) warning when the current
 * child set leaves parent scope elements uncovered. This is advisory-only — see
 * scope-coverage.js's module doc for why a hard-blocking check here would be wrong.
 *
 * QF-20260720-054 (Solomon Mode-B advisory d64ca850): linkChild() now also INHERITS the
 * parent's metadata.sourced_by onto the child as a PERSISTED stamp (computeInheritedSourcedBy)
 * so sourced_by-keyed yield gauges count decomposition children instead of undercounting them
 * (children were created with a null stamp). Never overwrites an existing child stamp. A
 * one-time backfill of pre-existing null children lives in
 * scripts/backfill-child-sourced-by.mjs (companion key sourced_by_backfilled=true).
 *
 * @module lib/sd/child-linkage
 */

import { computeScopeCoverage } from './scope-coverage.js';

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
 * PURE: decide the metadata.sourced_by value to STAMP on a decomposition child so its
 * provenance is INHERITED from the parent — a PERSISTED stamp, NOT a read-time join. This
 * is what lets sourced_by-keyed yield gauges count children instead of undercounting them
 * (the child-creation path never inherited, so children carried a null stamp).
 *
 * Returns the parent's sourced_by when the parent carries one AND the child does not yet
 * (never overwrites an existing child stamp); returns null when there is nothing to inherit.
 * QF-20260720-054 (Solomon Mode-B advisory d64ca850).
 *
 * @param {object|null|undefined} parentMeta - parent SD metadata
 * @param {object|null|undefined} childMeta - child SD's CURRENT metadata
 * @returns {string|null} the value to stamp, or null for "no change"
 */
export function computeInheritedSourcedBy(parentMeta, childMeta) {
  const isObj = (m) => m && typeof m === 'object' && !Array.isArray(m);
  const parentStamp = isObj(parentMeta) ? parentMeta.sourced_by : null;
  if (parentStamp == null || parentStamp === '') return null;      // nothing to inherit
  const childStamp = isObj(childMeta) ? childMeta.sourced_by : null;
  if (childStamp != null && childStamp !== '') return null;        // never overwrite an existing stamp
  return parentStamp;
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
    .select('id, uuid_id, sd_key, metadata, scope, success_criteria')
    .eq('sd_key', parent.sd_key)
    .single();
  const parentNow = (!fErr && fresh) ? fresh : parent;

  const { childFields, parentMetadata, registryKind, alreadyRegistered } =
    computeChildLinkage(parentNow, childKey, opts);

  // 1) Child fields — parent_sd_id + relationship_type='child' (the linkage contract).
  // Also INHERIT the parent's provenance stamp (metadata.sourced_by) onto the child as a
  // PERSISTED stamp (QF-20260720-054) so sourced_by-keyed yield gauges count children. The
  // child is inserted with its own metadata before linkChild runs, so re-fetch it and merge
  // — computeInheritedSourcedBy never clobbers an existing child stamp.
  let childUpdate = childFields;
  const { data: childRow } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', childKey)
    .single();
  const childMeta = (childRow?.metadata && typeof childRow.metadata === 'object' && !Array.isArray(childRow.metadata))
    ? childRow.metadata
    : {};
  const inheritedSourcedBy = computeInheritedSourcedBy(parentNow.metadata, childMeta);
  if (inheritedSourcedBy != null) {
    childUpdate = { ...childFields, metadata: { ...childMeta, sourced_by: inheritedSourcedBy, sourced_by_inherited: true } };
  }

  const { error: cErr } = await supabase
    .from('strategic_directives_v2')
    .update(childUpdate)
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

  // 3) Scope-coverage snapshot — advisory-only, never blocks/throws on failure.
  // Base metadata for the patch: prefer the just-written parentMetadata (carries the
  // fresh registry entry) over parentNow.metadata (already-registered / no-op case).
  try {
    const parentRef = parentNow.id ?? parentNow.uuid_id ?? null;
    const { data: allChildren, error: childrenFetchErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, scope, scope_slice')
      .eq('parent_sd_id', parentRef);
    // A failed re-fetch is NOT "zero children" -- treating it that way would persist a
    // wrong low/0% coverage snapshot (clobbering a previously-correct one) on a transient
    // DB hiccup. Bail out of the advisory computation entirely; the try/catch below still
    // makes this non-fatal to linkChild's real work (child fields + registry).
    if (childrenFetchErr) throw new Error(`children re-fetch failed: ${childrenFetchErr.message}`);

    const coverage = computeScopeCoverage(parentNow, allChildren || []);
    if (coverage.coverage_pct < 100) {
      const uncovered = coverage.elements.filter((e) => !e.covered).map((e) => e.element);
      console.warn(
        `[linkChild] ⚠️  scope coverage incomplete (${coverage.coverage_pct}%) for parent ${parentNow.sd_key} — uncovered: ${uncovered.join('; ')}`
      );
    }

    const baseMetadata = parentMetadata || (parentNow.metadata && typeof parentNow.metadata === 'object' ? parentNow.metadata : {});
    const { error: covErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: { ...baseMetadata, scope_coverage: coverage } })
      .eq('sd_key', parentNow.sd_key);
    if (covErr) console.warn(`[linkChild] ⚠️  scope-coverage write non-fatal: ${covErr.message}`);
  } catch (covErr) {
    console.warn(`[linkChild] ⚠️  scope-coverage computation failed (non-fatal): ${covErr.message}`);
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

export default { computeChildLinkage, computeInheritedSourcedBy, linkChild, deriveChildLetter };
