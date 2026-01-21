/**
 * LEAD → PLAN Handoff Constants
 * Configuration for SD validation requirements
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

/**
 * Strategic Directive Quality Requirements (LEO Protocol v4.3.3)
 */
export const SD_REQUIREMENTS = {
  minimumScore: 90,
  requiredFields: [
    'title',
    'description',
    'scope',
    'strategic_objectives',
    'key_principles',
    'priority'
  ],
  alternateFields: {
    success_metrics: 'success_criteria'
  },
  minimumObjectives: 2,
  minimumMetrics: 3,
  minimumConstraints: 1
};

/**
 * PRD Readiness Check Configuration
 */
export const PRD_READINESS_CHECKS = {
  description: { minLength: 100, weight: 25 },
  scope: { minLength: 50, weight: 25 },
  rationale: { minLength: 30, weight: 20 },
  strategic_objectives: { minItems: 2, weight: 15 },
  success_criteria: { minItems: 3, weight: 15 }
};

/**
 * Keyword patterns for SD type auto-detection
 */
export const TYPE_PATTERNS = {
  security: {
    keywords: ['auth', 'authentication', 'authorization', 'rls', 'row level security',
               'permission', 'role', 'rbac', 'vulnerability', 'cve', 'owasp',
               'encryption', 'credential', 'secret', 'token', 'jwt', 'session'],
    weight: 1.2
  },
  database: {
    keywords: ['schema', 'migration', 'table', 'column', 'index', 'postgres', 'supabase',
               'sql', 'query', 'rls policy', 'foreign key', 'constraint', 'trigger',
               'stored procedure', 'function', 'view', 'materialized'],
    weight: 1.1
  },
  infrastructure: {
    keywords: ['ci/cd', 'pipeline', 'github action', 'workflow', 'deploy', 'docker',
               'script', 'tooling', 'automation', 'build', 'bundle', 'lint', 'prettier',
               'eslint', 'pre-commit', 'hook', 'protocol', 'handoff', 'agent system',
               'mcp', 'leo protocol', 'devops', 'monitoring', 'logging'],
    weight: 1.0
  },
  documentation: {
    keywords: ['documentation', 'docs', 'readme', 'guide', 'tutorial', 'comment',
               'jsdoc', 'api doc', 'changelog', 'contributing', 'onboarding'],
    weight: 0.9
  },
  bugfix: {
    keywords: ['bug', 'fix', 'error', 'issue', 'broken', 'crash', 'regression',
               'hotfix', 'patch', 'resolve', 'repair'],
    weight: 1.0
  },
  refactor: {
    keywords: ['refactor', 'restructure', 'reorganize', 'cleanup', 'technical debt',
               'code quality', 'architecture', 'modularize', 'extract', 'simplify'],
    weight: 1.0
  },
  performance: {
    keywords: ['performance', 'optimize', 'speed', 'latency', 'cache', 'memory',
               'cpu', 'load time', 'bundle size', 'lazy load', 'memoize', 'index'],
    weight: 1.0
  },
  feature: {
    keywords: ['feature', 'ui', 'component', 'page', 'form', 'dialog', 'modal',
               'dashboard', 'button', 'input', 'frontend', 'react', 'user interface',
               'ux', 'user experience', 'screen', 'view', 'layout', 'stage'],
    weight: 0.8
  }
};

/**
 * Valid SD statuses for LEAD-TO-PLAN handoff
 */
export const VALID_SD_STATUSES = ['draft', 'active', 'in_progress', 'pending_approval'];

/**
 * Risk keywords that suggest SD should have risk documentation
 */
export const RISK_KEYWORDS = ['migration', 'security', 'auth', 'production', 'data', 'schema'];

/**
 * Patterns for detecting target application mismatches
 */
export const TARGET_APP_PATTERNS = {
  ehg: ['ui', 'component', 'form', 'page', 'dialog', 'dashboard', 'stage', 'frontend', 'react'],
  engineer: ['script', 'tooling', 'migration', 'protocol', 'handoff', 'agent', 'cli', 'database migration']
};

/**
 * SMART criteria keywords for objective validation
 */
export const SMART_KEYWORDS = ['owner:', 'target:', 'baseline:', 'deadline:', 'due:'];
