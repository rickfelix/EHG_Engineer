/**
 * Capability persistence + reuse
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 6 (FR-015)
 *
 * Panel outputs are written to sd_capabilities (typed, reuse-tracked) so a later
 * venture inherits "Clerk auth", "read-only Postgres connector", "PII-masking"
 * instead of re-deriving them. This is the mechanism by which each venture's
 * capabilities compound into the EHG platform.
 *
 * Pure mapping + reuse-decision logic — the live writer applies the plan via the
 * canonical sd_capabilities path; headlessly unit-testable.
 *
 * @module lib/eva/bridge/capability-persistence
 */

/** Panel dimension -> sd_capabilities {capability_type, category}. Unknown => service/application. */
export const DIMENSION_CAPABILITY = Object.freeze({
  'technical-architecture': { type: 'api_endpoint', category: 'application' },
  'data-schema': { type: 'database_schema', category: 'application' },
  'product-ux-design': { type: 'component', category: 'application' },
  'risk-security-compliance': { type: 'validation_rule', category: 'governance' },
  'venture-stack-compliance': { type: 'quality_gate', category: 'governance' },
  'data-algorithm': { type: 'service', category: 'application' },
  'business-model-monetization': { type: 'service', category: 'application' },
  'marketing-growth-gtm': { type: 'service', category: 'integration' },
  'acceptance-stories': { type: 'validation_rule', category: 'governance' },
});

/** Stable, dedup-friendly capability_id: a capability is the same across ventures by code+dimension. */
export function capabilityIdFor(section = {}) {
  return `cap-${String(section.code || 'X').toLowerCase()}-${String(section.dimension || 'general').toLowerCase()}`
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Map a panel section to an sd_capabilities record shape. */
export function toCapabilityRecord(section = {}, { ventureId = null } = {}) {
  const map = DIMENSION_CAPABILITY[section.dimension] || { type: 'service', category: 'application' };
  return {
    capability_id: capabilityIdFor(section),
    capability_type: map.type,
    category: map.category,
    name: `${section.code || 'agent'}: ${section.dimension || 'general'}`,
    description: String(section.section || '').slice(0, 280),
    source_venture_id: ventureId,
  };
}

/** Find an existing capability to reuse (same capability_id) — the compounding lookup. */
export function findReusable(record, existing = []) {
  return (Array.isArray(existing) ? existing : []).find((c) => c && c.capability_id === record.capability_id) || null;
}

/**
 * Plan the capability writes for a leaf's panel sections: reuse what already exists
 * (cross-venture compounding), create what's new.
 *
 * @param {Array<{dimension:string, code:string, section:string}>} sections
 * @param {Array<{capability_id:string, reuse_count?:number}>} existing
 * @param {object} [opts] - { ventureId }
 * @returns {{toCreate:object[], toReuse:Array<{capability_id:string, prior_reuse_count:number}>}}
 */
export function planCapabilityWrites(sections = [], existing = [], opts = {}) {
  const toCreate = [];
  const toReuse = [];
  const createdIds = new Set();
  for (const s of (Array.isArray(sections) ? sections : [])) {
    const rec = toCapabilityRecord(s, opts);
    const hit = findReusable(rec, existing);
    if (hit) {
      toReuse.push({ capability_id: hit.capability_id, prior_reuse_count: hit.reuse_count || 0 });
    } else if (!createdIds.has(rec.capability_id)) {
      createdIds.add(rec.capability_id);
      toCreate.push(rec);
    }
  }
  return { toCreate, toReuse };
}
