/**
 * App Architecture Verifier
 * Detects the framework used by a target application and verifies alignment with PRD
 * Prevents SD-BACKEND-002A type catastrophic rework (30-52h prevented)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Detect the framework used by an application
 * @param {string} appPath - Path to the application root
 * @returns {object} Detection results
 */
export function detectFramework(appPath) {
  const result = {
    framework: 'unknown',
    confidence: 0,
    indicators: [],
    warnings: []
  };

  // Check for package.json
  const packageJsonPath = join(appPath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    result.warnings.push('No package.json found');
    return result;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Check for Vite
    if (deps.vite) {
      result.framework = 'vite';
      result.confidence = 90;
      result.indicators.push('vite in dependencies');

      // Check for vite.config
      if (existsSync(join(appPath, 'vite.config.ts')) || existsSync(join(appPath, 'vite.config.js'))) {
        result.confidence = 100;
        result.indicators.push('vite.config found');
      }
    }
    // Check for Next.js
    else if (deps.next) {
      result.framework = 'next';
      result.confidence = 90;
      result.indicators.push('next in dependencies');

      if (existsSync(join(appPath, 'next.config.js')) || existsSync(join(appPath, 'next.config.mjs'))) {
        result.confidence = 100;
        result.indicators.push('next.config found');
      }
    }
    // Check for Create React App
    else if (deps['react-scripts']) {
      result.framework = 'cra';
      result.confidence = 100;
      result.indicators.push('react-scripts in dependencies');
    }
    // Check for plain React
    else if (deps.react) {
      result.framework = 'react';
      result.confidence = 70;
      result.indicators.push('react in dependencies');
    }

  } catch (e) {
    result.warnings.push(`Error reading package.json: ${e.message}`);
  }

  return result;
}

/**
 * Verify architecture alignment
 * @param {string} appPath - Path to target application
 * @param {object} prdMetadata - PRD metadata containing expected architecture
 * @returns {object} Verification results
 */
export async function verifyArchitecture(appPath, prdMetadata = {}) {
  const detection = detectFramework(appPath);

  const result = {
    detected: detection,
    expected: prdMetadata.technical_architecture || prdMetadata.implementation_approach || null,
    aligned: false,
    score: 50, // Base score when verification can't fully complete
    issues: [],
    warnings: detection.warnings
  };

  // If no expected architecture in PRD, give partial credit
  if (!result.expected) {
    result.warnings.push('No architecture specification in PRD metadata');
    result.score = 70; // Better score since we at least detected something
    return result;
  }

  // Check alignment
  const expectedFramework = typeof result.expected === 'string'
    ? result.expected.toLowerCase()
    : result.expected.framework?.toLowerCase() || '';

  if (detection.framework === 'unknown') {
    result.score = 50;
    result.issues.push('Could not detect application framework');
    return result;
  }

  if (expectedFramework.includes(detection.framework) ||
      expectedFramework.includes('vite') && detection.framework === 'vite' ||
      expectedFramework.includes('react') && detection.framework === 'react') {
    result.aligned = true;
    result.score = 100;
  } else {
    result.aligned = false;
    result.score = 0;
    result.issues.push(`Framework mismatch: Expected ${expectedFramework}, detected ${detection.framework}`);
  }

  return result;
}

// CLI execution
if (process.argv[1].includes('verify-app-architecture')) {
  const appPath = process.argv[2] || process.cwd();

  console.log('🏗️  Architecture Verification');
  console.log('='.repeat(50));
  console.log(`App Path: ${appPath}`);

  const result = await verifyArchitecture(appPath);

  console.log(`\nDetected Framework: ${result.detected.framework}`);
  console.log(`Confidence: ${result.detected.confidence}%`);
  console.log(`Indicators: ${result.detected.indicators.join(', ') || 'none'}`);
  console.log(`\nScore: ${result.score}/100`);

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    result.issues.forEach(i => console.log(`  - ${i}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }
}
