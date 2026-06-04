/**
 * Live sd_capabilities writer (MAPPER)
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-2 (B1/TR-1)
 *
 * capability-persistence.js produces a PURE plan ({capability_id, capability_type,
 * category, name, description}). That shape is NOT directly insertable: the live
 * sd_capabilities table has NO `capability_id` column and requires `capability_key`,
 * an `action` ∈ {registered, updated} (CHECK), and BOTH `sd_id` (varchar SD key) and
 * `sd_uuid` (uuid) NOT NULL. This module MAPS the plan to live rows and UPSERTs them
 * idempotently on UNIQUE(sd_uuid, capability_key, action).
 *
 * Scope guards (risk R5): venture-namespace the capability_key (the Phase A
 * capability_id is venture-agnostic — TS-4b); write NO reuse_count / centrality
 * columns from the panel; gate the prod write behind PREBUILD_PANEL_ENRICHMENT.
 *
 * @module lib/eva/bridge/capability-writer
 */

import { toCapabilityRecord, findReusable } from './capability-persistence.js';

/** The ONLY action values the sd_capabilities CHECK constraint accepts. */
export const VALID_CAPABILITY_ACTIONS = Object.freeze(['registered', 'updated']);

/**
 * Venture-namespace a capability slug so the same dimension across ventures does not
 * share a key. (Row identity also includes sd_uuid, but namespacing keeps the key
 * self-describing and collision-proof under any key-only query — TS-4b.)
 */
export function namespacedCapabilityKey(capabilityId, ventureId) {
  return ventureId ? `${ventureId}:${capabilityId}` : String(capabilityId);
}

/**
 * Map ONE planned capability record to a live sd_capabilities row.
 * @param {object} record - from toCapabilityRecord (has capability_id, capability_type, category, name, description)
 * @param {object} ctx - { sdId, sdUuid, ventureId, action }
 * @returns {object} insertable row
 */
export function mapToCapabilityRow(record, { sdId, sdUuid, ventureId = null, action } = {}) {
  if (!sdId || !sdUuid) throw new Error('mapToCapabilityRow: sdId and sdUuid are both required (NOT NULL)');
  if (!VALID_CAPABILITY_ACTIONS.includes(action)) {
    throw new Error(`mapToCapabilityRow: action must be one of ${VALID_CAPABILITY_ACTIONS.join('/')} (CHECK), got ${action}`);
  }
  return {
    sd_id: sdId,                 // varchar SD key — NOT NULL
    sd_uuid: sdUuid,             // uuid — NOT NULL
    capability_key: namespacedCapabilityKey(record.capability_id, ventureId),
    action,                      // 'registered' (new) | 'updated' (reused)
    capability_type: record.capability_type,
    category: record.category,
    name: record.name,
    description: record.description,
  };
  // NOTE: deliberately NO reuse_count / graph_centrality_score / plane*_score — R5.
}

/**
 * Plan the live rows for a leaf's panel sections (PURE). Each section becomes a row;
 * a section whose capability already exists (cross-venture) is action='updated',
 * otherwise 'registered'. De-duplicated by (capability_key, action) within the leaf
 * so the UPSERT never self-conflicts.
 * @param {Array} sections - panel sections [{dimension, code, section}]
 * @param {Array} existing - prior capabilities for reuse lookup [{capability_id, ...}]
 * @param {object} ctx - { sdId, sdUuid, ventureId }
 * @returns {object[]} deduped insertable rows
 */
export function planLeafCapabilityRows(sections = [], existing = [], { sdId, sdUuid, ventureId = null } = {}) {
  const seen = new Set();
  const rows = [];
  for (const s of (Array.isArray(sections) ? sections : [])) {
    const rec = toCapabilityRecord(s, { ventureId });
    const action = findReusable(rec, existing) ? 'updated' : 'registered';
    const row = mapToCapabilityRow(rec, { sdId, sdUuid, ventureId, action });
    const dedupKey = `${row.capability_key}|${row.action}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    rows.push(row);
  }
  return rows;
}

/** Conflict target matching the live UNIQUE(sd_uuid, capability_key, action). */
export const CAPABILITY_CONFLICT_TARGET = 'sd_uuid,capability_key,action';

/**
 * Write a leaf's panel capabilities to sd_capabilities (idempotent UPSERT).
 * @param {object} supabase - supabase client (injectable)
 * @param {Array} sections
 * @param {Array} existing
 * @param {object} ctx - { sdId, sdUuid, ventureId }
 * @returns {Promise<{written:number, rows:object[]}>}
 */
export async function writeLeafCapabilities(supabase, sections, existing, ctx = {}) {
  const rows = planLeafCapabilityRows(sections, existing, ctx);
  if (rows.length === 0) return { written: 0, rows: [] };
  const { error } = await supabase
    .from('sd_capabilities')
    .upsert(rows, { onConflict: CAPABILITY_CONFLICT_TARGET, ignoreDuplicates: false });
  if (error) throw new Error(`writeLeafCapabilities: upsert failed: ${error.message}`);
  return { written: rows.length, rows };
}

export default { mapToCapabilityRow, planLeafCapabilityRows, writeLeafCapabilities, namespacedCapabilityKey, VALID_CAPABILITY_ACTIONS, CAPABILITY_CONFLICT_TARGET };
