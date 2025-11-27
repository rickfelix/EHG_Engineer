module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000, // 60s default timeout for all tests
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/**/*.js',
    'scripts/**/*.js',
    '!**/node_modules/**',
    '!**/client/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '!**/tests/e2e/**',
    '!**/tests/a11y.spec.js',
    '!**/tests/**/*.spec.js',
    '!**/tests/integration.test.js',
    '!**/node_modules/**',
    '!**/applications/**',
    '!**/press-kit/**',
    '!**/agents/**'
  ],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // ES Module support - transform disabled for native ESM
  transform: {},
  transformIgnorePatterns: [],
  // Separate smoke tests from full test suite
  projects: [
    {
      displayName: 'smoke',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/smoke.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {},
      transformIgnorePatterns: []
    },
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {},
      transformIgnorePatterns: []
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {},
      transformIgnorePatterns: []
    }
  ]
};
