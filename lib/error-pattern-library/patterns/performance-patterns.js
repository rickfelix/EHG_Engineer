/**
 * Performance Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const PERFORMANCE_PATTERNS = [
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
  }
];
