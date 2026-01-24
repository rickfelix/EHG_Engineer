/**
 * Quality Analysis Domain
 * Handles API quality validation (error handling, schemas, rate limiting)
 *
 * @module api-sub-agent/domains/quality-analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { findAPIFiles } from './endpoint-analysis.js';

/**
 * Analyze error handling across API files
 * @param {string} basePath - Base path to analyze
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeErrorHandling(basePath, addFinding) {
  const apiFiles = await findAPIFiles(basePath);
  let filesWithoutErrorHandling = 0;

  for (const file of apiFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');

      // Check for error handling patterns
      const hasErrorHandling =
        content.includes('try') && content.includes('catch') ||
        content.includes('.catch(') ||
        content.includes('error') && content.includes('status');

      if (!hasErrorHandling) {
        filesWithoutErrorHandling++;
      }
    } catch {
      // File read error
    }
  }

  if (filesWithoutErrorHandling > 0) {
    const ratio = filesWithoutErrorHandling / apiFiles.length;

    if (ratio > 0.5) {
      addFinding({
        type: 'INADEQUATE_ERROR_HANDLING',
        severity: 'high',
        confidence: 0.9,
        file: 'api',
        description: `${Math.round(ratio * 100)}% of API files lack error handling`,
        recommendation: 'Implement comprehensive error handling for all endpoints',
        metadata: {
          filesWithoutHandling: filesWithoutErrorHandling,
          totalFiles: apiFiles.length
        }
      });
    }
  }
}

/**
 * Validate schema validation library usage
 * @param {string} basePath - Base path to analyze
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export async function validateSchemas(basePath, apiHealth, addFinding) {
  // Look for schema validation libraries
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const validationLibs = ['joi', 'yup', 'ajv', 'express-validator', 'class-validator'];
    const hasValidation = validationLibs.some(lib => lib in deps);

    if (!hasValidation && apiHealth.totalEndpoints > 0) {
      addFinding({
        type: 'MISSING_SCHEMA_VALIDATION',
        severity: 'high',
        confidence: 0.8,
        file: 'package.json',
        description: 'No schema validation library found',
        recommendation: 'Add Joi, Yup, or similar for request/response validation',
        metadata: {
          suggestions: validationLibs.slice(0, 3)
        }
      });
    }
  } catch {
    // Package.json error
  }
}

/**
 * Check rate limiting configuration
 * @param {string} basePath - Base path to analyze
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export async function checkRateLimiting(basePath, apiHealth, addFinding) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const rateLimitLibs = ['express-rate-limit', 'rate-limiter-flexible', 'express-slow-down'];
    const hasRateLimit = rateLimitLibs.some(lib => lib in deps);

    if (!hasRateLimit && apiHealth.totalEndpoints > 5) {
      addFinding({
        type: 'MISSING_RATE_LIMITING',
        severity: 'medium',
        confidence: 0.8,
        file: 'package.json',
        description: 'No rate limiting configured for API',
        recommendation: 'Add rate limiting to prevent abuse',
        metadata: {
          endpoints: apiHealth.totalEndpoints,
          suggestions: rateLimitLibs
        }
      });
    }
  } catch {
    // Package.json error
  }
}

export default {
  analyzeErrorHandling,
  validateSchemas,
  checkRateLimiting
};
