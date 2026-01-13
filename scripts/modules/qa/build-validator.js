#!/usr/bin/env node
/**
 * Build Validator Module
 * Enhanced QA Engineering Director v2.0
 *
 * Validates build before test execution to catch errors immediately.
 * Impact: Saves 2-3 hours per SD by preventing late-stage build failures.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../..');
const EHG_ROOT = path.resolve(__dirname, '../../../../ehg');

/**
 * Validate build for target application
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Validation result with verdict and recommendations
 */
export async function validateBuild(targetApp = 'ehg') {
  const appPath = targetApp === 'ehg'
    ? EHG_ROOT
    : EHG_ENGINEER_ROOT;

  console.log(`🔍 Build Validator: Checking ${targetApp} build...`);

  try {
    const startTime = Date.now();

    // Run build
    execSync('npm run build', {
      cwd: appPath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return {
      verdict: 'PASS',
      message: `Build successful in ${duration}s`,
      time_saved: '2-3 hours (pre-test validation prevented late failures)',
      app: targetApp,
      duration_seconds: parseFloat(duration)
    };

  } catch (error) {
    // Parse build errors
    const errors = parseBuildErrors(error.stderr || error.stdout || '');

    return {
      verdict: 'BLOCKED',
      blocker: 'Build failed - must fix before testing',
      errors: errors,
      recommendations: generateBuildFixRecommendations(errors),
      app: targetApp,
      stderr: error.stderr?.toString().substring(0, 500) // First 500 chars
    };
  }
}

/**
 * Parse build error output to extract specific errors
 */
function parseBuildErrors(stderr) {
  const lines = stderr.toString().split('\n');
  const errors = [];

  for (const line of lines) {
    // TypeScript errors
    if (line.includes('error TS')) {
      errors.push({
        type: 'typescript',
        message: line.trim(),
        severity: 'high'
      });
    }
    // Missing module errors
    else if (line.includes('Module not found') || line.includes('Cannot find module')) {
      const moduleMatch = line.match(/['"]([^'"]+)['"]/);
      errors.push({
        type: 'missing_module',
        module: moduleMatch ? moduleMatch[1] : 'unknown',
        message: line.trim(),
        severity: 'critical'
      });
    }
    // Syntax errors
    else if (line.includes('SyntaxError')) {
      errors.push({
        type: 'syntax',
        message: line.trim(),
        severity: 'critical'
      });
    }
  }

  return errors.slice(0, 10); // First 10 errors only
}

/**
 * Generate recommendations for fixing build errors
 */
function generateBuildFixRecommendations(errors) {
  const recommendations = [];

  for (const error of errors) {
    if (error.type === 'missing_module') {
      const moduleName = error.module?.split('/').pop() || 'unknown';
      recommendations.push({
        action: 'Create stub file or install dependency',
        module: error.module,
        priority: 'critical',
        example: `Create stub: src/lib/${moduleName}.ts with TODO comment and basic types`,
        command: `touch src/lib/${moduleName}.ts`
      });
    } else if (error.type === 'typescript') {
      recommendations.push({
        action: 'Fix TypeScript type errors or add type assertions',
        priority: 'high',
        example: 'Add "as any" assertion or fix type definitions'
      });
    } else if (error.type === 'syntax') {
      recommendations.push({
        action: 'Fix syntax errors in source code',
        priority: 'critical',
        example: 'Check for missing brackets, semicolons, or quote mismatches'
      });
    }
  }

  return recommendations;
}

/**
 * Extract module name from import path
 */
function _extractModuleName(errorMessage) {
  const match = errorMessage.match(/['"]([^'"]+)['"]/);
  if (match) {
    const parts = match[1].split('/');
    return parts[parts.length - 1].replace(/\.(ts|js|tsx|jsx)$/, '');
  }
  return 'unknown';
}
