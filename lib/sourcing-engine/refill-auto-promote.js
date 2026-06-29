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
import { randomUUID } from 'crypto';
import { verifyStagedCandidates } from './refill-dry-run-verifier.js';
import { buildTwoWayStamp, deriveSdFieldsFromRoadmapItem } from './register-first.js';
// SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-B (THE churn fix): the disposition-gate helpers.
import { hasBuildDisposition, REFILL_INVALID_REASONS } from './refill-candidate-validity.js';

/**
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-B: is distilled-only auto-mint mode on? When ON, the
 * auto-refill funnel promotes ONLY items dispositioned as buildable (the churn fix). Default OFF (env unset
 * / any value != 'on') keeps the current behavior for a safe rollout. Reads the env at call time so the
 * flag can flip without a process restart; injectable via `env` for tests.
 * @param {Object} [env]
 * @returns {boolean}
 */
export function isDistilledOnly(env = process.env) {
  // SD-LEO-INFRA-CORPUS-PROMOTE-ONLY-VIA-DISTILL-001 (chairman-authoritative ROOT-CAUSE fix): raw
  // Todoist/corpus items must NEVER auto-promote to the SD queue — the ONLY corpus->SD path is the
  // deliberate /distill review. So the gate is now FAIL-CLOSED BY DEFAULT: distilled-only is enforced
  // unless an operator sets an EXPLICIT break-glass escape (SOURCING_AUTO_REFILL_DISTILLED_ONLY=off).
  // With /distill not running (no item carries a build disposition), the engine therefore promotes
  // NOTHING. (Was opt-in '=on' for the original safe rollout — the rollout is now complete + mandated.)
  return (env && env.SOURCING_AUTO_REFILL_DISTILLED_ONLY) !== 'off';
}

/** Default per-run promotion cap — a single run never promotes more than this onto the belt. */
export const DEFAULT_REFILL_BATCH_LIMIT = 10;

/**
 * Allowed sd_type values (mirrors the DB sd_type_check constraint). The deriver passes metadata.sd_type
 * straight through, so a staged item carrying an out-of-list value would 23514 on raw insert; clamp to a
 * safe default instead (defense-in-depth — no live staged item currently carries metadata.sd_type).
 */
const ALLOWED_SD_TYPES = new Set([
  'feature', 'bugfix', 'database', 'infrastructure', 'security', 'refactor', 'documentation',
  'orchestrator', 'performance', 'enhancement', 'docs', 'discovery_spike', 'implementation', 'ux_debt', 'uat',
]);

/**
 * Select the staged rows to promote this run: the VALID candidates (per the -A/-B SSOT), capped at limit.
 * Pure + total.
 * @param {Array<Object>} rows  staged roadmap_wave_items rows
 * @param {{limit?:number, shippedTitleSet?:Set<string>}} [opts]  SD-LEO-INFRA-AUTO-REFILL-BELT-001 (FR-4):
 *        shippedTitleSet is the INJECTED normalized already-shipped-title Set; the I/O caller builds it once
 *        per run via a bounded query, keeping this function PURE. Default empty -> lookalike axis no-ops.
 * @returns {{ batch:Array<Object>, validCount:number, total:number, limit:number, byReason:Object }}
 */
export function selectRefillBatch(rows, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_REFILL_BATCH_LIMIT;
  // SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-B: forward the distilled-only flag so the batch
  // selector applies CHECK #11 (default OFF -> unchanged). Caller passes opts.distilledOnly (the cron
  // derives it from isDistilledOnly()); verifyStagedCandidates forwards opts straight to the predicate.
  const report = verifyStagedCandidates(rows, { shippedTitleSet: opts.shippedTitleSet, distilledOnly: opts.distilledOnly === true });
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
  const md = it.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  // Reuse the CANONICAL promotion-field deriver (the same one manual --from-roadmap-item promotion
  // uses) so auto-refill cannot drift from it: it returns sd_type=null when untyped (so createSD's
  // key-prefix default applies instead of a baked 'feature'), DISTINCT description/scope (not title
  // clones -> not a bare-shell), strategic_intent, and a needs_enrichment flag for thin items.
  const f = deriveSdFieldsFromRoadmapItem(it);
  // The raw-insert path bypasses createSD, so EVERY NOT-NULL-without-default column the DB triggers do
  // NOT backfill must be set here or the insert 23502-fails on live-flip. The authoritative set (per the
  // live schema) is: id, sd_key, title, status, category, priority, description, scope, rationale. The
  // remaining NOT-NULL columns (sequence_rank, sd_code_user_facing, uuid_internal_pk) are filled by BEFORE
  // INSERT triggers (auto_assign_sequence_rank / trg_sync_sd_code_user_facing / trg_sync_uuid_internal_pk).
  // sd_type is NOT NULL with a DB default of 'feature'. The raw-insert path does NOT run createSD's
  // key-prefix type resolution, and passing an explicit null OVERRIDES the default -> 23502. Falling
  // through to the 'feature' default would bake the wrong type the deriver's null was meant to avoid AND
  // misalign with the category. So pin a concrete type: the deriver's value when typed, else
  // 'infrastructure' (the engineer roadmap belt). Category mirrors createSD (capitalize(type)) so the two
  // stay aligned in BOTH branches (RCA SD-LEO-ENH-AUTO-PROCEED-001-12). Both pass sd_type_check.
  // Clamp to the sd_type_check list: the deriver passes metadata.sd_type through unverified, so an
  // out-of-list value would 23514 on raw insert. Untyped/invalid -> 'infrastructure' (the engineer belt).
  const type = f.type && ALLOWED_SD_TYPES.has(f.type) ? f.type : 'infrastructure';
  const category = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    // id is NOT NULL with no DB default — omitting it makes every insert fail 23502 (the raw-insert
    // path bypasses createSD which mints it). Mint a uuid here (mirrors leo-create-sd.js).
    id: randomUUID(),
    sd_key: sdKey,
    title: String(f.title || 'Auto-refill candidate').slice(0, 200),
    status: 'draft',
    // QF-20260621-219 (PART 1): mint at the INITIAL phase like every other new draft. The
    // strategic_directives_v2.current_phase column DEFAULT is 'LEAD_APPROVAL', so omitting this
    // landed every auto-refilled draft at LEAD_APPROVAL — which worker-checkin's isSdInFlight()
    // read as "already started past LEAD" and skipped before claim_sd, leaving an eligible belt
    // un-claimable (chairman-escalated claim-stall, manually phase-corrected by the coordinator
    // every run). Set 'LEAD' explicitly so new drafts are self-claimable without a manual fix.
    current_phase: 'LEAD',
    sd_type: type, // concrete (never null): explicit type override 23502s the NOT-NULL default 'feature'
    category, // NOT NULL, no default; aligns with sd_type per createSD convention
    priority: 'medium', // NOT NULL, no default; valid per priority_check (critical|high|medium|low)
    // target_application: honor an explicit item hint; else EHG_Engineer (auto-refill operates on the
    // engineer roadmap belt) rather than the DB's EHG default which would mis-route harness items.
    target_application: md.target_application || 'EHG_Engineer',
    description: f.description,
    scope: f.scope,
    strategic_intent: f.strategic_intent,
    // rationale: NOT NULL, no default; traceable provenance string (mirrors leo-create-sd.js promotion).
    rationale: `Auto-refill promotion from staged roadmap_wave_items ${it.id || '(unknown)'} (${it.source_type || 'unknown-source'}).`,
    metadata: {
      sourced_by: 'auto-refill',
      promoted_from_roadmap_item_id: it.id || null,
      source_type: it.source_type || null,
      source_id: it.source_id || null,
      ...(f.needs_enrichment ? { needs_enrichment: f.needs_enrichment } : {}),
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

  // SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-B (THE churn fix): in distilled-only mode, refuse to
  // mint an SD for an item that is not dispositioned as buildable — a per-mint guard that mirrors CHECK #11
  // so the gate holds even if a caller reaches promote without going through selectRefillBatch. Flag read
  // at call time (injectable via opts.distilledOnly for tests); default OFF -> behavior unchanged.
  const distilledOnly = opts.distilledOnly === undefined ? isDistilledOnly() : opts.distilledOnly === true;
  if (distilledOnly && !hasBuildDisposition(item)) {
    out.reason = REFILL_INVALID_REASONS.UNDISPOSITIONED_OR_NON_BUILD;
    return out;
  }

  const sdKey = buildRefillSdKey(item);
  out.sd_key = sdKey;

  // Idempotency guard: never mint a duplicate SD for the same deterministic key.
  const { data: existing } = await supabase
    .from('strategic_directives_v2').select('sd_key').eq('sd_key', sdKey).limit(1);
  if (existing && existing.length) { out.reason = 'sd_exists'; return out; }

  if (!apply) { out.reason = 'dry_run'; return out; }

  const { error: insErr } = await supabase
    .from('strategic_directives_v2').insert(buildRefillSdPayload(item, sdKey));
  if (insErr) {
    // A concurrent cron/manual promote can win the race between the existence check and the insert;
    // the sd_key unique constraint (23505) makes that a clean idempotent no-op, not a failure.
    if (insErr.code === '23505' || /duplicate key|already exists/i.test(insErr.message || '')) {
      out.reason = 'sd_exists'; return out;
    }
    out.reason = `insert_failed: ${insErr.message}`; return out;
  }

  // Two-way stamp (fail-soft — the SD already exists; a missed stamp is recoverable, not corrupting).
  const stamp = buildTwoWayStamp(item, sdKey);
  const { error: upErr } = await supabase
    .from('roadmap_wave_items').update(stamp.roadmap).eq('id', item.id);
  if (upErr) { out.promoted = true; out.reason = `promoted_stamp_warn: ${upErr.message}`; return out; }

  out.promoted = true;
  out.reason = 'promoted';
  return out;
}
