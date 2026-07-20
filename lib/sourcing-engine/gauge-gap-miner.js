/**
 * lib/sourcing-engine/gauge-gap-miner.js
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-GAUGE-GAP-MINER-001 — sourcing-engine child 10/10.
 *
 * Turns the READ-ONLY VDR vision gauge into a FORWARD ROUTER (closes the gauge dead-end on the
 * proactive axis). It reads computeBuildGauge, enumerates active-rung capabilities scored
 * unbuilt/partial, routes each gap through the SHIPPED router + dedup helper, and registers it as a
 * STAGED roadmap_wave_items candidate so the weakest BUILDABLE caps continuously feed the sourcing
 * belt. This is the systematized, automated version of Adam's manual adam-gauge-weakest read.
 *
 * REUSE, don't reinvent (duplicate-SSOT is the recurring trap — this child was HELD until DEDUP shipped
 * precisely so it can reuse the dedup helper):
 *   - computeBuildGauge / STATUS_SCORE  (lib/vision/vdr-registry.js)        — the live gauge.
 *   - stampCandidate / deriveOutcomeRealizedKeys (lib/sourcing-engine/dedup-autostamp.js)
 *                                                                            — the SHIPPED dedup match +
 *     the infra-shipped!=outcome-realized RE-EMIT rule. We do NOT write a new matcher.
 *   - routeCandidate (lib/sourcing-engine/router.js, via stampCandidate)    — the pure lane decision.
 *   - resolveTargetWaveId / roadmapLaneColumnExists (lib/sourcing-engine/adam-direct-registry.js)
 *                                                                            — the target wave + the
 *     DORMANT roadmap_wave_items.lane probe (mirror of the ledger probe). Reused, not re-derived.
 *   - isValidLane (lib/sourcing-engine/lane.js)                             — the CHECK-constraint mirror.
 *
 * BUILDABLE-FIRST: an operational/income-nature gap is NOT something the fleet can source an SD to
 * complete (only a venture/operation flips it). We route it OFF the belt-lead to the chairman-gated
 * lane (authority:'operational') — never belt-ready. Only buildable gaps lead the belt.
 *
 * STAGED-ONLY (FR-4, the hard safeguard): this module NEVER sets promoted_to_sd_key and NEVER mints an
 * SD. It registers staged candidates (metadata.sourcing_stage='staged'); the chairman baseline gate
 * governs promotion staged->belt.
 *
 * DORMANT-SAFE BY CONSTRUCTION: roadmap_wave_items.lane is a DORMANT column and the 'vdr_gauge'
 * source_type is a DORMANT CHECK extension. When either is absent the runner forces dry-run (computes
 * exactly what it WOULD stage but writes nothing), so it ships INERT and never mutates the
 * chairman-visible roadmap until an operator applies the migrations and passes --apply.
 *
 * The decision helpers are PURE (no I/O) so they unit-test without a DB; mineGaugeGaps is the thin
 * I/O wrapper.
 *
 * @module lib/sourcing-engine/gauge-gap-miner
 */
import { v5 as uuidv5 } from 'uuid';
import { stampCandidate, deriveOutcomeRealizedKeys } from './dedup-autostamp.js';
import { resolveTargetWaveId, roadmapLaneColumnExists } from './adam-direct-registry.js';
import { isValidLane } from './lane.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — mirrors dedup-autostamp.js: the
// dedup-against set must be the FULL existing-SD corpus (strategic_directives_v2 is a growing
// table), or gauge-mined candidates could silently duplicate already-shipped SDs past the cap.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/** The source_type gauge-mined candidates register under (gated by the DORMANT CHECK extension). */
export const VDR_GAUGE_SOURCE_TYPE = 'vdr_gauge';

/** Human-readable trace label for a capability gap (stored in metadata.source_label). */
export function gaugeGapLabel(capability) {
  return `vdr:${String(capability == null ? '' : capability).trim()}`;
}

/**
 * DETERMINISTIC source_id for a capability gap. roadmap_wave_items.source_id is a UUID column — a
 * non-UUID string (the obvious 'vdr:<capability>' key) 22P02-throws on insert (masked today only by the
 * dormant lane/source_type gates, lethal on activation). We derive a STABLE UUIDv5 from the capability
 * (same capability => same id) so the insert is valid AND idempotency still holds; the human-readable
 * 'vdr:<capability>' key lives in metadata.source_label. NOT an sd_key, so the router's source_id dedup
 * path never false-matches it against an SD.
 */
export function gaugeGapSourceId(capability) {
  return uuidv5(gaugeGapLabel(capability), uuidv5.URL);
}

/**
 * SD-LEO-INFRA-TRANSLATEGAPTOBUILDABLE-GAUGE-GAP-001 (FR-1): translate a weak capability gap into a
 * BUILDABLE candidate. PR1 (#5026) blocks raw source_type=vdr_gauge labels from the general funnel
 * (raw_label_source); this turns the bare capability label into a concrete, buildable framing — a
 * real title (not the raw label, not a 120-char truncation shell) plus a scope that states the
 * capability, its `required` acceptance criterion, and the current gauge status. The miner stamps the
 * output (title + metadata.translated=true + metadata.description=scope), which lets the FR-3 gate
 * escape pass it while raw labels stay blocked, and which deriveSdFieldsFromRoadmapItem carries onto
 * the promoted SD as real substance. PURE / TOTAL.
 *
 * @param {{capability:string, required?:string, status?:string, nature?:string, detail?:string}} gap
 * @param {{}} [opts]
 * @returns {{ title:string, scope:string, translated:boolean }}
 */
export function translateGapToBuildable(gap, opts = {}) {
  const g = gap || {};
  const capability = String(g.capability == null ? '' : g.capability).trim() || 'unnamed capability';
  const required = typeof g.required === 'string' && g.required.trim() ? g.required.trim() : '';
  const status = typeof g.status === 'string' && g.status.trim() ? g.status.trim() : 'unknown';
  // Concrete buildable title — an action framing, not the bare capability label. Cap well under the
  // 120-char truncation marker so it is never mistaken for a substance-thin shell.
  const title = `Realize VDR capability: ${capability}`.slice(0, 110);
  const scope = [
    `Build the concrete artifact that makes the VDR capability "${capability}" measurably realized`,
    '(not merely scaffolded in code).',
    required ? `Acceptance (required): ${required}` : 'Acceptance: the capability\'s realization probe reports "built".',
    `Current gauge status: ${status}.`,
    'This is a gauge-gap translation (step-2): the raw capability label is reframed as buildable work',
    'with an explicit acceptance criterion so it can flow onto the belt; the raw label alone is blocked.',
  ].join(' ');
  return { title, scope, translated: true };
}

/**
 * PURE (FR-1): select the minable gaps from a computeBuildGauge result — active-rung capabilities
 * scored unbuilt (0) or partial (0.5). 'unknown' (score null) is EXCLUDED (not measurable — never
 * coerced into a gap, the honest-gauge rule); 'built' (score 1) is excluded (no gap).
 *
 * @param {object} gauge - a computeBuildGauge() result ({ available, components:[{capability, nature, status, score}] })
 * @returns {Array<{capability:string, nature:(string|undefined), status:string, score:number}>}
 */
export function selectGaugeGaps(gauge) {
  if (!gauge || gauge.available !== true || !Array.isArray(gauge.components)) return [];
  return gauge.components.filter((c) => c && c.score != null && c.score < 1 && c.capability);
}

/**
 * PURE (FR-1/FR-2): map a gauge gap component to the router's classifiedItem shape. Operational/income
 * nature -> authority:'operational' so the SHIPPED router lanes it chairman-gated (off the belt-lead);
 * buildable -> no authority so it falls through to the belt-ready residual (subject to dedup).
 *
 * @param {{capability:string, nature?:string, status?:string}} gap
 * @param {{activeRungKey?:string}} [opts]
 * @returns {{source_id:string, title:string, disposition:string, rung:(string|null), authority:(string|null)}}
 */
export function gapToCandidate(gap, opts = {}) {
  const g = gap || {};
  const isOperational = g.nature === 'operational';
  // SD-LEO-INFRA-TRANSLATEGAPTOBUILDABLE-GAUGE-GAP-001: the candidate title MUST stay the RAW capability
  // here — it is the key the SHIPPED dedup matcher (stampCandidate/findDedupMatch, exact-title) compares
  // against already-shipped capability SD titles. The BUILDABLE translation is applied only on the staged
  // row (buildStagedRoadmapItem), so dedup keeps working while the staged/promoted artifact is buildable.
  return {
    source_id: gaugeGapSourceId(g.capability),
    title: g.capability,
    disposition: 'BUILD',
    rung: opts.activeRungKey == null ? null : opts.activeRungKey,
    authority: isOperational ? 'operational' : null,
  };
}

/**
 * PURE (FR-2/FR-4): build the roadmap_wave_items insert payload for ONE staged candidate. STAGED-ONLY —
 * promoted_to_sd_key is INTENTIONALLY absent (null) so no automated promoter mistakes it for a minted
 * SD; metadata.sourcing_stage='staged'. lane is included only when lanePresent && the lane is valid
 * (dormant-safe: a missing column means the insert omits lane, which is nullable).
 *
 * @param {{capability:string, nature?:string, status?:string}} gap
 * @param {{lane:(string|null), dedup_match_sd_key:(string|null), re_emit:boolean}} stamp - stampCandidate output
 * @param {{waveId:string, lanePresent:boolean, activeRungKey?:string}} ctx
 * @returns {object} roadmap_wave_items insert payload
 */
export function buildStagedRoadmapItem(gap, stamp, { waveId, lanePresent, activeRungKey = null }) {
  const g = gap || {};
  const s = stamp || {};
  // SD-LEO-INFRA-TRANSLATEGAPTOBUILDABLE-GAUGE-GAP-001 (FR-2): stage the BUILDABLE translation, not the
  // raw label. title becomes the concrete framing; metadata.translated=true lets the FR-3 funnel-gate
  // escape pass it (raw labels stay blocked); metadata.description carries the buildable scope, which
  // deriveSdFieldsFromRoadmapItem already reads onto the promoted SD as real substance. The raw
  // capability stays recorded in metadata.capability/source_label for traceability.
  const t = translateGapToBuildable(g, { activeRungKey });
  const payload = {
    wave_id: waveId,
    source_type: VDR_GAUGE_SOURCE_TYPE,
    source_id: gaugeGapSourceId(g.capability),
    title: t.title,
    promoted_to_sd_key: null, // STAGED-ONLY safeguard (FR-4): never promoted by the miner.
    metadata: {
      sourcing_stage: 'staged',
      staged_by: 'vdr-gauge-gap-miner',
      capability: g.capability,
      source_label: gaugeGapLabel(g.capability), // human-readable key (source_id is a UUIDv5 of this)
      translated: true, // FR-2/FR-3: buildable translation present -> funnel-gate escape
      description: t.scope, // buildable scope; carried onto the promoted SD by deriveSdFieldsFromRoadmapItem
      nature: g.nature || null,
      gauge_status: g.status || null,
      rung: activeRungKey,
      dedup_match_sd_key: s.dedup_match_sd_key || null,
      re_emit: s.re_emit === true,
    },
  };
  if (lanePresent && isValidLane(s.lane)) payload.lane = s.lane;
  return payload;
}

/**
 * I/O runner (FR-1..FR-5): mine the live gauge, route + dedup each gap via the SHIPPED helpers, and
 * register STAGED roadmap_wave_items candidates. DRY-RUN by default; pass apply:true to write (and even
 * then it stays dry-run until BOTH the lane column + the vdr_gauge source_type CHECK migrations land).
 *
 * Dedup semantics (FR-3, reusing stampCandidate):
 *   - terminal duplicate (covered by a completed SD AND outcome-realized) -> lane 'dedup', re_emit=false
 *     -> SKIPPED (not re-minted).
 *   - covered-but-still-unbuilt (re_emit) -> lane 'outcome-gated' carrying dedup_match_sd_key -> STAGED.
 *   - novel buildable -> belt-ready -> STAGED; novel operational -> chairman-gated -> STAGED.
 * Idempotency: a capability that already has a roadmap_wave_items row (source_type=vdr_gauge,
 * source_id=vdr:<cap>) is skipped, so a cadence re-run never re-mints the same gap.
 *
 * @param {object} opts
 * @param {object} opts.supabase - service-role client
 * @param {object} [opts.io] - { supabase, grep } forwarded to computeBuildGauge (defaults to { supabase })
 * @param {boolean} [opts.apply] - default false (dry-run)
 * @param {string} [opts.activeRungKey] - active rung label stamped on candidates (default 'V1')
 * @param {object} [opts.deps] - { computeBuildGauge } injection seam for hermetic tests
 * @returns {Promise<{available:boolean, gaps:number, staged:number, chairman_routed:number,
 *   deduped:number, re_emit:number, skipped_existing:number, dry_run:boolean,
 *   lane_column_missing:boolean, source_type_unsupported:boolean, wave_id:(string|null), errors:Array}>}
 */
export async function mineGaugeGaps({ supabase, io, apply = false, activeRungKey = 'V1', deps = {} } = {}) {
  const computeBuildGauge =
    deps.computeBuildGauge || (await import('../vision/vdr-registry.js')).computeBuildGauge;
  const result = {
    available: false, gaps: 0, staged: 0, chairman_routed: 0, deduped: 0, re_emit: 0,
    skipped_existing: 0, dry_run: !apply, lane_column_missing: false, source_type_unsupported: false,
    wave_id: null, errors: [],
  };

  // FR-1: read the live gauge. Fail-soft — an unavailable gauge yields no gaps (HONEST: could-not-
  // measure != 0%), never a throw.
  const gauge = await computeBuildGauge({ io: io || { supabase }, visionSource: true });
  const gaps = selectGaugeGaps(gauge);
  result.available = !!(gauge && gauge.available);
  result.gaps = gaps.length;
  if (gaps.length === 0) return result;

  // FR-3 dedup inputs: existing SDs (dedup-against set) + completed (shippedInfraKeys) + the gauge-
  // derived outcome-realized set (reusing the SHIPPED deriveOutcomeRealizedKeys, same gauge).
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2').select('sd_key, title, status, metadata')
      .order('sd_key', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (sdErr) {
    throw new Error(`load SDs failed: ${sdErr.message}`);
  }
  const existing = sds.map((s) => ({ sd_key: s.sd_key, title: s.title }));
  const shippedInfraKeys = new Set(sds.filter((s) => s.status === 'completed').map((s) => s.sd_key));
  const sdCapabilityPairs = [];
  for (const s of sds) {
    const caps = s.metadata && s.metadata.delivers_capabilities;
    for (const cap of Array.isArray(caps) ? caps : []) {
      if (typeof cap === 'string') sdCapabilityPairs.push({ sd_key: s.sd_key, capability: cap });
    }
  }
  const outcomeRealizedKeys = deriveOutcomeRealizedKeys(sdCapabilityPairs, gauge.components);

  // Target wave + DORMANT lane-column probe (both reused from adam-direct-registry).
  const waveId = await resolveTargetWaveId(supabase);
  result.wave_id = waveId;
  if (!waveId) { result.dry_run = true; return result; } // no wave => cannot insert; dry-run only.
  const lanePresent = await roadmapLaneColumnExists(supabase);
  if (!lanePresent) { result.lane_column_missing = true; result.dry_run = true; }

  // Idempotency set: capabilities already staged (source_type=vdr_gauge).
  const { data: existingRows } = await supabase
    .from('roadmap_wave_items').select('source_id').eq('source_type', VDR_GAUGE_SOURCE_TYPE);
  const alreadyStaged = new Set((existingRows || []).map((r) => r.source_id).filter(Boolean));

  let dryRun = result.dry_run;
  for (const gap of gaps) {
    try {
      const srcId = gaugeGapSourceId(gap.capability);
      if (alreadyStaged.has(srcId)) { result.skipped_existing++; continue; }

      const candidate = gapToCandidate(gap, { activeRungKey });
      const stamp = stampCandidate(candidate, { existing, shippedInfraKeys, outcomeRealizedKeys });

      // Terminal duplicate (covered + outcome-realized) -> do NOT re-mint (FR-3).
      if (stamp.lane === 'dedup' && stamp.re_emit !== true) { result.deduped++; continue; }
      if (stamp.re_emit) result.re_emit++;
      if (stamp.lane === 'chairman-gated') result.chairman_routed++;

      const payload = buildStagedRoadmapItem(gap, stamp, { waveId, lanePresent, activeRungKey });
      if (dryRun) { result.staged++; continue; }

      const { error } = await supabase.from('roadmap_wave_items').insert(payload);
      if (error) {
        // source_type CHECK not yet extended (dormant) => 23514: downgrade the WHOLE run to dry-run.
        if (error.code === '23514' || String(error.message || '').toLowerCase().includes('source_type')) {
          result.source_type_unsupported = true; result.dry_run = true; dryRun = true; result.staged++;
          continue;
        }
        result.errors.push({ capability: gap.capability, error: error.message });
        continue;
      }
      result.staged++;
    } catch (err) {
      result.errors.push({ capability: gap && gap.capability, error: err?.message || String(err) });
    }
  }
  return result;
}

/** Feature-flag helper for the miner cron: on|1|true => enabled; everything else (incl. undefined) => OFF. */
export function isGaugeGapMinerFlagEnabled(env = process.env) {
  const v = String((env && env.SOURCING_GAUGE_GAP_MINER_V1) || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}
