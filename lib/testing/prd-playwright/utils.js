/**
 * PRD Playwright Generator - Utility Functions
 */

export function toPascalCase(str) {
  return str
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function mapPriority(prdPriority) {
  const mapping = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low'
  };
  return mapping[prdPriority] || 'medium';
}

export function requiresValidation(requirement) {
  const text = JSON.stringify(requirement).toLowerCase();
  return text.includes('valid') ||
         text.includes('require') ||
         text.includes('must') ||
         text.includes('should');
}

export function determineNavigationUrl(requirement) {
  const reqId = requirement.id || '';
  const name = requirement.name || '';

  if (name.toLowerCase().includes('dashboard')) return '/dashboard';
  if (name.toLowerCase().includes('login')) return '/login';
  if (name.toLowerCase().includes('directive')) return '/directives';
  if (reqId.toLowerCase().includes('sdip')) return '/directive-lab';

  return '/';
}

export function extractSelector(text) {
  const patterns = [
    /data-testid="([^"]+)"/,
    /id="([^"]+)"/,
    /class="([^"]+)"/,
    /\[([^\]]+)\]/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

export function extractPageObjects(prd) {
  const pageObjects = {};

  for (const req of (prd.functional_requirements || [])) {
    const pageName = toPascalCase(req.id) + 'Page';
    pageObjects[pageName] = {
      selectors: {
        container: `[data-testid="${req.id}-container"]`,
        input: `[data-testid="${req.id}-input"]`,
        button: `[data-testid="${req.id}-button"]`,
        result: `[data-testid="${req.id}-result"]`
      },
      actions: ['navigate', 'fill', 'click', 'submit', 'validate']
    };
  }

  return pageObjects;
}

export function generateSharedSelectors() {
  return {
    navigation: {
      header: '[data-testid="header"]',
      nav: '[data-testid="navigation"]',
      footer: '[data-testid="footer"]'
    },
    common: {
      loader: '[data-testid="loader"]',
      error: '[data-testid="error-message"]',
      success: '[data-testid="success-message"]',
      modal: '[data-testid="modal"]'
    }
  };
}

export function extractAPIEndpoints(prd) {
  const endpoints = [];
  const apis = prd.technical_requirements?.apis || [];

  for (const api of apis) {
    endpoints.push({
      method: api.methods?.[0] || 'GET',
      path: api.endpoint,
      expectedStatus: 200,
      description: api.description
    });
  }

  return endpoints;
}
