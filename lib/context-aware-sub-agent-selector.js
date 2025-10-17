/**
 * Context-Aware Sub-Agent Selector
 *
 * Pattern 4 implementation - Intelligently selects relevant sub-agents based on SD content analysis.
 * Reduces false positives through compound keyword matching, context weighting, and exclusion patterns.
 *
 * Part of LEO Protocol Pattern 4 implementation.
 *
 * @module lib/context-aware-sub-agent-selector
 */

/**
 * Domain keyword mappings with false positive handling
 *
 * Structure:
 * - primary: High-confidence keywords (single match sufficient)
 * - secondary: Require compound matches (≥2 keywords)
 * - exclusions: Patterns that negate matches
 * - weight: Context importance (title: 3x, description: 2x, content: 1x)
 */
const DOMAIN_KEYWORDS = {
  DATABASE: {
    code: 'DATABASE',
    name: 'Principal Database Architect',
    primary: [
      'database',
      'postgres',
      'postgresql',
      'supabase',
      'migration',
      'schema',
      'SQL',
      'query',
      'index',
      'foreign key',
      'primary key',
      'constraint',
      'trigger',
      'stored procedure',
      'transaction'
    ],
    secondary: [
      'table',          // Requires compound match (avoid UI data tables)
      'column',
      'row',
      'RLS',            // Requires compound match (could be security)
      'policy',         // Requires compound match (could be security or business)
      'data model',
      'relationship',
      'junction',
      'insert',
      'update',
      'delete',
      'select'
    ],
    exclusions: [
      'HTML table',
      'data table',
      'table component',
      'UI table',
      'display table',
      'grid table',
      'table view',
      'table layout',
      'table styling',
      'CSS table'
    ],
    minMatches: 2,  // Require 2+ keyword matches for confidence
    weight: { title: 3, description: 2, content: 1 }
  },

  SECURITY: {
    code: 'SECURITY',
    name: 'Chief Security Architect',
    primary: [
      'authentication',
      'authorization',
      'auth',
      'security',
      'login',
      'logout',
      'session',
      'token',
      'JWT',
      'OAuth',
      'SSO',
      'password',
      'credential',
      'permission',
      'role',
      'access control',
      'RBAC',
      'encryption',
      'hash',
      'salt',
      'vulnerability',
      'OWASP',
      'XSS',
      'CSRF',
      'SQL injection'
    ],
    secondary: [
      'RLS',            // Row Level Security (compound with database keywords)
      'policy',         // Security policy vs database policy
      'user',           // Requires compound match (could be UI/UX)
      'admin',
      'privileges',
      'audit'
    ],
    exclusions: [
      'security deposit',  // Business context
      'job security',
      'security guard'
    ],
    minMatches: 2,
    weight: { title: 3, description: 2, content: 1 }
  },

  DESIGN: {
    code: 'DESIGN',
    name: 'Senior Design Sub-Agent',
    primary: [
      'UI',
      'UX',
      'design',
      'user experience',
      'user interface',
      'wireframe',
      'mockup',
      'prototype',
      'responsive',
      'mobile',
      'layout',
      'styling',
      'theme',
      'branding',
      'accessibility',
      'a11y',
      'ARIA',
      'screen reader',
      'keyboard navigation',
      'color contrast',
      'responsive design',
      'grid layout',
      'flexbox'
    ],
    secondary: [
      'component',      // Requires compound match (every React file has components)
      'interface',      // Requires compound match (TypeScript interfaces everywhere)
      'button',
      'form',
      'modal',
      'dropdown',
      'menu',
      'navigation',
      'header',
      'footer',
      'sidebar',
      'card',
      'tooltip',
      'icon'
    ],
    exclusions: [
      'TypeScript interface',
      'interface definition',
      'type interface',
      'API interface',
      'interface IProps',
      'interface Props',
      'React component logic',
      'component state',
      'component lifecycle',
      'component props',
      'component testing'
    ],
    minMatches: 2,
    weight: { title: 3, description: 2, content: 1 }
  },

  PERFORMANCE: {
    code: 'PERFORMANCE',
    name: 'Performance Engineering Lead',
    primary: [
      'performance',
      'optimization',
      'optimize',
      'speed',
      'latency',
      'throughput',
      'scalability',
      'scale',
      'scaling',
      'caching',
      'bottleneck',
      'profiling',
      'benchmark',
      'load time',
      'response time',
      'memory usage',
      'CPU usage',
      'indexing',
      'lazy loading',
      'code splitting',
      'bundle size',
      'compression',
      'minification',
      'high traffic',
      'traffic',
      'increased load'
    ],
    secondary: [
      'load',           // Could be data loading
      'cache',
      'fast',
      'slow',
      'timeout',
      'efficient',
      'efficiency'
    ],
    exclusions: [
      'load data',
      'data loading',
      'user load',
      'workload distribution'
    ],
    minMatches: 2,
    weight: { title: 3, description: 2, content: 1 }
  },

  TESTING: {
    code: 'TESTING',
    name: 'QA Engineering Director',
    primary: [
      'testing',
      'test',
      'QA',
      'quality assurance',
      'E2E',
      'end-to-end',
      'unit test',
      'integration test',
      'Playwright',
      'Vitest',
      'Jest',
      'coverage',
      'test suite',
      'test case',
      'assertion',
      'mock',
      'stub',
      'fixture',
      'test automation'
    ],
    secondary: [
      'verify',
      'validate',
      'check',
      'assertion',
      'expect'
    ],
    exclusions: [
      'test environment',  // Could be deployment
      'load test'          // Could be performance
    ],
    minMatches: 1,  // Testing keywords are specific enough
    weight: { title: 3, description: 2, content: 1 }
  },

  VALIDATION: {
    code: 'VALIDATION',
    name: 'Principal Systems Analyst',
    primary: [
      'duplicate',
      'duplicates',
      'existing implementation',
      'existing implementations',
      'already implemented',
      'codebase check',
      'codebase audit',
      'codebase validation',
      'codebase',
      'conflict',
      'validation',
      'validate',
      'duplicate work',
      'reuse',
      'leverage existing',
      'check existing',
      'find existing',
      'search existing',
      'verify existing',
      'search codebase'
    ],
    secondary: [
      'existing',
      'already',
      'similar',
      'same as',
      'like',
      'infrastructure',
      'pattern',
      'implementation',
      'implementations',
      'search',
      'find'
    ],
    exclusions: [],
    minMatches: 1,
    weight: { title: 4, description: 3, content: 2 }  // Higher weights for validation
  },

  DOCMON: {
    code: 'DOCMON',
    name: 'Information Architecture Lead',
    primary: [
      'documentation',
      'docs',
      'README',
      'guide',
      'guides',
      'documentation generation',
      'workflow docs',
      'technical writing',
      'API docs',
      'API documentation',
      'user manual',
      'reference docs',
      'tutorial',
      'instructions',
      'setup guide',
      'developer docs'
    ],
    secondary: [
      'document',
      'explain',
      'describe',
      'how to',
      'walkthrough',
      'example'
    ],
    exclusions: [
      'document upload',      // Feature, not documentation
      'PDF document',
      'document management'
    ],
    minMatches: 1,
    weight: { title: 4, description: 3, content: 2 }  // Higher weights for docmon
  },

  GITHUB: {
    code: 'GITHUB',
    name: 'DevOps Platform Architect',
    primary: [
      'GitHub Actions',
      'CI/CD',
      'pipeline',
      'workflow',
      'deployment',
      'build',
      'actions',
      'pull request',
      'PR',
      'release',
      'continuous integration',
      'continuous deployment'
    ],
    secondary: [
      'github',
      'git',
      'deploy',
      'publish',
      'version'
    ],
    exclusions: [
      'git commit',         // Development, not CI/CD
      'git branch',
      'version control'
    ],
    minMatches: 1,
    weight: { title: 3, description: 2, content: 1 }
  },

  UAT: {
    code: 'UAT',
    name: 'UAT Test Executor',
    primary: [
      'UAT',
      'user acceptance testing',
      'acceptance testing',
      'user journey',
      'acceptance criteria',
      'user story',
      'stakeholder testing'
    ],
    secondary: [
      'acceptance',
      'user test',
      'manual test'
    ],
    exclusions: [],
    minMatches: 1,
    weight: { title: 3, description: 2, content: 1 }
  }
};

/**
 * Domain coordination groups - features that require multiple sub-agents
 *
 * When certain keywords appear together, coordinate multiple specialists
 */
const COORDINATION_GROUPS = {
  'auth_feature': {
    keywords: ['authentication', 'authorization', 'login', 'auth'],
    agents: ['SECURITY', 'DATABASE'],  // Auth requires both security design and database tables
    reason: 'Authentication features require security architecture AND database schema'
  },
  'rls_policy': {
    keywords: ['RLS', 'row level security', 'policy'],
    agents: ['DATABASE', 'SECURITY'],
    reason: 'RLS policies are database features with security implications'
  },
  'api_endpoint': {
    keywords: ['API', 'endpoint', 'REST', 'GraphQL'],
    agents: ['SECURITY', 'DATABASE', 'PERFORMANCE'],
    reason: 'APIs require security validation, database queries, and performance optimization'
  },
  'data_export': {
    keywords: ['export', 'CSV', 'Excel', 'PDF', 'download'],
    agents: ['DATABASE', 'PERFORMANCE'],
    reason: 'Data export requires database optimization and performance tuning'
  },
  'user_management': {
    keywords: ['user management', 'user admin', 'role management'],
    agents: ['SECURITY', 'DATABASE', 'DESIGN'],
    reason: 'User management requires security, database, and UI design'
  }
};

/**
 * Extracts text content from SD for analysis
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Object} - Extracted text with context labels
 */
function extractSDContent(sd) {
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

/**
 * Counts keyword matches in text with exclusion filtering
 *
 * @param {string} text - Text to search
 * @param {Array<string>} keywords - Keywords to match
 * @param {Array<string>} exclusions - Exclusion patterns
 * @returns {Object} - Match details with matched keywords
 */
function countKeywordMatches(text, keywords, exclusions = []) {
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
function calculateDomainScore(content, domain) {
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
function checkCoordinationGroups(content) {
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

/**
 * Main selection function - analyzes SD and recommends sub-agents
 *
 * @param {Object} sd - Strategic directive object
 * @param {Object} options - Selection options
 * @returns {Object} - Recommended sub-agents with confidence scores
 */
function selectSubAgents(sd, options = {}) {
  const {
    confidenceThreshold = 0.4,  // Minimum confidence (0-1) to recommend (40%)
    includeCoordination = true   // Include coordination group recommendations
  } = options;

  const content = extractSDContent(sd);
  const results = [];
  const maxScore = 50;  // Rough estimate of max possible score (for normalization)

  // Analyze each domain
  for (const [domainKey, domain] of Object.entries(DOMAIN_KEYWORDS)) {
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
function formatSelectionResults(selectionResult) {
  const { recommended, coordinationGroups, summary } = selectionResult;

  let output = '🎯 Context-Aware Sub-Agent Selection Results\n\n';
  output += '=' .repeat(70) + '\n\n';

  if (recommended.length === 0) {
    output += '❌ No sub-agents recommended (confidence threshold not met)\n';
    return output;
  }

  output += `📊 Summary: ${summary.totalRecommended} sub-agents recommended\n`;
  output += `   High Confidence (≥75%): ${summary.highConfidence}\n`;
  output += `   Medium Confidence (50-74%): ${summary.mediumConfidence}\n`;
  output += `   Low Confidence (<50%): ${summary.lowConfidence}\n\n`;

  output += '=' .repeat(70) + '\n\n';

  recommended.forEach((agent, index) => {
    const confidenceBar = '█'.repeat(Math.round(agent.confidence / 5));
    output += `${index + 1}. ${agent.code} - ${agent.name}\n`;
    output += `   Confidence: ${agent.confidence}% ${confidenceBar}\n`;
    output += `   Reason: ${agent.reason}\n`;
    if (agent.coordinationGroup) {
      output += `   🔗 Coordination Group: ${agent.coordinationGroup}\n`;
    }
    output += '\n';
  });

  if (coordinationGroups.length > 0) {
    output += '=' .repeat(70) + '\n\n';
    output += '🔗 Coordination Groups Detected:\n\n';
    coordinationGroups.forEach(group => {
      output += `• ${group.groupName}: ${group.agents.join(', ')}\n`;
      output += `  Reason: ${group.reason}\n\n`;
    });
  }

  return output;
}

// Export functions
export {
  DOMAIN_KEYWORDS,
  COORDINATION_GROUPS,
  extractSDContent,
  countKeywordMatches,
  calculateDomainScore,
  checkCoordinationGroups,
  selectSubAgents,
  formatSelectionResults
};

// CLI execution for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  // Example SD for testing
  const testSD = {
    title: process.argv[2] || 'User Authentication System',
    description: process.argv[3] || 'Implement login, logout, and session management with RLS policies',
    business_value: 'Secure user access',
    technical_notes: 'Use Supabase Auth, implement RLS policies on all tables'
  };

  console.log('Testing with SD:');
  console.log(`Title: ${testSD.title}`);
  console.log(`Description: ${testSD.description}\n`);

  const result = selectSubAgents(testSD);
  console.log(formatSelectionResults(result));
}
