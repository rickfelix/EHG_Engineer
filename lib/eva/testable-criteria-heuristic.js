/**
 * B2 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Testable Success Criteria heuristic
 *
 * Validates that Success Criteria items in vision documents are testable.
 *
 * Heuristic accepts a criterion as "testable" if it contains AT LEAST ONE of:
 * - A fenced code block (```...```) — implies pseudo-code
 * - Given/When/Then markers (BDD format)
 * - A numbered list step (e.g., "Step 1: Click X. Step 2: Verify Y.") — implies E2E
 * - A measurable assertion: `must <verb>`, `should <verb>`, `<verb> within N <unit>`,
 *   numeric thresholds, or a SQL query reference
 *
 * Vague criteria like "improve performance", "better UX", "faster", "more reliable"
 * are flagged as non-testable.
 *
 * Returns { issues: Array<{criterion, reason}> } — empty array if all pass.
 *
 * Ships in WARNING-ONLY mode initially. Issues are printed by the caller and
 * (in a future version) persisted to eva_vision_documents.quality_issues for
 * telemetry. Promotion to blocking requires <15% false-positive rate over a
 * 2-week window.
 */
export function validateSuccessCriteriaTestability(sections) {
  const content = sections?.success_criteria || '';
  if (!content || typeof content !== 'string') return { issues: [] };

  // If the section has any fenced code block, treat all criteria as testable
  // (pseudo-code is present somewhere). Deliberately over-permissive for
  // warning-only mode.
  const hasFencedBlock = /```[\s\S]+?```/.test(content);

  // Extract individual criterion items (one per line, ignoring blank lines and headers)
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const criteria = lines
    .map(l => l.replace(/^([-*+]|\d+\.|\[\s*[xX ]?\s*\])\s+/, '').trim())
    .filter(l => l.length > 0 && l.length < 500);

  if (criteria.length === 0) return { issues: [] };

  // Pattern definitions (case-insensitive)
  // Note: trailing word-boundaries removed where the unit can be a non-word
  // character (%, etc.) — \b doesn't match between two non-word chars.
  const measurablePattern = /\b(must|should|shall)\s+(equal|return|complete|respond|execute|finish|appear|render|emit|persist|insert|update|delete|select|increase|decrease|drop|exceed|stay\s+below|stay\s+above|provide)\b/i;
  const withinUnitPattern = /\bwithin\s+\d+\s*(milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|rows?|requests?|calls?|users?|attempts?|tries?|retries?|ms|s|min|h)\b/i;
  // Numeric threshold: comparator + number + (optional space) + unit. Unit list
  // includes both full words and abbreviations. Trailing boundary uses (?=\s|$|\W)
  // so % and abbreviations followed by EOL/space match correctly.
  const numericThresholdPattern = /(>=?|<=?|≥|≤|=|<|>)\s*\d+(\.\d+)?\s*(%|percent|milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|loc|lines?|rows?|users?|mb|gb|kb|ms|sec|min|hr|h)(?=\s|$|\W)/i;
  const sqlPattern = /\b(SELECT|INSERT|UPDATE|DELETE)\b\s+/i;
  const givenWhenThenPattern = /\b(given|when|then)\b/i;
  const numberedStepPattern = /\bstep\s+\d+\b/i;
  const vagueVerbs = /\b(improve|enhance|optimize|better|faster|more\s+reliable|reliable|streamline|simplify|modernize|upgrade)\b/i;

  const issues = [];
  for (const c of criteria) {
    // If the file has any fenced code block, treat all criteria as testable
    if (hasFencedBlock) continue;

    const isMeasurable = measurablePattern.test(c) || withinUnitPattern.test(c) || numericThresholdPattern.test(c);
    const isSql = sqlPattern.test(c);
    const isBdd = givenWhenThenPattern.test(c);
    const isNumberedStep = numberedStepPattern.test(c);

    if (isMeasurable || isSql || isBdd || isNumberedStep) continue;

    // Vague-verb check runs FIRST and regardless of length, because short
    // items like "Better UX" (9 chars) are exactly the kind of vague
    // criteria the heuristic is designed to catch.
    if (vagueVerbs.test(c)) {
      issues.push({
        criterion: c.slice(0, 200),
        reason: 'Vague criterion: contains improvement verb without a measurable target. Add a specific threshold (e.g., "must complete within 100ms" or "coverage >= 80%").'
      });
      continue;
    }

    // Skip very short items that are not vague verbs (likely list fragments or headers)
    if (c.length < 10) continue;

    // Catch-all: short criterion (10-79 chars) with no testable signals.
    // Long criteria (>=80 chars) are NOT flagged in over-cautious mode —
    // they may be descriptive but valid. Tighten this in promotion-to-blocking phase.
    if (c.length < 80) {
      issues.push({
        criterion: c.slice(0, 200),
        reason: 'No testable signal: criterion lacks pseudo-code, Given/When/Then markers, numbered E2E steps, or measurable assertions (must/should + verb, within N units, numeric thresholds, SQL).'
      });
    }
  }

  return { issues };
}
