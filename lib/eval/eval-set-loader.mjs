/**
 * eval-set-loader.mjs — sealed eval-set loader + GT-floor bookkeeping
 * (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-B FR-2, second consumer of the
 * golden-task seal conventions: feedback-category primary read, system_events
 * mirror fallback, content-hash integrity).
 *
 * Unlike golden tasks there is no redaction surface here — cases are reviewable
 * in-repo fixtures (mechanical replay, no memorization threat model). The DB seal
 * is the integrity authority: a case loads only if its sealed content_hash matches
 * the canonical hash recomputed from the sealed payload; mismatches are REFUSED
 * with EVAL_CASE_HASH_MISMATCH, never silently dropped.
 */

import { createHash } from 'node:crypto';
import { EVAL_SET_CLASSES } from './eval-set-fixtures.mjs';

/** Fields hashed per case — explicit whitelist, canonical sorted-key serialization. */
const HASHED_FIELDS = Object.freeze([
  'case_id', 'synthetic', 'known_bad',
  'loop', 'evidence', 'now', 'engine_verdict_expected',
  'section_change', 'adjudicated_label',
  'adjudicated_status', 'adjudication_evidence',
]);

/** Deterministic serialization: sorted keys at every depth, whitelist at the top. */
function canonicalSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalSerialize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalSerialize(value[k])).join(',') + '}';
}

/** Full sha256 hex over the canonical whitelisted case body (matches child A's diffHash semantics). */
export function evalCaseHash(evalCase) {
  const picked = {};
  for (const f of HASHED_FIELDS) {
    if (evalCase[f] !== undefined) picked[f] = evalCase[f];
  }
  return createHash('sha256').update(canonicalSerialize(picked)).digest('hex');
}

/** GT honesty floor (parent SD contract): >=3 REAL adjudicated cases incl >=1 real known-bad. */
export function computeFloorBookkeeping(cases) {
  const real = cases.filter((c) => c.synthetic !== true);
  const known_bad_present = real.some((c) => c.known_bad === true);
  const floor_met = real.length >= 3 && known_bad_present;
  return {
    real_count: real.length,
    synthetic_count: cases.length - real.length,
    known_bad_present,
    floor_met,
    experimental: !floor_met,
  };
}

/**
 * Load one class's sealed eval-set. Primary: feedback rows at the class category;
 * fallback: the system_events mirror. Each sealed row's metadata carries the full
 * case payload + content_hash; the hash is recomputed and enforced here.
 *
 * @param {Object} supabase
 * @param {string} artifactClass - 'closure_predicates' | 'leo_protocol_sections'
 * @returns {Promise<{artifact_class: string, cases: Array, refused: Array, bookkeeping: Object}>}
 */
export async function loadEvalSet(supabase, artifactClass) {
  const cls = EVAL_SET_CLASSES[artifactClass];
  if (!cls) throw new Error(`eval-set-loader: unknown artifact class "${artifactClass}"`);

  let rows = null;
  const primary = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', cls.category);
  if (!primary.error && primary.data && primary.data.length) {
    rows = primary.data;
  } else {
    const mirror = await supabase
      .from('system_events')
      .select('id, payload')
      .eq('event_type', cls.eventType);
    if (mirror.error) throw new Error(`eval-set-loader: sealed corpus for ${artifactClass} unavailable from both stores`);
    rows = mirror.data || [];
  }

  const cases = [];
  const refused = [];
  const seenHashes = new Set(); // mirror store may hold duplicate rows for one case (pre-repair + repaired)
  for (const row of rows) {
    const m = row.metadata || row.payload || {};
    if (m.record_kind !== 'eval_case') continue;
    if (m.content_hash && seenHashes.has(m.content_hash)) continue;
    if (m.content_hash) seenHashes.add(m.content_hash);
    const sealedCase = m.case || {};
    const recomputed = evalCaseHash(sealedCase);
    if (recomputed !== m.content_hash) {
      refused.push({
        case_id: m.case_id,
        error: 'EVAL_CASE_HASH_MISMATCH',
        reason: `sealed content_hash does not match recomputed hash for ${m.case_id}`,
      });
      continue;
    }
    cases.push({ ...sealedCase, content_hash: m.content_hash, sealed_row_ref: `db:${row.id || m.case_id}` });
  }
  cases.sort((a, b) => String(a.case_id).localeCompare(String(b.case_id)));

  return {
    artifact_class: artifactClass,
    cases,
    refused,
    bookkeeping: computeFloorBookkeeping(cases),
  };
}
