/**
 * Model tier recommendation — SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-1).
 *
 * Operationalizes docs/design/fable-use-case-doctrine.md's standing rule: DEFAULT Sonnet,
 * escalate to Fable IFF any of R1-R5 matches. Pure classifier, no I/O — same architectural
 * style as lib/fleet/effort-recommendation.cjs and lib/fleet/door-classifier.mjs.
 *
 * COMPOSES WITH door_class, DOES NOT EXTEND IT (LEAD validation finding): door_class answers
 * "who may execute this" and fails CLOSED toward Fable-exclusive on any ambiguity. This answers
 * "should Fable have DESIGNED/DECIDED this" and fails OPEN toward cheap Sonnet, escalating only
 * on a positive, named R-match. Opposite biases — merging them would be unsafe.
 *
 * R2 (negative-space), R3 (taste), and R4 (coupling) are NOT reliably keyword-detectable the way
 * R1/R5 are (documented PRD risk) — this is a best-effort heuristic, advisory only, nothing gates
 * on it. A false negative here just means no Fable nudge is surfaced.
 *
 * @module lib/fleet/model-recommendation
 */

const R1_KEYWORDS = ['architecture', 'architectural', 'doctrine', 'standard', 'decomposition', 'decompos'];
const R2_KEYWORDS = ['pre-mortem', 'premortem', "what's missing", 'what is missing', 'negative space', 'negative-space', 'horizon scan', 'unknown-unknown', 'unknown unknown'];
const R3_KEYWORDS = ['ui/ux', 'ux judgment', 'ux judgement', 'design judgment', 'design judgement', 'venture selection', 'venture-selection', 'pricing', 'brand', 'taste'];
const R4_KEYWORDS = ['coupling', 'interaction failure', 'cross-subsystem', 'cross subsystem'];
const R5_KEYWORDS = ['overturn', 'reverse the', 'reversal', 'prior conclusion', 'ratified conclusion', 'irreversible', 'non-reversible', 'cannot be undone'];

const SUBSYSTEM_COUNT_RE = />=?\s*3\s+subsystems|\bat least 3 subsystems\b/i;

function textOf(item) {
  const parts = [
    item && item.title,
    item && item.description,
    item && item.scope,
    Array.isArray(item && item.key_changes)
      ? item.key_changes
          .flatMap((k) => (k && typeof k === 'object' ? Object.values(k) : [k]))
          .filter((v) => typeof v === 'string')
          .join(' ')
      : (item && item.key_changes),
  ].filter((v) => typeof v === 'string' && v.trim().length > 0);
  return parts.join(' ').toLowerCase();
}

function findKeyword(text, keywords) {
  return keywords.find((k) => text.includes(k)) || null;
}

/**
 * Pure model-tier classification. No I/O; default 'sonnet'; escalates to 'fable' only on a
 * positive, named R1-R5 match. Missing/ambiguous input NEVER yields 'fable' (opposite bias
 * from door-classifier's ambiguity-fail-safe, by design).
 *
 * @param {Object} item — { title?, description?, scope?, key_changes?, sd_type?, metadata? }
 * @returns {{ tier: 'fable'|'sonnet', criterion: 'R1'|'R2'|'R3'|'R4'|'R5'|null, reason: string }}
 */
function recommendModelTier(item = {}) {
  // R5 shortcut: a one_way door already implies Fable-exclusive execution (LEAD validation) —
  // check this BEFORE keyword matching so it's satisfied by construction, not by text luck.
  const doorClass = item && item.metadata && item.metadata.door_class;
  if (doorClass && doorClass.door === 'one_way') {
    return { tier: 'fable', criterion: 'R5', reason: 'one_way door_class implies Fable-exclusive execution (reversal-stakes)' };
  }

  const text = textOf(item);
  if (!text) {
    return { tier: 'sonnet', criterion: null, reason: 'default: no scoreable text, no positive R-match possible' };
  }

  let hit = findKeyword(text, R1_KEYWORDS);
  if (hit) return { tier: 'fable', criterion: 'R1', reason: `compounding-constraint keyword: ${hit}` };

  hit = findKeyword(text, R2_KEYWORDS);
  if (hit) return { tier: 'fable', criterion: 'R2', reason: `negative-space keyword: ${hit}` };

  hit = findKeyword(text, R3_KEYWORDS);
  if (hit) return { tier: 'fable', criterion: 'R3', reason: `taste/judgment keyword: ${hit}` };

  if (SUBSYSTEM_COUNT_RE.test(text)) {
    return { tier: 'fable', criterion: 'R4', reason: 'explicit >=3 subsystem coupling named' };
  }
  hit = findKeyword(text, R4_KEYWORDS);
  if (hit) return { tier: 'fable', criterion: 'R4', reason: `coupling keyword: ${hit}` };

  hit = findKeyword(text, R5_KEYWORDS);
  if (hit) return { tier: 'fable', criterion: 'R5', reason: `reversal-stakes keyword: ${hit}` };

  return { tier: 'sonnet', criterion: null, reason: 'default: no R1-R5 match — the litmus (would a wrong answer silently misdirect a week, or does it require noticing what is absent?) is not met' };
}

module.exports = { recommendModelTier, R1_KEYWORDS, R2_KEYWORDS, R3_KEYWORDS, R4_KEYWORDS, R5_KEYWORDS };
