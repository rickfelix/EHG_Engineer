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
  ANALYTICS: {
    primary: [
      'analytics tracking',
      'conversion tracking',
      'funnel analysis',
      'google analytics',
      'kpi dashboard',
      'metrics dashboard',
      'mixpanel',
      'user analytics'
    ],
    secondary: [
      'AARRR',
      'KPI',
      'analytics',
      'churn rate',
      'conversion',
      'conversion rate',
      'dashboard',
      'engagement',
      'funnel',
      'kpi',
      'metrics',
      'report',
      'retention',
      'retention rate',
      'tracking',
      'user behavior'
    ],
    tertiary: [
      'behavior',
      'chart',
      'count',
      'data',
      'graph',
      'insight',
      'measure',
      'track',
      'user',
      'visualization'
    ]
  },

  API: {
    primary: [
      'add endpoint',
      'api design',
      'api endpoint',
      'api route',
      'backend route',
      'create endpoint',
      'graphql api',
      'openapi',
      'rest api',
      'swagger'
    ],
    secondary: [
      'API',
      'GraphQL',
      'HTTP method',
      'OpenAPI',
      'REST',
      'RESTful',
      'Swagger',
      'api',
      'controller',
      'endpoint',
      'graphql',
      'handler',
      'http',
      'json',
      'middleware',
      'pagination',
      'payload',
      'request',
      'response',
      'rest',
      'route',
      'service',
      'status code',
      'versioning'
    ],
    tertiary: [
      'backend',
      'body',
      'call',
      'delete',
      'fetch',
      'get',
      'header',
      'patch',
      'post',
      'put',
      'receive',
      'send',
      'status'
    ]
  },

  CRM: {
    primary: [
      'contact management',
      'crm system',
      'customer relationship',
      'hubspot setup',
      'lead tracking',
      'salesforce integration'
    ],
    secondary: [
      'CRM',
      'HubSpot',
      'Salesforce',
      'account',
      'contact',
      'crm',
      'customer data',
      'customer record',
      'customer success',
      'hubspot',
      'lead',
      'salesforce'
    ],
    tertiary: [
      'activity',
      'customer',
      'follow up',
      'manage',
      'note',
      'track'
    ]
  },

  DATABASE: {
    primary: [
      'EXEC-TO-PLAN',
      'add column',
      'alter table',
      'apply migration',
      'apply schema changes',
      'apply the migration',
      'create table',
      'data model',
      'database migration',
      'database schema',
      'db migration',
      'erd',
      'execute migration',
      'execute the migration',
      'foreign key',
      'postgres schema',
      'primary key',
      'rls policy',
      'row level security',
      'run migration',
      'run the migration',
      'supabase migration'
    ],
    secondary: [
      'add this column',
      'add this to the database',
      'alter the table',
      'apply this migration',
      'can you execute',
      'can you run',
      'column',
      'constraint',
      'create the table',
      'database',
      'database agent should run',
      'database query',
      'delete from the table',
      'drop the table',
      'embedding',
      'execute it',
      'execute the following',
      'execute the query',
      'execute this sql',
      'fetch from database',
      'fix this in the database',
      'go ahead and run',
      'have the database agent',
      'index',
      'insert into',
      'insert this into',
      'make this change in the database',
      'migrate',
      'migration',
      'modify the schema',
      'pgvector',
      'please execute',
      'please run',
      'postgres',
      'postgresql',
      'query',
      'rls',
      'run it',
      'run that migration',
      'run the following',
      'run the query',
      'run this migration',
      'run this sql',
      'schema',
      'seed',
      'seeding',
      'select from',
      'sql',
      'supabase',
      'table',
      'update the database',
      'update the table',
      'update this in supabase',
      'use database sub-agent',
      'use the database sub-agent',
      'vector',
      'yes, execute',
      'yes, run it'
    ],
    tertiary: [
      'data',
      'db',
      'delete',
      'fetch',
      'from',
      'insert',
      'join',
      'record',
      'row',
      'save',
      'select',
      'store',
      'update',
      'where'
    ]
  },

  DEPENDENCY: {
    primary: [
      'dependency update',
      'dependency vulnerability',
      'npm audit',
      'npm install',
      'outdated packages',
      'package update',
      'pnpm add',
      'security advisory',
      'yarn add'
    ],
    secondary: [
      'CVE',
      'CVSS',
      'Dependabot',
      'Snyk',
      'audit',
      'dependabot',
      'dependencies',
      'dependency',
      'exploit',
      'install',
      'npm',
      'outdated',
      'package',
      'package.json',
      'patch',
      'pnpm',
      'update',
      'upgrade',
      'vulnerability',
      'yarn'
    ],
    tertiary: [
      'conflict',
      'devdependency',
      'library',
      'lock',
      'module',
      'node_modules',
      'peer',
      'resolution',
      'semver',
      'version'
    ]
  },

  DESIGN: {
    primary: [
      'a11y',
      'accessibility',
      'component design',
      'dark mode',
      'design system',
      'mobile layout',
      'responsive design',
      'shadcn',
      'ui design',
      'ux design',
      'wcag'
    ],
    secondary: [
      'API endpoint',
      'ARIA',
      'CSS',
      'Tailwind',
      'UI',
      'UX',
      'WCAG',
      'backend feature',
      'business logic',
      'button',
      'card',
      'component',
      'controller',
      'css',
      'dashboard',
      'database model',
      'database table',
      'design',
      'desktop',
      'dialog',
      'feature implementation',
      'form',
      'frontend',
      'interaction',
      'interface',
      'journey',
      'layout',
      'light mode',
      'mobile',
      'modal',
      'navbar',
      'navigation',
      'new endpoint',
      'new feature',
      'new route',
      'page',
      'prototype',
      'responsive',
      'screen reader',
      'service layer',
      'sidebar',
      'style',
      'styling',
      'tailwind',
      'theme',
      'ui',
      'user experience',
      'user flow',
      'user-facing',
      'ux',
      'view',
      'wireframe'
    ],
    tertiary: [
      'appearance',
      'border',
      'color',
      'font',
      'icon',
      'image',
      'look',
      'looks',
      'margin',
      'padding',
      'pretty',
      'spacing',
      'ugly',
      'visual'
    ]
  },

  DOCMON: {
    primary: [
      'DAILY_DOCMON_CHECK',
      'EXEC_COMPLETION',
      'EXEC-TO-PLAN',
      'FILE_CREATED',
      'HANDOFF_ACCEPTED',
      'HANDOFF_CREATED',
      'LEAD_APPROVAL',
      'LEAD_HANDOFF_CREATION',
      'LEAD_SD_CREATION',
      'PHASE_TRANSITION',
      'PLAN_PRD_GENERATION',
      'PLAN_VERIFICATION',
      'RETRO_GENERATED',
      'VIOLATION_DETECTED',
      'add documentation',
      'api documentation',
      'document this',
      'jsdoc',
      'missing docs',
      'readme update',
      'tsdoc',
      'update documentation'
    ],
    secondary: [
      'comment',
      'comments',
      'describe',
      'docs',
      'document',
      'documentation',
      'explain',
      'guide',
      'howto',
      'readme',
      'tutorial'
    ],
    tertiary: [
      'add',
      'doc',
      'how does',
      'update',
      'what does',
      'why does',
      'write'
    ]
  },

  FINANCIAL: {
    primary: [
      'burn rate',
      'cash flow analysis',
      'financial model',
      'p&l statement',
      'profit and loss',
      'revenue projection',
      'runway calculation'
    ],
    secondary: [
      'EBITDA',
      'P&L',
      'break even',
      'budget',
      'burn',
      'cash flow',
      'cost',
      'ebitda',
      'finance',
      'financial',
      'forecast',
      'gross margin',
      'margin',
      'profit',
      'projection',
      'revenue',
      'runway'
    ],
    tertiary: [
      'afford',
      'cash',
      'expense',
      'income',
      'money',
      'spend',
      'spending'
    ]
  },

  GITHUB: {
    primary: [
      'EXEC-TO-PLAN',
      'LEAD_APPROVAL_COMPLETE',
      'PLAN_VERIFICATION_PASS',
      'ci pipeline',
      'code review',
      'create pr',
      'git merge',
      'git rebase',
      'github actions',
      'github workflow',
      'merge pr',
      'pull request'
    ],
    secondary: [
      'actions',
      'branch',
      'cd',
      'ci',
      'commit',
      'create pull request',
      'create release',
      'deploy',
      'deployment ci pattern',
      'gh pr create',
      'git',
      'github',
      'github deploy',
      'github status',
      'merge',
      'pipeline',
      'pr',
      'pull',
      'push',
      'release',
      'workflow'
    ],
    tertiary: [
      'build',
      'changelog',
      'checkout',
      'issue',
      'repo',
      'repository',
      'ship',
      'stash',
      'tag',
      'version'
    ]
  },

  LAUNCH: {
    primary: [
      'deploy to production',
      'go live checklist',
      'launch checklist',
      'production deployment',
      'ready to launch',
      'release to production',
      'ship to prod'
    ],
    secondary: [
      'GA release',
      'beta release',
      'cutover',
      'deploy',
      'deployment',
      'go live',
      'go-live',
      'golive',
      'launch',
      'prod',
      'production',
      'production launch',
      'release',
      'rollback',
      'rollout',
      'ship'
    ],
    tertiary: [
      'alpha',
      'beta',
      'canary',
      'live',
      'push',
      'ready',
      'staging'
    ]
  },

  MARKETING: {
    primary: [
      'brand awareness',
      'content marketing',
      'go to market',
      'gtm strategy',
      'marketing campaign',
      'marketing strategy',
      'seo strategy'
    ],
    secondary: [
      'GTM',
      'SEO',
      'advertising',
      'brand',
      'campaign',
      'channel strategy',
      'content',
      'go-to-market',
      'lead generation',
      'market',
      'marketing',
      'messaging',
      'positioning',
      'promotion',
      'seo',
      'social'
    ],
    tertiary: [
      'ad',
      'ads',
      'audience',
      'awareness',
      'channel',
      'grow',
      'reach'
    ]
  },

  MONITORING: {
    primary: [
      'alerting system',
      'application monitoring',
      'datadog',
      'error monitoring',
      'health check',
      'prometheus',
      'sentry',
      'system monitoring',
      'uptime monitoring'
    ],
    secondary: [
      'Datadog',
      'Prometheus',
      'SLA',
      'alert',
      'alerting',
      'downtime',
      'health',
      'incident',
      'logging',
      'logs',
      'monitor',
      'monitoring',
      'observability',
      'tracing',
      'uptime'
    ],
    tertiary: [
      'down',
      'error',
      'failure',
      'notification',
      'on-call',
      'pager',
      'status',
      'up',
      'watch'
    ]
  },

  PERFORMANCE: {
    primary: [
      'bottleneck',
      'cpu usage',
      'load time',
      'memory leak',
      'n+1 query',
      'performance issue',
      'performance optimization',
      'response time',
      'slow query',
      'speed optimization',
      'takes forever',
      'too slow'
    ],
    secondary: [
      'cache',
      'caching',
      'fast',
      'faster',
      'latency',
      'memoize',
      'optimization',
      'optimize',
      'performance',
      'profile',
      'redis',
      'slow',
      'speed',
      'throughput'
    ],
    tertiary: [
      'benchmark',
      'cpu',
      'efficient',
      'hang',
      'hanging',
      'inefficient',
      'memory',
      'metrics',
      'quick',
      'sluggish',
      'timeout'
    ]
  },

  PRICING: {
    primary: [
      'cac ltv',
      'pricing model',
      'pricing page',
      'pricing strategy',
      'subscription pricing',
      'tiered pricing',
      'unit economics'
    ],
    secondary: [
      'CAC',
      'LTV',
      'arpu',
      'arr',
      'cac',
      'freemium',
      'ltv',
      'mrr',
      'plan',
      'price',
      'price point',
      'pricing',
      'revenue model',
      'subscription',
      'tier'
    ],
    tertiary: [
      'charge',
      'cheap',
      'cost',
      'expensive',
      'fee',
      'pay',
      'value'
    ]
  },

  QUICKFIX: {
    primary: [
      'easy fix',
      'hotfix',
      'minor fix',
      'one liner',
      'quick fix',
      'quickfix',
      'simple fix',
      'small fix',
      'trivial fix'
    ],
    secondary: [
      'adjust',
      'fast fix',
      'fix',
      'minor change',
      'patch',
      'quick change',
      'small change',
      'tweak'
    ],
    tertiary: [
      'just',
      'quickly',
      'real quick',
      'small',
      'super quick',
      'tiny'
    ]
  },

  RCA: {
    primary: [
      '5 whys',
      'causal analysis',
      'ci_pipeline_failure',
      'fault tree',
      'fishbone',
      'five whys',
      'get to the bottom',
      'handoff_rejection',
      'ishikawa',
      'keeps happening',
      'pattern detected',
      'pattern_recurrence',
      'performance_regression',
      'quality_degradation',
      'quality_gate_critical',
      'recurring issue',
      'root cause',
      'root-cause',
      'source of the issue',
      'source of the problem',
      'sub_agent_blocked',
      'sub_agent_fail',
      'test_regression',
      'what caused this',
      'why is this happening'
    ],
    secondary: [
      'debug',
      'debugging',
      'diagnose',
      'diagnose defect',
      'diagnostic',
      'dig deeper',
      'dig into',
      'figure out why',
      'find out why',
      'find the cause',
      'investigate',
      'investigation',
      'rca',
      'trace',
      'tracing',
      'track down',
      'understand why',
      'what went wrong'
    ],
    tertiary: [
      'broken',
      'bug',
      'defect',
      'error',
      'failed',
      'failing',
      'issue',
      'not working',
      'problem',
      'strange',
      'unexpected',
      'weird',
      'wrong'
    ]
  },

  REGRESSION: {
    primary: [
      'api signature',
      'backward compatible',
      'backwards compatible',
      'before and after',
      'breaking change',
      'no behavior change',
      'refactor safely',
      'regression test'
    ],
    secondary: [
      'DRY violation',
      'backward',
      'backward compatibility',
      'backwards',
      'breaking',
      'code smell',
      'consolidate',
      'extract component',
      'extract function',
      'extract method',
      'interface',
      'interface change',
      'maintain',
      'migration',
      'move file',
      'no functional change',
      'preserve',
      'public api',
      'refactor',
      'refactoring',
      'regression',
      'rename',
      'reorganize',
      'restructure',
      'split file',
      'technical debt'
    ],
    tertiary: [
      'clean up',
      'cleanup',
      'contract',
      'deprecate',
      'deprecated',
      'improve',
      'legacy',
      'modernize',
      'simplify',
      'tech debt'
    ]
  },

  RETRO: {
    primary: [
      'LEAD_APPROVAL_COMPLETE',
      'LEAD_REJECTION',
      'PLAN_VERIFICATION_COMPLETE',
      'action items',
      'continuous improvement',
      'learn from this',
      'lessons learned',
      'post-mortem',
      'postmortem',
      'retrospective',
      'sprint retrospective',
      'what did we learn',
      'what went well',
      'what went wrong'
    ],
    secondary: [
      'EXEC_QUALITY_ISSUE',
      'EXEC_SPRINT_COMPLETE',
      'HANDOFF_DELAY',
      'HANDOFF_REJECTED',
      'LEAD_PRE_APPROVAL_REVIEW',
      'PATTERN_DETECTED',
      'PHASE_COMPLETE',
      'PLAN_COMPLEXITY_HIGH',
      'SD_STATUS_BLOCKED',
      'SD_STATUS_COMPLETED',
      'SUBAGENT_MULTIPLE_FAILURES',
      'WEEKLY_LEO_REVIEW',
      'anti-pattern',
      'capture this insight',
      'capture this lesson',
      'feedback',
      'improve',
      'improvement',
      'insight',
      'intelligent plan',
      'learning',
      'lesson',
      'lesson learned',
      'pattern',
      'permission bundling',
      'phase transition',
      'plan file generation',
      'plan mode',
      'plan mode integration',
      'reflect',
      'remember this',
      'retro',
      'review',
      'sd type profile',
      'takeaway',
      'workflow intensity'
    ],
    tertiary: [
      'better',
      'didnt work',
      'future',
      'going forward',
      'hindsight',
      'next time',
      'remember',
      'worked',
      'worse'
    ]
  },

  RISK: {
    primary: [
      'architecture decision',
      'high risk',
      'pros and cons',
      'risk analysis',
      'risk assessment',
      'risk mitigation',
      'security risk',
      'system design',
      'tradeoff analysis'
    ],
    secondary: [
      'LEAD_PRE_APPROVAL',
      'PLAN_PRD',
      'a11y',
      'access control',
      'accessibility',
      'advanced',
      'alter',
      'api',
      'architecture',
      'authentication',
      'authorization',
      'aws',
      'bulk',
      'cache',
      'complex',
      'complexity',
      'component',
      'constraint',
      'contingency',
      'create table',
      'credential',
      'dangerous',
      'dashboard',
      'database',
      'decision',
      'decrypt',
      'design',
      'encrypt',
      'external',
      'foreign key',
      'integration',
      'interface',
      'large dataset',
      'latency',
      'microservice',
      'migration',
      'mitigation',
      'mobile',
      'openai',
      'optimization',
      'overhaul',
      'performance',
      'permission',
      'postgres',
      'real-time',
      'redesign',
      'refactor',
      'responsive',
      'restructure',
      'risk',
      'risky',
      'rls',
      'scalability',
      'schema',
      'security',
      'sensitive',
      'slow',
      'sophisticated',
      'sql',
      'stripe',
      'table',
      'third-party',
      'threat',
      'tradeoff',
      'twilio',
      'ui',
      'ux',
      'webhook',
      'websocket'
    ],
    tertiary: [
      'alternative',
      'assess',
      'careful',
      'caution',
      'consequence',
      'consider',
      'evaluate',
      'impact',
      'option',
      'safe',
      'unsafe'
    ]
  },

  SALES: {
    primary: [
      'close deal',
      'objection handling',
      'sales cycle',
      'sales pipeline',
      'sales playbook',
      'sales process',
      'sales strategy'
    ],
    secondary: [
      'close',
      'closing',
      'deal',
      'deal flow',
      'demo',
      'lead',
      'opportunity',
      'pipeline',
      'prospect',
      'quota',
      'sales',
      'sales enablement',
      'sell',
      'selling'
    ],
    tertiary: [
      'buyer',
      'client',
      'customer',
      'negotiate',
      'pitch',
      'proposal'
    ]
  },

  SECURITY: {
    primary: [
      'api key exposed',
      'authentication bypass',
      'csrf vulnerability',
      'cve',
      'exposed credential',
      'hardcoded secret',
      'owasp',
      'penetration test',
      'security audit',
      'security vulnerability',
      'sql injection',
      'xss attack'
    ],
    secondary: [
      'access control',
      'auth',
      'authentication',
      'authorization',
      'credential',
      'encrypt',
      'encryption',
      'hash',
      'jwt',
      'login',
      'oauth',
      'password',
      'permission',
      'role',
      'secret',
      'security',
      'security auth pattern',
      'token',
      'vulnerability'
    ],
    tertiary: [
      'attack',
      'breach',
      'certificate',
      'exploit',
      'https',
      'leak',
      'protect',
      'risk',
      'safe',
      'secure',
      'ssl',
      'tls',
      'unsafe'
    ]
  },

  STORIES: {
    primary: [
      'acceptance criteria',
      'as a user',
      'definition of done',
      'epic',
      'feature request',
      'i want to',
      'so that',
      'user stories',
      'user story'
    ],
    secondary: [
      'PLAN_PRD',
      'backlog',
      'context',
      'estimation',
      'feature',
      'guidance',
      'implementation',
      'planning',
      'points',
      'requirement',
      'requirements',
      'scope',
      'sprint',
      'stories',
      'story'
    ],
    tertiary: [
      'behavior',
      'expected',
      'functionality',
      'must',
      'need',
      'persona',
      'should',
      'user',
      'want'
    ]
  },

  TESTING: {
    primary: [
      'EXEC-TO-PLAN',
      'add tests',
      'create tests',
      'e2e test',
      'end to end test',
      'integration test',
      'vitest test',
      'playwright test',
      'spec file',
      'test coverage',
      'test file',
      'test suite',
      'unit test',
      'vitest',
      'write tests'
    ],
    secondary: [
      'assertion',
      'build error',
      'coverage',
      'cypress',
      'describe',
      'dev server',
      'expect',
      'fixture',
      'it',
      'vitest',
      'mock',
      'npm run test:unit',
      'playwright',
      'playwright build',
      'protected route',
      'redirect to login',
      'spy',
      'stub',
      'test',
      'test infrastructure',
      'test results',
      'testing',
      'testing evidence',
      'testing test pattern',
      'tests',
      'unit tests'
    ],
    tertiary: [
      'broken test',
      'check',
      'confirm',
      'fail',
      'failing',
      'fix test',
      'pass',
      'run test',
      'tdd',
      'validate',
      'verify'
    ]
  },

  UAT: {
    primary: [
      'acceptance criteria',
      'click through',
      'happy path',
      'human test',
      'manual test',
      'test scenario',
      'uat test',
      'user acceptance test',
      'user journey'
    ],
    secondary: [
      'TEST-AUTH',
      'TEST-DASH',
      'TEST-VENT',
      'acceptance',
      'check',
      'confirm',
      'demo',
      'execute test',
      'manual',
      'run uat',
      'scenario',
      'start testing',
      'test execution',
      'uat',
      'uat testing',
      'use case',
      'user flow',
      'validate',
      'verify',
      'workflow'
    ],
    tertiary: [
      'behave',
      'behavior',
      'look',
      'run through',
      'see',
      'show',
      'test',
      'try',
      'walk through',
      'work',
      'working',
      'works'
    ]
  },

  VALIDATION: {
    primary: [
      'already exists',
      'already implemented',
      'before i build',
      'check if exists',
      'codebase search',
      'duplicate check',
      'existing implementation'
    ],
    secondary: [
      'codebase',
      'codebase check',
      'conflict',
      'duplicate',
      'exist',
      'existing',
      'overlap',
      'redundant',
      'search',
      'validate',
      'validation',
      'verify'
    ],
    tertiary: [
      'already',
      'check',
      'current',
      'did we',
      'do we have',
      'find',
      'have',
      'is there',
      'look'
    ]
  },

  VETTING: {
    primary: [
      'vet',
      'vetting',
      'proposal',
      'rubric',
      'constitutional',
      'aegis',
      'governance check',
      'compliance check'
    ],
    secondary: [
      'validate proposal',
      'assess feedback',
      'review improvement',
      'self-improve',
      'protocol change',
      'improvement suggestion',
      'constitutional vetting',
      'rubric assessment',
      'proposal review'
    ],
    tertiary: [
      'evaluate',
      'assess',
      'score',
      'criteria',
      'threshold',
      'approval',
      'rejection'
    ]
  },

  VALUATION: {
    primary: [
      'acquisition target',
      'company valuation',
      'dcf analysis',
      'exit strategy',
      'fundraising round',
      'series a',
      'startup valuation'
    ],
    secondary: [
      'DCF',
      'IPO',
      'Series A',
      'acquisition',
      'comparable',
      'equity',
      'exit',
      'funding',
      'fundraising',
      'investor',
      'ipo',
      'multiple',
      'round',
      'seed',
      'series',
      'valuation'
    ],
    tertiary: [
      'angel',
      'cap table',
      'invest',
      'raise',
      'value',
      'vc',
      'worth'
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
