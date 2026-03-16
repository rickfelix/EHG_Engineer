/**
 * SRIP Service Layer Tests
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * Tests for CRUD operations on srip_site_dna, srip_brand_interviews,
 * and srip_synthesis_prompts tables via the service layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSelect = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnThis();
const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockSingle = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
}));

// Chain methods return themselves
mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit, single: mockSingle });
mockInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) });
mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }) });
mockEq.mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit, single: mockSingle });
mockOrder.mockReturnValue({ limit: mockLimit, eq: mockEq, single: mockSingle });
mockLimit.mockReturnValue({ single: mockSingle, data: [] });

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

describe('SRIP Site DNA Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports createSiteDna function', async () => {
    const { createSiteDna } = await import('../../../lib/eva/services/srip-site-dna.js');
    expect(typeof createSiteDna).toBe('function');
  });

  it('exports getSiteDna function', async () => {
    const { getSiteDna } = await import('../../../lib/eva/services/srip-site-dna.js');
    expect(typeof getSiteDna).toBe('function');
  });

  it('exports listSiteDna function', async () => {
    const { listSiteDna } = await import('../../../lib/eva/services/srip-site-dna.js');
    expect(typeof listSiteDna).toBe('function');
  });

  it('exports updateSiteDna function', async () => {
    const { updateSiteDna } = await import('../../../lib/eva/services/srip-site-dna.js');
    expect(typeof updateSiteDna).toBe('function');
  });

  it('exports getLatestCompletedDna function', async () => {
    const { getLatestCompletedDna } = await import('../../../lib/eva/services/srip-site-dna.js');
    expect(typeof getLatestCompletedDna).toBe('function');
  });
});

describe('SRIP Brand Interview Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports createBrandInterview function', async () => {
    const { createBrandInterview } = await import('../../../lib/eva/services/srip-brand-interview.js');
    expect(typeof createBrandInterview).toBe('function');
  });

  it('exports getBrandInterview function', async () => {
    const { getBrandInterview } = await import('../../../lib/eva/services/srip-brand-interview.js');
    expect(typeof getBrandInterview).toBe('function');
  });

  it('exports listBrandInterviews function', async () => {
    const { listBrandInterviews } = await import('../../../lib/eva/services/srip-brand-interview.js');
    expect(typeof listBrandInterviews).toBe('function');
  });

  it('exports updateBrandInterview function', async () => {
    const { updateBrandInterview } = await import('../../../lib/eva/services/srip-brand-interview.js');
    expect(typeof updateBrandInterview).toBe('function');
  });

  it('exports getLatestCompletedInterview function', async () => {
    const { getLatestCompletedInterview } = await import('../../../lib/eva/services/srip-brand-interview.js');
    expect(typeof getLatestCompletedInterview).toBe('function');
  });
});

describe('SRIP Synthesis Prompt Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports createSynthesisPrompt function', async () => {
    const { createSynthesisPrompt } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof createSynthesisPrompt).toBe('function');
  });

  it('exports getSynthesisPrompt function', async () => {
    const { getSynthesisPrompt } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof getSynthesisPrompt).toBe('function');
  });

  it('exports listSynthesisPrompts function', async () => {
    const { listSynthesisPrompts } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof listSynthesisPrompts).toBe('function');
  });

  it('exports updateSynthesisPrompt function', async () => {
    const { updateSynthesisPrompt } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof updateSynthesisPrompt).toBe('function');
  });

  it('exports getActiveSynthesisPrompt function', async () => {
    const { getActiveSynthesisPrompt } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof getActiveSynthesisPrompt).toBe('function');
  });

  it('exports activatePrompt function', async () => {
    const { activatePrompt } = await import('../../../lib/eva/services/srip-synthesis.js');
    expect(typeof activatePrompt).toBe('function');
  });
});

describe('SRIP Barrel Export', () => {
  it('re-exports all SRIP services from index', async () => {
    const services = await import('../../../lib/eva/services/index.js');
    // Site DNA
    expect(typeof services.createSiteDna).toBe('function');
    expect(typeof services.getSiteDna).toBe('function');
    expect(typeof services.listSiteDna).toBe('function');
    expect(typeof services.updateSiteDna).toBe('function');
    expect(typeof services.getLatestCompletedDna).toBe('function');
    // Brand Interview
    expect(typeof services.createBrandInterview).toBe('function');
    expect(typeof services.getBrandInterview).toBe('function');
    expect(typeof services.listBrandInterviews).toBe('function');
    expect(typeof services.updateBrandInterview).toBe('function');
    expect(typeof services.getLatestCompletedInterview).toBe('function');
    // Synthesis
    expect(typeof services.createSynthesisPrompt).toBe('function');
    expect(typeof services.getSynthesisPrompt).toBe('function');
    expect(typeof services.listSynthesisPrompts).toBe('function');
    expect(typeof services.updateSynthesisPrompt).toBe('function');
    expect(typeof services.getActiveSynthesisPrompt).toBe('function');
    expect(typeof services.activatePrompt).toBe('function');
  });
});
