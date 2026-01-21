/**
 * Context-Aware Sub-Agent Selector - Keyword Matching Module
 *
 * Contains keyword-based matching functions for sub-agent selection.
 *
 * @module lib/modules/context-aware-selector/keyword-matching
 */

import { DOMAIN_KEYWORDS, COORDINATION_GROUPS } from './domain-keywords.js';

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extracts text content from SD for analysis
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Object} - Extracted text with context labels
 */
export function extractSDContent(sd) {
  return {
    title: sd.title || '',
    description: sd.description || '',
    business_value: sd.business_value || '',
    acceptance_criteria: sd.acceptance_criteria || '',
    technical_notes: sd.technical_notes || '',
    // Combine all content for full-text search
    fullText: [
      sd.title,
      sd.description,
      sd.business_value,
      sd.acceptance_criteria,
      sd.technical_notes
    ].filter(Boolean).join(' ')
  };
}

// ============================================================================
// Keyword Matching
// ============================================================================

/**
 * Counts keyword matches in text with exclusion filtering
 *
 * @param {string} text - Text to search
 * @param {Array<string>} keywords - Keywords to match
 * @param {Array<string>} exclusions - Exclusion patterns
 * @returns {Object} - Match details with matched keywords
 */
export function countKeywordMatches(text, keywords, exclusions = []) {
  if (!text) return { count: 0, matched: [] };

  const lowerText = text.toLowerCase();
  const matchedKeywords = [];

  // Count keyword matches
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      matchedKeywords.push(keyword);
    }
  }

  // Check exclusions - if any exclusion pattern found, filter out matches
  let filteredMatches = matchedKeywords.length;
  for (const exclusion of exclusions) {
    if (lowerText.includes(exclusion.toLowerCase())) {
      // Remove matches related to this exclusion
      filteredMatches = 0;
      break;
    }
  }

  return {
    count: filteredMatches,
    matched: filteredMatches > 0 ? matchedKeywords : []
  };
}

/**
 * Calculates weighted match score for a domain
 *
 * @param {Object} content - Extracted SD content
 * @param {Object} domain - Domain configuration
 * @returns {Object} - Match details with score
 */
export function calculateDomainScore(content, domain) {
  const weights = domain.weight;

  // Count matches in each context
  const titlePrimary = countKeywordMatches(content.title, domain.primary, domain.exclusions);
  const titleSecondary = countKeywordMatches(content.title, domain.secondary, domain.exclusions);

  const descPrimary = countKeywordMatches(content.description, domain.primary, domain.exclusions);
  const descSecondary = countKeywordMatches(content.description, domain.secondary, domain.exclusions);

  const contentPrimary = countKeywordMatches(content.fullText, domain.primary, domain.exclusions);
  const contentSecondary = countKeywordMatches(content.fullText, domain.secondary, domain.exclusions);

  // Calculate weighted score
  const score = (
    (titlePrimary.count * weights.title * 2) +       // Primary keywords in title are strongest
    (titleSecondary.count * weights.title * 1) +
    (descPrimary.count * weights.description * 2) +
    (descSecondary.count * weights.description * 1) +
    (contentPrimary.count * weights.content * 2) +
    (contentSecondary.count * weights.content * 1)
  );

  // Total unique matches (for minimum threshold check)
  const totalMatches = Math.min(
    titlePrimary.count + titleSecondary.count +
    descPrimary.count + descSecondary.count +
    contentPrimary.count + contentSecondary.count,
    domain.primary.length + domain.secondary.length  // Cap at total available keywords
  );

  // Collect all matched keywords for debugging
  const allMatched = [
    ...titlePrimary.matched,
    ...titleSecondary.matched,
    ...descPrimary.matched,
    ...descSecondary.matched,
    ...contentPrimary.matched,
    ...contentSecondary.matched
  ];

  return {
    score,
    totalMatches,
    meetsMinimum: totalMatches >= domain.minMatches,
    matchedKeywords: [...new Set(allMatched)],  // Unique keywords
    breakdown: {
      title: { primary: titlePrimary.count, secondary: titleSecondary.count },
      description: { primary: descPrimary.count, secondary: descSecondary.count },
      content: { primary: contentPrimary.count, secondary: contentSecondary.count }
    }
  };
}

/**
 * Checks for coordination group matches
 *
 * @param {Object} content - Extracted SD content
 * @returns {Array<Object>} - Matched coordination groups
 */
export function checkCoordinationGroups(content) {
  const matched = [];

  for (const [groupName, group] of Object.entries(COORDINATION_GROUPS)) {
    const result = countKeywordMatches(content.fullText, group.keywords, []);
    if (result.count > 0) {
      matched.push({
        groupName,
        agents: group.agents,
        reason: group.reason,
        keywordMatches: result.count,
        matchedKeywords: result.matched
      });
    }
  }

  return matched;
}

// ============================================================================
// Sub-Agent Selection (Keyword-Only)
// ============================================================================

/**
 * Main selection function - analyzes SD and recommends sub-agents
 *
 * @param {Object} sd - Strategic directive object
 * @param {Object} options - Selection options
 * @returns {Object} - Recommended sub-agents with confidence scores
 */
export function selectSubAgents(sd, options = {}) {
  const {
    confidenceThreshold = 0.4,  // Minimum confidence (0-1) to recommend (40%)
    includeCoordination = true   // Include coordination group recommendations
  } = options;

  const content = extractSDContent(sd);
  const results = [];
  const maxScore = 50;  // Rough estimate of max possible score (for normalization)

  // Analyze each domain
  for (const [_domainKey, domain] of Object.entries(DOMAIN_KEYWORDS)) {
    const match = calculateDomainScore(content, domain);

    if (match.meetsMinimum && match.score > 0) {
      const confidence = Math.min(match.score / maxScore, 1.0);  // Normalize to 0-1

      if (confidence >= confidenceThreshold) {
        results.push({
          code: domain.code,
          name: domain.name,
          confidence: Math.round(confidence * 100),  // Convert to percentage
          score: match.score,
          matches: match.totalMatches,
          breakdown: match.breakdown,
          reason: `Matched ${match.totalMatches} keywords with weighted score ${match.score.toFixed(1)}`
        });
      }
    }
  }

  // Check coordination groups - add additional agents when coordination keywords match
  let coordinationAgents = [];
  const triggeredGroups = [];
  if (includeCoordination) {
    const groups = checkCoordinationGroups(content);
    for (const group of groups) {
      coordinationAgents = [...new Set([...coordinationAgents, ...group.agents])];

      // Add agents from coordination groups if not already selected
      // Only add if coordination group has at least 2 keyword matches (strong signal)
      if (group.keywordMatches >= 2) {
        triggeredGroups.push(group);  // Track which groups actually triggered

        for (const agentCode of group.agents) {
          if (!results.some(r => r.code === agentCode)) {
            const domain = DOMAIN_KEYWORDS[agentCode];
            if (domain) {
              results.push({
                code: agentCode,
                name: domain.name,
                confidence: 60,  // Medium confidence for coordination
                score: 0,
                matches: 0,
                breakdown: {},
                reason: `Coordination required: ${group.reason} (matched: ${group.matchedKeywords.join(', ')})`,
                coordinationGroup: group.groupName
              });
            }
          }
        }
      }
    }
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => b.confidence - a.confidence);

  return {
    recommended: results,
    coordinationGroups: triggeredGroups,  // Only show groups that actually triggered
    summary: {
      totalRecommended: results.length,
      highConfidence: results.filter(r => r.confidence >= 75).length,
      mediumConfidence: results.filter(r => r.confidence >= 50 && r.confidence < 75).length,
      lowConfidence: results.filter(r => r.confidence < 50).length
    }
  };
}

/**
 * Formats selection results for display
 *
 * @param {Object} selectionResult - Result from selectSubAgents()
 * @returns {string} - Formatted output
 */
export function formatSelectionResults(selectionResult) {
  const { recommended, coordinationGroups, summary } = selectionResult;

  let output = 'Context-Aware Sub-Agent Selection Results\n\n';
  output += '=' .repeat(70) + '\n\n';

  if (recommended.length === 0) {
    output += 'No sub-agents recommended (confidence threshold not met)\n';
    return output;
  }

  output += `Summary: ${summary.totalRecommended} sub-agents recommended\n`;
  output += `   High Confidence (>=75%): ${summary.highConfidence}\n`;
  output += `   Medium Confidence (50-74%): ${summary.mediumConfidence}\n`;
  output += `   Low Confidence (<50%): ${summary.lowConfidence}\n\n`;

  output += '=' .repeat(70) + '\n\n';

  recommended.forEach((agent, index) => {
    const confidenceBar = '='.repeat(Math.round(agent.confidence / 5));
    output += `${index + 1}. ${agent.code} - ${agent.name}\n`;
    output += `   Confidence: ${agent.confidence}% ${confidenceBar}\n`;
    output += `   Reason: ${agent.reason}\n`;
    if (agent.coordinationGroup) {
      output += `   Coordination Group: ${agent.coordinationGroup}\n`;
    }
    output += '\n';
  });

  if (coordinationGroups.length > 0) {
    output += '=' .repeat(70) + '\n\n';
    output += 'Coordination Groups Detected:\n\n';
    coordinationGroups.forEach(group => {
      output += `* ${group.groupName}: ${group.agents.join(', ')}\n`;
      output += `  Reason: ${group.reason}\n\n`;
    });
  }

  return output;
}

/**
 * Builds keyword match counts for hybrid matching
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Object} - Map of sub_agent_code -> keyword_match_count
 */
export function buildKeywordMatchCounts(sd) {
  const content = extractSDContent(sd);
  const matchCounts = {};

  // Calculate keyword matches for each domain
  for (const [_domainKey, domain] of Object.entries(DOMAIN_KEYWORDS)) {
    const match = calculateDomainScore(content, domain);

    if (match.meetsMinimum && match.totalMatches > 0) {
      matchCounts[domain.code] = match.totalMatches;
    }
  }

  return matchCounts;
}
