/**
 * Runtime Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const RUNTIME_PATTERNS = [
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
  }
];
