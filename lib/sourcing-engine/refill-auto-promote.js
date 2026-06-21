/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-C — flag-gated auto-refill promote (staged -> belt).
 *
 * The LIVE-FLIP step that closes the staged->belt gap: proactive-populator STAGES roadmap_wave_items at
 * item_disposition='pending' and stops; the coordinator hand-promotes every tick (the anti-pattern). This
 * module promotes VALID staged candidates onto the belt = create a draft SD from the staged row + stamp
 * roadmap_wave_items.promoted_to_sd_key (two-way link via register-first buildTwoWayStamp).
 *
 * SAFETY: it reuses the -A candidate-validity SSOT through -B's verifyStagedCandidates (no predicate
 * re-implementation -> can't drift), caps every run at a batch limit so it can never flood the belt, and is
 * DOUBLE-GATED at the CLI (SOURCING_AUTO_REFILL_V1 enable flag + --apply write flag). promoteStagedCandidate
 * is the ONLY writer and is a no-op preview unless apply:true.
 *
 * selectRefillBatch + buildRefillSdPayload are PURE + TOTAL (no DB/fs/clock; never throw on odd input).
 * ESM (this repo is type:module) — mirrors lib/sourcing-engine/refill-dry-run-verifier.js.
 */
import { verifyStagedCandidates } from './refill-dry-run-verifier.js';
import { buildTwoWayStamp } from './register-first.js';

/** Default per-run promotion cap — a single run never promotes more than this onto the belt. */
export const DEFAULT_REFILL_BATCH_LIMIT = 10;

/**
 * Select the staged rows to promote this run: the VALID candidates (per the -A/-B SSOT), capped at limit.
 * Pure + total.
 * @param {Array<Object>} rows  staged roadmap_wave_items rows
 * @param {{limit?:number}} [opts]
 * @returns {{ batch:Array<Object>, validCount:number, total:number, limit:number, byReason:Object }}
 */
export function selectRefillBatch(rows, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_REFILL_BATCH_LIMIT;
  const report = verifyStagedCandidates(rows);
  return {
    batch: report.valid.slice(0, limit),
    validCount: report.validCount,
    total: report.total,
    limit,
    byReason: report.byReason,
  };
}

/** Short, stable suffix from a string (no clock/random) so promotion keys are deterministic + idempotent. */
function stableSuffix(input) {
  let h = 0;
  const s = String(input == null ? '' : input);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 8).padStart(8, '0');
}

/**
 * Build the deterministic SD key for a staged item. Deterministic on source -> re-running the cron never
 * mints a second key for the same item (paired with the already_promoted predicate guard for idempotency).
 * @param {{source_type?:string, source_id?:string, id?:string}} item
 * @returns {string}
 */
export function buildRefillSdKey(item) {
  const it = item || {};
  return `SD-REFILL-${stableSuffix(`${it.source_type || ''}:${it.source_id || it.id || ''}`)}`;
}

/**
 * Build the draft-SD insert payload from a staged roadmap_wave_items row. Pure. Mirrors the minimal shape
 * roadmap-manager.js uses for a promoted item (draft + traceable provenance in metadata).
 * @param {{id?:string, title?:string, source_type?:string, source_id?:string, lane?:string, wave_id?:string}} item
 * @param {string} sdKey
 * @returns {Object} strategic_directives_v2 insert payload
 */
export function buildRefillSdPayload(item, sdKey) {
  const it = item || {};
  const title = (it.title && String(it.title).trim()) || 'Auto-refill candidate';
  return {
    sd_key: sdKey,
    title: title.slice(0, 200),
    status: 'draft',
    sd_type: 'feature',
    description: 'Auto-promoted from staged roadmap_wave_items by the auto-refill cron '
      + `(SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-C). Source: ${it.source_type || 'unknown'}:${it.source_id || it.id || 'unknown'}.`,
    scope: `Staged candidate: ${title}`.slice(0, 500),
    metadata: {
      sourced_by: 'auto-refill',
      promoted_from_roadmap_item_id: it.id || null,
      source_type: it.source_type || null,
      source_id: it.source_id || null,
      ...(it.lane ? { lane: it.lane } : {}),
    },
  };
}

/**
 * Promote a SINGLE staged candidate onto the belt: create a draft SD + stamp the roadmap row's
 * promoted_to_sd_key (two-way link). The ONLY writer here. Dry-run (apply:false, the default) performs NO
 * writes and just reports what it WOULD do. Idempotent: an item already carrying promoted_to_sd_key, or
 * whose deterministic key already exists, is a no-op.
 *
 * @param {object} supabase  service-role client
 * @param {Object} item      a staged roadmap_wave_items row (must have id)
 * @param {{apply?:boolean}} [opts]
 * @returns {Promise<{promoted:boolean, dry_run:boolean, sd_key:string|null, reason:string|null}>}
 */
export async function promoteStagedCandidate(supabase, item, opts = {}) {
  const apply = opts.apply === true;
  const out = { promoted: false, dry_run: !apply, sd_key: null, reason: null };
  if (!item || !item.id) { out.reason = 'missing_item_id'; return out; }
  if (item.promoted_to_sd_key) { out.reason = 'already_promoted'; out.sd_key = item.promoted_to_sd_key; return out; }

  const sdKey = buildRefillSdKey(item);
  out.sd_key = sdKey;

  // Idempotency guard: never mint a duplicate SD for the same deterministic key.
  const { data: existing } = await supabase
    .from('strategic_directives_v2').select('sd_key').eq('sd_key', sdKey).limit(1);
  if (existing && existing.length) { out.reason = 'sd_exists'; return out; }

  if (!apply) { out.reason = 'dry_run'; return out; }

  const { error: insErr } = await supabase
    .from('strategic_directives_v2').insert(buildRefillSdPayload(item, sdKey));
  if (insErr) { out.reason = `insert_failed: ${insErr.message}`; return out; }

  // Two-way stamp (fail-soft — the SD already exists; a missed stamp is recoverable, not corrupting).
  const stamp = buildTwoWayStamp(item, sdKey);
  const { error: upErr } = await supabase
    .from('roadmap_wave_items').update(stamp.roadmap).eq('id', item.id);
  if (upErr) { out.promoted = true; out.reason = `promoted_stamp_warn: ${upErr.message}`; return out; }

  out.promoted = true;
  out.reason = 'promoted';
  return out;
}
