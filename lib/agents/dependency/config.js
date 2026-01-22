/**
 * Dependency Sub-Agent Configuration
 * Thresholds and constants for dependency analysis
 */

export const THRESHOLDS = {
  vulnerabilities: {
    critical: 0,
    high: 2,
    moderate: 10,
    low: 50
  },
  outdated: {
    major: 5,
    minor: 20,
    patch: 100
  },
  bundleSize: 5,
  unusedDeps: 0.1,
  licenseCompliance: 0.95
};

export const ESSENTIAL_FIELDS = ['name', 'version', 'description', 'author'];

export const DEV_ONLY_PACKAGES = [
  '@types/', 'jest', 'mocha', 'chai', 'sinon', 'eslint', 'prettier',
  'webpack', 'babel', 'typescript', 'nodemon', 'ts-node'
];

export const SECURITY_CRITICAL_PACKAGES = [
  'jsonwebtoken', 'bcrypt', 'crypto', 'passport', 'helmet'
];

export const HEAVY_PACKAGES = [
  'moment', 'lodash', 'axios', 'react', 'vue', '@angular/core',
  'three', 'd3', 'chart.js', 'webpack'
];

export const DEPRECATED_PACKAGES = {
  'request': 'axios, node-fetch, or native fetch',
  'left-pad': 'String.prototype.padStart()',
  'babel-core': '@babel/core',
  'babel-preset-es2015': '@babel/preset-env',
  'node-uuid': 'uuid',
  'mkdirp': 'fs.mkdir({ recursive: true })',
  'rimraf': 'fs.rm({ recursive: true })'
};

export const DUPLICATE_FUNCTIONALITY = [
  { packages: ['axios', 'node-fetch'], functionality: 'HTTP requests' },
  { packages: ['lodash', 'ramda'], functionality: 'Utility functions' },
  { packages: ['moment', 'date-fns', 'day.js'], functionality: 'Date manipulation' },
  { packages: ['jest', 'mocha'], functionality: 'Testing framework' }
];

export const PROBLEMATIC_LICENSES = ['GPL-3.0', 'AGPL-3.0', 'WTFPL'];

export const LOCK_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

export function createDepHealthState() {
  return {
    totalDependencies: 0,
    productionDeps: 0,
    devDependencies: 0,
    vulnerabilities: {},
    outdatedPackages: [],
    unusedDependencies: [],
    licenseIssues: [],
    bundleImpact: new Map(),
    duplicates: []
  };
}
