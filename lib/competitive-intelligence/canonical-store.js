/**
 * Canonical Competitive-Intelligence Store — data-layer abstraction
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (Phase 1 data spine)
 *
 * The SINGLE access path for the compounding per-venture competitor-intelligence
 * record (competitor_intelligence) and its point-in-time history (ci_snapshots).
 * Every consumer — the Stage-0 teardown seed adapter, the discovery service, the
 * differentiation board (Child E), and the UI surfaces (Children B/C/D) — goes
 * through this contract rather than touching the tables directly.
 *
 * The record is OPERATOR-owned with an OPTIONAL venture link: a Stage-0 teardown
 * produces it BEFORE a venture exists, and the venture_id is attached later when
 * the venture is seeded.
 *
 * Supabase is injectable (opts.supabase) so the layer is unit-testable without
 * a live DB.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: getCompetitorIntelligence (no-filter
// path) and listSnapshots (no explicit limit) read whole result sets that consumers iterate — a
// silent 1000-row PostgREST cap would drop competitor records / snapshot history. Paginate.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
dotenv.config();

let _client = null;

/**
 * Resolve a Supabase service client. Prefers an injected client (tests), else a
 * lazily-created singleton from env. Returns null if env is not configured.
 * @param {Object} [injected]
 * @returns {Object|null}
 */
export function resolveClient(injected) {
  if (injected) return injected;
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) _client = createClient(url, key);
  return _client;
}

const TABLE = 'competitor_intelligence';
const SNAPSHOTS = 'ci_snapshots';

/**
 * Fetch competitor-intelligence records by id, venture, or competitor URL.
 * Returns a single record when `id` is given, otherwise an array.
 *
 * @param {Object} filters
 * @param {string} [filters.id]
 * @param {string} [filters.ventureId]
 * @param {string} [filters.competitorUrl]
 * @param {Object} [opts]
 * @param {Object} [opts.supabase]
 * @returns {Promise<Object|Array|null>}
 */
export async function getCompetitorIntelligence(filters = {}, opts = {}) {
  const supabase = resolveClient(opts.supabase);
  if (!supabase) throw new Error('Supabase client not configured');

  const buildQuery = () => {
    let query = supabase.from(TABLE).select('*');
    if (filters.id) query = query.eq('id', filters.id);
    if (filters.ventureId) query = query.eq('venture_id', filters.ventureId);
    if (filters.competitorUrl) query = query.eq('competitor_url', filters.competitorUrl);
    // id tiebreaker gives range pagination a stable total order (FR-6)
    return query.order('created_at', { ascending: false }).order('id', { ascending: true });
  };

  let data;
  try {
    data = await fetchAllPaginated(buildQuery);
  } catch (err) {
    throw new Error(`getCompetitorIntelligence failed: ${err.message}`);
  }
  if (filters.id) return (data && data[0]) || null;
  return data || [];
}

/**
 * Insert or update a competitor-intelligence record. When `record.id` is
 * present an update is performed; otherwise a new row is inserted.
 *
 * @param {Object} record - column subset of competitor_intelligence
 * @param {Object} [opts]
 * @param {Object} [opts.supabase]
 * @returns {Promise<Object>} the persisted row
 */
export async function upsertCompetitorIntelligence(record = {}, opts = {}) {
  const supabase = resolveClient(opts.supabase);
  if (!supabase) throw new Error('Supabase client not configured');

  // Whitelist persisted columns so callers can pass richer objects safely.
  const row = pickColumns(record, [
    'id',
    'venture_id',
    'global_competitor_id',
    'competitor_url',
    'competitor_name',
    'source',
    'four_buckets',
    'competitive_intelligence',
    'differentiation_strategy',
    'differentiation_delta',
    'sanitization_status',
    'quality',
    'created_by',
  ]);

  if (row.id) {
    const { id, ...updates } = row;
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`upsertCompetitorIntelligence (update) failed: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw new Error(`upsertCompetitorIntelligence (insert) failed: ${error.message}`);
  return data;
}

/**
 * Append a point-in-time snapshot for a competitor-intelligence record. The
 * diff against the previous snapshot is computed automatically unless an
 * explicit `diff` is supplied.
 *
 * @param {string} competitorIntelligenceId
 * @param {Object} snapshot - the point-in-time payload to record
 * @param {Object} [opts]
 * @param {string} [opts.source] - one of 'refresh' | 'seed' | 'enrichment'
 * @param {Object} [opts.diff] - explicit diff override
 * @param {Object} [opts.supabase]
 * @returns {Promise<Object>} the persisted snapshot row
 */
export async function appendSnapshot(competitorIntelligenceId, snapshot, opts = {}) {
  const supabase = resolveClient(opts.supabase);
  if (!supabase) throw new Error('Supabase client not configured');
  if (!competitorIntelligenceId) throw new Error('competitorIntelligenceId is required');

  let diff = opts.diff;
  if (diff === undefined) {
    const prior = await listSnapshots(competitorIntelligenceId, { supabase, limit: 1 });
    diff = prior.length ? computeDiff(prior[0].snapshot, snapshot) : null;
  }

  const { data, error } = await supabase
    .from(SNAPSHOTS)
    .insert({
      competitor_intelligence_id: competitorIntelligenceId,
      snapshot,
      diff_from_prior: diff,
      source: opts.source || null,
    })
    .select()
    .single();
  if (error) throw new Error(`appendSnapshot failed: ${error.message}`);
  return data;
}

/**
 * List snapshots for a record, newest first.
 *
 * @param {string} competitorIntelligenceId
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {Object} [opts.supabase]
 * @returns {Promise<Array>}
 */
export async function listSnapshots(competitorIntelligenceId, opts = {}) {
  const supabase = resolveClient(opts.supabase);
  if (!supabase) throw new Error('Supabase client not configured');

  const buildQuery = () => supabase
    .from(SNAPSHOTS)
    .select('*')
    .eq('competitor_intelligence_id', competitorIntelligenceId)
    .order('captured_at', { ascending: false })
    .order('id', { ascending: true }); // id tiebreaker: stable page boundaries (FR-6)

  let data;
  try {
    if (opts.limit) {
      const { data: limited, error } = await buildQuery().limit(opts.limit);
      if (error) throw new Error(error.message);
      data = limited;
    } else {
      data = await fetchAllPaginated(buildQuery);
    }
  } catch (err) {
    throw new Error(`listSnapshots failed: ${err.message}`);
  }
  return data || [];
}

/**
 * Compute a shallow top-level diff between two snapshot payloads. Pure — used by
 * appendSnapshot and the on-demand refresh (Child D). Returns { added, removed,
 * changed } keyed by top-level field.
 *
 * @param {Object} prev
 * @param {Object} next
 * @returns {{added: string[], removed: string[], changed: string[]}}
 */
export function computeDiff(prev, next) {
  const a = prev && typeof prev === 'object' ? prev : {};
  const b = next && typeof next === 'object' ? next : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const added = [];
  const removed = [];
  const changed = [];
  for (const k of keys) {
    const inA = Object.prototype.hasOwnProperty.call(a, k);
    const inB = Object.prototype.hasOwnProperty.call(b, k);
    if (inA && !inB) removed.push(k);
    else if (!inA && inB) added.push(k);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  return { added, removed, changed };
}

/**
 * Internal: copy only whitelisted keys that are actually present on the source.
 * @param {Object} src
 * @param {string[]} keys
 * @returns {Object}
 */
function pickColumns(src, keys) {
  const out = {};
  for (const k of keys) {
    if (src && Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) {
      out[k] = src[k];
    }
  }
  return out;
}
