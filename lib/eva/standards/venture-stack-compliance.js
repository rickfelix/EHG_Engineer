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
import { FORBIDDEN, REQUIRED, NEGATION_CUES, NEGATION_WINDOW } from './venture-stack-policy.js';

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

/** Scan a single text blob. Returns { violations:[{id,label,kind,token,why}], presentRequired:Set<id> }. */
function scanOne(text) {
  const violations = [];
  const presentRequired = new Set();
  if (typeof text !== 'string' || !text) return { violations, presentRequired };

  for (const rule of FORBIDDEN) {
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

  return { violations, presentRequired };
}

/**
 * Core: scan an array of text blobs at the VENTURE level (all artifacts taken together). Returns
 * { compliant, unscannable, reason, violations, missing }.
 */
export function scanTextForStackCompliance(texts) {
  const blobs = (Array.isArray(texts) ? texts : [texts]).filter((t) => typeof t === 'string' && t.trim());
  if (blobs.length === 0) {
    return {
      compliant: false,
      unscannable: true,
      reason: 'unscannable',
      violations: [],
      missing: REQUIRED.map((r) => r.label),
    };
  }

  const byId = new Map(); // dedupe violations by rule id across blobs
  const presentRequired = new Set();
  for (const b of blobs) {
    const { violations, presentRequired: pr } = scanOne(b);
    for (const v of violations) if (!byId.has(v.id)) byId.set(v.id, v);
    for (const id of pr) presentRequired.add(id);
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
  };
}

/**
 * Scan an array of venture_artifacts rows (each may carry `content` text and/or `artifact_data` JSON).
 * Zero artifacts -> unscannable (fail-closed). Otherwise delegates to scanTextForStackCompliance.
 */
export function scanArtifactsForStackCompliance(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return {
      compliant: false,
      unscannable: true,
      reason: 'unscannable',
      violations: [],
      missing: REQUIRED.map((r) => r.label),
    };
  }
  const texts = [];
  for (const a of artifacts) {
    if (!a) continue;
    if (typeof a.content === 'string') texts.push(a.content);
    if (a.artifact_data != null) {
      try { texts.push(typeof a.artifact_data === 'string' ? a.artifact_data : JSON.stringify(a.artifact_data)); } catch { /* skip unserializable */ }
    }
  }
  return scanTextForStackCompliance(texts);
}

export default { isNegated, scanTextForStackCompliance, scanArtifactsForStackCompliance };
