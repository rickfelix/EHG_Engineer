#!/usr/bin/env node

/**
 * Error Pattern Library for Automatic Sub-Agent Invocation
 *
 * Purpose: Detect errors during EXEC/PLAN phases and automatically invoke
 *          appropriate specialist sub-agents for diagnosis and recovery.
 *
 * Features:
 * - Pattern-based error detection
 * - Automatic sub-agent recommendation
 * - Circuit breaker to prevent infinite loops
 * - Learning from resolved errors
 * - Severity-based escalation
 *
 * Usage:
 *   import { detectError, recommendSubAgent } from './error-pattern-library.js';
 *
 *   const errorInfo = detectError(errorMessage, context);
 *   const subAgent = recommendSubAgent(errorInfo);
 */

// ============================================================================
// ERROR CATEGORIES
// ============================================================================

export const ERROR_CATEGORIES = {
  DATABASE: 'DATABASE',
  SECURITY: 'SECURITY',
  BUILD: 'BUILD',
  RUNTIME: 'RUNTIME',
  TEST: 'TEST',
  NETWORK: 'NETWORK',
  FILESYSTEM: 'FILESYSTEM',
  PERFORMANCE: 'PERFORMANCE',
  UI_COMPONENT: 'UI_COMPONENT',
  DEPENDENCY: 'DEPENDENCY'
};

export const SEVERITY_LEVELS = {
  CRITICAL: 'CRITICAL',   // System-breaking, requires immediate attention
  HIGH: 'HIGH',           // Major functionality broken
  MEDIUM: 'MEDIUM',       // Feature degradation
  LOW: 'LOW'              // Minor issues, cosmetic
};

// ============================================================================
// ERROR PATTERNS
// ============================================================================

export const ERROR_PATTERNS = [

  // ========== DATABASE ERRORS ==========
  {
    id: 'DB_CONNECTION_FAILED',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.CRITICAL,
    patterns: [
      /connection.*refused/i,
      /ECONNREFUSED.*postgres/i,
      /could not connect to.*database/i,
      /connection.*timed out.*postgres/i,
      /database.*unavailable/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Check PostgreSQL service status',
      'Verify connection string configuration',
      'Check network connectivity to database server',
      'Verify database credentials',
      'Check firewall rules'
    ],
    autoRecovery: false,
    learningTags: ['database', 'connection', 'infrastructure']
  },

  {
    id: 'DB_QUERY_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /syntax error.*SQL/i,
      /column.*does not exist/i,
      /table.*does not exist/i,
      /relation.*does not exist/i,
      /invalid input syntax/i,
      /constraint.*violation/i,
      /foreign key constraint/i,
      /unique constraint/i,
      /null value.*not null constraint/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Review SQL query syntax',
      'Check table/column names against schema',
      'Verify data types match schema',
      'Check constraint definitions',
      'Review migration history'
    ],
    autoRecovery: false,
    learningTags: ['database', 'query', 'schema']
  },

  {
    id: 'DB_RLS_POLICY_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /permission denied.*policy/i,
      /RLS.*policy.*failed/i,
      /row.*level.*security/i,
      /new row violates.*policy/i,
      /policy.*check.*failed/i
    ],
    subAgents: ['DATABASE', 'SECURITY'],
    diagnosis: [
      'Review RLS policy definitions',
      'Check user authentication context',
      'Verify policy expressions',
      'Test policy with current user role',
      'Check if RLS is enabled on table'
    ],
    autoRecovery: false,
    learningTags: ['database', 'rls', 'security', 'policy']
  },

  {
    id: 'DB_MIGRATION_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.CRITICAL,
    patterns: [
      /migration.*failed/i,
      /migration.*already.*applied/i,
      /migration.*out of order/i,
      /schema.*version.*mismatch/i,
      /duplicate.*migration/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Check migration version numbering',
      'Review migration history table',
      'Verify migration order',
      'Check for duplicate migrations',
      'Review rollback procedures'
    ],
    autoRecovery: false,
    learningTags: ['database', 'migration', 'schema']
  },

  // ========== SECURITY/AUTHENTICATION ERRORS ==========
  {
    id: 'AUTH_FAILED',
    category: ERROR_CATEGORIES.SECURITY,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /authentication.*failed/i,
      /invalid.*credentials/i,
      /unauthorized/i,
      /401.*unauthorized/i,
      /session.*expired/i,
      /token.*invalid/i,
      /token.*expired/i
    ],
    subAgents: ['SECURITY'],
    diagnosis: [
      'Verify authentication credentials',
      'Check session/token expiration',
      'Review authentication flow',
      'Check auth provider configuration',
      'Verify user permissions'
    ],
    autoRecovery: false,
    learningTags: ['security', 'authentication', 'session']
  },

  {
    id: 'PERMISSION_DENIED',
    category: ERROR_CATEGORIES.SECURITY,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /permission.*denied/i,
      /forbidden/i,
      /403.*forbidden/i,
      /access.*denied/i,
      /insufficient.*permissions/i,
      /not.*authorized/i
    ],
    subAgents: ['SECURITY'],
    diagnosis: [
      'Check user role assignments',
      'Review permission policies',
      'Verify resource access rules',
      'Check RLS policies if database operation',
      'Review RBAC configuration'
    ],
    autoRecovery: false,
    learningTags: ['security', 'authorization', 'permissions']
  },

  // ========== RUNTIME ERRORS ========== (Before BUILD to avoid TypeErrors matching BUILD_TYPE_ERROR)
  {
    id: 'RUNTIME_NULL_REFERENCE',
    category: ERROR_CATEGORIES.RUNTIME,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /cannot read.*property.*undefined/i,
      /cannot read.*property.*null/i,
      /undefined is not.*object/i,
      /null is not.*object/i,
      /cannot access.*before initialization/i
    ],
    subAgents: ['VALIDATION'],
    diagnosis: [
      'Check for null/undefined values',
      'Add null checks or optional chaining',
      'Review variable initialization',
      'Check async operation timing',
      'Verify data flow'
    ],
    autoRecovery: false,
    learningTags: ['runtime', 'null', 'undefined']
  },

  {
    id: 'RUNTIME_API_ERROR',
    category: ERROR_CATEGORIES.NETWORK,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /API.*error/i,
      /request.*failed/i,
      /network.*error/i,
      /fetch.*failed/i,
      /ERR_NETWORK/i,
      /500.*internal server error/i,
      /502.*bad gateway/i,
      /503.*service unavailable/i,
      /504.*gateway timeout/i
    ],
    subAgents: ['VALIDATION', 'GITHUB'],
    diagnosis: [
      'Check API endpoint availability',
      'Verify API request format',
      'Check network connectivity',
      'Review API error logs',
      'Verify API authentication',
      'Check rate limiting'
    ],
    autoRecovery: false,
    learningTags: ['runtime', 'api', 'network']
  },

  // ========== BUILD/COMPILATION ERRORS ==========
  {
    id: 'BUILD_COMPILATION_ERROR',
    category: ERROR_CATEGORIES.BUILD,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /compilation.*failed/i,
      /syntax error.*\.tsx?/i,
      /parse error/i,
      /unexpected token/i,
      /module.*not found/i,
      /cannot find module/i,
      /failed to compile/i
    ],
    subAgents: ['VALIDATION'],
    diagnosis: [
      'Check TypeScript/JavaScript syntax',
      'Verify import statements',
      'Check module resolution paths',
      'Review tsconfig.json configuration',
      'Verify file extensions'
    ],
    autoRecovery: false,
    learningTags: ['build', 'compilation', 'syntax']
  },

  {
    id: 'BUILD_TYPE_ERROR',
    category: ERROR_CATEGORIES.BUILD,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /typescript.*type.*error/i,
      /property.*does not exist.*type/i,
      /argument.*type.*not assignable/i,
      /cannot assign.*to type/i,
      /type.*is not assignable/i,
      /expected.*arguments.*got/i
    ],
    subAgents: ['VALIDATION'],
    diagnosis: [
      'Review type definitions',
      'Check interface implementations',
      'Verify function signatures',
      'Review type imports',
      'Check generic type parameters'
    ],
    autoRecovery: false,
    learningTags: ['build', 'typescript', 'types']
  },

  {
    id: 'BUILD_DEPENDENCY_ERROR',
    category: ERROR_CATEGORIES.DEPENDENCY,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /npm.*ERR!/i,
      /yarn.*error/i,
      /pnpm.*ERR/i,
      /peer dependency/i,
      /unmet dependency/i,
      /package.*not found/i,
      /version conflict/i,
      /ENOENT.*package\.json/i
    ],
    subAgents: ['VALIDATION'],
    diagnosis: [
      'Check package.json dependencies',
      'Review package-lock.json',
      'Verify npm/yarn/pnpm version',
      'Check dependency version conflicts',
      'Run npm install or yarn install'
    ],
    autoRecovery: true,
    autoRecoverySteps: ['npm install'],
    learningTags: ['build', 'dependencies', 'npm']
  },

  // ========== CI/CD ERRORS ========== (Before TEST to ensure CI-specific failures match first)
  {
    id: 'CICD_BUILD_FAILURE',
    category: ERROR_CATEGORIES.BUILD,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /build.*failed.*github actions/i,
      /github actions.*build.*failed/i,
      /workflow.*failed/i,
      /deployment.*failed/i,
      /CI.*build.*failed/i,
      /compilation.*failed.*CI/i
    ],
    subAgents: ['GITHUB', 'VALIDATION'],
    diagnosis: [
      'Review GitHub Actions logs',
      'Check workflow configuration',
      'Verify environment variables',
      'Check build script',
      'Review dependency installation',
      'Check for platform differences'
    ],
    autoRecovery: false,
    learningTags: ['cicd', 'github-actions', 'deployment', 'build']
  },

  {
    id: 'CICD_TEST_FAILURE',
    category: ERROR_CATEGORIES.TEST,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /tests.*failed.*CI/i,
      /playwright.*failed.*CI/i,
      /test.*suite.*failed/i,
      /github actions.*\d+.*tests.*failed/i,
      /CI.*\d+.*tests.*failed/i
    ],
    subAgents: ['TESTING', 'GITHUB'],
    diagnosis: [
      'Review failing test logs',
      'Check for environment differences',
      'Verify test data setup in CI',
      'Check for timing/race conditions',
      'Review screenshot/video evidence',
      'Check browser versions'
    ],
    autoRecovery: false,
    learningTags: ['cicd', 'testing', 'github-actions']
  },

  // ========== TEST ERRORS ==========
  {
    id: 'TEST_E2E_TIMEOUT',
    category: ERROR_CATEGORIES.TEST,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /test.*timeout/i,
      /exceeded.*timeout/i,
      /playwright.*timeout/i,
      /waiting for.*timed out/i,
      /element.*not found.*timeout/i,
      /page.*did not load.*timeout/i
    ],
    subAgents: ['TESTING', 'PERFORMANCE'],
    diagnosis: [
      'Increase test timeout values',
      'Check page load performance',
      'Verify element selectors',
      'Check for slow API responses',
      'Review wait conditions',
      'Check server startup time'
    ],
    autoRecovery: false,
    learningTags: ['testing', 'e2e', 'timeout', 'performance']
  },

  {
    id: 'TEST_ASSERTION_FAILURE',
    category: ERROR_CATEGORIES.TEST,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /assertion.*failed/i,
      /expected.*but got/i,
      /test.*failed/i,
      /expected.*to be.*received/i,
      /snapshot.*mismatch/i
    ],
    subAgents: ['TESTING'],
    diagnosis: [
      'Review test expectations',
      'Check actual vs expected values',
      'Verify test data setup',
      'Review implementation changes',
      'Check for race conditions',
      'Update snapshots if intentional'
    ],
    autoRecovery: false,
    learningTags: ['testing', 'assertion', 'test-failure']
  },

  {
    id: 'TEST_SELECTOR_NOT_FOUND',
    category: ERROR_CATEGORIES.TEST,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /element.*not found/i,
      /selector.*not found/i,
      /no.*element.*matching/i,
      /cannot find element/i,
      /locator.*resolved to.*not visible/i
    ],
    subAgents: ['TESTING', 'DESIGN'],
    diagnosis: [
      'Verify element selectors',
      'Check if element is rendered',
      'Review component structure changes',
      'Check conditional rendering logic',
      'Verify test wait conditions',
      'Update selectors if UI changed'
    ],
    autoRecovery: false,
    learningTags: ['testing', 'selectors', 'ui', 'e2e']
  },

  // ========== PERFORMANCE ERRORS ==========
  {
    id: 'PERFORMANCE_MEMORY_LEAK',
    category: ERROR_CATEGORIES.PERFORMANCE,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /out of memory/i,
      /heap.*out of memory/i,
      /allocation.*failed/i,
      /memory.*exhausted/i,
      /JavaScript heap/i
    ],
    subAgents: ['PERFORMANCE', 'VALIDATION'],
    diagnosis: [
      'Check for memory leaks',
      'Review large data structures',
      'Check for unbounded arrays/objects',
      'Review cleanup in useEffect/lifecycle',
      'Check for circular references',
      'Profile memory usage'
    ],
    autoRecovery: false,
    learningTags: ['performance', 'memory', 'leak']
  },

  {
    id: 'PERFORMANCE_SLOW_QUERY',
    category: ERROR_CATEGORIES.PERFORMANCE,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /query.*exceeded.*time/i,
      /slow.*query/i,
      /query.*timeout/i,
      /statement.*timeout/i
    ],
    subAgents: ['PERFORMANCE', 'DATABASE'],
    diagnosis: [
      'Review query execution plan',
      'Check for missing indexes',
      'Review table sizes',
      'Check for N+1 queries',
      'Optimize JOIN operations',
      'Consider query caching'
    ],
    autoRecovery: false,
    learningTags: ['performance', 'database', 'query', 'optimization']
  },

  // ========== UI/COMPONENT ERRORS ==========
  {
    id: 'UI_HYDRATION_ERROR',
    category: ERROR_CATEGORIES.UI_COMPONENT,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /hydration.*failed/i,
      /hydration.*mismatch/i,
      /server.*client.*mismatch/i,
      /text content.*not match/i
    ],
    subAgents: ['DESIGN', 'VALIDATION'],
    diagnosis: [
      'Check for client-only code in SSR',
      'Review conditional rendering',
      'Verify server/client data consistency',
      'Check for date/time formatting differences',
      'Review random value generation'
    ],
    autoRecovery: false,
    learningTags: ['ui', 'hydration', 'ssr', 'react']
  },

  {
    id: 'UI_COMPONENT_ERROR',
    category: ERROR_CATEGORIES.UI_COMPONENT,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [
      /component.*error/i,
      /react.*error/i,
      /hook.*called.*conditionally/i,
      /rendered.*fewer hooks/i,
      /invalid hook call/i,
      /maximum update depth exceeded/i
    ],
    subAgents: ['DESIGN', 'VALIDATION'],
    diagnosis: [
      'Review React hooks usage',
      'Check hook call order',
      'Verify component lifecycle',
      'Check for infinite render loops',
      'Review state update logic',
      'Check dependency arrays'
    ],
    autoRecovery: false,
    learningTags: ['ui', 'react', 'hooks', 'component']
  },

];

// ============================================================================
// SUB-AGENT MAPPING
// ============================================================================

export const SUB_AGENT_SPECIALTIES = {
  DATABASE: {
    code: 'DATABASE',
    name: 'Principal Database Architect',
    expertise: [
      'Database connection issues',
      'SQL query errors',
      'Schema validation',
      'Migration problems',
      'RLS policy errors',
      'Performance optimization'
    ]
  },
  SECURITY: {
    code: 'SECURITY',
    name: 'Chief Security Architect',
    expertise: [
      'Authentication failures',
      'Authorization errors',
      'Permission denied errors',
      'RLS policy validation',
      'Security configuration'
    ]
  },
  TESTING: {
    code: 'TESTING',
    name: 'QA Engineering Director',
    expertise: [
      'Test failures',
      'E2E timeout issues',
      'Selector problems',
      'Assertion failures',
      'Test environment setup'
    ]
  },
  VALIDATION: {
    code: 'VALIDATION',
    name: 'Principal Systems Analyst',
    expertise: [
      'Build errors',
      'Compilation issues',
      'Type errors',
      'Runtime errors',
      'Code quality issues'
    ]
  },
  PERFORMANCE: {
    code: 'PERFORMANCE',
    name: 'Performance Engineering Lead',
    expertise: [
      'Memory leaks',
      'Slow queries',
      'Performance bottlenecks',
      'Resource exhaustion',
      'Optimization recommendations'
    ]
  },
  DESIGN: {
    code: 'DESIGN',
    name: 'Senior Design Sub-Agent',
    expertise: [
      'UI component errors',
      'Hydration issues',
      'React errors',
      'Component structure',
      'Test selector issues'
    ]
  },
  GITHUB: {
    code: 'GITHUB',
    name: 'DevOps Platform Architect',
    expertise: [
      'CI/CD failures',
      'GitHub Actions errors',
      'Deployment issues',
      'Pipeline configuration',
      'Environment setup'
    ]
  }
};

// ============================================================================
// ERROR DETECTION
// ============================================================================

/**
 * Detect error pattern from error message and context
 * @param {string} errorMessage - The error message or stack trace
 * @param {object} context - Additional context (file, line, stack, etc.)
 * @returns {object|null} Error pattern match with metadata
 */
export function detectError(errorMessage, context = {}) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return null;
  }

  // Try to match against all error patterns
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMessage)) {
        return {
          ...pattern,
          matchedPattern: regex.source,
          errorMessage,
          context,
          timestamp: new Date().toISOString(),
          confidence: calculateConfidence(errorMessage, pattern)
        };
      }
    }
  }

  // No specific pattern matched - return generic error
  return {
    id: 'UNKNOWN_ERROR',
    category: ERROR_CATEGORIES.RUNTIME,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [],
    subAgents: ['VALIDATION'],
    diagnosis: ['Review error message and stack trace', 'Check recent code changes'],
    autoRecovery: false,
    errorMessage,
    context,
    timestamp: new Date().toISOString(),
    confidence: 30
  };
}

/**
 * Calculate confidence score for error pattern match
 * @param {string} errorMessage - The error message
 * @param {object} pattern - The matched pattern
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidence(errorMessage, pattern) {
  let confidence = 70; // Base confidence for pattern match

  // Increase confidence if multiple keywords match
  const keywords = pattern.patterns.map(p => p.source.replace(/[^a-z]/gi, ' ').split(/\s+/).filter(k => k.length > 3)).flat();
  const matchedKeywords = keywords.filter(k => new RegExp(k, 'i').test(errorMessage));
  confidence += Math.min(matchedKeywords.length * 5, 20);

  // Higher confidence for CRITICAL errors (assume pattern is more specific)
  if (pattern.severity === SEVERITY_LEVELS.CRITICAL) {
    confidence += 10;
  }

  return Math.min(confidence, 100);
}

/**
 * Recommend sub-agent(s) for error resolution
 * @param {object} errorInfo - Error information from detectError()
 * @returns {object} Sub-agent recommendation with invocation details
 */
export function recommendSubAgent(errorInfo) {
  if (!errorInfo || !errorInfo.subAgents || errorInfo.subAgents.length === 0) {
    return {
      recommended: [],
      reason: 'No specific sub-agent recommended for this error'
    };
  }

  const recommendations = errorInfo.subAgents.map(agentCode => {
    const agent = SUB_AGENT_SPECIALTIES[agentCode];
    return {
      code: agentCode,
      name: agent?.name || agentCode,
      expertise: agent?.expertise || [],
      priority: errorInfo.severity === SEVERITY_LEVELS.CRITICAL ? 'IMMEDIATE' :
                errorInfo.severity === SEVERITY_LEVELS.HIGH ? 'HIGH' :
                errorInfo.severity === SEVERITY_LEVELS.MEDIUM ? 'NORMAL' : 'LOW',
      autoInvoke: errorInfo.severity === SEVERITY_LEVELS.CRITICAL ||
                  errorInfo.severity === SEVERITY_LEVELS.HIGH,
      confidence: errorInfo.confidence
    };
  });

  return {
    recommended: recommendations,
    errorId: errorInfo.id,
    category: errorInfo.category,
    severity: errorInfo.severity,
    diagnosis: errorInfo.diagnosis,
    autoRecovery: errorInfo.autoRecovery,
    autoRecoverySteps: errorInfo.autoRecoverySteps || [],
    reason: `Error pattern '${errorInfo.id}' matched with ${errorInfo.confidence}% confidence`
  };
}

/**
 * Get all error patterns for a specific category
 * @param {string} category - Error category
 * @returns {array} Array of error patterns
 */
export function getPatternsByCategory(category) {
  return ERROR_PATTERNS.filter(p => p.category === category);
}

/**
 * Get all error patterns that recommend a specific sub-agent
 * @param {string} subAgentCode - Sub-agent code (e.g., 'DATABASE')
 * @returns {array} Array of error patterns
 */
export function getPatternsBySubAgent(subAgentCode) {
  return ERROR_PATTERNS.filter(p => p.subAgents.includes(subAgentCode));
}

/**
 * Get statistics about the error pattern library
 * @returns {object} Statistics object
 */
export function getLibraryStats() {
  return {
    totalPatterns: ERROR_PATTERNS.length,
    byCategory: Object.keys(ERROR_CATEGORIES).reduce((acc, cat) => {
      acc[cat] = getPatternsByCategory(cat).length;
      return acc;
    }, {}),
    bySeverity: Object.keys(SEVERITY_LEVELS).reduce((acc, sev) => {
      acc[sev] = ERROR_PATTERNS.filter(p => p.severity === sev).length;
      return acc;
    }, {}),
    bySubAgent: Object.keys(SUB_AGENT_SPECIALTIES).reduce((acc, agent) => {
      acc[agent] = getPatternsBySubAgent(agent).length;
      return acc;
    }, {}),
    autoRecoverableCount: ERROR_PATTERNS.filter(p => p.autoRecovery).length
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ERROR_CATEGORIES,
  SEVERITY_LEVELS,
  ERROR_PATTERNS,
  SUB_AGENT_SPECIALTIES,
  detectError,
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
};
