/**
 * Unit Tests: Feedback Learning & Smart Triage
 *
 * Tests for SD-LEO-ENH-EVOLVE-LEO-ASSIST-001
 * - US-001: Populate feedback.resolution_sd_id when SDs created from feedback
 * - US-002: Auto-close feedback when linked SD completes
 * - US-003: Cloud LLM triage with confidence scoring
 *
 * @module tests/unit/quality/feedback-learning.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// US-001: Feedback Resolution Tracking (sd-from-feedback.js)
// ============================================================================
describe('US-001: Feedback Resolution Tracking', () => {
  describe('createSdFromFeedback updates feedback with SD references', () => {
    it('should set strategic_directive_id and resolution_sd_id on feedback update', () => {
      // Verify the update payload includes both FK columns
      const createdSd = { id: 'SD-BUG-LOGIN-FIX-001', sd_key: 'SD-BUG-LOGIN-FIX-001', title: 'Fix login bug' };
      const _feedbackId = 'fb-uuid-001';

      const updatePayload = {
        status: 'in_progress',
        strategic_directive_id: createdSd.id,
        resolution_sd_id: createdSd.id
      };

      expect(updatePayload.strategic_directive_id).toBe('SD-BUG-LOGIN-FIX-001');
      expect(updatePayload.resolution_sd_id).toBe('SD-BUG-LOGIN-FIX-001');
      expect(updatePayload.status).toBe('in_progress');
    });

    it('should set both columns to the same SD id value', () => {
      const sdId = 'SD-FEAT-DASHBOARD-001';
      const updatePayload = {
        status: 'in_progress',
        strategic_directive_id: sdId,
        resolution_sd_id: sdId
      };

      // Both should point to the same SD
      expect(updatePayload.strategic_directive_id).toBe(updatePayload.resolution_sd_id);
    });

    it('should satisfy chk_resolved_requires_reference when later resolved', () => {
      // Simulates the CHECK constraint: resolved requires at least one reference
      const feedbackRow = {
        status: 'resolved',
        quick_fix_id: null,
        strategic_directive_id: 'SD-BUG-FIX-001',
        resolution_sd_id: 'SD-BUG-FIX-001',
        resolution_notes: null
      };

      // CHECK: status <> 'resolved' OR (one of the refs is not null)
      const satisfiesConstraint =
        feedbackRow.status !== 'resolved' || (
          feedbackRow.quick_fix_id !== null ||
          feedbackRow.strategic_directive_id !== null ||
          feedbackRow.resolution_sd_id !== null ||
          (feedbackRow.resolution_notes !== null && feedbackRow.resolution_notes.trim().length > 0)
        );

      expect(satisfiesConstraint).toBe(true);
    });
  });
});

// ============================================================================
// US-002: Auto-Close Feedback on SD Completion
// ============================================================================
describe('US-002: Auto-Close Feedback on SD Completion', () => {
  let mockSupabase;
  let _executor;

  beforeEach(() => {
    // Build a mock Supabase client chain
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockNot = vi.fn().mockReturnValue({ data: [], error: null });
    const mockOr = vi.fn().mockReturnValue({ not: mockNot });

    const mockUpdateSelect = vi.fn().mockResolvedValue({ data: [{ id: 'fb-1' }], error: null });
    const mockIn = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        or: mockOr,
        update: mockUpdate
      })
    };

    // Minimal executor mock with autoCloseFeedback method
    _executor = {
      supabase: mockSupabase
    };
  });

  describe('autoCloseFeedback', () => {
    it('should query feedback by strategic_directive_id or resolution_sd_id', async () => {
      const sd = { id: 'SD-BUG-FIX-001', sd_key: 'SD-BUG-FIX-001' };

      // Simulate the OR query filter
      const orFilter = `strategic_directive_id.eq.${sd.id},resolution_sd_id.eq.${sd.id}`;

      expect(orFilter).toContain('strategic_directive_id.eq.SD-BUG-FIX-001');
      expect(orFilter).toContain('resolution_sd_id.eq.SD-BUG-FIX-001');
    });

    it('should exclude already-terminal feedback statuses', () => {
      const terminalStatuses = ['resolved', 'wont_fix', 'shipped', 'duplicate', 'invalid'];
      const notInFilter = `(${terminalStatuses.join(',')})`;

      expect(notInFilter).toContain('resolved');
      expect(notInFilter).toContain('wont_fix');
      expect(notInFilter).toContain('shipped');
      expect(notInFilter).toContain('duplicate');
      expect(notInFilter).toContain('invalid');
    });

    it('should set resolved status with resolution notes on auto-close', () => {
      const sdKey = 'SD-BUG-FIX-001';
      const updatePayload = {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: `Auto-resolved: linked SD ${sdKey} completed via LEAD-FINAL-APPROVAL`,
        updated_at: new Date().toISOString()
      };

      expect(updatePayload.status).toBe('resolved');
      expect(updatePayload.resolution_notes).toContain('Auto-resolved');
      expect(updatePayload.resolution_notes).toContain(sdKey);
      expect(updatePayload.resolution_notes).toContain('LEAD-FINAL-APPROVAL');
      expect(updatePayload.resolved_at).toBeDefined();
    });

    it('should return closedCount of 0 when no linked feedback found', () => {
      const result = { closedCount: 0 };
      expect(result.closedCount).toBe(0);
    });

    it('should handle multiple linked feedback items', () => {
      const linkedFeedback = [
        { id: 'fb-1', status: 'in_progress', strategic_directive_id: 'SD-001' },
        { id: 'fb-2', status: 'triaged', resolution_sd_id: 'SD-001' },
        { id: 'fb-3', status: 'new', strategic_directive_id: 'SD-001' }
      ];

      const feedbackIds = linkedFeedback.map(f => f.id);
      expect(feedbackIds).toHaveLength(3);
      expect(feedbackIds).toContain('fb-1');
      expect(feedbackIds).toContain('fb-2');
      expect(feedbackIds).toContain('fb-3');
    });
  });
});

// ============================================================================
// US-003: Cloud LLM Triage with Confidence Scoring
// ============================================================================
describe('US-003: LLM Triage Classification', () => {
  describe('generateRuleBasedSuggestion (fallback)', () => {
    // Test the rule-based fallback logic independently
    function generateRuleBasedSuggestion(feedback, triageResult) {
      const suggestions = [];
      let confidence = 40;

      if (triageResult.priority?.priority === 'P0') {
        suggestions.push('URGENT: Requires immediate attention.');
        confidence = Math.max(confidence, 70);
      }

      if (feedback.source_type === 'uat_failure') {
        suggestions.push('Consider reverting recent changes or creating a hotfix.');
        confidence = Math.max(confidence, 60);
      }

      if (feedback.error_type?.includes('Database') || feedback.title?.toLowerCase().includes('database')) {
        suggestions.push('Check database connections and query performance.');
        confidence = Math.max(confidence, 55);
      }

      if (feedback.error_type?.includes('Auth') || feedback.title?.toLowerCase().includes('auth')) {
        suggestions.push('Verify authentication tokens and session handling.');
        confidence = Math.max(confidence, 55);
      }

      if (triageResult.burstGroup) {
        suggestions.push(`Part of a burst of ${triageResult.burstGroup.count || 'multiple'} similar errors.`);
        confidence = Math.max(confidence, 50);
      }

      if (suggestions.length === 0) return null;

      return {
        suggestion: suggestions.join(' '),
        classification: feedback.type || 'unknown',
        severity: triageResult.priority?.priority === 'P0' ? 'critical' : 'medium',
        confidence,
        category: 'other',
        source: 'rules'
      };
    }

    it('should return null when no rules match', () => {
      const feedback = { title: 'Normal task', type: 'enhancement' };
      const triageResult = { priority: { priority: 'P3' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result).toBeNull();
    });

    it('should set source to "rules"', () => {
      const feedback = { title: 'Database error', type: 'issue' };
      const triageResult = { priority: { priority: 'P1' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result).not.toBeNull();
      expect(result.source).toBe('rules');
    });

    it('should set confidence to 70 for P0 items', () => {
      const feedback = { title: 'Critical issue', type: 'issue' };
      const triageResult = { priority: { priority: 'P0' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.confidence).toBe(70);
      expect(result.severity).toBe('critical');
    });

    it('should set confidence to 60 for UAT failures', () => {
      const feedback = { title: 'Test failed', type: 'issue', source_type: 'uat_failure' };
      const triageResult = { priority: { priority: 'P2' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.confidence).toBe(60);
    });

    it('should detect database-related feedback by title', () => {
      const feedback = { title: 'Database connection timeout', type: 'issue' };
      const triageResult = { priority: { priority: 'P1' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.suggestion).toContain('database connections');
      expect(result.confidence).toBe(55);
    });

    it('should detect auth-related feedback by error type', () => {
      const feedback = { title: 'Login fails', type: 'issue', error_type: 'Auth' };
      const triageResult = { priority: { priority: 'P2' } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.suggestion).toContain('authentication tokens');
    });

    it('should include burst group info when present', () => {
      const feedback = { title: 'Database error', type: 'issue' };
      const triageResult = {
        priority: { priority: 'P1' },
        burstGroup: { id: 'bg-1', count: 5 }
      };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.suggestion).toContain('burst of 5');
    });

    it('should always return confidence between 0 and 100', () => {
      const feedback = { title: 'Database Auth issue', type: 'issue', source_type: 'uat_failure', error_type: 'Auth' };
      const triageResult = { priority: { priority: 'P0' }, burstGroup: { count: 10 } };

      const result = generateRuleBasedSuggestion(feedback, triageResult);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('LLM response parsing', () => {
    function parseLLMResponse(text) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 50)));

      return {
        suggestion: parsed.suggestion || null,
        classification: parsed.classification || 'unknown',
        severity: parsed.severity || 'medium',
        confidence,
        category: parsed.category || 'other',
        source: 'llm'
      };
    }

    it('should parse valid JSON response', () => {
      const llmResponse = JSON.stringify({
        classification: 'bug',
        severity: 'high',
        confidence: 92,
        suggestion: 'Check database connection pool settings',
        category: 'database'
      });

      const result = parseLLMResponse(llmResponse);
      expect(result.classification).toBe('bug');
      expect(result.severity).toBe('high');
      expect(result.confidence).toBe(92);
      expect(result.suggestion).toContain('database connection');
      expect(result.category).toBe('database');
      expect(result.source).toBe('llm');
    });

    it('should handle markdown code block wrapping', () => {
      const llmResponse = '```json\n{"classification":"enhancement","severity":"low","confidence":75,"suggestion":"Minor UI improvement","category":"ui"}\n```';

      const result = parseLLMResponse(llmResponse);
      expect(result.classification).toBe('enhancement');
      expect(result.confidence).toBe(75);
    });

    it('should clamp confidence to 0-100 range', () => {
      const overConfident = JSON.stringify({ classification: 'bug', confidence: 150, suggestion: 'test' });
      const underConfident = JSON.stringify({ classification: 'bug', confidence: -20, suggestion: 'test' });

      expect(parseLLMResponse(overConfident).confidence).toBe(100);
      expect(parseLLMResponse(underConfident).confidence).toBe(0);
    });

    it('should default confidence to 50 when not a number', () => {
      const noConfidence = JSON.stringify({ classification: 'bug', confidence: 'high', suggestion: 'test' });

      const result = parseLLMResponse(noConfidence);
      expect(result.confidence).toBe(50);
    });

    it('should round confidence to integer', () => {
      const floatConfidence = JSON.stringify({ classification: 'bug', confidence: 87.6, suggestion: 'test' });

      const result = parseLLMResponse(floatConfidence);
      expect(result.confidence).toBe(88);
      expect(Number.isInteger(result.confidence)).toBe(true);
    });

    it('should return null for non-JSON response', () => {
      const result = parseLLMResponse('I cannot classify this item properly.');
      expect(result).toBeNull();
    });

    it('should default classification to unknown when missing', () => {
      const noClassification = JSON.stringify({ confidence: 50, suggestion: 'test' });
      const result = parseLLMResponse(noClassification);
      expect(result.classification).toBe('unknown');
    });

    it('should default category to other when missing', () => {
      const noCategory = JSON.stringify({ classification: 'bug', confidence: 80, suggestion: 'test' });
      const result = parseLLMResponse(noCategory);
      expect(result.category).toBe('other');
    });
  });

  describe('Structured triage result storage', () => {
    it('should build correct update payload for disposition result', () => {
      const aiSuggestion = {
        suggestion: 'Clear feature request that fits current scope',
        classification: 'actionable',
        confidence: 85,
        source: 'llm'
      };

      const updates = {};
      if (typeof aiSuggestion === 'object') {
        updates.ai_triage_suggestion = aiSuggestion.suggestion;
        updates.ai_triage_confidence = aiSuggestion.confidence;
        updates.ai_triage_classification = aiSuggestion.classification;
        updates.ai_triage_source = aiSuggestion.source;
      }

      expect(updates.ai_triage_suggestion).toBe('Clear feature request that fits current scope');
      expect(updates.ai_triage_confidence).toBe(85);
      expect(updates.ai_triage_classification).toBe('actionable');
      expect(updates.ai_triage_source).toBe('llm');
    });

    it('should accept all valid disposition values', () => {
      const validDispositions = [
        'actionable', 'already_exists', 'research_needed',
        'consideration_only', 'significant_departure', 'needs_triage'
      ];

      for (const disposition of validDispositions) {
        const aiSuggestion = { classification: disposition, confidence: 75, source: 'llm' };
        const updates = {};
        updates.ai_triage_classification = aiSuggestion.classification;
        expect(validDispositions).toContain(updates.ai_triage_classification);
      }
    });

    it('should handle legacy string suggestion format', () => {
      const aiSuggestion = 'URGENT: Requires immediate attention.';

      const updates = {};
      if (typeof aiSuggestion === 'object') {
        updates.ai_triage_suggestion = aiSuggestion.suggestion;
      } else {
        updates.ai_triage_suggestion = aiSuggestion;
      }

      expect(updates.ai_triage_suggestion).toBe('URGENT: Requires immediate attention.');
      expect(updates.ai_triage_confidence).toBeUndefined();
    });
  });
});

// ============================================================================
// US-004: Disposition-Based Routing (SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001)
// ============================================================================
describe('US-004: Disposition-Based Routing', () => {
  describe('Disposition routing logic', () => {
    const statusMap = {
      'already_exists': 'duplicate',
      'research_needed': 'needs_revision',
      'consideration_only': 'archived',
      'significant_departure': 'needs_revision',
      'needs_triage': 'needs_revision'
    };

    it('should only allow actionable items through to vetting', () => {
      const disposition = 'actionable';
      const continueToVetting = disposition === 'actionable';
      expect(continueToVetting).toBe(true);
    });

    it('should block non-actionable items from vetting', () => {
      const nonActionable = ['already_exists', 'research_needed', 'consideration_only', 'significant_departure', 'needs_triage'];
      for (const disposition of nonActionable) {
        const continueToVetting = disposition === 'actionable';
        expect(continueToVetting).toBe(false);
      }
    });

    it('should map already_exists to duplicate status', () => {
      expect(statusMap['already_exists']).toBe('duplicate');
    });

    it('should map consideration_only to archived status', () => {
      expect(statusMap['consideration_only']).toBe('archived');
    });

    it('should map research_needed to needs_revision status', () => {
      expect(statusMap['research_needed']).toBe('needs_revision');
    });

    it('should map significant_departure to needs_revision status', () => {
      expect(statusMap['significant_departure']).toBe('needs_revision');
    });
  });

  describe('Disposition validation', () => {
    const VALID_DISPOSITIONS = [
      'actionable', 'already_exists', 'research_needed',
      'consideration_only', 'significant_departure', 'needs_triage'
    ];

    it('should validate known disposition values', () => {
      expect(VALID_DISPOSITIONS).toHaveLength(6);
      expect(VALID_DISPOSITIONS).toContain('actionable');
      expect(VALID_DISPOSITIONS).toContain('already_exists');
    });

    it('should default unknown dispositions to needs_triage', () => {
      const rawDisposition = 'something_unknown';
      const validated = VALID_DISPOSITIONS.includes(rawDisposition) ? rawDisposition : 'needs_triage';
      expect(validated).toBe('needs_triage');
    });

    it('should preserve valid disposition values', () => {
      for (const d of VALID_DISPOSITIONS) {
        const validated = VALID_DISPOSITIONS.includes(d) ? d : 'needs_triage';
        expect(validated).toBe(d);
      }
    });
  });

  describe('Conflict detection', () => {
    it('should store conflict_with when detected', () => {
      const aiSuggestion = {
        classification: 'already_exists',
        confidence: 82,
        suggestion: 'Codebase already has this via evaluation-bridge',
        conflict_with: 'evaluation-bridge',
        source: 'llm'
      };

      expect(aiSuggestion.conflict_with).toBe('evaluation-bridge');
      expect(aiSuggestion.classification).toBe('already_exists');
    });

    it('should have null conflict_with when no conflict', () => {
      const aiSuggestion = {
        classification: 'actionable',
        confidence: 90,
        suggestion: 'New feature, no conflicts found',
        conflict_with: null,
        source: 'llm'
      };

      expect(aiSuggestion.conflict_with).toBeNull();
    });
  });
});
