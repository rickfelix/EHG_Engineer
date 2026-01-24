/**
 * Structure Analysis Domain
 * Handles API structure and RESTful patterns validation
 *
 * @module api-sub-agent/domains/structure-analysis
 */

/**
 * Analyze API structure for RESTful patterns
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export function analyzeAPIStructure(apiHealth, addFinding) {
  // Check for RESTful patterns
  const endpoints = apiHealth.endpoints;
  const routes = endpoints.map(e => e.route);

  // Check for inconsistent naming
  const hasInconsistentNaming = routes.some(route =>
    route.includes('_') && routes.some(r => r.includes('-'))
  );

  if (hasInconsistentNaming) {
    addFinding({
      type: 'INCONSISTENT_ROUTE_NAMING',
      severity: 'low',
      confidence: 0.8,
      file: 'api-structure',
      description: 'API routes use inconsistent naming conventions',
      recommendation: 'Use consistent naming (either kebab-case or snake_case)',
      metadata: {
        examples: routes.filter(r => r.includes('_') || r.includes('-')).slice(0, 3)
      }
    });
  }

  // Check for proper resource naming (plural vs singular)
  const singularRoutes = routes.filter(route =>
    /\/\w+\/\d+$/.test(route) && !route.includes('/') // e.g., /user/123
  );

  if (singularRoutes.length > 0) {
    addFinding({
      type: 'NON_RESTFUL_RESOURCE_NAMING',
      severity: 'low',
      confidence: 0.7,
      file: 'api-structure',
      description: 'Some routes use singular resource names',
      recommendation: 'Use plural resource names for RESTful APIs (e.g., /users/123)',
      metadata: {
        examples: singularRoutes.slice(0, 3)
      }
    });
  }

  // Check for deep nesting
  const deepRoutes = routes.filter(route =>
    (route.match(/\//g) || []).length > 4
  );

  if (deepRoutes.length > 0) {
    addFinding({
      type: 'DEEPLY_NESTED_ROUTES',
      severity: 'medium',
      confidence: 0.8,
      file: 'api-structure',
      description: 'Some routes are deeply nested (>4 levels)',
      recommendation: 'Consider flattening route structure for better usability',
      metadata: {
        examples: deepRoutes.slice(0, 3)
      }
    });
  }
}

/**
 * Analyze API versioning strategy
 * @param {Object} apiHealth - API health tracking object
 * @param {Function} addFinding - Function to add findings
 */
export function analyzeVersioning(apiHealth, addFinding) {
  const endpoints = apiHealth.endpoints;
  const versionedRoutes = endpoints.filter(e =>
    /\/v\d+\/|\/api\/v\d+\/|version.*=/.test(e.route)
  );

  apiHealth.versionedEndpoints = versionedRoutes.length;

  if (endpoints.length > 5 && versionedRoutes.length === 0) {
    addFinding({
      type: 'MISSING_API_VERSIONING',
      severity: 'high',
      confidence: 0.9,
      file: 'api-versioning',
      description: 'API lacks versioning strategy',
      recommendation: 'Implement API versioning (URL path or header-based)',
      metadata: {
        totalEndpoints: endpoints.length,
        suggestion: 'Use /api/v1/ prefix or Accept-Version header'
      }
    });
  }
}

export default {
  analyzeAPIStructure,
  analyzeVersioning
};
