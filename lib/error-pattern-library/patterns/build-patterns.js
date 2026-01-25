/**
 * Build/Compilation Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const BUILD_PATTERNS = [
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
  }
];
