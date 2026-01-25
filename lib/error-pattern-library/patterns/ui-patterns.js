/**
 * UI/Component Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const UI_PATTERNS = [
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
  }
];
