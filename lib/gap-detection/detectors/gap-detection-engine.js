/**
 * Gap Detection Engine
 *
 * Compares extracted requirements against deliverable analysis.
 * Uses keyword matching with confidence scoring to identify gaps.
 */

/**
 * Detect gaps between requirements and deliverables.
 * @param {Array} requirements - From prd-requirement-extractor
 * @param {Array} deliverables - From deliverable-analyzer
 * @returns {{gaps: Array, matched: Array, coverage_score: number|null, total: number, matched_count: number}}
 */
export function detectGaps(requirements, deliverables) {
  if (!requirements || requirements.length === 0) {
    return { gaps: [], matched: [], coverage_score: null, total: 0, matched_count: 0 };
  }

  const deliverableFiles = deliverables.map(d => d.file.toLowerCase());
  const deliverableCategories = new Set(deliverables.map(d => d.category));

  const gaps = [];
  const matched = [];

  for (const req of requirements) {
    const keywords = extractKeywords(req.requirement, req.description);
    const { confidence, matchedFiles, matchType } = matchRequirementToDeliverables(keywords, deliverableFiles, deliverables);

    if (confidence >= 0.7) {
      matched.push({
        requirement_id: req.id,
        requirement: req.requirement,
        confidence,
        match_type: matchType,
        matched_files: matchedFiles
      });
    } else {
      const severity = assignSeverity(req.priority, confidence);
      gaps.push({
        requirement_id: req.id,
        requirement: req.requirement,
        gap_type: determineGapType(confidence, deliverableCategories, keywords),
        severity,
        confidence,
        priority: req.priority,
        evidence: buildEvidence(confidence, matchedFiles, keywords),
        root_cause_category: null, // Filled by root-cause-classifier
        corrective_sd_key: null    // Filled by corrective-sd-creator
      });
    }
  }

  const total = requirements.length;
  const matchedCount = matched.length;
  const coverageScore = total > 0 ? Math.round((matchedCount / total) * 100) : null;

  return { gaps, matched, coverage_score: coverageScore, total, matched_count: matchedCount };
}

/**
 * Extract meaningful keywords from requirement text.
 */
function extractKeywords(requirement, description) {
  const text = `${requirement} ${description}`.toLowerCase();

  // Remove common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
    'they', 'them', 'their', 'this', 'that', 'these', 'those',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'for', 'with', 'from', 'to', 'of', 'in', 'on', 'at', 'by', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'when', 'where', 'how', 'what', 'which', 'who', 'whom',
    'all', 'each', 'every', 'any', 'some', 'no', 'than', 'too', 'very',
    'just', 'also', 'then', 'if', 'else', 'while', 'until',
  ]);

  const words = text
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Match requirement keywords against deliverable file paths.
 */
function matchRequirementToDeliverables(keywords, deliverableFiles, deliverables) {
  if (keywords.length === 0 || deliverableFiles.length === 0) {
    return { confidence: 0, matchedFiles: [], matchType: 'no_match' };
  }

  let totalScore = 0;
  const matchedFiles = [];

  for (const keyword of keywords) {
    let bestMatch = 0;
    let bestFile = null;

    for (let i = 0; i < deliverableFiles.length; i++) {
      const filePath = deliverableFiles[i];
      const fileName = filePath.split('/').pop();

      // Exact keyword in file path
      if (filePath.includes(keyword)) {
        const score = fileName.includes(keyword) ? 1.0 : 0.8;
        if (score > bestMatch) {
          bestMatch = score;
          bestFile = deliverables[i].file;
        }
      }
      // Partial match (keyword stem)
      else if (keyword.length > 4) {
        const stem = keyword.slice(0, -2);
        if (filePath.includes(stem)) {
          const score = 0.5;
          if (score > bestMatch) {
            bestMatch = score;
            bestFile = deliverables[i].file;
          }
        }
      }
    }

    totalScore += bestMatch;
    if (bestFile && !matchedFiles.includes(bestFile)) {
      matchedFiles.push(bestFile);
    }
  }

  const confidence = keywords.length > 0 ? totalScore / keywords.length : 0;
  const clampedConfidence = Math.min(1.0, Math.max(0, confidence));

  let matchType = 'no_match';
  if (clampedConfidence >= 0.8) matchType = 'exact_match';
  else if (clampedConfidence >= 0.5) matchType = 'partial_match';

  return { confidence: Math.round(clampedConfidence * 100) / 100, matchedFiles, matchType };
}

/**
 * Assign severity based on requirement priority and match confidence.
 */
function assignSeverity(priority, confidence) {
  const p = (priority || 'MEDIUM').toUpperCase();

  if ((p === 'CRITICAL') && confidence < 0.3) return 'critical';
  if ((p === 'HIGH') && confidence < 0.5) return 'high';
  if (confidence < 0.3) return 'high';
  if (confidence < 0.5) return 'medium';
  if (confidence < 0.7) return 'medium';
  return 'low';
}

/**
 * Determine gap type based on analysis context.
 */
function determineGapType(confidence, _deliverableCategories, _keywords) {
  if (confidence === 0) return 'not_implemented';
  if (confidence < 0.3) return 'partially_implemented';
  return 'under_delivered';
}

/**
 * Build human-readable evidence string.
 */
function buildEvidence(confidence, matchedFiles, keywords) {
  const parts = [];

  if (confidence === 0) {
    parts.push('No matching files found for requirement keywords');
  } else {
    parts.push(`Confidence ${(confidence * 100).toFixed(0)}% - below threshold`);
  }

  if (matchedFiles.length > 0) {
    parts.push(`Closest files: ${matchedFiles.slice(0, 3).join(', ')}`);
  }

  parts.push(`Keywords searched: ${keywords.slice(0, 5).join(', ')}`);

  return parts.join('. ');
}
