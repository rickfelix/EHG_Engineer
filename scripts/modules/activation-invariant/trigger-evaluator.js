/**
 * Activation Invariant — Trigger Evaluator
 *
 * SD-LEO-INFRA-REQUIRE-END-END-001 / FR-1
 *
 * Decides whether a given SD ships a "schema + UI + worker" chain that
 * requires an end-to-end activation-invariant test. Heterogeneous-shape
 * key_changes are handled via a DUAL-SCAN:
 *   1. STRUCTURED: scan key_changes[*].type for schema/database/feature/ui
 *      tokens.
 *   2. FREE-TEXT: regex over the union of change|detail|title|impact|description
 *      fields for the same conceptual signals.
 *
 * Both lanes are required because motivating SDs (SD-GVOS-S17-* in the
 * 26th-witness incident) use {title, detail} shape with NO type field.
 * Naive structured-only scan would miss them.
 */

// Lane 1: structured-type tokens. Lowercase. Match exact equality.
const SCHEMA_TYPES = new Set(['schema', 'database', 'migration']);
const SURFACE_TYPES = new Set(['feature', 'ui', 'component', 'route']);
const WORKER_TYPES = new Set(['worker', 'consumer', 'api', 'service', 'job']);

// Lane 2: free-text anchors. Carefully tuned (QF-20260513-725) — wide single
// words (column/table alone, view/panel/admin/render, pipeline/trigger/hook/
// orchestrator) are dropped because LEO-infra SDs casually mention them
// without shipping a real chain (58% FP rate on May-2026 cohort before tuning).
// Replaced with stronger phrase anchors: action-bound schema terms, paired UI
// patterns, role-bound worker/consumer mentions.
//
// Tuning regression check: GVOS-S17-PROMPT-QUALITY, GVOS-S17-E2E-PLAYWRIGHT,
// and the synthetic motivating fixture must still trigger this lane. See
// trigger-evaluator.test.js for the production-SD coverage tests.
const SCHEMA_TEXT_REGEX = /\b(schema (migration|change|update|adds)|migration (adds|creates|introduces)|new[ -]table|side[- ]table|seed migration|catalog table|registry table|new (catalog|registry)|gvos_[a-z_]+|adds [a-z_]+_(table|rubric))\b/i;
const SURFACE_TEXT_REGEX = /\b(ui[ -]?component|react[- ]component|new[- ]component|chairman[^.]*view|dashboard|user[- ]facing|panel[^.]*renders|page[^.]*renders|component[^.]*renders)\b/i;
const WORKER_TEXT_REGEX = /\b(s\d+ worker|stage[ -]\d+ worker|worker[^.]*(populates|writes|consumes|reads|hook)|consumer[^.]*(reads|consumes|populates)|new[- ](consumer|worker|api))\b/i;

// Negation-awareness (backlog 50a9da45): the Lane-2 regexes above are pure
// keyword matchers, so "no schema migration" / "without a new worker" match the
// same as the affirmative form — a UI-only SD that disclaims data-layer work
// then false-triggers (witnessed on SD-LEO-INFRA-STAGE-BUILD-MODEL-001).
// hasAffirmativeMatch() skips any occurrence negated within its own clause.
// HARD negations only (no/not/never/without/none/neither/nor + n't): soft
// "existing/current" qualifiers are deliberately NOT suppressed, because an
// existing consumer reading newly-written data is exactly the writer-consumer
// asymmetry this gate must catch — a false-negative (real chain ships untested)
// is worse than a false-positive (cleared via the ACTIV-CHAIN-DEFERRED bypass).
const NEGATION_CUE_REGEX = /\b(?:no|not|never|without|none|neither|nor|rather than|instead of)\b|n['’]t\b/i;

// Look back at most this many chars before a match for a negation cue, and never
// across a hard clause boundary ([.;:,] or newline) so a negation in a prior
// clause ("No data layer. The worker writes X.") does not leak forward.
const NEGATION_LOOKBACK_CHARS = 40;

/**
 * True iff `regex` has at least one occurrence in `text` that is NOT negated —
 * i.e. not immediately preceded, within the same clause and within
 * NEGATION_LOOKBACK_CHARS, by a hard negation cue. Drop-in replacement for a
 * bare `regex.test(text)` that no longer counts negated phrasing as a positive
 * signal (backlog 50a9da45).
 *
 * @param {RegExp} regex  case-insensitive, non-global signal regex
 * @param {string} text   aggregated free text
 * @returns {boolean}
 */
function hasAffirmativeMatch(regex, text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  // Clone with the global flag so exec() can iterate every occurrence.
  const scanner = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = scanner.exec(text)) !== null) {
    if (m[0].length === 0) { scanner.lastIndex++; continue; } // defensive; signal regexes never match empty
    let preceding = text.slice(Math.max(0, m.index - NEGATION_LOOKBACK_CHARS), m.index);
    // Trim to the current clause: drop up to & including the last hard boundary
    // so only a SAME-clause negation counts.
    const boundary = Math.max(
      preceding.lastIndexOf('.'), preceding.lastIndexOf(';'),
      preceding.lastIndexOf(':'), preceding.lastIndexOf(','),
      preceding.lastIndexOf('\n'),
    );
    if (boundary !== -1) preceding = preceding.slice(boundary + 1);
    if (!NEGATION_CUE_REGEX.test(preceding)) return true; // an affirmative occurrence
    // else this occurrence is negated — keep scanning for a non-negated one.
  }
  return false;
}

/**
 * Pull all free-text fields from a single key_changes entry. Tolerant of
 * heterogeneous shapes; coerces non-string values to empty string.
 *
 * @param {Object} entry key_changes[i]
 * @returns {string} concatenated free-text content
 */
function entryFreeText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const parts = [];
  for (const key of ['change', 'detail', 'title', 'impact', 'description', 'note']) {
    const value = entry[key];
    if (typeof value === 'string' && value.length > 0) parts.push(value);
  }
  return parts.join(' ');
}

/**
 * Extract structured types from a key_changes array. Returns lowercased
 * set of all type tokens seen.
 *
 * @param {Array} keyChanges
 * @returns {Set<string>}
 */
function collectStructuredTypes(keyChanges) {
  const types = new Set();
  if (!Array.isArray(keyChanges)) return types;
  for (const entry of keyChanges) {
    if (entry && typeof entry === 'object' && typeof entry.type === 'string') {
      types.add(entry.type.toLowerCase().trim());
    }
  }
  return types;
}

/**
 * Aggregate all free-text content from key_changes + sd.description + sd.scope.
 *
 * @param {Object} sd Strategic directive row
 * @returns {string}
 */
function collectFreeText(sd) {
  const parts = [];
  if (Array.isArray(sd?.key_changes)) {
    for (const entry of sd.key_changes) parts.push(entryFreeText(entry));
  }
  if (typeof sd?.description === 'string') parts.push(sd.description);
  if (typeof sd?.scope === 'string') parts.push(sd.scope);
  if (typeof sd?.title === 'string') parts.push(sd.title);
  return parts.join(' ');
}

/**
 * Decide whether an SD triggers the activation-invariant requirement.
 *
 * Trigger rule: EITHER lane is sufficient (disjunction).
 *   Lane 1 (structured) PASSES when key_changes contains at least one
 *   SCHEMA_TYPE AND at least one of (SURFACE_TYPE OR WORKER_TYPE).
 *   Lane 2 (free-text) PASSES when the aggregated text matches
 *   SCHEMA_TEXT_REGEX AND (SURFACE_TEXT_REGEX OR WORKER_TEXT_REGEX).
 *
 * Both lanes must REQUIRE-WITHIN-LANE the schema+consumer pair (so a pure
 * UI-tweak SD or a pure migration SD does not match either lane), but
 * EITHER lane alone is sufficient to trigger.
 *
 * Why disjunction not conjunction: motivating GVOS S17 SDs use {title,
 * detail} shape with NO type field. Lane 1 alone would miss them. AND-
 * ing would defeat the whole purpose of Lane 2. The OR is conservative
 * enough because each lane independently requires the schema+consumer
 * pair within that lane.
 *
 * False-positive tuning: PRD risk R1 anticipates ~10%. FR-4 audit utility
 * runs this on 50+ recent completed SDs to surface miscalibrations.
 * Adjust constants at top of file as needed.
 *
 * @param {Object} sd Strategic directive row (must have key_changes, may have description/scope/title)
 * @returns {{triggered: boolean, reason: string, lane1: object, lane2: object}}
 */
export function evaluateTrigger(sd) {
  if (!sd || typeof sd !== 'object') {
    return {
      triggered: false,
      reason: 'no_sd_provided',
      lane1: { passed: false, schemaMatch: false, consumerMatch: false, types: [] },
      lane2: { passed: false, schemaMatch: false, consumerMatch: false, text_length: 0 },
    };
  }

  const types = collectStructuredTypes(sd.key_changes);
  const lane1SchemaMatch = [...SCHEMA_TYPES].some(t => types.has(t));
  const lane1ConsumerMatch = [...SURFACE_TYPES, ...WORKER_TYPES].some(t => types.has(t));
  const lane1Passed = lane1SchemaMatch && lane1ConsumerMatch;

  const text = collectFreeText(sd);
  // Negation-aware (backlog 50a9da45): a negated phrase ("no schema migration")
  // does NOT count as a positive signal. See hasAffirmativeMatch above.
  const lane2SchemaMatch = hasAffirmativeMatch(SCHEMA_TEXT_REGEX, text);
  const lane2SurfaceMatch = hasAffirmativeMatch(SURFACE_TEXT_REGEX, text);
  const lane2WorkerMatch = hasAffirmativeMatch(WORKER_TEXT_REGEX, text);
  const lane2ConsumerMatch = lane2SurfaceMatch || lane2WorkerMatch;
  const lane2Passed = lane2SchemaMatch && lane2ConsumerMatch;

  // Trigger when EITHER lane independently sees the schema+consumer pair.
  // Each lane internally requires both halves, so neither lane fires on
  // pure migrations or pure UI tweaks.
  const triggered = lane1Passed || lane2Passed;

  let reason;
  if (triggered) {
    if (lane1Passed && lane2Passed) reason = 'both_lanes_match';
    else if (lane1Passed) reason = 'structured_types_match_schema_plus_consumer';
    else reason = 'free_text_matches_schema_plus_consumer';
  } else {
    reason = 'neither_lane_detected_schema_plus_consumer';
  }

  return {
    triggered,
    reason,
    lane1: {
      passed: lane1Passed,
      schemaMatch: lane1SchemaMatch,
      consumerMatch: lane1ConsumerMatch,
      types: [...types],
    },
    lane2: {
      passed: lane2Passed,
      schemaMatch: lane2SchemaMatch,
      consumerMatch: lane2ConsumerMatch,
      text_length: text.length,
    },
  };
}

// Exported for tests.
export const TRIGGER_INTERNALS = {
  SCHEMA_TYPES,
  SURFACE_TYPES,
  WORKER_TYPES,
  SCHEMA_TEXT_REGEX,
  SURFACE_TEXT_REGEX,
  WORKER_TEXT_REGEX,
  NEGATION_CUE_REGEX,
  entryFreeText,
  collectStructuredTypes,
  collectFreeText,
  hasAffirmativeMatch,
};
