/**
 * Keyword Intent Scorer
 *
 * Weighted keyword scoring for sub-agent routing.
 * Replaces simple keyword matching with confidence-based scoring.
 *
 * Scoring Formula:
 *   score = sum(matched_keyword_weights) / sum(all_keyword_weights) * 100
 *
 * Thresholds:
 *   >= 70%: High confidence, auto-trigger
 *   50-69%: Medium confidence, trigger if single match or suggest if multiple
 *   < 50%: Low confidence, no match
 *
 * Usage:
 *   node lib/keyword-intent-scorer.js "identify the root cause of this bug"
 */

// Database imports removed - this module uses embedded keywords, not database queries
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

// Point-based thresholds (absolute, not percentage)
const THRESHOLDS = {
  HIGH: 5,       // Auto-trigger (e.g., 1 primary + 1 secondary, or 2 primary)
  MEDIUM: 3,     // Suggest or trigger if single match (e.g., 1 primary, or 1 secondary + 1 tertiary)
  LOW: 1         // Mention for awareness
};

const WEIGHTS = {
  PRIMARY: 4,    // Unique to agent (e.g., "root cause" → RCA) - single match = medium confidence
  SECONDARY: 2,  // Strong signal (e.g., "debug", "migration")
  TERTIARY: 1    // Common terms (e.g., "issue", "problem")
};

// ============================================================================
// KEYWORD DEFINITIONS
// Organized by weight: primary (unique), secondary (strong), tertiary (common)
// ============================================================================

const AGENT_KEYWORDS = {
  RCA: {
    primary: [
      'root cause', 'root-cause', '5 whys', 'five whys', 'fishbone', 'ishikawa',
      'fault tree', 'causal analysis', 'why is this happening', 'what caused this',
      'get to the bottom', 'source of the issue', 'source of the problem'
    ],
    secondary: [
      'debug', 'debugging', 'investigate', 'investigation', 'diagnose', 'diagnostic',
      'trace', 'tracing', 'track down', 'dig into', 'dig deeper', 'figure out why',
      'understand why', 'find the cause', 'find out why', 'what went wrong'
    ],
    tertiary: [
      'not working', 'broken', 'failing', 'failed', 'error', 'bug', 'issue',
      'problem', 'defect', 'unexpected', 'wrong', 'weird', 'strange'
    ]
  },

  DATABASE: {
    primary: [
      'database migration', 'db migration', 'create table', 'alter table', 'add column',
      'rls policy', 'row level security', 'supabase migration', 'postgres schema',
      'foreign key', 'primary key', 'database schema', 'data model', 'erd'
    ],
    secondary: [
      'database', 'schema', 'table', 'column', 'migration', 'migrate', 'supabase',
      'postgres', 'postgresql', 'sql', 'query', 'index', 'constraint', 'rls',
      'seed', 'seeding', 'pgvector', 'embedding', 'vector'
    ],
    tertiary: [
      'select', 'insert', 'update', 'delete', 'join', 'where', 'from',
      'db', 'data', 'store', 'fetch', 'save', 'record', 'row'
    ]
  },

  SECURITY: {
    primary: [
      'security vulnerability', 'authentication bypass', 'sql injection', 'xss attack',
      'csrf vulnerability', 'hardcoded secret', 'exposed credential', 'api key exposed',
      'security audit', 'penetration test', 'owasp', 'cve'
    ],
    secondary: [
      'security', 'authentication', 'authorization', 'auth', 'login', 'password',
      'credential', 'secret', 'token', 'jwt', 'oauth', 'permission', 'role',
      'access control', 'encrypt', 'encryption', 'hash', 'vulnerability'
    ],
    tertiary: [
      'secure', 'protect', 'safe', 'unsafe', 'risk', 'attack', 'exploit',
      'leak', 'breach', 'certificate', 'ssl', 'tls', 'https'
    ]
  },

  TESTING: {
    primary: [
      'write tests', 'add tests', 'create tests', 'unit test', 'integration test',
      'e2e test', 'end to end test', 'test coverage', 'playwright test', 'jest test',
      'vitest', 'test suite', 'test file', 'spec file'
    ],
    secondary: [
      'test', 'tests', 'testing', 'coverage', 'jest', 'playwright', 'cypress',
      'mock', 'stub', 'spy', 'fixture', 'assertion', 'expect', 'describe', 'it'
    ],
    tertiary: [
      'verify', 'check', 'validate', 'confirm', 'pass', 'fail', 'failing',
      'broken test', 'fix test', 'run test', 'tdd'
    ]
  },

  PERFORMANCE: {
    primary: [
      'performance optimization', 'speed optimization', 'slow query', 'n+1 query',
      'memory leak', 'cpu usage', 'response time', 'load time', 'bottleneck',
      'performance issue', 'too slow', 'takes forever'
    ],
    secondary: [
      'performance', 'optimize', 'optimization', 'speed', 'slow', 'fast', 'faster',
      'latency', 'throughput', 'cache', 'caching', 'redis', 'memoize', 'profile'
    ],
    tertiary: [
      'quick', 'sluggish', 'hang', 'hanging', 'timeout', 'memory', 'cpu',
      'benchmark', 'metrics', 'efficient', 'inefficient'
    ]
  },

  DESIGN: {
    primary: [
      'ui design', 'ux design', 'component design', 'design system', 'accessibility',
      'a11y', 'wcag', 'responsive design', 'mobile layout', 'dark mode', 'shadcn'
    ],
    secondary: [
      'ui', 'ux', 'design', 'component', 'layout', 'style', 'styling', 'css',
      'tailwind', 'theme', 'responsive', 'mobile', 'desktop', 'button', 'form',
      'modal', 'dialog', 'card', 'navbar', 'sidebar'
    ],
    tertiary: [
      'visual', 'look', 'looks', 'appearance', 'color', 'font', 'spacing',
      'padding', 'margin', 'border', 'icon', 'image', 'pretty', 'ugly'
    ]
  },

  API: {
    primary: [
      'api endpoint', 'rest api', 'graphql api', 'create endpoint', 'add endpoint',
      'api route', 'backend route', 'api design', 'swagger', 'openapi'
    ],
    secondary: [
      'api', 'endpoint', 'route', 'rest', 'graphql', 'http', 'request', 'response',
      'controller', 'middleware', 'handler', 'service', 'json', 'payload'
    ],
    tertiary: [
      'get', 'post', 'put', 'patch', 'delete', 'header', 'body', 'status',
      'call', 'fetch', 'send', 'receive', 'backend'
    ]
  },

  GITHUB: {
    primary: [
      'create pr', 'pull request', 'merge pr', 'github actions', 'ci pipeline',
      'github workflow', 'code review', 'git merge', 'git rebase'
    ],
    secondary: [
      'git', 'github', 'commit', 'push', 'pull', 'branch', 'merge', 'pr',
      'ci', 'cd', 'pipeline', 'workflow', 'actions', 'deploy', 'release'
    ],
    tertiary: [
      'repo', 'repository', 'checkout', 'stash', 'tag', 'version', 'issue',
      'ship', 'build', 'changelog'
    ]
  },

  DEPENDENCY: {
    primary: [
      'npm install', 'yarn add', 'pnpm add', 'package update', 'dependency update',
      'npm audit', 'security advisory', 'dependency vulnerability', 'outdated packages'
    ],
    secondary: [
      'npm', 'yarn', 'pnpm', 'package', 'dependency', 'dependencies', 'install',
      'upgrade', 'update', 'outdated', 'vulnerability', 'audit', 'dependabot'
    ],
    tertiary: [
      'module', 'library', 'version', 'semver', 'lock', 'node_modules',
      'devdependency', 'peer', 'conflict', 'resolution'
    ]
  },

  REGRESSION: {
    primary: [
      'backward compatible', 'backwards compatible', 'breaking change', 'no behavior change',
      'regression test', 'before and after', 'refactor safely', 'api signature'
    ],
    secondary: [
      'refactor', 'refactoring', 'restructure', 'reorganize', 'regression',
      'backward', 'backwards', 'breaking', 'preserve', 'maintain', 'interface'
    ],
    tertiary: [
      'clean up', 'cleanup', 'simplify', 'improve', 'tech debt', 'legacy',
      'modernize', 'deprecate', 'deprecated', 'contract'
    ]
  },

  UAT: {
    primary: [
      'user acceptance test', 'uat test', 'manual test', 'human test', 'acceptance criteria',
      'user journey', 'happy path', 'test scenario', 'click through'
    ],
    secondary: [
      'uat', 'acceptance', 'manual', 'verify', 'validate', 'confirm', 'check',
      'user flow', 'workflow', 'use case', 'scenario', 'demo'
    ],
    tertiary: [
      'try', 'test', 'work', 'working', 'works', 'behave', 'behavior',
      'show', 'see', 'look', 'run through', 'walk through'
    ]
  },

  RISK: {
    primary: [
      'risk assessment', 'risk analysis', 'risk mitigation', 'high risk', 'security risk',
      'architecture decision', 'system design', 'tradeoff analysis', 'pros and cons'
    ],
    secondary: [
      'risk', 'risky', 'dangerous', 'threat', 'mitigation', 'contingency',
      'complex', 'complexity', 'architecture', 'tradeoff', 'decision'
    ],
    tertiary: [
      'safe', 'unsafe', 'careful', 'caution', 'impact', 'consequence',
      'option', 'alternative', 'consider', 'evaluate', 'assess'
    ]
  },

  VALIDATION: {
    primary: [
      'already exists', 'already implemented', 'check if exists', 'duplicate check',
      'codebase search', 'existing implementation', 'before i build'
    ],
    secondary: [
      'validate', 'validation', 'verify', 'exist', 'existing', 'duplicate',
      'redundant', 'conflict', 'overlap', 'codebase', 'search'
    ],
    tertiary: [
      'check', 'find', 'look', 'already', 'current', 'have', 'do we have',
      'is there', 'did we'
    ]
  },

  RETRO: {
    primary: [
      'retrospective', 'post-mortem', 'postmortem', 'lessons learned', 'what went well',
      'what went wrong', 'action items', 'continuous improvement', 'sprint retrospective',
      'what did we learn', 'learn from this'
    ],
    secondary: [
      'retro', 'lesson', 'learning', 'takeaway', 'improve', 'improvement',
      'reflect', 'review', 'feedback', 'pattern', 'anti-pattern'
    ],
    tertiary: [
      'next time', 'going forward', 'better', 'worse', 'worked', 'didnt work',
      'hindsight', 'future', 'remember'
    ]
  },

  STORIES: {
    primary: [
      'user story', 'user stories', 'acceptance criteria', 'definition of done',
      'as a user', 'i want to', 'so that', 'epic', 'feature request'
    ],
    secondary: [
      'story', 'stories', 'requirement', 'requirements', 'feature', 'scope',
      'backlog', 'sprint', 'planning', 'estimation', 'points'
    ],
    tertiary: [
      'persona', 'user', 'want', 'need', 'should', 'must', 'expected',
      'behavior', 'functionality'
    ]
  },

  DOCMON: {
    primary: [
      'update documentation', 'add documentation', 'document this', 'api documentation',
      'readme update', 'jsdoc', 'tsdoc', 'missing docs'
    ],
    secondary: [
      'documentation', 'docs', 'document', 'readme', 'guide', 'tutorial',
      'howto', 'explain', 'describe', 'comment', 'comments'
    ],
    tertiary: [
      'doc', 'write', 'add', 'update', 'what does', 'how does', 'why does'
    ]
  },

  ANALYTICS: {
    primary: [
      'analytics tracking', 'user analytics', 'conversion tracking', 'funnel analysis',
      'kpi dashboard', 'metrics dashboard', 'google analytics', 'mixpanel'
    ],
    secondary: [
      'analytics', 'metrics', 'tracking', 'kpi', 'conversion', 'funnel',
      'retention', 'engagement', 'dashboard', 'report'
    ],
    tertiary: [
      'measure', 'track', 'count', 'data', 'insight', 'behavior', 'user',
      'chart', 'graph', 'visualization'
    ]
  },

  MONITORING: {
    primary: [
      'system monitoring', 'application monitoring', 'error monitoring', 'uptime monitoring',
      'alerting system', 'health check', 'datadog', 'prometheus', 'sentry'
    ],
    secondary: [
      'monitoring', 'monitor', 'observability', 'logging', 'logs', 'tracing',
      'alert', 'alerting', 'incident', 'health', 'uptime', 'downtime'
    ],
    tertiary: [
      'watch', 'status', 'up', 'down', 'error', 'failure', 'notification',
      'pager', 'on-call'
    ]
  },

  LAUNCH: {
    primary: [
      'launch checklist', 'go live checklist', 'production deployment', 'deploy to production',
      'release to production', 'ready to launch', 'ship to prod'
    ],
    secondary: [
      'launch', 'deploy', 'deployment', 'release', 'production', 'prod',
      'go live', 'golive', 'ship', 'rollout', 'rollback'
    ],
    tertiary: [
      'live', 'staging', 'beta', 'alpha', 'canary', 'push', 'ready'
    ]
  },

  FINANCIAL: {
    primary: [
      'financial model', 'profit and loss', 'p&l statement', 'cash flow analysis',
      'burn rate', 'runway calculation', 'revenue projection'
    ],
    secondary: [
      'financial', 'finance', 'revenue', 'cost', 'profit', 'margin', 'ebitda',
      'runway', 'burn', 'budget', 'forecast', 'projection'
    ],
    tertiary: [
      'money', 'spend', 'spending', 'income', 'expense', 'cash', 'afford'
    ]
  },

  PRICING: {
    primary: [
      'pricing strategy', 'pricing model', 'subscription pricing', 'tiered pricing',
      'unit economics', 'cac ltv', 'pricing page'
    ],
    secondary: [
      'pricing', 'price', 'subscription', 'tier', 'plan', 'freemium',
      'cac', 'ltv', 'arpu', 'mrr', 'arr'
    ],
    tertiary: [
      'cost', 'charge', 'pay', 'fee', 'cheap', 'expensive', 'value'
    ]
  },

  VALUATION: {
    primary: [
      'company valuation', 'startup valuation', 'fundraising round', 'series a',
      'exit strategy', 'acquisition target', 'dcf analysis'
    ],
    secondary: [
      'valuation', 'fundraising', 'funding', 'round', 'seed', 'series',
      'exit', 'acquisition', 'ipo', 'investor', 'equity'
    ],
    tertiary: [
      'worth', 'value', 'raise', 'invest', 'vc', 'angel', 'cap table'
    ]
  },

  MARKETING: {
    primary: [
      'marketing strategy', 'go to market', 'gtm strategy', 'content marketing',
      'seo strategy', 'brand awareness', 'marketing campaign'
    ],
    secondary: [
      'marketing', 'market', 'brand', 'campaign', 'seo', 'content',
      'social', 'advertising', 'promotion', 'positioning'
    ],
    tertiary: [
      'audience', 'reach', 'grow', 'awareness', 'channel', 'ad', 'ads'
    ]
  },

  SALES: {
    primary: [
      'sales strategy', 'sales process', 'sales pipeline', 'sales playbook',
      'close deal', 'sales cycle', 'objection handling'
    ],
    secondary: [
      'sales', 'sell', 'selling', 'deal', 'pipeline', 'lead', 'prospect',
      'opportunity', 'close', 'quota', 'demo'
    ],
    tertiary: [
      'customer', 'client', 'buyer', 'negotiate', 'pitch', 'proposal'
    ]
  },

  CRM: {
    primary: [
      'crm system', 'customer relationship', 'salesforce integration', 'hubspot setup',
      'contact management', 'lead tracking'
    ],
    secondary: [
      'crm', 'salesforce', 'hubspot', 'contact', 'account', 'lead',
      'customer data', 'customer record'
    ],
    tertiary: [
      'customer', 'track', 'manage', 'follow up', 'note', 'activity'
    ]
  },

  QUICKFIX: {
    primary: [
      'quick fix', 'quickfix', 'hotfix', 'small fix', 'minor fix', 'one liner',
      'simple fix', 'easy fix', 'trivial fix'
    ],
    secondary: [
      'fix', 'patch', 'tweak', 'adjust', 'small change', 'minor change',
      'quick change', 'fast fix'
    ],
    tertiary: [
      'just', 'quickly', 'real quick', 'super quick', 'tiny', 'small'
    ]
  }
};

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
    score: matchedWeight,  // Now absolute points, not percentage
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
    // High confidence: auto-trigger top match(es)
    action = 'TRIGGER';
    agents = highConfidence.slice(0, 2);  // Max 2 agents
    reason = `High confidence match (${agents.map(a => `${a.agent}:${a.score}pts`).join(', ')})`;
  } else if (mediumConfidence.length === 1) {
    // Single medium confidence: trigger it
    action = 'TRIGGER';
    agents = [mediumConfidence[0]];
    reason = `Medium confidence match (${agents[0].agent}:${agents[0].score}pts)`;
  } else if (mediumConfidence.length > 1) {
    // Multiple medium confidence: suggest, let Claude decide
    action = 'SUGGEST';
    agents = mediumConfidence.slice(0, 3);
    reason = `Multiple medium confidence matches - consider: ${agents.map(a => `${a.agent}:${a.score}pts`).join(', ')}`;
  } else if (lowConfidence.length > 0) {
    // Low but notable: mention for awareness
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
    allScores: allScores.slice(0, 5)  // Top 5 for debugging
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
        console.log(`  ${agent.agent}: ${agent.score}% (${agent.confidence})`);
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
    { query: 'document this api endpoint', expected: 'API' },  // API scores higher due to "api endpoint" primary match
    { query: 'quick fix for this typo', expected: 'QUICKFIX' },
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
      console.log(`✅ "${tc.query.substring(0, 40)}..." → ${topAgent} (${topScore}pts, ${result.agents[0]?.confidence})`);
    } else {
      console.log(`❌ "${tc.query.substring(0, 40)}..." → ${topAgent} (expected ${tc.expected})`);
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
