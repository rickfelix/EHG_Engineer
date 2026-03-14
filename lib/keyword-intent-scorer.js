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
const COMBINATION_RULES = routingConfig?.combination_rules || [];
const PHASE_MODIFIERS = routingConfig?.phase_modifiers || {};

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
 * Score query against all agents, with optional phase-aware boosting.
 * @param {string} query - The prompt to score
 * @param {string} [phase] - Current workflow phase (LEAD, PLAN, EXEC)
 */
function scoreAll(query, phase) {
  const results = [];
  const phaseBoosts = phase ? (PHASE_MODIFIERS[phase]?.boosts || {}) : {};

  for (const [agentCode, keywords] of Object.entries(AGENT_KEYWORDS)) {
    const result = scoreAgent(query, agentCode, keywords);
    if (result.score > 0) {
      // Apply phase modifier if available
      const boost = phaseBoosts[agentCode];
      if (boost) {
        result.score = Math.round(result.score * boost);
        result.phaseBoost = boost;
      }
      results.push(result);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Re-evaluate confidence after phase boost
  for (const r of results) {
    if (r.score >= THRESHOLDS.HIGH) r.confidence = 'HIGH';
    else if (r.score >= THRESHOLDS.MEDIUM) r.confidence = 'MEDIUM';
    else if (r.score >= THRESHOLDS.LOW) r.confidence = 'LOW';
    else r.confidence = 'NONE';
  }

  return results;
}

/**
 * Evaluate combination rules against scored results.
 * Returns additional agent pairs that should be co-triggered.
 * @param {string} query - The prompt
 * @param {Array} scoredResults - Results from scoreAll()
 */
function evaluateCombinations(query, scoredResults) {
  const normalizedQuery = normalize(query);
  const triggered = [];

  for (const rule of COMBINATION_RULES) {
    // Check if any trigger keyword matches
    const hasKeyword = rule.trigger_keywords.some(kw => {
      const nkw = normalize(kw);
      return nkw.includes(' ')
        ? normalizedQuery.includes(nkw)
        : new RegExp(`\\b${nkw}\\b`, 'i').test(normalizedQuery);
    });

    if (!hasKeyword) continue;

    // Check if all agents in the combination have at least the minimum confidence
    const minConf = rule.min_confidence || 'LOW';
    const confOrder = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    const minConfNum = confOrder[minConf] || 0;

    const matchedAgents = rule.agents.filter(agentCode => {
      const agentResult = scoredResults.find(r => r.agent === agentCode);
      return agentResult && confOrder[agentResult.confidence] >= minConfNum;
    });

    // If at least one agent already matches with sufficient confidence,
    // suggest the full combination
    if (matchedAgents.length >= 1) {
      triggered.push({
        rule: rule.name,
        agents: rule.agents,
        matchedAgents,
        description: rule.description
      });
    }
  }

  return triggered;
}

/**
 * Get routing recommendation with combination rules and phase awareness.
 * @param {string} query - The prompt to score
 * @param {Object} [options] - Optional settings
 * @param {string} [options.phase] - Current workflow phase (LEAD, PLAN, EXEC)
 */
function getRecommendation(query, options = {}) {
  const phase = options.phase || null;
  const allScores = scoreAll(query, phase);

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

  // Evaluate combination rules
  const combinations = evaluateCombinations(query, allScores);

  return {
    action,
    agents,
    reason,
    combinations,
    phase: phase || null,
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

  // Combination tests
  console.log('\n=== Combination Rule Tests ===\n');
  let comboPassed = 0;
  const comboTests = [
    { query: 'add rls policy to the users table', expectedRule: 'auth_database', expectedAgents: ['DATABASE', 'SECURITY'] },
    { query: 'refactor the auth module without breaking changes', expectedRule: 'refactor_regression', expectedAgents: ['REGRESSION', 'TESTING'] },
    { query: 'create a new api endpoint for user profiles', expectedRule: 'api_security', expectedAgents: ['API', 'SECURITY'] },
  ];

  for (const tc of comboTests) {
    const result = getRecommendation(tc.query);
    const matchedRule = result.combinations.find(c => c.rule === tc.expectedRule);
    if (matchedRule) {
      comboPassed++;
      console.log(`  PASS "${tc.query.substring(0, 40)}..." -> combo: ${tc.expectedRule} [${matchedRule.agents.join(', ')}]`);
    } else {
      console.log(`  FAIL "${tc.query.substring(0, 40)}..." -> expected combo: ${tc.expectedRule}`);
      console.log(`   Combos found: ${result.combinations.map(c => c.rule).join(', ') || 'none'}`);
    }
  }
  console.log(`\nCombo Results: ${comboPassed}/${comboTests.length} passed`);

  // Phase modifier tests
  console.log('\n=== Phase Modifier Tests ===\n');
  let phasePassed = 0;
  const phaseTests = [
    { query: 'root cause analysis needed', phase: 'LEAD', expectedAgent: 'RCA', expectBoosted: true },
    { query: 'root cause analysis needed', phase: null, expectedAgent: 'RCA', expectBoosted: false },
    { query: 'write unit tests for this module', phase: 'EXEC', expectedAgent: 'TESTING', expectBoosted: true },
  ];

  for (const tc of phaseTests) {
    const result = getRecommendation(tc.query, { phase: tc.phase });
    const agentResult = result.allScores.find(r => r.agent === tc.expectedAgent);
    const isBoosted = agentResult?.phaseBoost > 1;
    if (tc.expectBoosted === !!isBoosted) {
      phasePassed++;
      console.log(`  PASS "${tc.query.substring(0, 30)}..." phase=${tc.phase || 'none'} -> ${tc.expectedAgent} boosted=${isBoosted}`);
    } else {
      console.log(`  FAIL "${tc.query.substring(0, 30)}..." phase=${tc.phase || 'none'} -> expected boosted=${tc.expectBoosted}, got=${isBoosted}`);
    }
  }
  console.log(`\nPhase Results: ${phasePassed}/${phaseTests.length} passed`);
}

// Export for use as module
export {
  scoreAll,
  scoreAgent,
  getRecommendation,
  evaluateCombinations,
  AGENT_KEYWORDS,
  COMBINATION_RULES,
  PHASE_MODIFIERS,
  THRESHOLDS,
  WEIGHTS
};

// Run CLI if executed directly
main();
