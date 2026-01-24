/**
 * Documentation Analysis Domain
 * Handles API documentation validation (OpenAPI/Swagger, README)
 *
 * @module api-sub-agent/domains/documentation-analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Analyze API documentation quality
 * @param {string} basePath - Base path to analyze
 * @param {Object} apiHealth - API health tracking object
 * @param {Object} thresholds - Quality thresholds
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeAPIDocumentation(basePath, apiHealth, thresholds, addFinding) {
  // Check for OpenAPI/Swagger
  const swaggerFiles = [
    'swagger.json', 'swagger.yaml', 'swagger.yml',
    'openapi.json', 'openapi.yaml', 'openapi.yml',
    'api-docs.json', 'api-docs.yaml'
  ];

  let hasAPIDoc = false;

  for (const swaggerFile of swaggerFiles) {
    try {
      const content = await fs.readFile(path.join(basePath, swaggerFile), 'utf8');
      hasAPIDoc = true;

      // Validate swagger/openapi
      if (swaggerFile.endsWith('.json')) {
        try {
          const spec = JSON.parse(content);
          validateOpenAPISpec(spec, swaggerFile, apiHealth, thresholds, addFinding);
        } catch (error) {
          addFinding({
            type: 'INVALID_API_SPECIFICATION',
            severity: 'high',
            confidence: 1.0,
            file: swaggerFile,
            description: 'API specification has invalid JSON syntax',
            recommendation: 'Fix JSON syntax errors in API specification',
            metadata: {
              error: error.message
            }
          });
        }
      }
      break;
    } catch {
      // File doesn't exist
    }
  }

  if (!hasAPIDoc && apiHealth.totalEndpoints > 0) {
    addFinding({
      type: 'MISSING_API_DOCUMENTATION',
      severity: 'high',
      confidence: 0.9,
      file: 'api-docs',
      description: `${apiHealth.totalEndpoints} API endpoints lack documentation`,
      recommendation: 'Create OpenAPI/Swagger specification for API',
      metadata: {
        endpoints: apiHealth.totalEndpoints,
        suggestion: 'Use swagger-jsdoc to generate docs from code comments'
      }
    });
  }

  // Check for README API documentation
  try {
    const readme = await fs.readFile(path.join(basePath, 'README.md'), 'utf8');

    if (apiHealth.totalEndpoints > 0 && !readme.toLowerCase().includes('api')) {
      addFinding({
        type: 'API_NOT_DOCUMENTED_IN_README',
        severity: 'medium',
        confidence: 0.8,
        file: 'README.md',
        description: 'API endpoints not mentioned in README',
        recommendation: 'Add API usage examples to README',
        metadata: {
          endpoints: apiHealth.totalEndpoints
        }
      });
    }
  } catch {
    // No README
  }
}

/**
 * Validate OpenAPI specification
 * @param {Object} spec - OpenAPI specification object
 * @param {string} file - File path
 * @param {Object} apiHealth - API health tracking object
 * @param {Object} thresholds - Quality thresholds
 * @param {Function} addFinding - Function to add findings
 */
export function validateOpenAPISpec(spec, file, apiHealth, thresholds, addFinding) {
  // Check required fields
  if (!spec.openapi && !spec.swagger) {
    addFinding({
      type: 'MISSING_API_VERSION',
      severity: 'high',
      confidence: 1.0,
      file,
      description: 'API specification missing version field',
      recommendation: 'Add openapi or swagger version field',
      metadata: {
        required: 'openapi: "3.0.0" or swagger: "2.0"'
      }
    });
  }

  if (!spec.info) {
    addFinding({
      type: 'MISSING_API_INFO',
      severity: 'medium',
      confidence: 1.0,
      file,
      description: 'API specification missing info section',
      recommendation: 'Add API title, description, and version in info section',
      metadata: {
        required: 'info: { title, description, version }'
      }
    });
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    addFinding({
      type: 'EMPTY_API_SPECIFICATION',
      severity: 'high',
      confidence: 1.0,
      file,
      description: 'API specification has no endpoints defined',
      recommendation: 'Add endpoint definitions to paths section',
      metadata: {
        actualEndpoints: apiHealth.totalEndpoints
      }
    });
  } else {
    // Check coverage
    const specEndpoints = Object.keys(spec.paths).length;
    const coverage = specEndpoints / apiHealth.totalEndpoints;

    if (coverage < thresholds.documentation) {
      addFinding({
        type: 'INCOMPLETE_API_DOCUMENTATION',
        severity: 'medium',
        confidence: 0.9,
        file,
        description: `Only ${Math.round(coverage * 100)}% of endpoints are documented`,
        recommendation: 'Document all API endpoints in specification',
        metadata: {
          documented: specEndpoints,
          total: apiHealth.totalEndpoints,
          coverage: Math.round(coverage * 100)
        }
      });
    }
  }
}

export default {
  analyzeAPIDocumentation,
  validateOpenAPISpec
};
