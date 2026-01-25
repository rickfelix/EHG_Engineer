/**
 * Test Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const TEST_PATTERNS = [
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
  }
];
