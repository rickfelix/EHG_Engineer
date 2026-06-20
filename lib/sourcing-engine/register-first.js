/**
 * Pure helpers for the register-first SD-creation wiring.
 * SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-1/FR-2/FR-3/FR-4).
 *
 * PATH_A (coordinator ruling, ack 75448f1b): FR-2 is WARN-ONLY — the universal create path emits a
 * non-blocking nudge when an SD is created without a preceding roadmap registration, but does NOT
 * auto-register (the default-wave / source-id minting convention is owned by the deferred parent
 * SD-LEO-INFRA-SOURCING-ROADMAP-ENGINE-001 and must not be invented on the universal SD-creation path).
 *
 * These helpers are PURE (no IO) so the orchestration in scripts/leo-create-sd.js stays thin and the
 * decisions unit-test without a DB. The lane column ships DORMANT, so lane persistence is fail-soft at
 * the call site (detect PostgREST 42703); these helpers only compute the intended payloads.
 */

import { routeCandidate } from './router.js';

/**
 * Derive createSD fields from a roadmap_wave_items row (FR-1, --from-roadmap-item).
 * @param {{id?:string, title?:string, source_type?:string, source_id?:string, item_disposition?:string, metadata?:object}} item
 * @returns {{title:string, type:string, metadata:object}}
 */
export function deriveSdFieldsFromRoadmapItem(item) {
  const it = item || {};
  const md = it.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  // Disposition -> SD type hint (BUILD/RESEARCH/REFERENCE/CANCEL are dispositions, not SD types):
  // a BUILD item becomes a feature/infrastructure SD; everything else defaults to feature and lets
  // the normal type inference / --type override take over.
  const type = md.sd_type || 'feature';
  return {
    title: it.title || `Roadmap item ${it.id || ''}`.trim(),
    type,
    metadata: {
      source: 'roadmap_item',
      source_id: it.id,
      roadmap_item_source_type: it.source_type,
      roadmap_item_source_id: it.source_id,
      item_disposition: it.item_disposition || null,
    },
  };
}

/**
 * Build the atomic two-way stamp payload (FR-3): the roadmap item side and the conversion_ledger side,
 * written together so the linkage cannot drift. Returns the column→value updates for each side; the
 * caller applies them (fail-soft). `proposalPath` is optional (the promoted proposal file, if any).
 *
 * @param {{id?:string, source_type?:string, source_id?:string}} item  the roadmap_wave_items row
 * @param {string} sdKey  the freshly-created SD key
 * @param {string|null} [proposalPath]
 * @returns {{ roadmap:{promoted_to_sd_key:string}, ledger:(null|{linked_sd_key:string, promoted_proposal_path?:string}) }}
 */
export function buildTwoWayStamp(item, sdKey, proposalPath = null) {
  const it = item || {};
  const roadmap = { promoted_to_sd_key: sdKey };
  // The conversion_ledger side is only stamped when the roadmap item traces back to a ledger row
  // (source_type='conversion_ledger' carries the ledger id in source_id).
  let ledger = null;
  if (it.source_type === 'conversion_ledger' && it.source_id) {
    ledger = { linked_sd_key: sdKey };
    if (proposalPath) ledger.promoted_proposal_path = proposalPath;
  }
  return { roadmap, ledger };
}

/**
 * The FR-2 warn-only decision: should the create path nudge that this SD was created without a
 * preceding roadmap registration? PATH_A — warn (never block, never auto-register). Skips obviously
 * exempt origins (children, fixtures, and SDs already created FROM a roadmap item) to keep the
 * universal path low-noise.
 *
 * @param {{sd_key?:string, metadata?:object}} sd  the created SD
 * @param {boolean} hasRegistration  whether a roadmap_wave_items row already points to this SD
 * @param {string|null} [parentId]  the parent SD id/key when this is a child (top-level, not in metadata)
 * @returns {boolean}
 */
export function shouldWarnRegisterFirst(sd, hasRegistration, parentId = null) {
  if (hasRegistration) return false;
  const s = sd || {};
  const md = s.metadata && typeof s.metadata === 'object' ? s.metadata : {};
  if (md.source === 'roadmap_item') return false;      // created FROM a roadmap item — already linked
  if (md.is_fixture === true) return false;             // test fixtures
  if (typeof s.sd_key === 'string' && /^SD-(TEST|DEMO|SWITCH-OLD)\b/.test(s.sd_key)) return false;
  // Children inherit their parent's lineage. The real createChild path stamps metadata.parent_sd_key
  // (+ child_index) and passes parentId as the createSD `parentId` arg — NOT metadata.parent_sd_id /
  // source:'child'. Check the shapes that actually occur so a child never false-warns.
  if (parentId || md.parent_sd_key || md.parent_sd_id || md.child_index != null || md.source === 'child') return false;
  return true;
}

/**
 * Compute the sourcing lane for a roadmap item via the shipped router (FR-4). Returns the routeCandidate
 * result; the caller persists `lane` fail-soft (the lane column is DORMANT). Pure.
 *
 * @param {{id?:string, title?:string, item_disposition?:string, metadata?:object}} item
 * @param {object} [context]  routeCandidate context (existing/inFlight/etc.)
 * @returns {{lane:string, disposition:(string|null), rung:(string|null)}}
 */
export function laneForRoadmapItem(item, context = {}) {
  const it = item || {};
  const md = it.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  return routeCandidate(
    {
      source_id: it.source_id,
      title: it.title,
      disposition: it.item_disposition || md.disposition || null,
      rung: md.rung || null,
    },
    context,
  );
}
