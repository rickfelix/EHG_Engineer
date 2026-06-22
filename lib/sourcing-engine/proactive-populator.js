/**
 * Proactive corpus populator — SD-LEO-INFRA-SOURCING-ENGINE-PROACTIVE-POPULATOR-001 (child 9/10).
 *
 * Enumerates the full sourcing corpus from its 4 canonical sources, classifies+routes each item via
 * the SHIPPED routeCandidate/stampCandidate, and (only when chairman-approved) STAGES register-first
 * roadmap_wave_items rows. DRY-RUN BY DEFAULT — the bare path stages NOTHING and emits a per-lane /
 * per-rung baseline REPORT (the chairman's review artifact, FR-5).
 *
 * REUSE, do not re-derive (the duplicate-SSOT trap):
 *   - stampCandidate / routeCandidate / ledgerLaneColumnExists (lib/sourcing-engine/dedup-autostamp.js + router.js)
 *   - roadmapLaneColumnExists / resolveTargetWaveId (lib/sourcing-engine/adam-direct-registry.js)
 *   - shouldWarnRegisterFirst (lib/sourcing-engine/register-first.js)
 *
 * HARD SAFEGUARDS (FR-3): writes require apply=true AND chairmanApproved=true; staging only ever
 * INSERTs roadmap_wave_items at item_disposition='pending' (the STAGED state) — it NEVER sets
 * promoted_to_sd_key (never promotes staged->belt) and NEVER creates an SD. Idempotent on the
 * UNIQUE(wave_id, source_type, source_id) key. Dormant-safe: the lane column is omitted when absent.
 *
 * @module lib/sourcing-engine/proactive-populator
 */

import { v5 as uuidv5, validate as isUuid } from 'uuid';
import { stampCandidate } from './dedup-autostamp.js';
import { roadmapLaneColumnExists, resolveTargetWaveId } from './adam-direct-registry.js';
import { shouldWarnRegisterFirst } from './register-first.js';

// Fixed namespace for deriving a STABLE, valid UUID source_id from a non-UUID corpus key.
// roadmap_wave_items.source_id is a UUID-typed column; some sources (notably the deferred
// strategic_directives_v2 cluster, whose .id is varchar and frequently the sd_key STRING)
// would otherwise throw 22P02 on the staged INSERT and silently drop the candidate. UUIDv5 is
// deterministic, so the same key always maps to the same source_id — idempotency is preserved.
const SOURCE_ID_NAMESPACE = uuidv5.URL;

/** Return a valid UUID for use as roadmap_wave_items.source_id: pass UUIDs through, derive UUIDv5 from any other key. */
export function toUuidSourceId(value) {
  if (value == null) return value;
  const s = String(value);
  return isUuid(s) ? s : uuidv5(s, SOURCE_ID_NAMESPACE);
}

/** Map a corpus item to a LIVE-allowed roadmap_wave_items.source_type (CHECK: todoist|youtube|brainstorm). */
export function corpusSourceType(item) {
  const pool = item && item.source_pool;
  if (pool === 'todoist_todo') return 'todoist';
  if (pool === 'youtube_playlist') return 'youtube';
  // estate / sd_proposal / deferred-V2 / harness-backlog / Wave-6 -> the live 'brainstorm' staging vehicle
  // (will migrate to 'adam_direct' once the dormant source_type CHECK extension lands).
  return 'brainstorm';
}

/**
 * Load + normalize the 4 corpus sources into a single de-duplicated candidate list (FR-1).
 * Each candidate carries { corpus, source_type, source_id (stable, for the UNIQUE key), title,
 * disposition, rung, sdKeyHint } — the shape routeCandidate/stampCandidate consume. Dedup is by the
 * (source_type, source_id) pair (the same key the staged-write idempotency uses), so the same intake
 * item enumerated from two sources collapses to one candidate. PURE over the injected loaders.
 *
 * @param {object} sources - { ledger:[], wave6:[], deferred:[], backlog:[] } pre-loaded rows
 * @returns {Array<{corpus,source_type,source_id,title,disposition,rung,sdKeyHint}>}
 */
export function buildCorpus({ ledger = [], wave6 = [], deferred = [], backlog = [] } = {}) {
  const out = [];
  const seen = new Set();
  const push = (c) => {
    if (!c.source_id) return;
    // Normalize source_id to a valid UUID (the staged column is UUID-typed). Preserve the original
    // key in source_key when it changed, so the staged row stays traceable to its origin id/sd_key.
    const uuid = toUuidSourceId(c.source_id);
    if (uuid !== c.source_id) c.source_key = c.source_id;
    c.source_id = uuid;
    const key = `${c.source_type}::${c.source_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const r of ledger) {
    push({ corpus: 'conversion_ledger', source_type: corpusSourceType(r), source_id: r.id,
      title: r.title || r.source_external_id || r.source_id, disposition: null,
      description: r.description || null, // SD-LEO-INFRA-SOURCING-DEDUP-SEMANTIC-001: carry problem text for semantic dedup
      rung: r.target_rung || null, sdKeyHint: r.dedup_match_sd_key || null });
  }
  for (const r of wave6) {
    // Already a roadmap_wave_items row: enumerated for the report, but it is ALREADY staged (skip-staging).
    push({ corpus: 'wave6', source_type: r.source_type, source_id: r.source_id,
      title: r.title, disposition: r.item_disposition || null, rung: (r.metadata && r.metadata.rung) || null,
      sdKeyHint: r.promoted_to_sd_key || null, alreadyStaged: true });
  }
  for (const r of deferred) {
    push({ corpus: 'deferred_v2', source_type: 'brainstorm', source_id: r.id,
      title: r.title || r.sd_key, disposition: null, description: r.description || null,
      rung: (r.metadata && r.metadata.rung) || null, sdKeyHint: r.sd_key });
  }
  for (const r of backlog) {
    push({ corpus: 'harness_backlog', source_type: 'brainstorm', source_id: r.id,
      title: r.title || (r.description || '').slice(0, 80), disposition: null,
      description: r.description || null, // carry full problem text for semantic dedup
      rung: null, sdKeyHint: r.sd_id || null });
  }
  return out;
}

// Lightweight, deterministic classification keywords (mirror the LEO triage risk taxonomy) so the
// router sees the authority/outcome signals that drive the non-belt lanes. PURE — keyword match only.
const CHAIRMAN_AUTHORITY_KEYWORDS = /\b(auth|authentication|authorization|rls|row[-\s]?level|credential|secret|api[-\s]?key|payment|stripe|billing|oauth|token|grant)\b/i;
const OUTCOME_KEYWORDS = /\b(revenue|venture|customer|operational|go[-\s]?live|deploy to prod|live (venture|customer|payment)|first dollar|distance[-\s]?to[-\s]?(broke|quit)|kr-)\b/i;

/**
 * Classify a corpus candidate into the routeCandidate input shape (FR-2). Deterministic keyword scan
 * over title (+ optional description): security/credential/payment text => authority (chairman-gated);
 * revenue/venture/operational text => needsOutcome (outcome-gated). No keyword => residual belt-ready.
 * @returns {{ source_id, title, disposition, rung, authority, needsOutcome }}
 */
export function classifyCandidate(c) {
  const text = `${c.title || ''} ${c.description || ''}`;
  const authority = CHAIRMAN_AUTHORITY_KEYWORDS.test(text) ? 'credential' : null;
  const needsOutcome = !authority && OUTCOME_KEYWORDS.test(text);
  return {
    source_id: c.sdKeyHint || c.source_id,
    title: c.title,
    // SD-LEO-INFRA-SOURCING-DEDUP-SEMANTIC-001: pass the problem text through so findDedupMatch's
    // semantic problem-key path can catch problem-phrased restatements (not just title matches).
    description: c.description == null ? null : c.description,
    disposition: c.disposition,
    rung: c.rung,
    ...(authority ? { authority } : {}),
    ...(needsOutcome ? { needsOutcome: true } : {}),
  };
}

/**
 * Classify + route every corpus candidate via classifyCandidate -> the SHIPPED stampCandidate (FR-2).
 * Returns each candidate enriched with { lane, dedup_match_sd_key, re_emit }. PURE over the context.
 * @param {Array} corpus - from buildCorpus
 * @param {object} ctx - { existing, inFlight, shippedInfraKeys, outcomeRealizedKeys } for routeCandidate
 */
export function routeCorpus(corpus, ctx = {}) {
  return (corpus || []).map((c) => {
    const stamp = stampCandidate(classifyCandidate(c), ctx);
    return { ...c, lane: stamp.lane, dedup_match_sd_key: stamp.dedup_match_sd_key, re_emit: stamp.re_emit };
  });
}

/**
 * Build the per-lane / per-rung baseline REPORT (FR-5) — the chairman's review artifact. PURE.
 * @param {Array} routed - from routeCorpus
 * @returns {{ total, by_lane, by_rung, by_corpus, dedup_matches, decline, re_emit, samples }}
 */
export function buildReport(routed) {
  const rows = routed || [];
  const tally = (keyFn) => rows.reduce((m, r) => { const k = keyFn(r) || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    total: rows.length,
    by_lane: tally((r) => r.lane),
    by_rung: tally((r) => r.rung),
    by_corpus: tally((r) => r.corpus),
    dedup_matches: rows.filter((r) => r.dedup_match_sd_key).length,
    decline: rows.filter((r) => r.lane === 'decline').length,
    re_emit: rows.filter((r) => r.re_emit).length,
    samples: rows.slice(0, 8).map((r) => ({ corpus: r.corpus, lane: r.lane, title: (r.title || '').slice(0, 60) })),
  };
}

/**
 * DISPOSITION / QUALITY GATE — SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (FR-2).
 *
 * Runs AFTER routeCorpus and BEFORE stageCorpus to curate the routed corpus down to a KEEPER
 * set, so only quality work reaches the belt (the raw ~768-of-811 belt-ready intake is noise/
 * dup/already-done heavy). Drops, with a per-reason tally:
 *   - already_staged : wave6 rows that are already roadmap_wave_items (never re-stage)
 *   - noise          : empty / too-short / untitled raw intake (title missing or == its own id/key)
 *   - decline        : router lane 'decline'
 *   - terminal_dup   : router lane 'dedup' (source is itself an existing SD key — terminal duplicate)
 *   - already_covered: dedup_match_sd_key set AND NOT re_emit (an existing SHIPPED+realized SD already covers it)
 * KEEPS everything else — novel belt-ready, chairman-gated, outcome-gated, blocked-on, and crucially
 * re_emit candidates (matched an infra SD whose OUTCOME is not yet realized => still open work).
 *
 * PURE. Conservative by design: it only drops terminal-dup / declined / already-realized / noise, so
 * a genuine candidate is never silently dropped (the false-negative risk called out in the PRD).
 *
 * RAW-INTAKE policy (opts.dropRawIntake, chairman-set 2026-06-20): the SD's necessity is explicit
 * that the raw todoist/youtube corpus is personal-productivity intake that "must be DISPOSITIONED
 * before reaching the belt" — it is not curated engineering work. When dropRawIntake is true, any
 * candidate whose source_type is 'todoist' or 'youtube' is dropped (reason 'raw_intake'); the items
 * stay UNTOUCHED in conversion_ledger, so a later policy can re-include them. Default false keeps the
 * pure function source-agnostic (the CLI runner opts in).
 *
 * @param {Array} routed - from routeCorpus (each { lane, dedup_match_sd_key, re_emit, title, source_id, source_type, ... })
 * @param {{ minTitleLen?:number, dropRawIntake?:boolean, rawIntakeSourceTypes?:string[] }} [opts]
 * @returns {{ keepers:Array, dropped:Array, drop_by_reason:Object }}
 */
export function dispositionGate(routed, opts = {}) {
  const minTitleLen = Number.isInteger(opts.minTitleLen) && opts.minTitleLen > 0 ? opts.minTitleLen : 6;
  const rawTypes = new Set(opts.rawIntakeSourceTypes || ['todoist', 'youtube']);
  const keepers = [];
  const dropped = [];
  const drop_by_reason = {};
  const drop = (c, reason) => {
    dropped.push({ ...c, drop_reason: reason });
    drop_by_reason[reason] = (drop_by_reason[reason] || 0) + 1;
  };
  for (const c of (routed || [])) {
    if (c.alreadyStaged) { drop(c, 'already_staged'); continue; }
    const title = (c.title || '').trim();
    const isUntitled = !title
      || title.length < minTitleLen
      || title === String(c.source_id)
      || (c.source_key != null && title === String(c.source_key));
    if (isUntitled) { drop(c, 'noise'); continue; }
    if (opts.dropRawIntake && rawTypes.has(c.source_type)) { drop(c, 'raw_intake'); continue; }
    if (c.lane === 'decline') { drop(c, 'decline'); continue; }
    if (c.lane === 'dedup') { drop(c, 'terminal_dup'); continue; }
    if (c.dedup_match_sd_key && !c.re_emit) { drop(c, 'already_covered'); continue; }
    keepers.push(c);
  }
  return { keepers, dropped, drop_by_reason };
}

/**
 * Stage routed candidates as roadmap_wave_items rows (FR-2/FR-3/FR-4). HARD-SAFEGUARDED:
 *   - writes ONLY when apply===true AND chairmanApproved===true (else dry-run: counts, no writes).
 *   - INSERTs at item_disposition='pending' (the STAGED state); NEVER sets promoted_to_sd_key
 *     (never promotes) and NEVER creates an SD.
 *   - idempotent: skips a candidate already present (UNIQUE wave_id/source_type/source_id); skips
 *     items already staged (corpus='wave6'); a 23505 unique-violation is treated as already-staged.
 *   - dormant-safe: omits the lane column when absent.
 *
 * @param {object} supabase
 * @param {Array} routed - from routeCorpus
 * @param {{ apply?:boolean, chairmanApproved?:boolean, waveId:string, lanePresent:boolean, cap?:number }} opts
 * @returns {Promise<{staged:number, skipped:number, dry_run:boolean, chairman_approved:boolean, errors:Array}>}
 */
export async function stageCorpus(supabase, routed, opts = {}) {
  const cap = Number.isInteger(opts.cap) && opts.cap > 0 ? opts.cap : 1000;
  const dryRun = !(opts.apply && opts.chairmanApproved);
  const res = { staged: 0, skipped: 0, dry_run: dryRun, chairman_approved: !!opts.chairmanApproved, errors: [] };
  if (!opts.waveId) { res.dry_run = true; return res; }

  for (const c of (routed || []).slice(0, cap)) {
    if (c.alreadyStaged) { res.skipped++; continue; } // wave6 items are already roadmap rows
    if (dryRun) { res.staged++; continue; }            // count what WOULD stage; write nothing

    const payload = {
      wave_id: opts.waveId,
      source_type: c.source_type,
      source_id: c.source_id,
      title: c.title || c.source_id,
      item_disposition: 'pending', // STAGED — never 'promoted'; promoted_to_sd_key intentionally unset
      metadata: { sourced_by: 'proactive-populator', corpus: c.corpus, intended_lane: c.lane,
        // SD-LEO-INFRA-BELT-001-PART-001 (FR-3 recovery): carry the candidate's full source substance
        // (feedback.description etc.) onto the staged row so the title's 120-char truncation is no
        // longer a deceptive shell. roadmap_wave_items has no description column, so it rides in
        // metadata.description — read by deriveSdFieldsFromRoadmapItem (onto the promoted SD, shrinking
        // needs_enrichment) and by evaluateRefillCandidate's recovery-aware substance check.
        ...(typeof c.description === 'string' && c.description.trim() ? { description: c.description } : {}),
        ...(c.source_key ? { source_key: c.source_key } : {}),
        ...(c.dedup_match_sd_key ? { dedup_match_sd_key: c.dedup_match_sd_key } : {}),
        ...(c.re_emit ? { re_emit: true } : {}) },
    };
    if (opts.lanePresent && c.lane) payload.lane = c.lane;

    const { error } = await supabase.from('roadmap_wave_items').insert(payload);
    if (error) {
      if (error.code === '23505') { res.skipped++; continue; } // already staged (idempotent)
      if (error.code === '23514') { res.errors.push({ source_id: c.source_id, error: 'source_type/lane CHECK (dormant)' }); res.dry_run = true; continue; }
      res.errors.push({ source_id: c.source_id, error: error.message });
      continue;
    }
    res.staged++;
  }
  return res;
}

/**
 * End-to-end populate (loaders injected so the lib stays testable). Loads the 4 sources, builds the
 * corpus, routes it, builds the report, and (chairman-gated) stages. Returns { report, staging }.
 * @param {object} supabase
 * @param {object} deps - { loadSources: async(supabase)=>({ledger,wave6,deferred,backlog}), loadContext: async(supabase)=>ctx }
 * @param {{ apply?:boolean, chairmanApproved?:boolean, cap?:number }} [opts]
 */
export async function populate(supabase, deps, opts = {}) {
  const sources = await deps.loadSources(supabase);
  const ctx = deps.loadContext ? await deps.loadContext(supabase) : {};
  const corpus = buildCorpus(sources);
  const routed = routeCorpus(corpus, ctx);
  const report = buildReport(routed);

  // FR-2: disposition / quality gate — curate the routed corpus to KEEPERS before staging, so the
  // belt only ever fills with quality work (raw belt-ready intake is noise/dup/already-done heavy).
  const disposition = dispositionGate(routed, { minTitleLen: opts.minTitleLen, dropRawIntake: opts.dropRawIntake, rawIntakeSourceTypes: opts.rawIntakeSourceTypes });
  report.disposition_kept = disposition.keepers.length;
  report.disposition_dropped = disposition.dropped.length;
  report.drop_by_reason = disposition.drop_by_reason;

  const waveId = await resolveTargetWaveId(supabase);
  const lanePresent = await roadmapLaneColumnExists(supabase);
  // Stage ONLY the curated keepers (never the raw routed corpus).
  const staging = await stageCorpus(supabase, disposition.keepers, {
    apply: opts.apply, chairmanApproved: opts.chairmanApproved, waveId, lanePresent, cap: opts.cap,
  });
  // FR: surface a register-first warn count (advisory, never blocks).
  report.register_first_warn = routed.filter((r) => r.sdKeyHint && shouldWarnRegisterFirst({ sd_key: r.sdKeyHint, metadata: {} }, !!r.alreadyStaged)).length;
  return { report, staging, wave_id: waveId, lane_column_present: lanePresent };
}
