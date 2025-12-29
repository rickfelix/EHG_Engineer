/**
 * Context-Aware Sub-Agent Selector
 *
 * Pattern 4 implementation - Intelligently selects relevant sub-agents based on SD content analysis.
 * Reduces false positives through compound keyword matching, context weighting, and exclusion patterns.
 *
 * PHASE 4 ENHANCEMENT: Hybrid semantic + keyword matching
 * - Semantic similarity using OpenAI embeddings (text-embedding-3-small)
 * - Keyword-based confidence scoring
 * - Weighted combination (default: 60% semantic, 40% keyword)
 * - Fallback to keyword-only when embeddings unavailable
 *
 * Part of LEO Protocol Pattern 4 implementation.
 *
 * @module lib/context-aware-sub-agent-selector
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

// Get the directory of this module for relative path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const HYBRID_CONFIG = {
  // Weights for hybrid matching (must sum to 1.0)
  semanticWeight: 0.6,   // 60% weight to semantic similarity
  keywordWeight: 0.4,    // 40% weight to keyword matching

  // Thresholds
  semanticThreshold: 0.7,     // Minimum semantic similarity (0-1)
  combinedThreshold: 0.6,     // Minimum combined score (0-1)

  // Fallback behavior
  useKeywordFallback: true,   // Fall back to keyword-only if embeddings fail

  // Model configuration
  embeddingModel: 'text-embedding-3-small',  // OpenAI model
  embeddingDimensions: 1536                  // Embedding dimensions
};

// Initialize clients (lazy loaded)
let supabaseClient = null;
let openaiClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
}

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Load domain keywords from external JSON configuration
 * Extracted to config/domain-keywords.json for maintainability
 */
let _domainKeywordsCache = null;
let _coordinationGroupsCache = null;

function loadDomainKeywords() {
  if (_domainKeywordsCache) return _domainKeywordsCache;

  try {
    const configPath = join(__dirname, '..', 'config', 'domain-keywords.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    _domainKeywordsCache = configData.domains;
    _coordinationGroupsCache = configData.coordinationGroups;
    return _domainKeywordsCache;
  } catch (error) {
    console.error('[DOMAIN_KEYWORDS] Failed to load config, using fallback:', error.message);
    // Return a minimal fallback for critical functionality
    return {
      DATABASE: {
        code: 'DATABASE',
        name: 'Principal Database Architect',
        primary: ['database', 'postgres', 'supabase', 'migration', 'schema'],
        secondary: ['table', 'column', 'query'],
        exclusions: [],
        minMatches: 2,
        weight: { title: 3, description: 2, content: 1 }
      }
    };
  }
}

function loadCoordinationGroups() {
  if (_coordinationGroupsCache) return _coordinationGroupsCache;

  // Trigger loading if not already done
  loadDomainKeywords();
  return _coordinationGroupsCache || {};
}

// Lazy-loaded domain keywords (backwards compatible)
const DOMAIN_KEYWORDS = new Proxy({}, {
  get: (target, prop) => loadDomainKeywords()[prop],
  ownKeys: () => Object.keys(loadDomainKeywords()),
  getOwnPropertyDescriptor: (target, prop) => {
    const keywords = loadDomainKeywords();
    if (prop in keywords) {
      return { enumerable: true, configurable: true, value: keywords[prop] };
    }
    return undefined;
  },
  has: (target, prop) => prop in loadDomainKeywords()
});

// Backwards compatibility - original inline definition removed
// See config/domain-keywords.json for the full configuration
// Original structure preserved for reference:
/*
const DOMAIN_KEYWORDS_ORIGINAL = {
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
  },

  API: {
    code: 'API',
    name: 'API Architecture Sub-Agent',
    primary: [
      'API',
      'REST',
      'RESTful',
      'GraphQL',
      'endpoint',
      'route',
      'controller',
      'middleware',
      'API design',
      'API architecture',
      'OpenAPI',
      'Swagger',
      'API versioning',
      'API documentation'
    ],
    secondary: [
      'request',
      'response',
      'payload',
      'status code',
      'HTTP method',
      'query parameter',
      'path parameter',
      'pagination',
      'rate limiting'
    ],
    exclusions: [
      'API key',          // Could be security context
      'third-party API'   // Could be integration, not designing APIs
    ],
    minMatches: 2,
    weight: { title: 3, description: 2, content: 1 }
  },

  DEPENDENCY: {
    code: 'DEPENDENCY',
    name: 'Dependency Management Sub-Agent',
    primary: [
      'dependency',
      'dependencies',
      'npm',
      'yarn',
      'pnpm',
      'package.json',
      'vulnerability',
      'CVE',
      'security advisory',
      'outdated',
      'deprecated',
      'npm audit',
      'Snyk',
      'Dependabot'
    ],
    secondary: [
      'package',
      'install',
      'update',
      'upgrade',
      'version',
      'semver',
      'node_modules',
      'patch',
      'CVSS',
      'exploit'
    ],
    exclusions: [
      'package delivery',    // Business context
      'software package',    // Generic term
      'update user'          // Not dependency update
    ],
    minMatches: 2,
    weight: { title: 3, description: 2, content: 1 }
  }
};
*/

// Coordination groups now loaded from config/domain-keywords.json
// See loadCoordinationGroups() function above
const COORDINATION_GROUPS = new Proxy({}, {
  get: (target, prop) => loadCoordinationGroups()[prop],
  ownKeys: () => Object.keys(loadCoordinationGroups()),
  getOwnPropertyDescriptor: (target, prop) => {
    const groups = loadCoordinationGroups();
    if (prop in groups) {
      return { enumerable: true, configurable: true, value: groups[prop] };
    }
    return undefined;
  },
  has: (target, prop) => prop in loadCoordinationGroups()
});

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

// ============================================================================
// PHASE 4: Hybrid Semantic + Keyword Selection
// ============================================================================

/**
 * Generates OpenAI embedding for SD content
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Promise<Array<number>>} - Embedding vector (1536 dimensions)
 */
async function generateSDEmbedding(sd) {
  try {
    const openai = getOpenAIClient();

    // Combine SD content into a single text for embedding
    const content = extractSDContent(sd);
    const text = [
      `Title: ${content.title}`,
      `Description: ${content.description}`,
      content.business_value && `Business Value: ${content.business_value}`,
      content.technical_notes && `Technical Notes: ${content.technical_notes}`
    ].filter(Boolean).join('\n\n');

    // Generate embedding
    const response = await openai.embeddings.create({
      model: HYBRID_CONFIG.embeddingModel,
      input: text
    });

    return response.data[0].embedding;

  } catch (error) {
    console.error('❌ Failed to generate SD embedding:', error.message);
    return null;
  }
}

/**
 * Fetches semantic matches from database using embeddings
 *
 * @param {Array<number>} queryEmbedding - SD embedding vector
 * @param {Object} options - Query options
 * @returns {Promise<Array<Object>>} - Semantically similar sub-agents
 */
async function fetchSemanticMatches(queryEmbedding, options = {}) {
  const {
    matchThreshold = HYBRID_CONFIG.semanticThreshold,
    matchCount = 10
  } = options;

  try {
    const supabase = getSupabaseClient();

    // Call the semantic matching function from database
    const { data, error } = await supabase.rpc('match_sub_agents_semantic', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error('❌ Failed to fetch semantic matches:', error.message);
    return [];
  }
}

/**
 * Builds keyword match counts for hybrid matching
 *
 * @param {Object} sd - Strategic directive object
 * @returns {Object} - Map of sub_agent_code -> keyword_match_count
 */
function buildKeywordMatchCounts(sd) {
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

/**
 * Hybrid selection: Combines semantic similarity with keyword matching
 *
 * @param {Object} sd - Strategic directive object
 * @param {Object} options - Selection options
 * @returns {Promise<Object>} - Recommended sub-agents with hybrid scores
 */
async function selectSubAgentsHybrid(sd, options = {}) {
  const {
    semanticWeight = HYBRID_CONFIG.semanticWeight,
    keywordWeight = HYBRID_CONFIG.keywordWeight,
    combinedThreshold = HYBRID_CONFIG.combinedThreshold,
    useKeywordFallback = HYBRID_CONFIG.useKeywordFallback,
    matchCount = 10
  } = options;

  // Step 1: Generate embedding for SD
  const queryEmbedding = await generateSDEmbedding(sd);

  // Step 2: If embeddings failed and fallback enabled, use keyword-only
  if (!queryEmbedding && useKeywordFallback) {
    console.warn('⚠️  Embeddings unavailable, falling back to keyword-only matching');
    return selectSubAgents(sd, { confidenceThreshold: combinedThreshold });
  }

  if (!queryEmbedding) {
    throw new Error('Failed to generate SD embedding and fallback disabled');
  }

  // Step 3: Build keyword match counts
  const keywordMatchCounts = buildKeywordMatchCounts(sd);

  // Step 4: Call hybrid matching function from database
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('match_sub_agents_hybrid', {
      query_embedding: queryEmbedding,
      keyword_matches: keywordMatchCounts,
      semantic_weight: semanticWeight,
      keyword_weight: keywordWeight,
      match_threshold: combinedThreshold,
      match_count: matchCount
    });

    if (error) {
      throw new Error(`Hybrid matching failed: ${error.message}`);
    }

    // Step 5: Format results
    const results = (data || []).map(agent => ({
      code: agent.code,
      name: agent.name,
      confidence: Math.round(agent.combined_score * 100),  // Convert to percentage
      semanticScore: Math.round(agent.semantic_score * 100),
      keywordScore: Math.round(agent.keyword_score * 100),
      keywordMatches: agent.keyword_match_count,
      priority: agent.priority,
      reason: `Hybrid match: ${Math.round(agent.semantic_score * 100)}% semantic + ${Math.round(agent.keyword_score * 100)}% keyword (${agent.keyword_match_count} keywords)`
    }));

    // Step 6: Check coordination groups (reuse existing logic)
    const content = extractSDContent(sd);
    const coordinationGroups = checkCoordinationGroups(content);
    const triggeredGroups = [];

    for (const group of coordinationGroups) {
      if (group.keywordMatches >= 2) {
        triggeredGroups.push(group);

        for (const agentCode of group.agents) {
          if (!results.some(r => r.code === agentCode)) {
            const domain = DOMAIN_KEYWORDS[agentCode];
            if (domain) {
              results.push({
                code: agentCode,
                name: domain.name,
                confidence: 60,
                semanticScore: 0,
                keywordScore: 0,
                keywordMatches: 0,
                priority: 0,
                reason: `Coordination required: ${group.reason}`,
                coordinationGroup: group.groupName
              });
            }
          }
        }
      }
    }

    // Sort by combined confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    return {
      recommended: results,
      coordinationGroups: triggeredGroups,
      matchingStrategy: 'hybrid',
      summary: {
        totalRecommended: results.length,
        highConfidence: results.filter(r => r.confidence >= 75).length,
        mediumConfidence: results.filter(r => r.confidence >= 50 && r.confidence < 75).length,
        lowConfidence: results.filter(r => r.confidence < 50).length,
        semanticWeight,
        keywordWeight
      }
    };

  } catch (error) {
    console.error('❌ Hybrid matching error:', error.message);

    // Fallback to keyword-only if enabled
    if (useKeywordFallback) {
      console.warn('⚠️  Falling back to keyword-only matching');
      return selectSubAgents(sd, { confidenceThreshold: combinedThreshold });
    }

    throw error;
  }
}

/**
 * Formats hybrid selection results for display
 *
 * @param {Object} selectionResult - Result from selectSubAgentsHybrid()
 * @returns {string} - Formatted output
 */
function formatHybridSelectionResults(selectionResult) {
  const { recommended, coordinationGroups, summary, matchingStrategy } = selectionResult;

  let output = '🎯 Hybrid Sub-Agent Selection Results (Semantic + Keyword)\n\n';
  output += '=' .repeat(70) + '\n\n';

  if (recommended.length === 0) {
    output += '❌ No sub-agents recommended (confidence threshold not met)\n';
    return output;
  }

  output += `🧠 Matching Strategy: ${matchingStrategy || 'hybrid'}\n`;
  output += `📊 Weights: ${Math.round((summary.semanticWeight || 0.6) * 100)}% semantic, ${Math.round((summary.keywordWeight || 0.4) * 100)}% keyword\n\n`;
  output += `📊 Summary: ${summary.totalRecommended} sub-agents recommended\n`;
  output += `   High Confidence (≥75%): ${summary.highConfidence}\n`;
  output += `   Medium Confidence (50-74%): ${summary.mediumConfidence}\n`;
  output += `   Low Confidence (<50%): ${summary.lowConfidence}\n\n`;

  output += '=' .repeat(70) + '\n\n';

  recommended.forEach((agent, index) => {
    const confidenceBar = '█'.repeat(Math.round(agent.confidence / 5));
    output += `${index + 1}. ${agent.code} - ${agent.name}\n`;
    output += `   Combined: ${agent.confidence}% ${confidenceBar}\n`;

    if (agent.semanticScore !== undefined && agent.keywordScore !== undefined) {
      output += `   └─ Semantic: ${agent.semanticScore}% | Keyword: ${agent.keywordScore}% (${agent.keywordMatches} matches)\n`;
    }

    output += `   Reason: ${agent.reason}\n`;

    if (agent.coordinationGroup) {
      output += `   🔗 Coordination Group: ${agent.coordinationGroup}\n`;
    }
    output += '\n';
  });

  if (coordinationGroups && coordinationGroups.length > 0) {
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
  HYBRID_CONFIG,
  extractSDContent,
  countKeywordMatches,
  calculateDomainScore,
  checkCoordinationGroups,
  selectSubAgents,
  formatSelectionResults,
  // Phase 4: Hybrid matching
  generateSDEmbedding,
  fetchSemanticMatches,
  buildKeywordMatchCounts,
  selectSubAgentsHybrid,
  formatHybridSelectionResults
};

// CLI execution for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const useHybrid = process.argv.includes('--hybrid');

  // Example SD for testing
  const testSD = {
    title: process.argv[2] || 'User Authentication System',
    description: process.argv[3] || 'Implement login, logout, and session management with RLS policies',
    business_value: 'Secure user access',
    technical_notes: 'Use Supabase Auth, implement RLS policies on all tables'
  };

  console.log('Testing with SD:');
  console.log(`Title: ${testSD.title}`);
  console.log(`Description: ${testSD.description}`);
  console.log(`Mode: ${useHybrid ? 'HYBRID (semantic + keyword)' : 'KEYWORD-ONLY'}\n`);

  if (useHybrid) {
    // Test hybrid mode
    selectSubAgentsHybrid(testSD)
      .then(result => {
        console.log(formatHybridSelectionResults(result));
      })
      .catch(error => {
        console.error('❌ Hybrid selection failed:', error.message);
        process.exit(1);
      });
  } else {
    // Test keyword-only mode
    const result = selectSubAgents(testSD);
    console.log(formatSelectionResults(result));
  }
}
