/**
 * PBN gate orchestration — SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
 *
 * Wires pbn-scoring.js (LLM) + pbn-gate.js (pure rules) into the two things the
 * chairman-review.js integration point actually needs: a verdict, and a durable audit
 * record. Persistence LOCATION (nursery row vs. venture metadata) is the caller's decision
 * (TR-8) — this module never writes to venture_nursery/ventures directly, only to
 * nursery_evaluation_log via TR-5's recordNurseryEvaluation (which requires a real nurseryId
 * the caller must already have).
 */
import { scorePbnBuckets } from './pbn-scoring.js';
import { buildPbnVerdict } from './pbn-gate.js';
import { recordNurseryEvaluation } from './venture-nursery.js';

// TR-7/C1: patterns LLM-authored free text must never carry through to persistence. rule_trace
// is SAFE BY CONSTRUCTION (pbn-gate.js builds it entirely from code-authored template strings
// plus a Number.isFinite-gated numeric interpolation, never LLM echo — verified by SECURITY
// sub-agent probe at EXEC-TO-PLAN), so this guard is the only line of defense for every OTHER
// LLM-authored field in the persisted shape: proven.mechanic, better.hypothesis,
// better.friction_point, new.wedge, and every citation field across both buckets (SECURITY
// EXEC-TO-PLAN F1: the original version covered citations only — 1 of 7 LLM-authored leaves —
// and used a spread/denylist that let an LLM-invented extra citation key through unredacted).
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SD_KEY_PATTERN = /\bSD-[A-Z0-9-]+-\d{3}[A-Z0-9.-]*\b/gi;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;

/**
 * Sanitize a single LLM-authored text leaf. Fail-closed on shape, not just content: a
 * non-string value (object, array, number...) is malformed for a field this module's callers
 * only ever treat as free text, so it is nulled rather than passed through unredacted
 * (SECURITY F1: the prior version returned non-strings unchanged, silently).
 */
function sanitizeTextLeaf(text) {
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') return null;
  return text
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(UUID_PATTERN, '[REDACTED_ID]')
    .replace(SD_KEY_PATTERN, '[REDACTED_SD_KEY]');
}

/**
 * Allowlist-by-construction (SECURITY F1): names exactly the 3 fields a citation is allowed to
 * carry and builds a fresh object from them — an LLM-invented extra key (or a bare string
 * standing in for a citation object) can never reach the persisted shape, unlike a
 * spread-then-override which is a denylist.
 */
function sanitizeCitation(citation) {
  if (!citation || typeof citation !== 'object') return null;
  return {
    source: sanitizeTextLeaf(citation.source),
    measured: sanitizeTextLeaf(citation.measured),
    reference: sanitizeTextLeaf(citation.reference),
  };
}

/**
 * TR-7/C1: bound pbn_verdict content before it is persisted. Strips chairman-identity-shaped
 * strings (email) and internal identifiers beyond what source_ref already exposes (UUIDs, SD
 * keys) from every LLM-authored leaf in the verdict — both buckets' free-text fields
 * (mechanic/hypothesis/friction_point/wedge) and every citation field. rule_trace is untouched
 * — code-authored, never LLM echo (see module docblock).
 *
 * @param {Object} verdict - output of buildPbnVerdict
 * @returns {Object} sanitized verdict, same shape
 */
export function sanitizePbnVerdictForPersistence(verdict) {
  return {
    ...verdict,
    // Adversarial review finding (deep-tier /ship gate): scoring_error carries pbn-scoring.js's
    // raw caught-error message (LLM/network failure text) — external-origin, unlike rule_trace,
    // so it goes through the same text-leaf sanitizer as every other free-text field here.
    scoring_error: sanitizeTextLeaf(verdict.scoring_error),
    proven: {
      ...verdict.proven,
      mechanic: sanitizeTextLeaf(verdict.proven?.mechanic),
      citations: (verdict.proven?.citations || []).map(sanitizeCitation),
    },
    better: {
      ...verdict.better,
      hypothesis: sanitizeTextLeaf(verdict.better?.hypothesis),
      friction_point: sanitizeTextLeaf(verdict.better?.friction_point),
      citations: (verdict.better?.citations || []).map(sanitizeCitation),
    },
    new: {
      ...verdict.new,
      wedge: sanitizeTextLeaf(verdict.new?.wedge),
    },
  };
}

/**
 * Run the PBN gate against a brief. Scores (LLM) then evaluates (pure rules), and sanitizes
 * before returning — callers persist the RETURN VALUE directly, never the raw scorer output.
 *
 * @param {Object} brief
 * @param {Object} [deps] - {llmClient, logger, now} — all injectable for tests
 * @returns {Promise<Object>} sanitized pbn_verdict, ready to persist
 */
export async function runPbnGate(brief, deps = {}) {
  const buckets = await scorePbnBuckets(brief, deps);
  const verdict = buildPbnVerdict(buckets, deps);
  return sanitizePbnVerdictForPersistence(verdict);
}

/**
 * TR-5: record a PBN verdict as a durable, independently-queryable nursery_evaluation_log
 * entry — survives a later unpark re-check overwriting the CURRENT venture_nursery.pbn_verdict
 * column (DESIGN sub-agent findings D2/D3). MUST be called with a real nurseryId that already
 * exists in venture_nursery (recordNurseryEvaluation throws otherwise) — for a first-time park,
 * call this AFTER parkVenture()'s insert returns its new row id, never before.
 *
 * triggerType is hardcoded 'manual' (DATABASE sub-agent, confidence 95): NURSERY_EVAL_TRIGGER_TYPES
 * is an Object.freeze'd JS allowlist in venture-nursery.js that throws pre-insert on any other
 * value — a prior caller (discovery-mode.js:790) hit this exact trap and silently wrote zero rows.
 *
 * @param {string} nurseryId
 * @param {Object} verdict - sanitized pbn_verdict (from runPbnGate)
 * @param {Object} [deps] - {supabase, logger}
 * @returns {Promise<Object>} the inserted nursery_evaluation_log row
 */
export async function recordPbnEvaluation(nurseryId, verdict, deps = {}) {
  return recordNurseryEvaluation(
    {
      nurseryId,
      triggerType: 'manual',
      evaluatedBy: 'pbn_gate',
      triggerDetails: verdict,
      notes: `PBN verdict: ${verdict.verdict} (proven=${verdict.proven.coverage}, wedges=${verdict.new.wedge_count})`,
      skipAdvance: true, // a PBN score is not a scheduled re-evaluation event
    },
    deps
  );
}

export default { sanitizePbnVerdictForPersistence, runPbnGate, recordPbnEvaluation };
