/**
 * Keyword Intent Scorer
 *
 * Weighted keyword scoring for sub-agent routing.
 * Keywords are loaded from config/agent-keywords-routing.json (single source of truth).
 *
 * Scoring Formula:
 *   score = sum(matched_keyword_weights)
 *
 * Thresholds (absolute points):
 *   >= 5: High confidence, auto-trigger
 *   3-4:  Medium confidence, trigger if single match or suggest if multiple
 *   1-2:  Low confidence, mention for awareness
 *
 * Usage:
 *   node lib/keyword-intent-scorer.js "identify the root cause of this bug"
 */

import dotenv from 'dotenv';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

// ============================================================================
// CONFIGURATION - loaded from shared JSON config
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);

let routingConfig;
try {
  routingConfig = _require(path.resolve(__dirname, '..', 'config', 'agent-keywords-routing.json'));
} catch {
  routingConfig = null;
}

const THRESHOLDS = routingConfig?.thresholds || { HIGH: 5, MEDIUM: 3, LOW: 1 };
const WEIGHTS = routingConfig?.weights || { PRIMARY: 4, SECONDARY: 2, TERTIARY: 1 };

// ============================================================================
// KEYWORD DEFINITIONS
// Source of truth: config/agent-keywords-routing.json
// 16 real agents loaded. 11 phantom agents removed during consolidation.
// ============================================================================

const AGENT_KEYWORDS = routingConfig?.agents || {};

// ============================================================================
// SCORING ENGINE
// ============================================================================

/**
 * Normalize text for matching
 */
function normalize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Remove punctuation except hyphens
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .trim();
}

/**
 * Check if query contains a keyword (phrase-aware)
 */
function containsKeyword(query, keyword) {
  const normalizedQuery = normalize(query);
  const normalizedKeyword = normalize(keyword);

  // For multi-word phrases, check exact phrase match
  if (normalizedKeyword.includes(' ')) {
    return normalizedQuery.includes(normalizedKeyword);
  }

  // For single words, check word boundary match
  const regex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
  return regex.test(normalizedQuery);
}

/**
 * Calculate score for a single agent
 * Uses absolute point scoring (not percentage)
 */
function scoreAgent(query, agentCode, keywords) {
  let matchedWeight = 0;
  const matchedKeywords = [];
  let primaryMatches = 0;
  let secondaryMatches = 0;
  let tertiaryMatches = 0;

  // Score primary keywords (weight 4)
  for (const kw of keywords.primary || []) {
    if (containsKeyword(query, kw)) {
      matchedWeight += WEIGHTS.PRIMARY;
      matchedKeywords.push({ keyword: kw, weight: 'primary' });
      primaryMatches++;
    }
  }

  // Score secondary keywords (weight 2)
  for (const kw of keywords.secondary || []) {
    if (containsKeyword(query, kw)) {
      matchedWeight += WEIGHTS.SECONDARY;
      matchedKeywords.push({ keyword: kw, weight: 'secondary' });
      secondaryMatches++;
    }
  }

  // Score tertiary keywords (weight 1)
  for (const kw of keywords.tertiary || []) {
    if (containsKeyword(query, kw)) {
      matchedWeight += WEIGHTS.TERTIARY;
      matchedKeywords.push({ keyword: kw, weight: 'tertiary' });
      tertiaryMatches++;
    }
  }

  // Determine confidence level based on absolute points
  let confidence;
  if (matchedWeight >= THRESHOLDS.HIGH) {
    confidence = 'HIGH';
  } else if (matchedWeight >= THRESHOLDS.MEDIUM) {
    confidence = 'MEDIUM';
  } else if (matchedWeight >= THRESHOLDS.LOW) {
    confidence = 'LOW';
  } else {
    confidence = 'NONE';
  }

  return {
    agent: agentCode,
    score: matchedWeight,
    matchedKeywords,
    primaryMatches,
    secondaryMatches,
    tertiaryMatches,
    confidence
  };
}

/**
 * Score query against all agents
 */
function scoreAll(query) {
  const results = [];

  for (const [agentCode, keywords] of Object.entries(AGENT_KEYWORDS)) {
    const result = scoreAgent(query, agentCode, keywords);
    if (result.score > 0) {
      results.push(result);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Get routing recommendation
 */
function getRecommendation(query) {
  const allScores = scoreAll(query);

  // Filter by confidence level
  const highConfidence = allScores.filter(r => r.confidence === 'HIGH');
  const mediumConfidence = allScores.filter(r => r.confidence === 'MEDIUM');
  const lowConfidence = allScores.filter(r => r.confidence === 'LOW');

  // Determine action
  let action = 'NONE';
  let agents = [];
  let reason = '';

  if (highConfidence.length >= 1) {
    action = 'TRIGGER';
    agents = highConfidence.slice(0, 2);
    reason = `High confidence match (${agents.map(a => `${a.agent}:${a.score}pts`).join(', ')})`;
  } else if (mediumConfidence.length === 1) {
    action = 'TRIGGER';
    agents = [mediumConfidence[0]];
    reason = `Medium confidence match (${agents[0].agent}:${agents[0].score}pts)`;
  } else if (mediumConfidence.length > 1) {
    action = 'SUGGEST';
    agents = mediumConfidence.slice(0, 3);
    reason = `Multiple medium confidence matches - consider: ${agents.map(a => `${a.agent}:${a.score}pts`).join(', ')}`;
  } else if (lowConfidence.length > 0) {
    action = 'MENTION';
    agents = lowConfidence.slice(0, 2);
    reason = `Low confidence possible match: ${agents.map(a => `${a.agent}:${a.score}pts`).join(', ')}`;
  } else {
    action = 'NONE';
    reason = 'No significant keyword matches';
  }

  return {
    action,
    agents,
    reason,
    allScores: allScores.slice(0, 5)
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node lib/keyword-intent-scorer.js "your query here"');
    console.log('       node lib/keyword-intent-scorer.js --test');
    console.log('       node lib/keyword-intent-scorer.js --json "query"');
    process.exit(0);
  }

  const jsonMode = args[0] === '--json';
  const testMode = args[0] === '--test';
  const query = jsonMode ? args.slice(1).join(' ') : args.join(' ');

  if (testMode) {
    runTests();
    return;
  }

  const recommendation = getRecommendation(query);

  if (jsonMode) {
    console.log(JSON.stringify(recommendation, null, 2));
  } else {
    console.log('\n=== Keyword Intent Scoring ===');
    console.log(`Query: "${query}"\n`);
    console.log(`Action: ${recommendation.action}`);
    console.log(`Reason: ${recommendation.reason}\n`);

    if (recommendation.agents.length > 0) {
      console.log('Matched Agents:');
      for (const agent of recommendation.agents) {
        console.log(`  ${agent.agent}: ${agent.score}pts (${agent.confidence})`);
        if (agent.matchedKeywords.length > 0) {
          const primaryMatches = agent.matchedKeywords.filter(k => k.weight === 'primary');
          const secondaryMatches = agent.matchedKeywords.filter(k => k.weight === 'secondary');
          if (primaryMatches.length > 0) {
            console.log(`    Primary: ${primaryMatches.map(k => k.keyword).join(', ')}`);
          }
          if (secondaryMatches.length > 0) {
            console.log(`    Secondary: ${secondaryMatches.map(k => k.keyword).join(', ')}`);
          }
        }
      }
    }

    console.log('\nTop 5 Scores:');
    for (const s of recommendation.allScores) {
      console.log(`  ${s.agent}: ${s.score}pts (${s.confidence})`);
    }
  }
}

function runTests() {
  const testCases = [
    { query: 'identify the root cause of this bug', expected: 'RCA' },
    { query: 'create a database migration for users table', expected: 'DATABASE' },
    { query: 'fix the authentication vulnerability', expected: 'SECURITY' },
    { query: 'write unit tests for the login component', expected: 'TESTING' },
    { query: 'this page is too slow, optimize it', expected: 'PERFORMANCE' },
    { query: 'the button looks wrong on mobile', expected: 'DESIGN' },
    { query: 'create a new api endpoint for users', expected: 'API' },
    { query: 'create a pull request for this', expected: 'GITHUB' },
    { query: 'update npm packages and check for vulnerabilities', expected: 'DEPENDENCY' },
    { query: 'refactor this without breaking changes', expected: 'REGRESSION' },
    { query: 'run uat and verify the user journey', expected: 'UAT' },
    { query: 'what are the risks of this architecture decision', expected: 'RISK' },
    { query: 'do we already have this implemented somewhere', expected: 'VALIDATION' },
    { query: 'what did we learn from this sprint', expected: 'RETRO' },
    { query: 'document this api endpoint', expected: 'API' },
  ];

  console.log('\n=== Running Tests ===\n');
  console.log('Thresholds: HIGH >= 5pts, MEDIUM >= 3pts, LOW >= 1pt');
  console.log('Weights: PRIMARY=4, SECONDARY=2, TERTIARY=1\n');

  let passed = 0;

  for (const tc of testCases) {
    const result = getRecommendation(tc.query);
    const topAgent = result.agents[0]?.agent || 'NONE';
    const topScore = result.agents[0]?.score || 0;
    const isPass = topAgent === tc.expected;

    if (isPass) {
      passed++;
      console.log(`  PASS "${tc.query.substring(0, 40)}..." -> ${topAgent} (${topScore}pts, ${result.agents[0]?.confidence})`);
    } else {
      console.log(`  FAIL "${tc.query.substring(0, 40)}..." -> ${topAgent} (expected ${tc.expected})`);
      if (result.allScores.length > 0) {
        console.log(`   Top scores: ${result.allScores.slice(0, 3).map(s => `${s.agent}:${s.score}pts`).join(', ')}`);
      }
    }
  }

  console.log(`\nResults: ${passed}/${testCases.length} passed (${Math.round(passed/testCases.length*100)}%)`);
}

// Export for use as module
export {
  scoreAll,
  scoreAgent,
  getRecommendation,
  AGENT_KEYWORDS,
  THRESHOLDS,
  WEIGHTS
};

// Run CLI if executed directly
main();
