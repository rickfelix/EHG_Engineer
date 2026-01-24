/**
 * Update leo_sub_agents with weighted trigger keywords
 *
 * This script stores the keyword structure in the database
 * so CLAUDE.md can be generated from database sources.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Weighted keyword definitions for all agents
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
  }
};

async function updateAgentKeywords() {
  console.log('Updating leo_sub_agents with weighted trigger keywords...\n');

  let updated = 0;
  let errors = 0;

  for (const [agentCode, keywords] of Object.entries(AGENT_KEYWORDS)) {
    // Get current metadata
    const { data: agent, error: fetchError } = await supabase
      .from('leo_sub_agents')
      .select('metadata')
      .eq('code', agentCode)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        console.log(`⚠️  ${agentCode}: Agent not found in database, skipping`);
      } else {
        console.log(`❌ ${agentCode}: Fetch error - ${fetchError.message}`);
        errors++;
      }
      continue;
    }

    // Merge trigger_keywords into existing metadata
    const updatedMetadata = {
      ...agent.metadata,
      trigger_keywords: keywords
    };

    // Update the agent
    const { error: updateError } = await supabase
      .from('leo_sub_agents')
      .update({ metadata: updatedMetadata })
      .eq('code', agentCode);

    if (updateError) {
      console.log(`❌ ${agentCode}: Update error - ${updateError.message}`);
      errors++;
    } else {
      const keywordCount = keywords.primary.length + keywords.secondary.length + keywords.tertiary.length;
      console.log(`✅ ${agentCode}: ${keywordCount} keywords (${keywords.primary.length}P/${keywords.secondary.length}S/${keywords.tertiary.length}T)`);
      updated++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total agents in config: ${Object.keys(AGENT_KEYWORDS).length}`);
}

updateAgentKeywords().catch(console.error);
