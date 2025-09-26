module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'scripts/**/*.js',
    'src/services/**/*.js',
    '!**/node_modules/**',
    '!**/client/**',
    '!src/client/dist/**'
  ],
  testMatch: [
    '**/tests/unit/simple.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '/applications/',
    '/lib/'
  ],
  transform: {},
  verbose: true,
  testTimeout: 10000
};