/**
 * Genesis Virtual Bunker - Mock Firewall Enforcement
 *
 * Ensures simulations cannot access production resources:
 * - No real database connections
 * - No external API calls with real credentials
 * - No production secrets
 * - No side effects outside the simulation
 *
 * @module lib/mock/firewall
 * Part of SD-GENESIS-V31-MASON-FIREWALL
 */

/**
 * Canonical environment variable for mock mode detection.
 * Matches playwright.config.ts for consistency.
 */
export const MOCK_MODE_ENV_VAR = 'EHG_MOCK_MODE';

/**
 * Environment variables that are DENIED in simulation mode.
 * If any of these are present, the simulation should not start.
 */
export const DENIED_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',  // Production DB access with elevated privileges
  'STRIPE_SECRET_KEY',          // Payment processing
  'STRIPE_WEBHOOK_SECRET',      // Payment webhooks
  'SENDGRID_API_KEY',           // Email sending
  'TWILIO_AUTH_TOKEN',          // SMS sending
  'AWS_SECRET_ACCESS_KEY',      // Cloud resources
  'OPENAI_API_KEY',             // AI API (use mock in simulation)
  'ANTHROPIC_API_KEY',          // Claude API
  'GOOGLE_CLOUD_KEY',           // Google Cloud
  'DATABASE_URL',               // Direct database URL (if using real connection string)
];

/**
 * Hosts allowed in simulation mode.
 * All other hosts will have requests blocked or mocked.
 */
export const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  /.*\.vercel\.app$/,    // Vercel preview URLs
  /.*\.localhost$/,      // Local subdomains
];

/**
 * Check if mock mode is enabled.
 *
 * Mock mode can be enabled via:
 * 1. Environment variable: EHG_MOCK_MODE=true
 * 2. URL parameter: ?mock=true
 * 3. LocalStorage: mockMode=true
 *
 * @returns {boolean} True if mock mode is enabled
 */
export function isMockMode() {
  // Browser environment checks
  if (typeof window !== 'undefined') {
    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mock') === 'true') return true;

    // Check localStorage
    try {
      if (localStorage.getItem('mockMode') === 'true') return true;
    } catch {
      // localStorage may not be available
    }
  }

  // Environment variable check (Node.js or bundled)
  if (typeof process !== 'undefined' && process.env) {
    return process.env[MOCK_MODE_ENV_VAR] === 'true';
  }

  return false;
}

/**
 * Assert that mock mode is enabled.
 * Throws an error if mock mode is not enabled.
 *
 * Use this at the start of simulation-only code paths.
 *
 * @throws {Error} If mock mode is not enabled
 */
export function assertMockMode() {
  if (!isMockMode()) {
    throw new Error(
      'SIMULATION FIREWALL: This code requires mock mode. ' +
      'Set EHG_MOCK_MODE=true or add ?mock=true to URL. ' +
      'Production resources are not available in simulation context.'
    );
  }
}

/**
 * Validate that no denied environment variables are present.
 * This should be called at simulation startup to ensure no production
 * secrets can leak into the simulation.
 *
 * @param {Object} options - Validation options
 * @param {boolean} [options.throwOnViolation=true] - Whether to throw on violation
 * @param {string[]} [options.additionalDenied=[]] - Additional env vars to deny
 * @returns {{ valid: boolean, violations: string[] }} Validation result
 * @throws {Error} If throwOnViolation is true and violations found
 */
export function validateSimulationEnv(options = {}) {
  const { throwOnViolation = true, additionalDenied = [] } = options;

  const allDenied = [...DENIED_ENV_VARS, ...additionalDenied];
  const violations = [];

  for (const envVar of allDenied) {
    if (typeof process !== 'undefined' && process.env && process.env[envVar]) {
      violations.push(envVar);
    }
  }

  const result = {
    valid: violations.length === 0,
    violations,
  };

  if (!result.valid && throwOnViolation) {
    throw new Error(
      'SIMULATION FIREWALL: Production secrets detected! ' +
      'The following environment variables are not allowed in simulation mode: ' +
      `${violations.join(', ')}. ` +
      'Please unset these variables or use a separate simulation environment.'
    );
  }

  return result;
}

/**
 * Check if a hostname is allowed in simulation mode.
 *
 * @param {string} hostname - The hostname to check
 * @returns {boolean} True if the hostname is allowed
 */
export function isAllowedHost(hostname) {
  for (const allowed of ALLOWED_HOSTS) {
    if (typeof allowed === 'string') {
      if (hostname === allowed) return true;
    } else if (allowed instanceof RegExp) {
      if (allowed.test(hostname)) return true;
    }
  }
  return false;
}

/**
 * Generate a mock response for a blocked network request.
 *
 * @param {string|URL} url - The blocked URL
 * @param {string} [reason='blocked'] - The reason for blocking
 * @returns {Response} A mock Response object
 */
export function mockBlockedResponse(url, reason = 'blocked') {
  const body = JSON.stringify({
    error: 'SIMULATION_FIREWALL_BLOCKED',
    message: `Request to ${url} was blocked by the simulation firewall`,
    reason,
    mock: true,
  });

  return new Response(body, {
    status: 403,
    statusText: 'Forbidden - Simulation Firewall',
    headers: {
      'Content-Type': 'application/json',
      'X-Simulation-Firewall': 'blocked',
    },
  });
}

// Store original fetch for restoration
let originalFetch = null;
let isInterceptorInstalled = false;

/**
 * Install network interceptor for simulation mode.
 * Intercepts fetch calls and blocks requests to non-allowed hosts.
 *
 * @param {Object} options - Interceptor options
 * @param {boolean} [options.logBlocked=true] - Whether to log blocked requests
 * @param {Function} [options.mockProvider] - Custom mock response provider
 */
export function installNetworkInterceptor(options = {}) {
  const { logBlocked = true, mockProvider } = options;

  if (!isMockMode()) {
    console.warn('[Firewall] Network interceptor not installed - mock mode is off');
    return;
  }

  if (isInterceptorInstalled) {
    console.warn('[Firewall] Network interceptor already installed');
    return;
  }

  if (typeof globalThis.fetch !== 'function') {
    console.warn('[Firewall] fetch not available in this environment');
    return;
  }

  originalFetch = globalThis.fetch;
  isInterceptorInstalled = true;

  globalThis.fetch = async (input, init) => {
    let url;
    try {
      url = typeof input === 'string' ? new URL(input) : new URL(input.url);
    } catch {
      // If URL parsing fails, it's likely a relative URL - allow it
      return originalFetch(input, init);
    }

    const hostname = url.hostname;

    if (!isAllowedHost(hostname)) {
      if (logBlocked) {
        console.warn(`[Firewall] Blocked request to: ${hostname}${url.pathname}`);
      }

      // Use custom mock provider if available
      if (mockProvider) {
        return mockProvider(url, init);
      }

      return mockBlockedResponse(url.toString());
    }

    return originalFetch(input, init);
  };

  console.log('[Firewall] Network interceptor installed for simulation mode');
}

/**
 * Uninstall network interceptor and restore original fetch.
 */
export function uninstallNetworkInterceptor() {
  if (!isInterceptorInstalled || !originalFetch) {
    return;
  }

  globalThis.fetch = originalFetch;
  originalFetch = null;
  isInterceptorInstalled = false;

  console.log('[Firewall] Network interceptor uninstalled');
}

/**
 * Initialize simulation firewall.
 * Runs all validation checks and installs interceptors.
 *
 * @param {Object} options - Initialization options
 * @param {boolean} [options.validateEnv=true] - Validate environment variables
 * @param {boolean} [options.installInterceptor=true] - Install network interceptor
 * @param {boolean} [options.strict=true] - Throw on any violation
 * @returns {{ initialized: boolean, warnings: string[] }}
 */
export function initSimulationFirewall(options = {}) {
  const {
    validateEnv = true,
    installInterceptor = true,
    strict = true,
  } = options;

  const warnings = [];

  // Verify mock mode is enabled
  if (!isMockMode()) {
    if (strict) {
      throw new Error('SIMULATION FIREWALL: Mock mode must be enabled');
    }
    warnings.push('Mock mode is not enabled');
    return { initialized: false, warnings };
  }

  // Validate environment
  if (validateEnv) {
    try {
      validateSimulationEnv({ throwOnViolation: strict });
    } catch (err) {
      if (strict) throw err;
      warnings.push(err.message);
    }
  }

  // Install network interceptor
  if (installInterceptor) {
    installNetworkInterceptor();
  }

  console.log('[Firewall] Simulation firewall initialized');

  return { initialized: true, warnings };
}

// Export all functions as default object for convenience
export default {
  MOCK_MODE_ENV_VAR,
  DENIED_ENV_VARS,
  ALLOWED_HOSTS,
  isMockMode,
  assertMockMode,
  validateSimulationEnv,
  isAllowedHost,
  mockBlockedResponse,
  installNetworkInterceptor,
  uninstallNetworkInterceptor,
  initSimulationFirewall,
};
