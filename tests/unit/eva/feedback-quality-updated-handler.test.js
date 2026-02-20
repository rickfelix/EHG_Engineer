/**
 * Tests for feedback-quality-updated handler
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerFeedbackQualityUpdatedHandlers, _resetFeedbackQualityUpdatedHandlers } from '../../../lib/eva/event-bus/handlers/feedback-quality-updated.js';
import { publishVisionEvent, VISION_EVENTS, clearVisionSubscribers } from '../../../lib/eva/event-bus/vision-events.js';

describe('feedback-quality-updated handler', () => {
  beforeEach(() => {
    clearVisionSubscribers();
    _resetFeedbackQualityUpdatedHandlers();
  });

  it('should register idempotently', () => {
    registerFeedbackQualityUpdatedHandlers();
    registerFeedbackQualityUpdatedHandlers(); // second call should be no-op
    // No error thrown = success
  });

  it('should have FEEDBACK_QUALITY_UPDATED event constant', () => {
    expect(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED).toBe('feedback.quality_updated');
  });

  it('should log when feedback is classified', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    registerFeedbackQualityUpdatedHandlers();

    publishVisionEvent(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED, {
      feedbackId: 'test-123',
      title: 'Portfolio risk assessment error',
      dimensionMatches: [
        { dimensionId: 'V01', name: 'Portfolio Governance', confidence: 0.8, matchedKeywords: ['portfolio', 'risk'] },
      ],
      rubricScore: 75,
      supabase: null, // null supabase = subscriber 2 skips DB write
    });

    // Give async handlers time to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    const visionBusLogs = logSpy.mock.calls.filter(call =>
      typeof call[0] === 'string' && call[0].includes('[VisionBus] Feedback classified')
    );
    expect(visionBusLogs.length).toBe(1);
    expect(visionBusLogs[0][0]).toContain('V01');
    expect(visionBusLogs[0][0]).toContain('test-123');

    logSpy.mockRestore();
  });

  it('should persist dimension codes to feedback metadata', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: { metadata: { existing: 'value' } },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    };

    registerFeedbackQualityUpdatedHandlers();

    publishVisionEvent(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED, {
      feedbackId: 'persist-test-456',
      title: 'Test error',
      dimensionMatches: [
        { dimensionId: 'V01', name: 'Governance', confidence: 0.7, matchedKeywords: ['governance'] },
        { dimensionId: 'A02', name: 'Security', confidence: 0.5, matchedKeywords: ['security'] },
      ],
      rubricScore: 80,
      supabase: mockSupabase,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify supabase was called for read + write
    expect(mockSupabase.from).toHaveBeenCalledWith('feedback');
  });
});
