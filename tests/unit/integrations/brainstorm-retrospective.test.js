/**
 * Brainstorm Retrospective Engine Tests
 *
 * Tests for session recording, question effectiveness,
 * related session discovery, and retrospective completion.
 *
 * Part of SD-LEO-FIX-EXPAND-BRAINSTORM-COMMAND-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv before importing module
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// Mock supabase
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();

const chainable = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  upsert: mockUpsert,
  eq: mockEq,
  in: mockIn,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
};

// Each method returns the chainable object for chaining
for (const fn of Object.values(chainable)) {
  fn.mockReturnValue(chainable);
}

const mockFrom = vi.fn().mockReturnValue(chainable);
const mockSupabase = { from: mockFrom };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Set env vars before import
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const {
  recordSession,
  recordQuestionInteractions,
  updateQuestionEffectiveness: _updateQuestionEffectiveness,
  getEffectiveQuestions,
  findRelatedSessions,
  completeRetrospective,
  getPendingRetrospectives,
} = await import('../../../lib/integrations/brainstorm-retrospective.js');

describe('brainstorm-retrospective', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain returns
    for (const fn of Object.values(chainable)) {
      fn.mockReturnValue(chainable);
    }
  });

  describe('recordSession', () => {
    it('inserts session with all fields', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 'session-1', domain: 'protocol', topic: 'test' },
        error: null,
      });

      const result = await recordSession({
        domain: 'protocol',
        topic: 'Improve handoff gates',
        mode: 'conversational',
        stage: 'discovery',
        ventureIds: null,
        crossVenture: false,
        outcomeType: 'sd_created',
        qualityScore: 80,
        crystallizationScore: 0.85,
        documentPath: 'brainstorm/2026-02-10-improve-handoff-gates.md',
        metadata: { questions_asked: 5 },
      });

      expect(mockFrom).toHaveBeenCalledWith('brainstorm_sessions');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'protocol',
        topic: 'Improve handoff gates',
        mode: 'conversational',
        stage: 'discovery',
        outcome_type: 'sd_created',
        session_quality_score: 80,
        crystallization_score: 0.85,
        retrospective_status: 'pending',
      }));
      expect(result.id).toBe('session-1');
    });

    it('uses defaults for optional fields', async () => {
      mockSingle.mockResolvedValue({
        data: { id: 'session-2' },
        error: null,
      });

      await recordSession({
        domain: 'venture',
        topic: 'New chatbot',
        mode: 'structured',
        stage: 'ideation',
      });

      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        venture_ids: null,
        cross_venture: false,
        outcome_type: 'no_action',
        retrospective_status: 'pending',
      }));
    });

    it('throws on insert error', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'insert failed' },
      });

      await expect(recordSession({
        domain: 'protocol',
        topic: 'test',
        mode: 'conversational',
        stage: 'discovery',
      })).rejects.toThrow('Failed to record session');
    });
  });

  describe('recordQuestionInteractions', () => {
    it('inserts all interactions', async () => {
      mockInsert.mockReturnValue({ error: null });

      const count = await recordQuestionInteractions('session-1', [
        { questionId: 'p_friction', domain: 'protocol', phase: 'discovery', outcome: 'answered', answerLength: 200 },
        { questionId: 'p_evidence', domain: 'protocol', phase: 'discovery', outcome: 'answered', answerLength: 150 },
        { questionId: 'p_workaround', domain: 'protocol', phase: 'discovery', outcome: 'skipped' },
      ]);

      expect(count).toBe(3);
      expect(mockFrom).toHaveBeenCalledWith('brainstorm_question_interactions');
      expect(mockInsert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          session_id: 'session-1',
          question_id: 'p_friction',
          outcome: 'answered',
        }),
      ]));
    });

    it('throws on insert error', async () => {
      mockInsert.mockReturnValue({ error: { message: 'fk violation' } });

      await expect(recordQuestionInteractions('bad-session', [
        { questionId: 'q1', domain: 'protocol', phase: 'discovery', outcome: 'answered' },
      ])).rejects.toThrow('Failed to record interactions');
    });
  });

  describe('getEffectiveQuestions', () => {
    it('returns questions sorted by effectiveness', async () => {
      mockOrder.mockResolvedValue({
        data: [
          { question_id: 'p_friction', effectiveness_score: 0.9, total_sessions: 10, led_to_action_count: 3 },
          { question_id: 'p_evidence', effectiveness_score: 0.7, total_sessions: 10, led_to_action_count: 1 },
        ],
        error: null,
      });

      const result = await getEffectiveQuestions('protocol');

      expect(result).toHaveLength(2);
      expect(result[0].question_id).toBe('p_friction');
      expect(result[0].effectiveness_score).toBe(0.9);
    });

    it('returns empty array on error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'table not found' } });

      const result = await getEffectiveQuestions('protocol');
      expect(result).toEqual([]);
    });
  });

  describe('findRelatedSessions', () => {
    it('finds sessions with overlapping keywords', async () => {
      mockLimit.mockResolvedValue({
        data: [
          { id: 's1', domain: 'protocol', topic: 'Improve handoff gate scoring', outcome_type: 'sd_created', created_at: '2026-02-09' },
          { id: 's2', domain: 'protocol', topic: 'Add new venture type', outcome_type: 'no_action', created_at: '2026-02-08' },
        ],
        error: null,
      });

      const result = await findRelatedSessions('handoff gate improvements');

      expect(result.length).toBeGreaterThan(0);
      // 'handoff' and 'gate' should match s1
      expect(result[0].id).toBe('s1');
    });

    it('returns empty for short topic words', async () => {
      const result = await findRelatedSessions('do it');
      expect(result).toEqual([]);
    });

    it('returns empty on error', async () => {
      mockLimit.mockResolvedValue({ data: null, error: { message: 'err' } });

      const result = await findRelatedSessions('some topic here');
      expect(result).toEqual([]);
    });
  });

  describe('completeRetrospective', () => {
    it('updates session and triggers effectiveness recalc', async () => {
      // First call: update session → single() resolves with domain
      // Second call: fetch interactions → eq() resolves empty
      let singleCallCount = 0;
      mockSingle.mockImplementation(() => {
        singleCallCount++;
        if (singleCallCount === 1) {
          return Promise.resolve({ data: { domain: 'protocol' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // For the effectiveness recalc, the interactions query returns empty
      // This happens via from().select().eq() chain where eq resolves
      let eqCallCount = 0;
      mockEq.mockImplementation(() => {
        eqCallCount++;
        // After the update chain completes, subsequent eq() calls are for
        // the effectiveness recalc queries - return resolved empty data
        if (eqCallCount > 2) {
          return Promise.resolve({ data: [], error: null });
        }
        return chainable;
      });

      await completeRetrospective('session-1', {
        createdSdId: 'SD-LEARN-001',
        qualityScore: 90,
      });

      expect(mockFrom).toHaveBeenCalledWith('brainstorm_sessions');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        retrospective_status: 'completed',
        created_sd_id: 'SD-LEARN-001',
        session_quality_score: 90,
      }));
    });

    it('throws on update error', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      await expect(completeRetrospective('bad-id'))
        .rejects.toThrow('Failed to update session');
    });
  });

  describe('getPendingRetrospectives', () => {
    it('returns pending sessions ordered by creation', async () => {
      mockLimit.mockResolvedValue({
        data: [
          { id: 's1', domain: 'venture', topic: 'Chatbot', outcome_type: 'sd_created', created_at: '2026-02-09' },
        ],
        error: null,
      });

      const result = await getPendingRetrospectives();

      expect(result).toHaveLength(1);
      expect(mockEq).toHaveBeenCalledWith('retrospective_status', 'pending');
    });

    it('returns empty on error', async () => {
      mockLimit.mockResolvedValue({ data: null, error: { message: 'err' } });

      const result = await getPendingRetrospectives();
      expect(result).toEqual([]);
    });
  });
});
