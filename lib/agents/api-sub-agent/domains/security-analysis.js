/**
 * Security Analysis Domain
 * Handles API security validation (secrets, CORS, HTTPS)
 *
 * @module api-sub-agent/domains/security-analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { findAPIFiles } from './endpoint-analysis.js';

/**
 * Analyze API security issues
 * @param {string} basePath - Base path to analyze
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeAPISecurity(basePath, addFinding) {
  const apiFiles = await findAPIFiles(basePath);

  for (const file of apiFiles.slice(0, 10)) { // Sample for performance
    try {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(basePath, file);

      // Check for hardcoded secrets
      if (/api[_-]?key\s*[:=]\s*["'][^"']+["']/i.test(content)) {
        addFinding({
          type: 'HARDCODED_API_KEY',
          severity: 'critical',
          confidence: 0.9,
          file: relativePath,
          description: 'Hardcoded API key found in source code',
          recommendation: 'Move API keys to environment variables',
          metadata: {
            type: 'security'
          }
        });
      }

      // Check for CORS misconfiguration
      if (content.includes('cors') && content.includes('origin: "*"')) {
        addFinding({
          type: 'INSECURE_CORS',
          severity: 'high',
          confidence: 0.95,
          file: relativePath,
          description: 'CORS configured to allow all origins',
          recommendation: 'Restrict CORS to specific trusted domains',
          metadata: {
            current: 'origin: "*"',
            suggestion: 'origin: ["https://yourdomain.com"]'
          }
        });
      }

      // Check for missing HTTPS enforcement
      if (content.includes('http://') && !content.includes('localhost')) {
        addFinding({
          type: 'INSECURE_HTTP',
          severity: 'high',
          confidence: 0.8,
          file: relativePath,
          description: 'Using HTTP instead of HTTPS',
          recommendation: 'Enforce HTTPS for all API communications',
          metadata: {
            protocol: 'HTTP'
          }
        });
      }
    } catch {
      // File read error
    }
  }
}

/**
 * Analyze CORS configuration
 * @param {string} basePath - Base path to analyze
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeCORS(basePath, apiHealth, addFinding) {
  const apiFiles = await findAPIFiles(basePath);
  let hasCORS = false;

  for (const file of apiFiles.slice(0, 5)) { // Check sample
    try {
      const content = await fs.readFile(file, 'utf8');

      if (content.includes('cors') || content.includes('Access-Control-Allow')) {
        hasCORS = true;
        break;
      }
    } catch {
      // File read error
    }
  }

  if (!hasCORS && apiHealth.totalEndpoints > 0) {
    // Check if it's likely a web API that needs CORS
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      const needsCORS = 'express' in deps || 'koa' in deps || 'fastify' in deps;

      if (needsCORS) {
        addFinding({
          type: 'MISSING_CORS_CONFIGURATION',
          severity: 'medium',
          confidence: 0.7,
          file: 'api',
          description: 'No CORS configuration found',
          recommendation: 'Configure CORS for web API access',
          metadata: {
            suggestion: 'Install and configure cors middleware'
          }
        });
      }
    } catch {
      // Package.json error
    }
  }
}

export default {
  analyzeAPISecurity,
  analyzeCORS
};
