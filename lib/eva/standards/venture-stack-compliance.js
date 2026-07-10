/**
 * venture-stack-compliance — fail-closed venture-stack compliance scanner.
 * SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-2).
 *
 * Pure (no DB / fs / network). Consumes the structured policy (venture-stack-policy.js) to judge
 * whether a venture's artifacts / repo text conform to the canonical Replit-native + Clerk stack.
 *
 * Compliance semantics (deliberate, see risk-agent 3723b124):
 *   - A FORBIDDEN item POSITIVELY present (not negated)  -> compliant=false, reason='forbidden_stack_present'  (HOLD)
 *   - Nothing scannable (no text/artifacts)              -> compliant=false, reason='unscannable'              (HOLD, fail-closed)
 *   - Otherwise                                          -> compliant=true,  reason='compliant'
 *   - REQUIRED items absent are reported in `missing[]` but are ADVISORY (do NOT flip compliant) to
 *     avoid over-blocking an under-specified-but-not-wrong venture. The high-value, low-false-positive
 *     signal is a forbidden item positively present (the B1 / DataDistill 'Replit Auth' class).
 */
import { FORBIDDEN, REQUIRED, NEGATION_CUES, NEGATION_WINDOW, EXCLUDED_ARTIFACT_TYPES } from './venture-stack-policy.js';

/**
 * Is the match at `idx` in `text` negated (a prohibition/standard-citation) rather than a positive
 * usage? Looks back up to NEGATION_WINDOW chars, but ONLY within the current clause — a negation in a
 * PRIOR sentence/clause must not mask a positive usage here (e.g. "do NOT use X; we use X" → the
 * second X is a real violation, not a citation). Clause boundaries: '.', ';', newline.
 */
export function isNegated(text, idx) {
  const start = Math.max(0, idx - NEGATION_WINDOW);
  const clause = text.slice(start, idx).split(/[.;\n]/).pop().toLowerCase();
  return NEGATION_CUES.some((cue) => clause.includes(cue));
}

/** Force a (possibly /i) RegExp into a fresh global one so we can iterate all matches without state leak. */
function asGlobal(re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return new RegExp(re.source, flags);
}

/**
 * SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001 (FR-4): does a FORBIDDEN rule apply to a
 * venture given its recorded explicit decisions? Rules without appliesWhen always apply.
 * With appliesWhen, the rule applies when NO decision is provided for the key (the
 * declared default governs — back-compat) or the decision's value is in the rule's list.
 * PURE. @param {object} rule @param {object|null} decisions e.g. {form_factor:{value:'native'}}
 */
export function ruleApplies(rule, decisions) {
  if (!rule.appliesWhen) return true;
  if (!decisions || typeof decisions !== 'object') return true;
  for (const [key, allowedValues] of Object.entries(rule.appliesWhen)) {
    const decided = decisions[key] && decisions[key].value;
    if (decided && !allowedValues.includes(decided)) return false;
  }
  return true;
}

/** Scan a single text blob. Returns { violations:[{id,label,kind,token,why}], presentRequired:Set<id>, skippedRules:[{id,reason}] }. */
function scanOne(text, decisions = null) {
  const violations = [];
  const presentRequired = new Set();
  const skippedRules = [];
  if (typeof text !== 'string' || !text) return { violations, presentRequired, skippedRules };

  for (const rule of FORBIDDEN) {
    if (!ruleApplies(rule, decisions)) {
      skippedRules.push({ id: rule.id, reason: `skipped: recorded explicit decision (${Object.keys(rule.appliesWhen).join(',')}) outside this rule's appliesWhen` });
      continue;
    }
    let flagged = false;
    for (const re of rule.patterns) {
      if (flagged) break;
      const rx = asGlobal(re);
      let m;
      while ((m = rx.exec(text)) !== null) {
        if (!isNegated(text, m.index)) {
          violations.push({ id: rule.id, label: rule.label, kind: rule.kind, token: m[0], why: rule.why });
          flagged = true;
          break; // one violation per rule per blob is enough
        }
      }
    }
  }

  for (const rule of REQUIRED) {
    for (const re of rule.patterns) {
      const rx = asGlobal(re);
      let m;
      while ((m = rx.exec(text)) !== null) {
        if (!isNegated(text, m.index)) { presentRequired.add(rule.id); break; }
      }
      if (presentRequired.has(rule.id)) break;
    }
  }

  return { violations, presentRequired, skippedRules };
}

/**
 * Core: scan an array of text blobs at the VENTURE level (all artifacts taken together). Returns
 * { compliant, unscannable, reason, violations, missing }.
 */
export function scanTextForStackCompliance(texts, opts = {}) {
  // SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001 (FR-4): opts.decisions = the venture's
  // recorded explicit_decisions block; rules whose appliesWhen excludes the decided value
  // are skipped (reported in skippedRules). Omitting opts.decisions is byte-identical to
  // the pre-decision behavior (the declared defaults govern).
  const { decisions = null } = opts;
  const blobs = (Array.isArray(texts) ? texts : [texts]).filter((t) => typeof t === 'string' && t.trim());
  if (blobs.length === 0) {
    return {
      compliant: false,
      unscannable: true,
      reason: 'unscannable',
      violations: [],
      missing: REQUIRED.map((r) => r.label),
      skippedRules: [],
    };
  }

  const byId = new Map(); // dedupe violations by rule id across blobs
  const presentRequired = new Set();
  const skippedById = new Map();
  for (const b of blobs) {
    const { violations, presentRequired: pr, skippedRules } = scanOne(b, decisions);
    for (const v of violations) if (!byId.has(v.id)) byId.set(v.id, v);
    for (const id of pr) presentRequired.add(id);
    for (const s of skippedRules) if (!skippedById.has(s.id)) skippedById.set(s.id, s);
  }

  const violations = [...byId.values()];
  const missing = REQUIRED.filter((r) => !presentRequired.has(r.id)).map((r) => r.label);
  const compliant = violations.length === 0;
  return {
    compliant,
    unscannable: false,
    reason: compliant ? 'compliant' : 'forbidden_stack_present',
    violations,
    missing,
    skippedRules: [...skippedById.values()],
  };
}

/**
 * Scan an array of venture_artifacts rows (each may carry `content` text and/or `artifact_data` JSON).
 * Adversarial-analysis / critique artifact types (EXCLUDED_ARTIFACT_TYPES) are skipped: they argue
 * AGAINST the concept and so mention forbidden approaches without the venture adopting them. Zero
 * SCANNABLE artifacts -> unscannable (fail-closed). Otherwise delegates to scanTextForStackCompliance.
 */
export function scanArtifactsForStackCompliance(artifacts, opts = {}) {
  const scannable = (Array.isArray(artifacts) ? artifacts : []).filter(
    (a) => a && !EXCLUDED_ARTIFACT_TYPES.has(a.artifact_type),
  );
  if (scannable.length === 0) {
    return {
      compliant: false,
      unscannable: true,
      reason: 'unscannable',
      violations: [],
      missing: REQUIRED.map((r) => r.label),
      skippedRules: [],
    };
  }
  const texts = [];
  for (const a of scannable) {
    if (typeof a.content === 'string') texts.push(a.content);
    if (a.artifact_data != null) {
      try { texts.push(typeof a.artifact_data === 'string' ? a.artifact_data : JSON.stringify(a.artifact_data)); } catch { /* skip unserializable */ }
    }
  }
  return scanTextForStackCompliance(texts, opts);
}

export default { isNegated, ruleApplies, scanTextForStackCompliance, scanArtifactsForStackCompliance };
