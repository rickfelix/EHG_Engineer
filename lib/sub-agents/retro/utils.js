/**
 * RETRO Sub-Agent Utility Functions
 * Extracted from retro.js for modularity
 */

/**
 * Strip nested findings from sub-agent results to prevent recursive snowballing
 * @param {Array} results - Array of sub-agent execution results
 * @returns {Array} Results with nested findings stripped
 */
export function stripNestedFindings(results) {
  if (!Array.isArray(results)) return results;

  return results.map(result => {
    if (!result.metadata || !result.metadata.findings) {
      return result;
    }

    const cleaned = { ...result };
    const { findings, ...otherMetadata } = result.metadata;

    if (findings && findings.sub_agent_results && findings.sub_agent_results.results) {
      const summarizedResults = findings.sub_agent_results.results.map(r => ({
        id: r.id,
        sub_agent_code: r.sub_agent_code,
        sub_agent_name: r.sub_agent_name,
        verdict: r.verdict,
        confidence: r.confidence,
        created_at: r.created_at
      }));

      cleaned.metadata = {
        ...otherMetadata,
        findings_summary: {
          sd_metadata: findings.sd_metadata ? { id: findings.sd_metadata.id, title: findings.sd_metadata.title, status: findings.sd_metadata.status } : null,
          sub_agent_count: findings.sub_agent_results?.count || 0,
          sub_agent_codes: [...new Set(summarizedResults.map(r => r.sub_agent_code))],
          sub_agent_result_ids: summarizedResults.map(r => r.id)
        },
        _findings_stripped: true,
        _stripped_at: new Date().toISOString()
      };
    } else {
      cleaned.metadata = {
        ...otherMetadata,
        _findings_stripped: true,
        _stripped_at: new Date().toISOString()
      };
    }

    return cleaned;
  });
}

/**
 * Semantic deduplication of array items
 * @param {Array} existingItems - Existing items
 * @param {Array} newItems - New items to add
 * @param {string} textField - Field to compare for deduplication
 * @returns {Array} Deduplicated array
 */
export function semanticDeduplicateArray(existingItems, newItems, textField = null) {
  if (!Array.isArray(existingItems)) existingItems = [];
  if (!Array.isArray(newItems)) return existingItems;

  const existingTexts = new Set(
    existingItems.map(item => {
      const text = textField ? item[textField] : (typeof item === 'string' ? item : JSON.stringify(item));
      return text?.toLowerCase().trim() || '';
    })
  );

  const uniqueNew = newItems.filter(item => {
    const text = textField ? item[textField] : (typeof item === 'string' ? item : JSON.stringify(item));
    const normalizedText = text?.toLowerCase().trim() || '';
    if (existingTexts.has(normalizedText)) return false;
    existingTexts.add(normalizedText);
    return true;
  });

  return [...existingItems, ...uniqueNew];
}

/**
 * Detect tags from a message using keyword matching
 * @param {string} message - Message to analyze
 * @returns {Array} Detected tags
 */
export function detectTagsFromMessage(message) {
  const tagPatterns = {
    'workflow': /\b(workflow|process|procedure|handoff|phase)\b/i,
    'testing': /\b(test|testing|e2e|unit test|coverage|playwright)\b/i,
    'documentation': /\b(doc|documentation|readme|comment|jsdoc)\b/i,
    'performance': /\b(performance|speed|slow|fast|optimize|cache)\b/i,
    'architecture': /\b(architecture|design|pattern|structure|refactor)\b/i,
    'database': /\b(database|db|query|sql|supabase|postgres)\b/i,
    'ui': /\b(ui|frontend|component|react|button|modal|form)\b/i,
    'api': /\b(api|endpoint|rest|graphql|route|controller)\b/i,
    'security': /\b(security|auth|permission|rls|role|token)\b/i,
    'error-handling': /\b(error|exception|catch|try|throw|bug|fix)\b/i,
    'validation': /\b(validation|validate|check|verify|gate)\b/i,
    'configuration': /\b(config|configuration|env|environment|setting)\b/i
  };

  const detectedTags = [];
  for (const [tag, pattern] of Object.entries(tagPatterns)) {
    if (pattern.test(message)) {
      detectedTags.push(tag);
    }
  }

  return detectedTags.length > 0 ? detectedTags : ['general'];
}
