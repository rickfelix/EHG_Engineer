/**
 * SRIP Quality Check & Naming Generator Tests
 * SD: SD-LEO-INFRA-SRIP-QUALITY-SCORING-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

describe('SRIP Quality Check Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports QUALITY_DOMAINS constant with 6 domains', async () => {
    const { QUALITY_DOMAINS } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(QUALITY_DOMAINS).toHaveLength(6);
    expect(QUALITY_DOMAINS).toContain('layout');
    expect(QUALITY_DOMAINS).toContain('visual_composition');
    expect(QUALITY_DOMAINS).toContain('design_system');
    expect(QUALITY_DOMAINS).toContain('interaction');
    expect(QUALITY_DOMAINS).toContain('technical');
    expect(QUALITY_DOMAINS).toContain('accessibility');
  });

  it('exports createQualityCheck function', async () => {
    const { createQualityCheck } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof createQualityCheck).toBe('function');
  });

  it('exports getQualityCheck function', async () => {
    const { getQualityCheck } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof getQualityCheck).toBe('function');
  });

  it('exports listQualityChecks function', async () => {
    const { listQualityChecks } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof listQualityChecks).toBe('function');
  });

  it('exports getLatestQualityCheck function', async () => {
    const { getLatestQualityCheck } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof getLatestQualityCheck).toBe('function');
  });

  it('exports checkPassed function', async () => {
    const { checkPassed } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof checkPassed).toBe('function');
  });

  it('exports gatePromptActivation function', async () => {
    const { gatePromptActivation } = await import('../../../lib/eva/services/srip-quality-check.js');
    expect(typeof gatePromptActivation).toBe('function');
  });
});

describe('SRIP Naming Generator', () => {
  it('exports generateNamingCandidates function', async () => {
    const { generateNamingCandidates } = await import('../../../scripts/eva/srip/naming-generator.mjs');
    expect(typeof generateNamingCandidates).toBe('function');
  });

  it('exports DEFAULT_CANDIDATE_COUNT constant', async () => {
    const { DEFAULT_CANDIDATE_COUNT } = await import('../../../scripts/eva/srip/naming-generator.mjs');
    expect(DEFAULT_CANDIDATE_COUNT).toBe(8);
  });
});

describe('Barrel Export includes quality check', () => {
  it('re-exports quality check functions from index', async () => {
    const services = await import('../../../lib/eva/services/index.js');
    expect(typeof services.createQualityCheck).toBe('function');
    expect(typeof services.getQualityCheck).toBe('function');
    expect(typeof services.listQualityChecks).toBe('function');
    expect(typeof services.getLatestQualityCheck).toBe('function');
    expect(typeof services.checkPassed).toBe('function');
    expect(typeof services.gatePromptActivation).toBe('function');
    expect(services.QUALITY_DOMAINS).toHaveLength(6);
  });
});
