/**
 * RESEARCH_INTELLIGENCE_OPERATOR — the 5th EHG-shared operator's behavior module.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A.
 *
 * This is the CONSUMER that turns the youtube reference/insight lane (previously a
 * dead-end excluded from wave clustering, see lib/eva/youtube-backlog-clear.js) into a
 * real triage step, and it owns the standing landscape reference data product
 * (research_intelligence_reference table — see database/migrations/20260718_research_intelligence_reference.sql).
 *
 * The operator ships DEFINED-BUT-UNARMED (rail entry armed:false). Every live-write path
 * here is gated on a chairman ratification stamp: while unarmed the operator honestly
 * no-ops (returns a dry-run preview) and NEVER fabricates a landscape update or a
 * reference row. Downstream children read the reference table:
 *   Child B  → entry_type IN ('tech_landscape','model_landscape')
 *   Child C  → entry_type IN ('market_size','unit_economics','comparables')
 *   Child D  → versioned/superseded rows for forecast-vs-actual calibration
 *
 * @module lib/agents/research-intelligence-operator
 */

/** capture-intents that reach this operator (the reference lane youtube-backlog-clear files). */
export const OPERATOR_INTAKE_INTENTS = new Set(['reference', 'insight']);

/** entry_type values the research_intelligence_reference table accepts (mirrors the migration CHECK). */
export const REFERENCE_ENTRY_TYPES = Object.freeze([
  'tech_landscape', 'model_landscape', 'market_size', 'unit_economics', 'comparables'
]);

/** confidence values the table accepts (mirrors the migration CHECK). */
export const REFERENCE_CONFIDENCE_LEVELS = Object.freeze(['unverified', 'low', 'medium', 'high']);

/**
 * Extract stable provenance for a youtube-intake row (video id / url), never fabricated.
 * @param {object} row
 * @returns {{ intake_id: string|null, youtube_video_id: string|null, url: string|null }}
 */
function provenanceOf(row) {
  return {
    intake_id: row?.id ?? null,
    youtube_video_id: row?.youtube_video_id ?? row?.video_id ?? null,
    url: row?.url ?? row?.video_url ?? null
  };
}

/**
 * Decide whether a reference-lane row merits deeper (e.g. Gemini) analysis. PURE, deterministic.
 * A row is accepted when it carries a landscape-relevant intent AND has a locatable source
 * (a video id or url). Rows with an intent but no locatable source are DEFERRED (we never
 * invent a source to analyze). This is intentionally conservative — the operator curates,
 * it does not manufacture signal.
 * @param {object} row
 * @returns {boolean}
 */
function meritsDeeperAnalysis(row) {
  const intent = (row?.chairman_intent || '').toLowerCase();
  if (!OPERATOR_INTAKE_INTENTS.has(intent)) return false;
  const p = provenanceOf(row);
  return Boolean(p.youtube_video_id || p.url);
}

/**
 * Triage the reference/insight youtube lane into accepted-vs-deferred. PURE.
 * Honest-idle: an empty or non-array input yields an empty split and never fabricates rows.
 *
 * @param {Array<object>} rows reference-lane rows (chairman_intent in {reference,insight})
 * @returns {{ accepted: Array<object>, deferred: Array<object>, counts: {accepted:number, deferred:number, total:number} }}
 */
export function triageReferenceLane(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const accepted = [];
  const deferred = [];
  for (const row of list) {
    const intent = (row?.chairman_intent || '').toLowerCase();
    // Only reference/insight rows belong to this operator; anything else is ignored (not deferred).
    if (!OPERATOR_INTAKE_INTENTS.has(intent)) continue;
    const entry = { id: row?.id ?? null, chairman_intent: intent, provenance: provenanceOf(row) };
    if (meritsDeeperAnalysis(row)) {
      accepted.push({ ...entry, disposition: 'analyze' });
    } else {
      deferred.push({ ...entry, disposition: 'defer', reason: 'no_locatable_source' });
    }
  }
  return {
    accepted,
    deferred,
    counts: { accepted: accepted.length, deferred: deferred.length, total: accepted.length + deferred.length }
  };
}

/**
 * Select the reference-lane subset out of a planBacklogClear() result and triage it. PURE.
 * The planBacklogClear output's toRoute entries carry a `lane` field; we take lane==='reference'.
 * Additive: does not mutate or depend on the rest of the plan shape.
 *
 * @param {{ toRoute?: Array<object> }} plan the object returned by planBacklogClear
 * @returns {ReturnType<typeof triageReferenceLane>}
 */
export function triageBacklogReferenceLane(plan) {
  const toRoute = Array.isArray(plan?.toRoute) ? plan.toRoute : [];
  const referenceRows = toRoute.filter((r) => r?.lane === 'reference');
  return triageReferenceLane(referenceRows);
}

/**
 * Shape a research_intelligence_reference row for insert. PURE. Validates the discriminators
 * against the table's CHECK constraints so a bad entry fails here, not at the DB.
 *
 * @param {object} spec
 * @param {string} spec.entry_type one of REFERENCE_ENTRY_TYPES
 * @param {string} spec.subject canonical topic key
 * @param {object} [spec.payload] the reference data
 * @param {Array} [spec.source_refs] provenance list
 * @param {string} [spec.confidence] one of REFERENCE_CONFIDENCE_LEVELS
 * @returns {object} a row ready for supabase.from('research_intelligence_reference').insert()
 */
export function buildReferenceEntry(spec = {}) {
  const { entry_type, subject, payload = {}, source_refs = [], confidence = 'unverified' } = spec;
  if (!REFERENCE_ENTRY_TYPES.includes(entry_type)) {
    throw new Error(`buildReferenceEntry: invalid entry_type "${entry_type}" (expected one of ${REFERENCE_ENTRY_TYPES.join(', ')})`);
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    throw new Error('buildReferenceEntry: subject is required (non-empty string)');
  }
  if (!REFERENCE_CONFIDENCE_LEVELS.includes(confidence)) {
    throw new Error(`buildReferenceEntry: invalid confidence "${confidence}" (expected one of ${REFERENCE_CONFIDENCE_LEVELS.join(', ')})`);
  }
  return {
    entry_type,
    subject: subject.trim(),
    payload,
    source_refs: Array.isArray(source_refs) ? source_refs : [],
    confidence,
    version: 1,
    is_current: true,
    created_by: 'RESEARCH_INTELLIGENCE_OPERATOR'
  };
}

/**
 * Validate a chairman ratification stamp. A stamp arms the operator's live duty cycle.
 * A valid stamp is exactly {ratified_by:'chairman', ratified_at:<ISO string>, sd_key:<non-empty string>}.
 * Anything else leaves the operator unarmed. PURE.
 *
 * @param {object|null|undefined} stamp
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function assertArmRatificationStamp(stamp) {
  if (!stamp || typeof stamp !== 'object') return { valid: false, reason: 'no_stamp' };
  if (stamp.ratified_by !== 'chairman') return { valid: false, reason: 'not_chairman_ratified' };
  if (typeof stamp.sd_key !== 'string' || !stamp.sd_key.trim()) return { valid: false, reason: 'missing_sd_key' };
  const ts = stamp.ratified_at;
  if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts))) return { valid: false, reason: 'invalid_ratified_at' };
  return { valid: true, reason: null };
}

/**
 * Is the operator armed for live writes? True only with a well-formed chairman stamp. PURE.
 * @param {object|null|undefined} stamp
 * @returns {boolean}
 */
export function isOperatorArmed(stamp) {
  return assertArmRatificationStamp(stamp).valid;
}

/**
 * Ingest accepted triage signals into the standing reference table — but ONLY when armed.
 * While unarmed (no valid chairman stamp) this performs NO write and returns a dry-run preview
 * (defined-but-unarmed honest-idle). This mirrors the 4 existing shared operators, which are
 * defined but not wired to a live scheduler.
 *
 * @param {object} supabase a supabase client (or mock exposing .from().insert())
 * @param {Array<object>} entries rows produced by buildReferenceEntry
 * @param {{ stamp?: object }} [options] chairman ratification stamp
 * @returns {Promise<{ armed: boolean, written: number, dry_run: boolean, preview: Array<object>, error: string|null }>}
 */
export async function ingestAcceptedSignals(supabase, entries, options = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const armed = isOperatorArmed(options.stamp);

  // Honest-idle: nothing to write, regardless of armed state.
  if (rows.length === 0) {
    return { armed, written: 0, dry_run: !armed, preview: [], error: null };
  }

  // Defined-but-unarmed: no live write; return a preview of exactly what WOULD be written.
  if (!armed) {
    return { armed: false, written: 0, dry_run: true, preview: rows, error: null };
  }

  const { error } = await supabase.from('research_intelligence_reference').insert(rows);
  if (error) {
    return { armed: true, written: 0, dry_run: false, preview: rows, error: error.message || String(error) };
  }
  return { armed: true, written: rows.length, dry_run: false, preview: [], error: null };
}
