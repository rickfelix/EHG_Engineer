/**
 * Smoke Test Configuration Helper
 * SD-E2E-VENTURE-LAUNCH-001B
 *
 * Provides pre-configured smoke test configurations for common ventures.
 */

import { SmokeConfig } from './venture-smoke.template';

/**
 * Default EHG App smoke test configuration
 */
export const EHG_SMOKE_CONFIG: SmokeConfig = {
  venture: {
    name: 'EHG App',
    baseUrl: process.env.EHG_BASE_URL || 'http://localhost:8080',
    loginPath: '/login',
    happyPath: [
      '/dashboard',
      '/ventures',
      '/ventures/new',
      '/settings'
    ],
    authRequired: true
  },
  thresholds: {
    lcp: 2500,
    fid: 100,
    cls: 0.1
  },
  credentials: process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
    ? {
        email: process.env.TEST_USER_EMAIL,
        password: process.env.TEST_USER_PASSWORD
      }
    : undefined
};

/**
 * EHG Engineer App smoke test configuration
 */
export const EHG_ENGINEER_SMOKE_CONFIG: SmokeConfig = {
  venture: {
    name: 'EHG Engineer',
    baseUrl: process.env.ENGINEER_BASE_URL || 'http://localhost:3000',
    happyPath: [
      '/',
      '/api/health'
    ],
    authRequired: false
  },
  thresholds: {
    lcp: 3000,  // Backend app, slightly higher threshold
    fid: 100,
    cls: 0.1
  }
};

/**
 * Create a custom venture smoke configuration
 */
export function createSmokeConfig(options: Partial<SmokeConfig> & { venture: SmokeConfig['venture'] }): SmokeConfig {
  return {
    venture: options.venture,
    thresholds: {
      lcp: options.thresholds?.lcp ?? 2500,
      fid: options.thresholds?.fid ?? 100,
      cls: options.thresholds?.cls ?? 0.1
    },
    skip: options.skip ?? {},
    credentials: options.credentials
  };
}

/**
 * Quick smoke config for development/testing
 * Skips time-consuming tests for faster feedback
 */
export function createQuickSmokeConfig(baseConfig: SmokeConfig): SmokeConfig {
  return {
    ...baseConfig,
    skip: {
      ...baseConfig.skip,
      performance: true,
      mobile: true
    }
  };
}
