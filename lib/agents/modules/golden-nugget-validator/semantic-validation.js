/**
 * Golden Nugget Validator - Semantic Validation Module
 *
 * COGNITIVE UPGRADE v2.6.0: SEMANTIC VALIDATION LAYER
 * THE LAW: Character count is NOT quality. Semantic value is MANDATORY.
 *
 * @module lib/agents/modules/golden-nugget-validator/semantic-validation
 */

/**
 * Anti-Entropy Check - Detect low-value content
 * Flags: Lorem Ipsum, high repetition, filler text, placeholder content
 *
 * @param {string} content - Text content to analyze
 * @returns {Object} {passed, entropy_score, issues}
 */
export function checkSemanticEntropy(content) {
  const issues = [];
  let entropyScore = 100;

  // 1. Lorem Ipsum detection
  const loremPatterns = [
    /lorem\s+ipsum/gi,
    /dolor\s+sit\s+amet/gi,
    /consectetur\s+adipiscing/gi,
    /placeholder\s+text/gi,
    /sample\s+content/gi,
    /TODO:|FIXME:|TBD:|XXX:/gi,
    /\[insert\s+.*?\]/gi,
    /\{.*?placeholder.*?\}/gi
  ];

  for (const pattern of loremPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      issues.push(`Placeholder content detected: "${matches[0]}"`);
      entropyScore -= 30;
    }
  }

  // 2. High repetition detection (same phrase repeated 3+ times)
  const words = content.toLowerCase().split(/\s+/);
  const phrases = [];
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }

  const phraseCounts = {};
  for (const phrase of phrases) {
    if (phrase.length > 10) {  // Only count meaningful phrases
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }

  const repetitions = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 3)
    .map(([phrase, count]) => ({ phrase, count }));

  if (repetitions.length > 0) {
    issues.push(`High repetition detected: ${repetitions.length} phrases repeated 3+ times`);
    entropyScore -= 10 * repetitions.length;
  }

  // 3. Low unique word ratio (entropy measure)
  const uniqueWords = new Set(words.filter(w => w.length > 3));
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);

  if (uniqueRatio < 0.15) {
    issues.push(`Low semantic variance: Only ${(uniqueRatio * 100).toFixed(1)}% unique words`);
    entropyScore -= 25;
  }

  // 4. Filler phrase detection
  const fillerPatterns = [
    /as\s+mentioned\s+above/gi,
    /it\s+is\s+worth\s+noting/gi,
    /needless\s+to\s+say/gi,
    /in\s+conclusion/gi,
    /to\s+summarize/gi,
    /basically/gi,
    /essentially/gi
  ];

  let fillerCount = 0;
  for (const pattern of fillerPatterns) {
    const matches = content.match(pattern);
    if (matches) fillerCount += matches.length;
  }

  if (fillerCount > 5) {
    issues.push(`Excessive filler phrases: ${fillerCount} instances`);
    entropyScore -= 5 * fillerCount;
  }

  // SOVEREIGN SEAL v2.7.0: Buzzword blacklist detection
  const buzzwordPatterns = [
    /\bsynergy\b/gi,
    /\bsynergistic\b/gi,
    /\bparadigm\s+shift\b/gi,
    /\bparadigm\b/gi,
    /\bleverage\b/gi,
    /\boperationalize\b/gi,
    /\boptimize\b/gi,
    /\bdisruptive\b/gi,
    /\binnovation\s+vector\b/gi,
    /\bstakeholder\s+engagement\b/gi,
    /\bholistic\s+approach\b/gi,
    /\bbest\s+practices\b/gi,
    /\bcore\s+competency\b/gi,
    /\bvalue\s+add\b/gi,
    /\bscalable\s+solution\b/gi,
    /\bagile\s+methodology\b/gi,
    /\bthought\s+leader\b/gi,
    /\bmoving\s+forward\b/gi,
    /\bat\s+the\s+end\s+of\s+the\s+day\b/gi,
    /\blow-hanging\s+fruit\b/gi
  ];

  let buzzwordCount = 0;
  const foundBuzzwords = [];
  for (const pattern of buzzwordPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      buzzwordCount += matches.length;
      foundBuzzwords.push(matches[0]);
    }
  }

  // Calculate buzzword density (buzzwords per 100 words)
  const wordCount = content.split(/\s+/).length;
  const buzzwordDensity = (buzzwordCount / wordCount) * 100;

  if (buzzwordDensity > 2) {  // More than 2% buzzwords = gaming attempt
    issues.push(`High buzzword density: ${buzzwordDensity.toFixed(1)}% (${foundBuzzwords.slice(0, 3).join(', ')}...)`);
    entropyScore -= 20;
  } else if (buzzwordCount > 3) {  // More than 3 buzzwords total
    issues.push(`Buzzword accumulation: ${buzzwordCount} instances detected`);
    entropyScore -= 10;
  }

  return {
    passed: entropyScore >= 60,
    entropy_score: Math.max(0, entropyScore),
    issues,
    unique_word_ratio: uniqueRatio,
    buzzword_density: buzzwordDensity
  };
}

/**
 * Semantic Keyword Validation for specific artifact types
 * Ensures artifacts contain domain-specific terminology
 *
 * @param {string} artifactType - Type of artifact
 * @param {string} content - Artifact content
 * @returns {Object} {passed, required_keywords, found_keywords, missing_keywords}
 */
export function validateSemanticKeywords(artifactType, content) {
  const keywordRequirements = {
    'risk_matrix': {
      required: ['risk', 'probability', 'impact', 'mitigation'],
      optional: ['severity', 'contingency', 'likelihood', 'exposure', 'control'],
      minRequired: 3,
      minOptional: 2
    },
    'financial_model': {
      required: ['revenue', 'cost', 'margin', 'projection'],
      optional: ['cac', 'ltv', 'burn', 'runway', 'profit', 'unit economics'],
      minRequired: 3,
      minOptional: 2
    },
    'validation_report': {
      required: ['validation', 'result', 'criteria'],
      optional: ['score', 'pass', 'fail', 'recommendation', 'finding'],
      minRequired: 2,
      minOptional: 2
    },
    'competitive_analysis': {
      required: ['competitor', 'market', 'advantage'],
      optional: ['differentiation', 'positioning', 'threat', 'opportunity', 'share'],
      minRequired: 2,
      minOptional: 2
    },
    'business_model_canvas': {
      required: ['value proposition', 'customer', 'revenue'],
      optional: ['channel', 'relationship', 'resource', 'partner', 'cost structure'],
      minRequired: 2,
      minOptional: 3
    }
  };

  const requirements = keywordRequirements[artifactType];
  if (!requirements) {
    return { passed: true, reason: 'No keyword requirements for this artifact type' };
  }

  const contentLower = content.toLowerCase();

  // SOVEREIGN SEAL v2.7.0: Word-boundary matching (not substring matching)
  const matchesWordBoundary = (keyword, text) => {
    const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedKw}\\b`, 'i');
    return pattern.test(text);
  };

  const foundRequired = requirements.required.filter(kw =>
    matchesWordBoundary(kw, contentLower)
  );
  const foundOptional = requirements.optional.filter(kw =>
    matchesWordBoundary(kw, contentLower)
  );
  const missingRequired = requirements.required.filter(kw =>
    !matchesWordBoundary(kw, contentLower)
  );

  const requiredMet = foundRequired.length >= requirements.minRequired;
  const optionalMet = foundOptional.length >= requirements.minOptional;

  return {
    passed: requiredMet && optionalMet,
    required_keywords: requirements.required,
    found_required: foundRequired,
    missing_required: missingRequired,
    found_optional: foundOptional,
    matching_mode: 'word_boundary',
    reason: !requiredMet
      ? `Missing required keywords: ${missingRequired.join(', ')} (need ${requirements.minRequired})`
      : !optionalMet
        ? `Insufficient domain terminology: Only ${foundOptional.length}/${requirements.minOptional} optional keywords found`
        : 'Semantic keywords validated (word-boundary matching)'
  };
}

/**
 * Epistemic Classification Check
 * Ensures artifact separates Facts from Assumptions (Four Buckets)
 *
 * @param {string} content - Artifact content
 * @returns {Object} {passed, buckets_found, reason}
 */
export function checkEpistemicClassification(content) {
  const contentLower = content.toLowerCase();

  const bucketPatterns = {
    facts: /\bfact[s]?\b|\bknown\b|\bverified\b|\bconfirmed\b|\bdata\s+shows\b/i,
    assumptions: /\bassumption[s]?\b|\bassum[ed|ing]\b|\bbelieve[sd]?\b|\bhypothes[is|ize]\b|\bexpect\b/i,
    simulations: /\bsimulat[ed|ion]\b|\bmodel[led|ing]?\b|\bproject[ed|ion]\b|\bforecast\b|\bscenario\b/i,
    unknowns: /\bunknown[s]?\b|\buncertain\b|\btbd\b|\bto\s+be\s+determined\b|\bpending\b|\brisk\b/i
  };

  const bucketsFound = {};
  let count = 0;

  for (const [bucket, pattern] of Object.entries(bucketPatterns)) {
    if (pattern.test(contentLower)) {
      bucketsFound[bucket] = true;
      count++;
    }
  }

  return {
    passed: count >= 2,  // Must have at least 2 of 4 buckets
    buckets_found: bucketsFound,
    bucket_count: count,
    reason: count >= 2
      ? `Epistemic classification present: ${Object.keys(bucketsFound).join(', ')}`
      : `Insufficient epistemic classification: Only ${count}/2 required buckets found`
  };
}
