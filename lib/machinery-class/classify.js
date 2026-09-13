/**
 * Machinery-class classifier — SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-2).
 *
 * Decides whether an SD/QF's deliverable is "event-processing machinery" (a worker,
 * watcher, router, gate, cron, or hook) — the class subject to the amended Definition-
 * of-Done (FR-1: must reach ACTIVATED or ARMED, never just "merged + tests green").
 *
 * Deliberately NOT the same predicate as scripts/modules/activation-invariant/
 * trigger-evaluator.js's evaluateTrigger(): that evaluator requires a SCHEMA match
 * AND a consumer match (schema+UI or schema+worker chain) — a pure cron/watcher fix
 * with no schema change (the common case for G3's own named specimens: an
 * eva-scheduler watcher, a capture gauge, a remediation router) would never trigger
 * it. Machinery-class has no schema precondition; a worker/watcher/router/gate/
 * cron/hook is machinery-class on its own, schema or not.
 *
 * Reuses the SAME dual-scan signal-extraction pattern (structured key_changes[].type
 * + negation-aware free-text) and the same hasAffirmativeMatch/collectFreeText
 * helpers as trigger-evaluator.js, imported via its TRIGGER_INTERNALS export, so the
 * two classifiers share one negation/clause-boundary implementation rather than
 * diverging copies.
 *
 * Conservative-DOWN on ambiguity (defaults to 'none'): over-gating here blocks real
 * work, the opposite bias from tier-rank normalization's conservative-UP.
 */
import { TRIGGER_INTERNALS } from '../../scripts/modules/activation-invariant/trigger-evaluator.js';

const { hasAffirmativeMatch, collectStructuredTypes, collectFreeText } = TRIGGER_INTERNALS;

/** Structured key_changes[].type tokens that mark a machinery-class deliverable. */
export const MACHINERY_TYPES = new Set(['worker', 'consumer', 'job', 'cron', 'watcher', 'router', 'gate', 'hook', 'service']);

/**
 * Free-text anchors for machinery-class deliverables. Phrase-bound (not bare single
 * words like "gate"/"hook" alone) to avoid the same 58% FP class trigger-evaluator.js
 * tuned away from (QF-20260513-725) — "gate" and "hook" are common English words in
 * SD prose unrelated to a literal gate/hook file.
 *
 * QF-20260913-876: the trailing worker/watcher anchors previously used `[^.]*`, an
 * OPEN span reaching to the next period regardless of distance — not phrase-bound at
 * all, unlike every sibling anchor above. Live specimen: SD-LEO-INFRA-SUMMARY-COLUMNS-
 * DERIVED-001's PRD describes a "WORKER CLAIM QUEUE" whose semicolon-joined risk
 * paragraph later mentions "~19 writes/day" — same sentence (no intervening period),
 * many words away, and completely unrelated to the worker itself doing any writing.
 * Bounded to at most two intervening words, matching the discipline every other
 * anchor in this list already has.
 */
const MACHINERY_TEXT_REGEX = /\b(cron job|scheduled job|background worker|watcher process|periodic watcher|remediation router|event router|validation gate|gate file|lifecycle hook|git hook|webhook handler|new (worker|watcher|router|cron)|(?:worker|watcher)\W+(?:\w+\W+){0,2}(?:populates|writes|consumes|processes|polls|monitors|checks))\b/i;

/**
 * Strips an "OUT OF SCOPE" section from free text before machinery-class matching.
 *
 * SD-LEO-INFRA-PHASE-DESIGN-OKR-001 (QF-20260901-817) live specimen: scope text read
 * "OUT OF SCOPE ... - Scheduling okr-priority-sync.js as a cron job -- a design
 * recommendation only." NEGATION_CUE_REGEX's 40-char LOOKBACK window (imported via
 * hasAffirmativeMatch) only catches negation cues immediately BEFORE a match — it has
 * no notion of a section-level guardrail heading, so a design-only SD whose prose
 * explicitly lists "cron job" as something it will NOT build still classified as
 * machinery-class on a bare free-text match. Same negation-blindness class as
 * QF-20260728-987 (verb-context missing trailing/section-level scope qualifiers), one
 * level up: sentence-level vs section-level. Scoped to THIS classifier only — not
 * touching trigger-evaluator.js's shared collectFreeText/NEGATION_CUE_REGEX, which
 * other activation-invariant checks depend on with different tuning history.
 */
function stripOutOfScopeSection(text) {
  return text.replace(/\bOUT[\s-]OF[\s-]SCOPE\b[\s\S]*$/i, '');
}

/**
 * QF-20260913-876: a row's on-record, audited exit from a wrong classifier verdict.
 * Set as sd.metadata.machinery_class_override = { kind: null|<MACHINERY_TYPES member>,
 * reason, set_by, set_at }. Distinct from the global ACTIVATION_EVIDENCE_MODE rollout
 * switch (which flips behavior fleet-wide): this is a single row's documented,
 * provenance-carrying correction, readable by anyone auditing why that ONE row's
 * classification differs from what the regex/structured-type scan would otherwise say.
 * @param {*} override
 * @returns {boolean}
 */
function isValidOverride(override) {
  return (
    override && typeof override === 'object'
    && (override.kind === null || MACHINERY_TYPES.has(override.kind))
    && typeof override.reason === 'string' && override.reason.trim().length > 0
  );
}

/**
 * Classify an SD/QF row as machinery-class or not.
 * @param {Object} sd - a strategic_directives_v2 or quick_fixes-shaped row (key_changes, description, scope, title, metadata)
 * @returns {{ machineryClass: boolean, kind: string, reason: string, override?: object }}
 */
export function classifyMachineryClass(sd) {
  if (!sd || typeof sd !== 'object') {
    return { machineryClass: false, kind: 'none', reason: 'no_sd_provided' };
  }

  const override = sd.metadata?.machinery_class_override;
  if (isValidOverride(override)) {
    return {
      machineryClass: override.kind !== null,
      kind: override.kind ?? 'none',
      reason: 'override',
      override: { reason: override.reason, set_by: override.set_by ?? null, set_at: override.set_at ?? null },
    };
  }

  const types = collectStructuredTypes(sd.key_changes);
  const structuredMatch = [...MACHINERY_TYPES].some((t) => types.has(t));

  const text = stripOutOfScopeSection(collectFreeText(sd));
  const textMatch = hasAffirmativeMatch(MACHINERY_TEXT_REGEX, text);

  const machineryClass = structuredMatch || textMatch;
  let reason = 'neither_lane_detected_machinery';
  if (structuredMatch && textMatch) reason = 'both_lanes_match';
  else if (structuredMatch) reason = 'structured_type_match';
  else if (textMatch) reason = 'free_text_match';

  return {
    machineryClass,
    kind: machineryClass ? matchedKind(types, text) : 'none',
    reason,
  };
}

/** Best-effort specific kind for the metadata.machinery_class stamp (informational only). */
function matchedKind(types, text) {
  for (const t of MACHINERY_TYPES) {
    if (types.has(t)) return t;
  }
  const lower = (text || '').toLowerCase();
  if (/watcher/.test(lower)) return 'watcher';
  if (/cron/.test(lower)) return 'cron';
  if (/router/.test(lower)) return 'router';
  if (/hook/.test(lower)) return 'hook';
  if (/gate/.test(lower)) return 'gate';
  return 'worker';
}
