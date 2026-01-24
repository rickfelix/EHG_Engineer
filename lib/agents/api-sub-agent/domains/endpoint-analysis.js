/**
 * Endpoint Analysis Domain
 * Handles detection and analysis of API endpoints (REST and GraphQL)
 *
 * @module api-sub-agent/domains/endpoint-analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Find API files in standard directories
 * @param {string} basePath - Base path to search
 * @returns {Promise<string[]>} Array of API file paths
 */
export async function findAPIFiles(basePath) {
  const apiFiles = [];
  const searchDirs = [
    'api', 'routes', 'controllers', 'endpoints',
    'src/api', 'src/routes', 'src/controllers',
    'pages/api', // Next.js
    'functions', // Serverless
    'lambda' // AWS Lambda
  ];

  for (const dir of searchDirs) {
    const fullPath = path.join(basePath, dir);

    async function scan(scanDir) {
      try {
        const entries = await fs.readdir(scanDir, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = path.join(scanDir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await scan(entryPath);
          } else if (entry.isFile() &&
                    (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
            apiFiles.push(entryPath);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    await scan(fullPath);
  }

  return apiFiles;
}

/**
 * Analyze API endpoints in a base path
 * @param {string} basePath - Base path to analyze
 * @param {Object} apiInfo - API framework information
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeEndpoints(basePath, apiInfo, apiHealth, addFinding) {
  const apiFiles = await findAPIFiles(basePath);

  for (const file of apiFiles) {
    await analyzeAPIFile(file, basePath, apiHealth, addFinding);
  }

  // Check for common endpoint issues
  if (apiHealth.totalEndpoints === 0) {
    addFinding({
      type: 'NO_API_ENDPOINTS',
      severity: 'high',
      confidence: 0.9,
      file: 'api',
      description: 'API framework detected but no endpoints found',
      recommendation: 'Define API endpoints or remove unused framework dependencies',
      metadata: {
        framework: apiInfo.framework
      }
    });
  }
}

/**
 * Analyze individual API file
 * @param {string} file - File path
 * @param {string} basePath - Base path
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export async function analyzeAPIFile(file, basePath, apiHealth, addFinding) {
  try {
    const content = await fs.readFile(file, 'utf8');
    const relativePath = path.relative(basePath, file);

    // Find HTTP method definitions
    const methodRegex = /\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:async\s+)?\(?([^)]*)\)?\s*=>\s*{|app\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const method = (match[1] || match[4]).toUpperCase();
      const route = match[2] || match[5];
      const params = match[3] || '';

      apiHealth.totalEndpoints++;

      const endpoint = {
        method,
        route,
        file: relativePath,
        params,
        documented: false,
        authenticated: false,
        validated: false,
        errorHandled: false
      };

      apiHealth.endpoints.push(endpoint);

      // Analyze endpoint quality
      analyzeEndpoint(endpoint, content, relativePath, addFinding);
    }

    // Check for GraphQL schemas
    if (content.includes('GraphQL') || content.includes('gql`') || content.includes('buildSchema')) {
      analyzeGraphQL(content, relativePath, addFinding);
    }

  } catch {
    // File read error - silently ignore
  }
}

/**
 * Analyze individual endpoint for quality issues
 * @param {Object} endpoint - Endpoint object
 * @param {string} fileContent - File content
 * @param {string} file - File path
 * @param {Function} addFinding - Function to add findings
 */
export function analyzeEndpoint(endpoint, fileContent, file, addFinding) {
  const { method, route } = endpoint;

  // Check for parameter validation
  const hasValidation = /req\.body\s*&&|joi\.|yup\.|validate|schema/i.test(fileContent);
  if (!hasValidation && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    addFinding({
      type: 'MISSING_INPUT_VALIDATION',
      severity: 'high',
      confidence: 0.9,
      file,
      description: `${method} ${route} lacks input validation`,
      recommendation: 'Add request body validation using Joi, Yup, or similar',
      metadata: {
        endpoint: `${method} ${route}`,
        method,
        route
      }
    });
  }

  // Check for authentication
  const hasAuth = /auth|jwt|token|passport|session/i.test(fileContent);
  if (!hasAuth && !route.includes('public') && !route.includes('health')) {
    addFinding({
      type: 'MISSING_AUTHENTICATION',
      severity: 'high',
      confidence: 0.8,
      file,
      description: `${method} ${route} appears to lack authentication`,
      recommendation: 'Add authentication middleware for protected endpoints',
      metadata: {
        endpoint: `${method} ${route}`
      }
    });
  }

  // Check for error handling
  const hasErrorHandling = /try\s*{|catch\s*\(|\.catch\s*\(/i.test(fileContent);
  if (!hasErrorHandling) {
    addFinding({
      type: 'MISSING_ERROR_HANDLING',
      severity: 'medium',
      confidence: 0.85,
      file,
      description: `${method} ${route} lacks error handling`,
      recommendation: 'Add try-catch blocks or error handling middleware',
      metadata: {
        endpoint: `${method} ${route}`
      }
    });
  }

  // Check for SQL injection vulnerabilities
  if (fileContent.includes('query(') && fileContent.includes('req.body')) {
    const hasSQLInjection = /query\s*\(\s*['"`].*\$\{.*req\./i.test(fileContent);
    if (hasSQLInjection) {
      addFinding({
        type: 'SQL_INJECTION_RISK',
        severity: 'critical',
        confidence: 0.95,
        file,
        description: `${method} ${route} vulnerable to SQL injection`,
        recommendation: 'Use parameterized queries or ORM methods',
        metadata: {
          endpoint: `${method} ${route}`
        }
      });
    }
  }

  // Check for proper HTTP status codes
  const statusCodeRegex = /res\.status\s*\(\s*(\d+)\s*\)|res\.sendStatus\s*\(\s*(\d+)\s*\)/g;
  const statusCodes = [];
  let statusMatch;

  while ((statusMatch = statusCodeRegex.exec(fileContent)) !== null) {
    statusCodes.push(parseInt(statusMatch[1] || statusMatch[2]));
  }

  // Check if using appropriate status codes
  if (method === 'POST' && !statusCodes.includes(201) && statusCodes.length > 0) {
    addFinding({
      type: 'INCORRECT_STATUS_CODE',
      severity: 'low',
      confidence: 0.7,
      file,
      description: `POST ${route} should return 201 for successful creation`,
      recommendation: 'Use res.status(201) for successful resource creation',
      metadata: {
        endpoint: `${method} ${route}`,
        currentCodes: statusCodes
      }
    });
  }

  // Check for rate limiting
  const hasRateLimit = /rate.*limit|express-rate-limit|slowdown/i.test(fileContent);
  if (!hasRateLimit && (method === 'POST' || method === 'PUT')) {
    addFinding({
      type: 'MISSING_RATE_LIMITING',
      severity: 'medium',
      confidence: 0.8,
      file,
      description: `${method} ${route} lacks rate limiting`,
      recommendation: 'Add rate limiting middleware for write operations',
      metadata: {
        endpoint: `${method} ${route}`
      }
    });
  }
}

/**
 * Analyze GraphQL schemas and resolvers
 * @param {string} content - File content
 * @param {string} file - File path
 * @param {Function} addFinding - Function to add findings
 */
export function analyzeGraphQL(content, file, addFinding) {
  // Check for GraphQL best practices
  if (!content.includes('Query') || !content.includes('Mutation')) {
    addFinding({
      type: 'INCOMPLETE_GRAPHQL_SCHEMA',
      severity: 'medium',
      confidence: 0.8,
      file,
      description: 'GraphQL schema missing Query or Mutation types',
      recommendation: 'Define proper GraphQL schema with Query and Mutation types',
      metadata: {
        type: 'GraphQL'
      }
    });
  }

  // Check for N+1 query problems
  if (content.includes('for') && content.includes('await')) {
    addFinding({
      type: 'GRAPHQL_N_PLUS_ONE',
      severity: 'high',
      confidence: 0.7,
      file,
      description: 'Potential N+1 query problem in GraphQL resolver',
      recommendation: 'Use DataLoader or batch queries to avoid N+1 problems',
      metadata: {
        type: 'GraphQL'
      }
    });
  }
}

export default {
  findAPIFiles,
  analyzeEndpoints,
  analyzeAPIFile,
  analyzeEndpoint,
  analyzeGraphQL
};
