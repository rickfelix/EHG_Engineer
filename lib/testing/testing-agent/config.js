/**
 * Testing Sub-Agent Configuration
 * Configuration constants and activation triggers
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

export const DEFAULT_CONFIG = {
  autoRun: true,
  headless: true,
  timeout: 30000,
  baseURL: 'http://localhost:8080',
  outputDir: 'test-results/automated',
  screenshotDir: 'test-results/automated/screenshots',
  reportDir: 'test-results/automated/reports'
};

export const ACTIVATION_TRIGGERS = {
  coverageThreshold: 80,
  e2eRequired: true,
  complexTestScenarios: 10,
  visualInspection: true
};

export const PERFORMANCE_THRESHOLDS = {
  loadTime: 3000,
  domReady: 2000
};

export const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 }
];

export function createTestResults() {
  return {
    passed: 0,
    failed: 0,
    warnings: 0,
    screenshots: [],
    issues: [],
    failureAnalysis: [],
    fixRecommendations: []
  };
}

export async function checkCoverageRequirement() {
  try {
    const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(packageJson);
    return pkg.scripts && pkg.scripts['test:coverage'];
  } catch {
    return false;
  }
}

export async function checkE2ERequirement() {
  try {
    const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const content = packageJson.toLowerCase();
    return content.includes('e2e') || content.includes('playwright') || content.includes('cypress');
  } catch {
    return false;
  }
}

export async function checkComplexScenarios() {
  try {
    const testDir = path.join(process.cwd(), 'tests');
    const files = await fs.readdir(testDir, { recursive: true });
    return files.filter(file => file.endsWith('.spec.js') || file.endsWith('.test.js')).length >= 10;
  } catch {
    return false;
  }
}
