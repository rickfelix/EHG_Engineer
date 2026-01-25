/**
 * Sub-Agent Mapping
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Maps error types to specialized sub-agents for resolution.
 */

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
