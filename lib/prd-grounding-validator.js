/**
 * PRD Grounding Validator
 * Cross-checks generated PRD requirements against source SD to detect hallucination
 * SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001
 *
 * US-003: Grounding validator flags ungrounded requirements
 * US-004: Discovery documents inform grounding validation
 */

/**
 * Calculate text similarity using Jaccard index on word tokens
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score 0-1
 */
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  // Tokenize and normalize
  const normalize = (text) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  };

  const tokens1 = new Set(normalize(text1));
  const tokens2 = new Set(normalize(text2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Calculate Jaccard index
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;

  return intersection / union;
}

/**
 * Extract key phrases from text
 * @param {string} text - Source text
 * @returns {string[]} Array of key phrases
 */
function extractKeyPhrases(text) {
  if (!text) return [];

  // Common technical terms that indicate specific requirements
  const technicalPatterns = [
    /(?:add|create|implement|modify|update|delete|remove)\s+\w+/gi,
    /\w+\s+(?:column|table|field|index|constraint)/gi,
    /\w+\s+(?:endpoint|api|route|handler)/gi,
    /\w+\s+(?:component|module|function|class)/gi,
    /(?:must|shall|should|will)\s+\w+/gi
  ];

  const phrases = [];
  technicalPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      phrases.push(...matches.map(m => m.toLowerCase().trim()));
    }
  });

  return [...new Set(phrases)];
}

/**
 * Context-specific requirement patterns that indicate hallucination
 * @param {string} context - Implementation context (cli, web, api, database, etc.)
 * @returns {RegExp[]} Array of patterns that shouldn't appear in this context
 */
function getContextExclusionPatterns(context) {
  const patterns = {
    cli: [
      /wcag/i,
      /accessibility|a11y/i,
      /responsive|mobile|tablet/i,
      /render.*(?:time|sla|performance)/i,
      /color.*contrast/i,
      /screen.*reader/i,
      /keyboard.*navigation/i,
      /dark.*mode|light.*mode|theme/i,
      /css|styling|tailwind/i,
      /component.*architecture/i,
      /ui.*framework/i
    ],
    api: [
      /ui.*component/i,
      /frontend.*design/i,
      /button|modal|dialog|form.*input/i,
      /user.*interface/i,
      /css|styling/i,
      /browser.*compatibility/i
    ],
    database: [
      /ui.*component/i,
      /frontend/i,
      /user.*interface/i,
      /responsive/i,
      /css|styling/i
    ],
    infrastructure: [
      /end.*user.*ui/i,
      /customer.*facing/i,
      /user.*journey/i,
      /visual.*design/i,
      /wcag/i
    ]
  };

  return patterns[context] || [];
}

/**
 * Check if a requirement text contains excluded patterns for its context
 * @param {string} requirementText - The requirement text to check
 * @param {string} context - Implementation context
 * @returns {{ isExcluded: boolean, matchedPattern: string|null }}
 */
function checkContextExclusions(requirementText, context) {
  const exclusionPatterns = getContextExclusionPatterns(context);

  for (const pattern of exclusionPatterns) {
    if (pattern.test(requirementText)) {
      return {
        isExcluded: true,
        matchedPattern: pattern.toString()
      };
    }
  }

  return { isExcluded: false, matchedPattern: null };
}

/**
 * Validate a single requirement against SD source
 * @param {Object} requirement - The requirement to validate
 * @param {Object} sd - Source Strategic Directive
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with confidence score
 */
function validateRequirement(requirement, sd, options = {}) {
  const { explorationSummary = null, implementationContext = 'web' } = options;

  const reqText = `${requirement.title || ''} ${requirement.description || ''}`;
  const sdText = `${sd.title || ''} ${sd.description || ''} ${sd.scope || ''} ${sd.rationale || ''}`;

  let confidence = 0;
  const factors = [];

  // Factor 1: Text similarity with SD (0-40 points)
  const similarity = calculateTextSimilarity(reqText, sdText);
  const similarityScore = Math.min(similarity * 80, 40); // Max 40 points
  confidence += similarityScore;
  factors.push({
    name: 'sd_text_similarity',
    score: similarityScore,
    detail: `${(similarity * 100).toFixed(1)}% word overlap with SD`
  });

  // Factor 2: Key phrase matching (0-30 points)
  const sdPhrases = extractKeyPhrases(sdText);
  const reqPhrases = extractKeyPhrases(reqText);
  const phraseMatches = reqPhrases.filter(p =>
    sdPhrases.some(sp => sp.includes(p) || p.includes(sp))
  ).length;
  const phraseScore = Math.min((phraseMatches / Math.max(reqPhrases.length, 1)) * 40, 30);
  confidence += phraseScore;
  factors.push({
    name: 'key_phrase_match',
    score: phraseScore,
    detail: `${phraseMatches}/${reqPhrases.length} key phrases match SD`
  });

  // Factor 3: Context exclusion check (0 or -30 points)
  const exclusionCheck = checkContextExclusions(reqText, implementationContext);
  if (exclusionCheck.isExcluded) {
    confidence -= 30;
    factors.push({
      name: 'context_exclusion',
      score: -30,
      detail: `Contains pattern excluded for ${implementationContext} context: ${exclusionCheck.matchedPattern}`
    });
  }

  // Factor 4: Exploration summary match (0-20 points) - US-004
  if (explorationSummary) {
    const exploreSimilarity = calculateTextSimilarity(reqText, explorationSummary);
    const exploreScore = Math.min(exploreSimilarity * 40, 20);
    confidence += exploreScore;
    factors.push({
      name: 'exploration_match',
      score: exploreScore,
      detail: `${(exploreSimilarity * 100).toFixed(1)}% overlap with discovery documents`
    });
  }

  // Factor 5: Strategic objectives alignment (0-10 points)
  if (sd.strategic_objectives && Array.isArray(sd.strategic_objectives)) {
    const objectivesText = sd.strategic_objectives
      .map(o => typeof o === 'string' ? o : o.objective || o.description || '')
      .join(' ');
    const objSimilarity = calculateTextSimilarity(reqText, objectivesText);
    const objScore = Math.min(objSimilarity * 20, 10);
    confidence += objScore;
    factors.push({
      name: 'objectives_alignment',
      score: objScore,
      detail: `${(objSimilarity * 100).toFixed(1)}% alignment with strategic objectives`
    });
  }

  // Normalize confidence to 0-1 range
  const normalizedConfidence = Math.max(0, Math.min(1, confidence / 100));

  return {
    requirement_id: requirement.id,
    requirement_title: requirement.title,
    confidence: normalizedConfidence,
    is_flagged: normalizedConfidence < 0.7,
    factors,
    explanation: normalizedConfidence < 0.7
      ? `Low confidence (${(normalizedConfidence * 100).toFixed(0)}%): This requirement may not be grounded in the SD source. ${factors.filter(f => f.score < 10).map(f => f.detail).join('. ')}`
      : `Grounded (${(normalizedConfidence * 100).toFixed(0)}%): Requirement aligns with SD scope.`
  };
}

/**
 * Validate all requirements in a PRD against source SD
 * @param {Object} prd - The PRD to validate
 * @param {Object} sd - Source Strategic Directive
 * @param {Object} options - Validation options
 * @returns {Object} Validation results
 */
export function validatePRDGrounding(prd, sd, options = {}) {
  const startTime = Date.now();
  const results = {
    validated_at: new Date().toISOString(),
    sd_id: sd.id || sd.sd_key,
    implementation_context: options.implementationContext || sd.implementation_context || 'web',
    requirements_validated: 0,
    requirements_flagged: 0,
    average_confidence: 0,
    flagged_requirements: [],
    all_results: []
  };

  // Combine all requirements for validation
  const allRequirements = [
    ...(prd.functional_requirements || []).map(r => ({ ...r, type: 'functional' })),
    ...(prd.non_functional_requirements || []).map(r => ({ ...r, type: 'non_functional' })),
    ...(prd.technical_requirements || []).map(r => ({ ...r, type: 'technical' }))
  ];

  if (allRequirements.length === 0) {
    results.error = 'No requirements found in PRD';
    return results;
  }

  // Get exploration summary if available
  const explorationSummary = sd.exploration_summary ||
    (sd.metadata?.exploration_summary) ||
    options.explorationSummary;

  // Validate each requirement
  let totalConfidence = 0;
  for (const req of allRequirements) {
    const validation = validateRequirement(req, sd, {
      explorationSummary,
      implementationContext: results.implementation_context
    });

    results.all_results.push({
      ...validation,
      requirement_type: req.type
    });

    totalConfidence += validation.confidence;
    results.requirements_validated++;

    if (validation.is_flagged) {
      results.requirements_flagged++;
      results.flagged_requirements.push({
        id: req.id,
        title: req.title,
        type: req.type,
        confidence: validation.confidence,
        explanation: validation.explanation
      });
    }
  }

  results.average_confidence = totalConfidence / results.requirements_validated;
  results.validation_duration_ms = Date.now() - startTime;
  results.grounding_score = results.average_confidence;
  results.has_issues = results.requirements_flagged > 0;

  return results;
}

/**
 * Format validation results for display
 * @param {Object} results - Validation results
 * @returns {string} Formatted output
 */
export function formatValidationResults(results) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('PRD GROUNDING VALIDATION RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`SD: ${results.sd_id}`);
  lines.push(`Implementation Context: ${results.implementation_context}`);
  lines.push(`Validated: ${results.requirements_validated} requirements`);
  lines.push(`Flagged: ${results.requirements_flagged} (${((results.requirements_flagged / results.requirements_validated) * 100).toFixed(0)}%)`);
  lines.push(`Average Confidence: ${(results.average_confidence * 100).toFixed(1)}%`);
  lines.push(`Duration: ${results.validation_duration_ms}ms`);
  lines.push('');

  if (results.flagged_requirements.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('FLAGGED REQUIREMENTS (potentially ungrounded)');
    lines.push('-'.repeat(60));
    lines.push('');

    results.flagged_requirements.forEach((req, i) => {
      lines.push(`${i + 1}. [${req.type.toUpperCase()}] ${req.id}: ${req.title}`);
      lines.push(`   Confidence: ${(req.confidence * 100).toFixed(0)}%`);
      lines.push(`   ${req.explanation}`);
      lines.push('');
    });
  } else {
    lines.push('All requirements appear to be grounded in the SD source.');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

// Export for testing
export { calculateTextSimilarity, extractKeyPhrases, checkContextExclusions, validateRequirement };
