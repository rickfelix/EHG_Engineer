/**
 * Security Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const SECURITY_PATTERNS = [
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
  }
];
