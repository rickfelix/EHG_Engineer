/**
 * Gap Assessment Rubric Engine
 *
 * Scores findings across 4 dimensions and routes to 3 tiers.
 * Consumed by: EOC scanner, translation fidelity gate.
 *
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-B
 * @module scripts/modules/evaluation/gap-assessment-rubric
 */

/**
 * Configurable tier thresholds.
 * Composite score ranges: 0-40 (4 dimensions × 0-10 each).
 *
 * Tiers:
 *   auto_create: 0 to AUTO_CREATE_MAX (mechanical fix, clear scope)
 *   inbox:       AUTO_CREATE_MAX+1 to BRAINSTORM_MIN-1 (needs chairman review)
 *   brainstorm:  BRAINSTORM_MIN to 40 (complex, architecturally significant)
 */
const RUBRIC_THRESHOLDS = {
  AUTO_CREATE_MAX: 12,
  BRAINSTORM_MIN: 23,
};

/**
 * Risk keywords that elevate the risk_keywords dimension score.
 * Each keyword match adds weight to the score.
 */
const RISK_KEYWORDS = {
  high: ['auth', 'authentication', 'authorization', 'rls', 'security', 'migration', 'schema', 'architecture'],
  medium: ['refactor', 'breaking', 'deprecat', 'api', 'endpoint'],
  low: ['config', 'rename', 'typo', 'comment', 'documentation'],
};

/**
 * Score a single finding across 4 dimensions.
 *
 * @param {Object} finding - The finding to score
 * @param {number} finding.ambiguity - 0 (exact replacement) to 10 (architectural question)
 * @param {number} finding.scope - 0 (single file) to 10 (system-wide)
 * @param {number} finding.riskKeywords - 0 (none) to 10 (auth/migration/schema)
 * @param {number} finding.novelty - 0 (seen before) to 10 (entirely new domain)
 * @returns {Object} Scored result with tier, composite, and dimension breakdown
 */
function scoreFinding(finding) {
  const dimensions = {
    ambiguity: clamp(finding.ambiguity ?? 0, 0, 10),
    scope: clamp(finding.scope ?? 0, 0, 10),
    riskKeywords: clamp(finding.riskKeywords ?? 0, 0, 10),
    novelty: clamp(finding.novelty ?? 0, 0, 10),
  };

  const composite = dimensions.ambiguity + dimensions.scope + dimensions.riskKeywords + dimensions.novelty;
  const tier = compositeToTier(composite);

  return {
    tier,
    composite,
    dimensions,
    thresholds: { ...RUBRIC_THRESHOLDS },
  };
}

/**
 * Score multiple findings and return results with summary.
 *
 * @param {Object[]} findings - Array of finding objects with dimension scores
 * @returns {Object} Results with individual scores, tier counts, and summary
 */
function scoreFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return { results: [], summary: { total: 0, auto_create: 0, inbox: 0, brainstorm: 0 } };
  }

  const results = findings.map((f, i) => ({
    index: i,
    ...scoreFinding(f),
    original: f,
  }));

  const summary = {
    total: results.length,
    auto_create: results.filter(r => r.tier === 'auto_create').length,
    inbox: results.filter(r => r.tier === 'inbox').length,
    brainstorm: results.filter(r => r.tier === 'brainstorm').length,
  };

  return { results, summary };
}

/**
 * Score a finding from raw context (file count, matched keywords, etc.)
 * rather than pre-assigned dimension scores. Useful for automated scanners.
 *
 * @param {Object} context - Raw finding context
 * @param {number} context.fileCount - Number of files affected
 * @param {string[]} context.matchedKeywords - Keywords found in the finding
 * @param {string} context.changeType - Type of change: 'string_literal', 'function_rename', 'config_key', 'architectural'
 * @param {boolean} context.seenBefore - Whether this pattern was seen in prior scans
 * @returns {Object} Scored result with derived dimension scores
 */
function scoreFromContext(context) {
  const ambiguity = deriveAmbiguity(context.changeType);
  const scope = deriveScope(context.fileCount);
  const riskKeywords = deriveRiskKeywords(context.matchedKeywords || []);
  const novelty = context.seenBefore ? 1 : 6;

  return scoreFinding({ ambiguity, scope, riskKeywords, novelty });
}

// --- Internal helpers ---

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compositeToTier(composite) {
  if (composite <= RUBRIC_THRESHOLDS.AUTO_CREATE_MAX) return 'auto_create';
  if (composite >= RUBRIC_THRESHOLDS.BRAINSTORM_MIN) return 'brainstorm';
  return 'inbox';
}

function deriveAmbiguity(changeType) {
  const map = {
    string_literal: 1,
    config_key: 2,
    function_rename: 4,
    parameter_change: 5,
    interface_change: 7,
    architectural: 9,
  };
  return map[changeType] ?? 5;
}

function deriveScope(fileCount) {
  if (fileCount <= 1) return 1;
  if (fileCount <= 3) return 3;
  if (fileCount <= 10) return 5;
  if (fileCount <= 20) return 7;
  return 9;
}

function deriveRiskKeywords(keywords) {
  let score = 0;
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (RISK_KEYWORDS.high.some(r => kwLower.includes(r))) score += 3;
    else if (RISK_KEYWORDS.medium.some(r => kwLower.includes(r))) score += 2;
    else if (RISK_KEYWORDS.low.some(r => kwLower.includes(r))) score += 1;
  }
  return clamp(score, 0, 10);
}

// --- Exports (dual CJS/ESM) ---

export {
  scoreFinding,
  scoreFindings,
  scoreFromContext,
  RUBRIC_THRESHOLDS,
  RISK_KEYWORDS,
};

export default {
  scoreFinding,
  scoreFindings,
  scoreFromContext,
  RUBRIC_THRESHOLDS,
  RISK_KEYWORDS,
};
