/**
 * Tests for TTL Cleanup
 * SD-GENESIS-V31-MASON-P3
 *
 * Note: These are unit tests for the module structure.
 * Integration tests with database would require a test database.
 */

import { describe, it, expect } from 'vitest';

describe('TTL Cleanup Module', () => {
  it('should export expected functions', async () => {
    const module = await import('../ttl-cleanup.js');

    expect(typeof module.getExpiredDeployments).toBe('function');
    expect(typeof module.runCleanup).toBe('function');
    expect(typeof module.getCleanupHistory).toBe('function');
    expect(typeof module.extendTTL).toBe('function');
    expect(typeof module.getExpiringDeployments).toBe('function');
    expect(typeof module.generateCleanupReport).toBe('function');
    expect(typeof module.scheduleCleanup).toBe('function');
  });

  it('should have default export with all functions', async () => {
    const module = await import('../ttl-cleanup.js');

    expect(module.default).toHaveProperty('getExpiredDeployments');
    expect(module.default).toHaveProperty('runCleanup');
    expect(module.default).toHaveProperty('getCleanupHistory');
    expect(module.default).toHaveProperty('extendTTL');
    expect(module.default).toHaveProperty('getExpiringDeployments');
    expect(module.default).toHaveProperty('generateCleanupReport');
    expect(module.default).toHaveProperty('scheduleCleanup');
  });
});

describe('Vercel Deploy Module', () => {
  it('should export expected functions', async () => {
    const module = await import('../vercel-deploy.js');

    expect(typeof module.deployToVercel).toBe('function');
    expect(typeof module.verifyDeployment).toBe('function');
    expect(typeof module.listDeployments).toBe('function');
    expect(typeof module.getDeployment).toBe('function');
    expect(typeof module.deleteVercelDeployment).toBe('function');
    expect(typeof module.updateDeploymentHealth).toBe('function');
  });

  it('should have default export with all functions', async () => {
    const module = await import('../vercel-deploy.js');

    expect(module.default).toHaveProperty('deployToVercel');
    expect(module.default).toHaveProperty('verifyDeployment');
    expect(module.default).toHaveProperty('listDeployments');
    expect(module.default).toHaveProperty('getDeployment');
    expect(module.default).toHaveProperty('deleteVercelDeployment');
    expect(module.default).toHaveProperty('updateDeploymentHealth');
  });
});
