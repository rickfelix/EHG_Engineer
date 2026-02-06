/**
 * Unit tests for Genesis Mock Firewall
 * Part of SD-GENESIS-V31-MASON-FIREWALL
 */

import { vi } from 'vitest';

// Store original env and fetch
const originalEnv = { ...process.env };
let originalFetch;

beforeEach(() => {
  // Reset modules to get fresh state
  vi.resetModules();
  // Restore original env
  process.env = { ...originalEnv };
  // Store original fetch
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  // Restore env
  process.env = originalEnv;
  // Restore fetch if it was modified
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe('Mock Firewall', () => {
  describe('isMockMode', () => {
    it('should return true when EHG_MOCK_MODE is true', async () => {
      process.env.EHG_MOCK_MODE = 'true';
      const { isMockMode } = await import('../../../lib/mock/firewall.js');
      expect(isMockMode()).toBe(true);
    });

    it('should return false when EHG_MOCK_MODE is not set', async () => {
      delete process.env.EHG_MOCK_MODE;
      const { isMockMode } = await import('../../../lib/mock/firewall.js');
      expect(isMockMode()).toBe(false);
    });

    it('should return false when EHG_MOCK_MODE is false', async () => {
      process.env.EHG_MOCK_MODE = 'false';
      const { isMockMode } = await import('../../../lib/mock/firewall.js');
      expect(isMockMode()).toBe(false);
    });
  });

  describe('assertMockMode', () => {
    it('should not throw when mock mode is enabled', async () => {
      process.env.EHG_MOCK_MODE = 'true';
      const { assertMockMode } = await import('../../../lib/mock/firewall.js');
      expect(() => assertMockMode()).not.toThrow();
    });

    it('should throw when mock mode is disabled', async () => {
      delete process.env.EHG_MOCK_MODE;
      const { assertMockMode } = await import('../../../lib/mock/firewall.js');
      expect(() => assertMockMode()).toThrow('SIMULATION FIREWALL');
    });

    it('should include helpful message in error', async () => {
      delete process.env.EHG_MOCK_MODE;
      const { assertMockMode } = await import('../../../lib/mock/firewall.js');
      expect(() => assertMockMode()).toThrow('EHG_MOCK_MODE=true');
    });
  });

  describe('validateSimulationEnv', () => {
    it('should pass when no denied vars are present', async () => {
      process.env.EHG_MOCK_MODE = 'true';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      const { validateSimulationEnv } = await import('../../../lib/mock/firewall.js');
      const result = validateSimulationEnv({ throwOnViolation: false });

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when SUPABASE_SERVICE_ROLE_KEY is present', async () => {
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-key';

      const { validateSimulationEnv } = await import('../../../lib/mock/firewall.js');
      const result = validateSimulationEnv({ throwOnViolation: false });

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('should throw when throwOnViolation is true', async () => {
      process.env.STRIPE_SECRET_KEY = 'secret';

      const { validateSimulationEnv } = await import('../../../lib/mock/firewall.js');
      expect(() => validateSimulationEnv({ throwOnViolation: true }))
        .toThrow('SIMULATION FIREWALL');
    });

    it('should check additional denied vars', async () => {
      process.env.CUSTOM_SECRET = 'secret';

      const { validateSimulationEnv } = await import('../../../lib/mock/firewall.js');
      const result = validateSimulationEnv({
        throwOnViolation: false,
        additionalDenied: ['CUSTOM_SECRET']
      });

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('CUSTOM_SECRET');
    });
  });

  describe('isAllowedHost', () => {
    it('should allow localhost', async () => {
      const { isAllowedHost } = await import('../../../lib/mock/firewall.js');
      expect(isAllowedHost('localhost')).toBe(true);
    });

    it('should allow 127.0.0.1', async () => {
      const { isAllowedHost } = await import('../../../lib/mock/firewall.js');
      expect(isAllowedHost('127.0.0.1')).toBe(true);
    });

    it('should allow vercel.app subdomains', async () => {
      const { isAllowedHost } = await import('../../../lib/mock/firewall.js');
      expect(isAllowedHost('my-app-123.vercel.app')).toBe(true);
    });

    it('should block external hosts', async () => {
      const { isAllowedHost } = await import('../../../lib/mock/firewall.js');
      expect(isAllowedHost('api.stripe.com')).toBe(false);
      expect(isAllowedHost('supabase.co')).toBe(false);
      expect(isAllowedHost('google.com')).toBe(false);
    });
  });

  describe('mockBlockedResponse', () => {
    it('should return 403 status', async () => {
      const { mockBlockedResponse } = await import('../../../lib/mock/firewall.js');
      const response = mockBlockedResponse('https://api.stripe.com/v1/charges');

      expect(response.status).toBe(403);
    });

    it('should include firewall header', async () => {
      const { mockBlockedResponse } = await import('../../../lib/mock/firewall.js');
      const response = mockBlockedResponse('https://api.stripe.com/v1/charges');

      expect(response.headers.get('X-Simulation-Firewall')).toBe('blocked');
    });

    it('should include JSON error body', async () => {
      const { mockBlockedResponse } = await import('../../../lib/mock/firewall.js');
      const response = mockBlockedResponse('https://api.stripe.com/v1/charges');
      const body = await response.json();

      expect(body.error).toBe('SIMULATION_FIREWALL_BLOCKED');
      expect(body.mock).toBe(true);
    });
  });

  describe('initSimulationFirewall', () => {
    it('should fail when mock mode is not enabled', async () => {
      delete process.env.EHG_MOCK_MODE;

      const { initSimulationFirewall } = await import('../../../lib/mock/firewall.js');
      const result = initSimulationFirewall({ strict: false });

      expect(result.initialized).toBe(false);
      expect(result.warnings).toContain('Mock mode is not enabled');
    });

    it('should initialize when mock mode is enabled', async () => {
      process.env.EHG_MOCK_MODE = 'true';

      const { initSimulationFirewall } = await import('../../../lib/mock/firewall.js');
      const result = initSimulationFirewall({
        validateEnv: true,
        installInterceptor: false  // Don't modify fetch in tests
      });

      expect(result.initialized).toBe(true);
    });
  });
});
