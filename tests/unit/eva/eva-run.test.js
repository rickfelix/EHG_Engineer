/**
 * Tests for eva-run CLI dispatcher
 * SD-EVA-FEAT-CLI-DISPATCHER-001
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dotenv and supabase before any imports that might use them
vi.mock('dotenv/config', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// Mock the orchestrator to prevent transitive dep loading
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  run: vi.fn(),
}));

// Mock shebanged modules
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn(),
}));

describe('eva-run EXIT codes', () => {
  it('defines correct exit codes', async () => {
    const { EXIT } = await import('../../../scripts/eva-run.js');
    expect(EXIT.SUCCESS).toBe(0);
    expect(EXIT.USAGE).toBe(1);
    expect(EXIT.NOT_FOUND).toBe(2);
    expect(EXIT.CHAIRMAN_REVIEW).toBe(3);
    expect(EXIT.EXECUTION_ERROR).toBe(4);
  });

  it('all exit codes are unique', async () => {
    const { EXIT } = await import('../../../scripts/eva-run.js');
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('exports main function', async () => {
    const mod = await import('../../../scripts/eva-run.js');
    expect(typeof mod.main).toBe('function');
  });
});
