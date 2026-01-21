/**
 * PRD Fetcher Module
 * Handles PRD data retrieval and Playwright specification management
 */

/**
 * Fetch PRD from database
 * @param {object} supabase - Supabase client
 * @param {string} prdId - PRD identifier
 * @returns {Promise<object|null>} PRD data or null if not found
 */
export async function fetchPRD(supabase, prdId) {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', prdId)
    .single();

  if (error) {
    console.error('Error fetching PRD:', error);
    return null;
  }

  return data;
}

/**
 * Fetch existing Playwright specifications
 * @param {object} supabase - Supabase client
 * @param {string} prdId - PRD identifier
 * @returns {Promise<object|null>} Playwright specs or null if not found
 */
export async function fetchPlaywrightSpecs(supabase, prdId) {
  const { data, error } = await supabase
    .from('prd_playwright_specifications')
    .select('*')
    .eq('prd_id', prdId)
    .single();

  // PGRST116 = no rows returned
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching Playwright specs:', error);
  }

  return data;
}

/**
 * Create default Playwright specifications
 * @param {object} supabase - Supabase client
 * @param {object} prd - PRD data
 * @param {object} config - Configuration options
 * @returns {Promise<object>} Created or local specifications
 */
export async function createDefaultPlaywrightSpecs(supabase, prd, config) {
  const specs = {
    prd_id: prd.id,
    base_url: config.baseUrl,
    test_timeout_ms: 30000,
    viewport_sizes: [
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 }
    ],
    browsers: ['chromium', 'firefox', 'webkit'],
    page_objects: extractPageObjects(prd),
    shared_selectors: generateSharedSelectors(),
    api_endpoints: extractAPIEndpoints(prd),
    visual_regression_enabled: true,
    created_by: 'PRD Generator'
  };

  const { data, error } = await supabase
    .from('prd_playwright_specifications')
    .insert(specs)
    .select()
    .single();

  if (error) {
    console.error('Error creating Playwright specs:', error);
    return specs;
  }

  return data;
}

/**
 * Extract page objects from PRD requirements
 * @param {object} prd - PRD data
 * @returns {object} Page objects configuration
 */
export function extractPageObjects(prd) {
  const pageObjects = {};

  for (const req of prd.functional_requirements || []) {
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

/**
 * Generate shared selectors for common UI elements
 * @returns {object} Shared selectors configuration
 */
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

/**
 * Extract API endpoints from PRD technical requirements
 * @param {object} prd - PRD data
 * @returns {Array} API endpoints configuration
 */
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

/**
 * Convert string to PascalCase
 * @param {string} str - Input string
 * @returns {string} PascalCase string
 */
export function toPascalCase(str) {
  return str
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 * @param {string} str - Input string
 * @returns {string} camelCase string
 */
export function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
