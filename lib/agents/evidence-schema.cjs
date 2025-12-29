/**
 * Evidence Schema and Scoring
 *
 * First-class evidence tracking for claim/evidence auditing.
 * All scoring is DETERMINISTIC - NO LLM calls.
 *
 * @module lib/agents/evidence-schema
 */

const fs = require('fs');
const path = require('path');

/**
 * Evidence pointer types
 */
const EVIDENCE_TYPES = {
  FILE: 'file',
  ARTIFACT: 'artifact',
  URL: 'url',
  CITATION: 'citation',
  TEST_RESULT: 'test_result',
  INLINE: 'inline'
};

/**
 * Verification methods
 */
const VERIFICATION_METHODS = {
  FILE_EXISTS: 'file_exists',
  ARTIFACT_LOOKUP: 'artifact_lookup',
  URL_REACHABLE: 'url_reachable',
  INLINE: 'inline',
  UNVERIFIED: 'unverified'
};

/**
 * Create an evidence pointer
 * @param {Object} params - Evidence parameters
 * @returns {Object} EvidencePointer
 */
function createEvidencePointer({
  type,
  ref,
  loc = null,
  verified = false,
  verification_method = VERIFICATION_METHODS.UNVERIFIED
}) {
  return {
    type,
    ref,
    loc: loc ? {
      line_start: loc.line_start || null,
      line_end: loc.line_end || null,
      section: loc.section || null
    } : null,
    verified,
    verification_method,
    created_at: new Date().toISOString()
  };
}

/**
 * Create a file evidence pointer with auto-verification
 * @param {string} filePath - Path to file
 * @param {Object} loc - Location within file
 * @param {string} basePath - Base path for relative files
 * @returns {Object} EvidencePointer
 */
function createFileEvidence(filePath, loc = null, basePath = process.cwd()) {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(basePath, filePath);

  const exists = fs.existsSync(fullPath);

  return createEvidencePointer({
    type: EVIDENCE_TYPES.FILE,
    ref: filePath,
    loc,
    verified: exists,
    verification_method: VERIFICATION_METHODS.FILE_EXISTS
  });
}

/**
 * Create an inline evidence pointer (always verified)
 * @param {string} content - Inline evidence content
 * @param {string} description - Description of what this proves
 * @returns {Object} EvidencePointer
 */
function createInlineEvidence(content, description) {
  return createEvidencePointer({
    type: EVIDENCE_TYPES.INLINE,
    ref: JSON.stringify({ content, description }),
    loc: null,
    verified: true,
    verification_method: VERIFICATION_METHODS.INLINE
  });
}

/**
 * Create artifact evidence pointer
 * Note: Verification requires DB lookup, deferred to audit time
 * @param {string} artifactId - Artifact UUID
 * @param {string} artifactType - Type of artifact
 * @returns {Object} EvidencePointer
 */
function createArtifactEvidence(artifactId, artifactType = null) {
  return createEvidencePointer({
    type: EVIDENCE_TYPES.ARTIFACT,
    ref: artifactId,
    loc: artifactType ? { section: artifactType } : null,
    verified: false,  // Needs DB verification
    verification_method: VERIFICATION_METHODS.ARTIFACT_LOOKUP
  });
}

/**
 * Create URL evidence pointer
 * Note: URL reachability check is skipped (too slow)
 * @param {string} url - URL reference
 * @param {string} retrievalTimestamp - When URL was accessed
 * @returns {Object} EvidencePointer
 */
function createUrlEvidence(url, retrievalTimestamp = null) {
  return createEvidencePointer({
    type: EVIDENCE_TYPES.URL,
    ref: url,
    loc: retrievalTimestamp ? { section: `retrieved: ${retrievalTimestamp}` } : null,
    verified: false,  // URL verification skipped (too slow)
    verification_method: VERIFICATION_METHODS.UNVERIFIED
  });
}

/**
 * Create test result evidence pointer
 * @param {string} testId - Test identifier
 * @param {Object} result - Test result data
 * @returns {Object} EvidencePointer
 */
function createTestResultEvidence(testId, result) {
  return createEvidencePointer({
    type: EVIDENCE_TYPES.TEST_RESULT,
    ref: testId,
    loc: { section: JSON.stringify(result) },
    verified: true,  // Test results are self-verified
    verification_method: VERIFICATION_METHODS.INLINE
  });
}

/**
 * Calculate evidence score for a finding
 *
 * Deterministic scoring rubric:
 * - Presence: +0.2 per pointer (max 0.6)
 * - Verification: +0.2 if verified
 * - Diversity: +0.2 if >= 2 different types
 *
 * @param {Object} finding - Finding with evidence array
 * @returns {number} Evidence score (0.0 - 1.0)
 */
function calculateEvidenceScore(finding) {
  const evidence = finding.evidence || [];
  if (evidence.length === 0) return 0;

  let score = 0;
  const types = new Set();

  for (const e of evidence) {
    // Presence: +0.2 per pointer (max 0.6)
    score += Math.min(0.2, 0.6 / evidence.length);

    // Verification: +0.2 total distributed across verified items
    if (e.verified) {
      score += 0.2 / evidence.length;
    }

    // Track types for diversity
    types.add(e.type);
  }

  // Diversity bonus: +0.2 if >= 2 different types
  if (types.size >= 2) {
    score += 0.2;
  }

  return Math.min(1.0, score);
}

/**
 * Check if finding has sufficient evidence for its confidence level
 * @param {Object} finding - Finding to check
 * @param {number} highConfidenceThreshold - Threshold requiring evidence (default 0.9)
 * @param {number} minEvidenceScore - Minimum evidence score for high confidence
 * @returns {Object} Validation result
 */
function validateEvidenceForConfidence(finding, highConfidenceThreshold = 0.9, minEvidenceScore = 0.5) {
  const confidence = finding.confidence || 0;
  const evidenceScore = calculateEvidenceScore(finding);

  // High confidence claims need evidence
  if (confidence >= highConfidenceThreshold && evidenceScore < minEvidenceScore) {
    return {
      valid: false,
      reason: 'high_confidence_without_evidence',
      confidence,
      evidenceScore,
      gap: minEvidenceScore - evidenceScore
    };
  }

  return {
    valid: true,
    confidence,
    evidenceScore
  };
}

/**
 * Check if evidence array contains conflicting items
 * Looks for contradictory types or explicit conflict markers
 * @param {Array} evidence - Evidence array
 * @returns {boolean}
 */
function hasConflictingEvidence(evidence) {
  if (!evidence || evidence.length < 2) return false;

  // Check for explicit conflict markers
  const hasConflictMarker = evidence.some(e =>
    e.loc?.section?.includes('conflicting') ||
    e.loc?.section?.includes('contradicts') ||
    e.ref?.includes('conflict')
  );

  if (hasConflictMarker) return true;

  // Check for same-type evidence with different conclusions
  // (This is a heuristic - real conflict detection would need semantic analysis)
  const typeGroups = new Map();
  for (const e of evidence) {
    if (!typeGroups.has(e.type)) {
      typeGroups.set(e.type, []);
    }
    typeGroups.get(e.type).push(e);
  }

  // If any type has multiple items, could indicate conflicting evidence
  for (const [_type, items] of typeGroups) {
    if (items.length >= 2 && items.some(i => !i.verified)) {
      // Multiple items of same type with some unverified = potential conflict
      return true;
    }
  }

  return false;
}

/**
 * Verify file-based evidence pointers
 * @param {Array} evidence - Evidence array to verify
 * @param {string} basePath - Base path for relative files
 * @returns {Array} Evidence with verification status updated
 */
function verifyFileEvidence(evidence, basePath = process.cwd()) {
  return evidence.map(e => {
    if (e.type !== EVIDENCE_TYPES.FILE) return e;
    if (e.verified) return e;  // Already verified

    const fullPath = path.isAbsolute(e.ref)
      ? e.ref
      : path.join(basePath, e.ref);

    return {
      ...e,
      verified: fs.existsSync(fullPath),
      verification_method: VERIFICATION_METHODS.FILE_EXISTS
    };
  });
}

/**
 * Get evidence summary for logging
 * @param {Array} evidence - Evidence array
 * @returns {Object} Summary stats
 */
function getEvidenceSummary(evidence) {
  if (!evidence || evidence.length === 0) {
    return { count: 0, verified: 0, types: [], score: 0 };
  }

  const types = [...new Set(evidence.map(e => e.type))];
  const verified = evidence.filter(e => e.verified).length;

  return {
    count: evidence.length,
    verified,
    types,
    score: calculateEvidenceScore({ evidence })
  };
}

module.exports = {
  // Types
  EVIDENCE_TYPES,
  VERIFICATION_METHODS,

  // Creators
  createEvidencePointer,
  createFileEvidence,
  createInlineEvidence,
  createArtifactEvidence,
  createUrlEvidence,
  createTestResultEvidence,

  // Scoring
  calculateEvidenceScore,
  validateEvidenceForConfidence,
  hasConflictingEvidence,

  // Utilities
  verifyFileEvidence,
  getEvidenceSummary
};
