/**
 * API Sub-Agent Domain Exports
 * Re-exports all domain modules for easy import
 *
 * @module api-sub-agent/domains
 */

// Endpoint Analysis
export {
  findAPIFiles,
  analyzeEndpoints,
  analyzeAPIFile,
  analyzeEndpoint,
  analyzeGraphQL
} from './endpoint-analysis.js';

// Documentation Analysis
export {
  analyzeAPIDocumentation,
  validateOpenAPISpec
} from './documentation-analysis.js';

// Structure Analysis
export {
  analyzeAPIStructure,
  analyzeVersioning
} from './structure-analysis.js';

// Security Analysis
export {
  analyzeAPISecurity,
  analyzeCORS
} from './security-analysis.js';

// Quality Analysis
export {
  analyzeErrorHandling,
  validateSchemas,
  checkRateLimiting
} from './quality-analysis.js';
