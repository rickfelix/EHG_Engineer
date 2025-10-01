module.exports = {
  testEnvironment: 'node',
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
    '!**/tests/**/*.spec.js'
  ],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // ES Module support - transform disabled for native ESM
  transform: {},
  transformIgnorePatterns: []
};