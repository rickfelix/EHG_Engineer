import { describe, it, expect, vi } from 'vitest';

// Mock the LLM client factory before importing the module
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn().mockResolvedValue({ text: 'LLM-generated digest summary for the week.' })
  }))
}));

// Mock supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn(cb => cb({ error: null })),
    })),
  }))
}));

// Dynamic import after mocks are set up
const { fridayMeetingHandler, processMeetingDecisions } = await import('../../../scripts/eva/friday-meeting.mjs');

describe('Weekly Digest Generation', () => {
  it('fridayMeetingHandler returns results with digest field', async () => {
    const results = await fridayMeetingHandler({ interactive: false });
    expect(results).toBeDefined();
    expect(results.sections).toBeDefined();
    expect(results.digest).toBeDefined();
    expect(typeof results.digest).toBe('string');
    expect(results.digest.length).toBeGreaterThan(0);
  });

  it('processMeetingDecisions accepts chairmanNotes option', async () => {
    const summary = await processMeetingDecisions([], { chairmanNotes: 'Good week overall.' });
    expect(summary.accepted).toBe(0);
    expect(summary.dismissed).toBe(0);
    expect(summary.deferred).toBe(0);
  });
});
