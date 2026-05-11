/**
 * lib/eva-support/research-cache.js
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-3, FR-2
 *
 * Hash-keyed cache for the /eva-support research flow. Hash = SHA-256 hex of
 * normalize(query)=lowercase + trim + collapse-whitespace. Read-side TTL eviction
 * (filter ttl_until > now() at SELECT) — no scheduled job.
 *
 * Fail-soft posture (per unlock_gate_override constraint #1): all errors return
 * { hit: false } so cache infrastructure never blocks the research flow.
 * Production callers can opt in to strict mode via { strict: true }.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const TABLE = 'eva_support_research_cache';
const DEFAULT_TTL_DAYS = 7;

function defaultClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('research-cache: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

/**
 * Normalize a raw query string for hashing: lowercase + trim + collapse whitespace.
 * Exposed for tests + cache invalidation tooling.
 */
export function normalizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * SHA-256 hex of normalized query.
 */
export function hashQuery(raw) {
  return createHash('sha256').update(normalizeQuery(raw)).digest('hex');
}

function isSchemaCacheMiss(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(msg) || /relation .* does not exist/i.test(msg);
}

/**
 * Fetch a cached response. Returns { hit, response, references, hash }.
 *
 * - Returns hit:false when no row exists OR ttl_until <= now() OR any error
 *   (fail-soft — cache miss is always safe).
 * - On hit, asynchronously bumps accessed_at via UPDATE (does not block the
 *   return; the bump is observational telemetry).
 */
export async function get(rawQuery, { client, strict = false } = {}) {
  const hash = hashQuery(rawQuery);
  const empty = { hit: false, response: null, references: [], hash };
  let c;
  try {
    c = client ?? defaultClient();
  } catch (e) {
    if (strict) throw e;
    return empty;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await c
    .from(TABLE)
    .select('query_hash, response_text, "references", ttl_until')
    .eq('query_hash', hash)
    .gt('ttl_until', nowIso)
    .maybeSingle();

  if (error) {
    if (isSchemaCacheMiss(error)) return empty;
    if (strict) throw error;
    return empty;
  }
  if (!data) return empty;

  // Fire-and-forget accessed_at bump.
  void c.from(TABLE).update({ accessed_at: nowIso }).eq('query_hash', hash);

  return {
    hit: true,
    response: data.response_text,
    references: data.references || [],
    hash,
  };
}

/**
 * Set / overwrite a cached response. Idempotent on query_hash (PRIMARY KEY).
 * Returns { written: boolean, hash }.
 */
export async function set(rawQuery, responseText, { references = [], ttlDays = DEFAULT_TTL_DAYS, client, strict = false } = {}) {
  if (typeof responseText !== 'string') {
    if (strict) throw new Error('research-cache.set: responseText must be a string');
    return { written: false, hash: hashQuery(rawQuery) };
  }
  const hash = hashQuery(rawQuery);
  let c;
  try {
    c = client ?? defaultClient();
  } catch (e) {
    if (strict) throw e;
    return { written: false, hash };
  }

  const ttlUntil = new Date(Date.now() + ttlDays * 24 * 3600 * 1000).toISOString();
  const row = {
    query_hash: hash,
    query_text: normalizeQuery(rawQuery),
    response_text: responseText,
    references,
    ttl_until: ttlUntil,
  };

  const { error } = await c
    .from(TABLE)
    .upsert(row, { onConflict: 'query_hash' });

  if (error) {
    if (strict && !isSchemaCacheMiss(error)) throw error;
    return { written: false, hash };
  }
  return { written: true, hash };
}

/**
 * Purge cached rows older than the given cutoff. Returns { deleted } (count).
 */
export async function purgeBefore(cutoffIso, { client } = {}) {
  const c = client ?? defaultClient();
  const { count, error } = await c
    .from(TABLE)
    .delete({ count: 'exact' })
    .lt('created_at', cutoffIso);
  if (error) {
    if (isSchemaCacheMiss(error)) return { deleted: 0 };
    throw error;
  }
  return { deleted: count ?? 0 };
}

/**
 * Purge a single cached row by query_hash. Returns { deleted: 0|1 }.
 */
export async function purgeByQueryHash(hash, { client } = {}) {
  const c = client ?? defaultClient();
  const { count, error } = await c
    .from(TABLE)
    .delete({ count: 'exact' })
    .eq('query_hash', hash);
  if (error) {
    if (isSchemaCacheMiss(error)) return { deleted: 0 };
    throw error;
  }
  return { deleted: count ?? 0 };
}

export default { get, set, hashQuery, normalizeQuery, purgeBefore, purgeByQueryHash };
