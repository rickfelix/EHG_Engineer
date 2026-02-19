/**
 * Unit Tests: Vision Event Bus
 * Part of SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Tests: publishVisionEvent, subscribeVisionEvent, clearVisionSubscribers,
 *        VISION_EVENTS constants, error isolation between subscribers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  publishVisionEvent,
  subscribeVisionEvent,
  clearVisionSubscribers,
  getSubscriberCount,
  VISION_EVENTS,
} from '../../lib/eva/event-bus/vision-events.js';
import {
  registerVisionScoredHandlers,
  _resetVisionScoredHandlers,
} from '../../lib/eva/event-bus/handlers/vision-scored.js';
import {
  registerVisionGapDetectedHandlers,
  _resetVisionGapDetectedHandlers,
} from '../../lib/eva/event-bus/handlers/vision-gap-detected.js';
import {
  registerVisionProcessGapDetectedHandlers,
  _resetVisionProcessGapDetectedHandlers,
} from '../../lib/eva/event-bus/handlers/vision-process-gap-detected.js';

// ─── VISION_EVENTS constants ─────────────────────────────────────────────────

describe('VISION_EVENTS', () => {
  it('defines all four vision event types', () => {
    expect(VISION_EVENTS.SCORED).toBe('vision.scored');
    expect(VISION_EVENTS.GAP_DETECTED).toBe('vision.gap_detected');
    expect(VISION_EVENTS.CORRECTIVE_SD_CREATED).toBe('vision.corrective_sd_created');
    expect(VISION_EVENTS.PROCESS_GAP_DETECTED).toBe('vision.process_gap_detected');
  });
});

// ─── publishVisionEvent / subscribeVisionEvent ───────────────────────────────

describe('publishVisionEvent + subscribeVisionEvent', () => {
  beforeEach(() => {
    clearVisionSubscribers();
  });

  it('delivers payload to a subscribed handler', async () => {
    const received = [];
    subscribeVisionEvent(VISION_EVENTS.SCORED, async (payload) => {
      received.push(payload);
    });

    publishVisionEvent(VISION_EVENTS.SCORED, { sdKey: 'SD-TEST-001', totalScore: 85 });
    // Allow async handler to run
    await new Promise(r => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0].sdKey).toBe('SD-TEST-001');
    expect(received[0].totalScore).toBe(85);
  });

  it('delivers to multiple subscribers for the same event type', async () => {
    const calls = [];
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => calls.push('subscriber-1'));
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => calls.push('subscriber-2'));

    publishVisionEvent(VISION_EVENTS.SCORED, { sdKey: 'SD-TEST-002' });
    await new Promise(r => setTimeout(r, 10));
    expect(calls).toContain('subscriber-1');
    expect(calls).toContain('subscriber-2');
  });

  it('does not deliver to subscribers of a different event type', async () => {
    const calls = [];
    subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async () => calls.push('gap-handler'));

    publishVisionEvent(VISION_EVENTS.SCORED, { sdKey: 'SD-TEST-003' });
    await new Promise(r => setTimeout(r, 10));
    expect(calls).toHaveLength(0);
  });

  it('catches and logs subscriber errors without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => {
      throw new Error('subscriber exploded');
    });

    // publishVisionEvent must not throw
    expect(() => publishVisionEvent(VISION_EVENTS.SCORED, {})).not.toThrow();
    await new Promise(r => setTimeout(r, 10));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('subscriber exploded'));
    consoleSpy.mockRestore();
  });

  it('second subscriber executes even if first subscriber throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const executed = [];
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => { throw new Error('sub1 fail'); });
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => { executed.push('sub2'); });

    publishVisionEvent(VISION_EVENTS.SCORED, {});
    await new Promise(r => setTimeout(r, 20));
    expect(executed).toContain('sub2');
    consoleSpy.mockRestore();
  });

  it('clearVisionSubscribers removes all listeners', async () => {
    const calls = [];
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => calls.push('fired'));
    clearVisionSubscribers();
    publishVisionEvent(VISION_EVENTS.SCORED, {});
    await new Promise(r => setTimeout(r, 10));
    expect(calls).toHaveLength(0);
  });
});

// ─── getSubscriberCount ───────────────────────────────────────────────────────

describe('getSubscriberCount', () => {
  beforeEach(() => clearVisionSubscribers());

  it('returns 0 when no subscribers', () => {
    expect(getSubscriberCount(VISION_EVENTS.SCORED)).toBe(0);
  });

  it('returns correct count after subscriptions', () => {
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => {});
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => {});
    expect(getSubscriberCount(VISION_EVENTS.SCORED)).toBe(2);
  });

  it('returns 0 after clearVisionSubscribers', () => {
    subscribeVisionEvent(VISION_EVENTS.SCORED, async () => {});
    clearVisionSubscribers();
    expect(getSubscriberCount(VISION_EVENTS.SCORED)).toBe(0);
  });
});

// ─── registerVisionScoredHandlers (idempotency) ───────────────────────────────

describe('registerVisionScoredHandlers', () => {
  beforeEach(() => {
    clearVisionSubscribers();
    _resetVisionScoredHandlers();
  });

  afterEach(() => {
    clearVisionSubscribers();
    _resetVisionScoredHandlers();
  });

  it('registers exactly 2 subscribers on first call', () => {
    registerVisionScoredHandlers();
    expect(getSubscriberCount(VISION_EVENTS.SCORED)).toBe(2);
  });

  it('is idempotent — second call does not add more subscribers', () => {
    registerVisionScoredHandlers();
    registerVisionScoredHandlers();
    expect(getSubscriberCount(VISION_EVENTS.SCORED)).toBe(2);
  });
});

// ─── registerVisionGapDetectedHandlers ─────────────────────────────────────

describe('registerVisionGapDetectedHandlers', () => {
  beforeEach(() => {
    clearVisionSubscribers();
    _resetVisionGapDetectedHandlers();
  });

  afterEach(() => {
    clearVisionSubscribers();
    _resetVisionGapDetectedHandlers();
  });

  it('registers 1 subscriber for gap detected events', () => {
    registerVisionGapDetectedHandlers();
    expect(getSubscriberCount(VISION_EVENTS.GAP_DETECTED)).toBe(1);
  });

  it('is idempotent — double registration stays at 1', () => {
    registerVisionGapDetectedHandlers();
    registerVisionGapDetectedHandlers();
    expect(getSubscriberCount(VISION_EVENTS.GAP_DETECTED)).toBe(1);
  });

  it('logs gap info when event is published', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    registerVisionGapDetectedHandlers();
    publishVisionEvent(VISION_EVENTS.GAP_DETECTED, { sdKey: 'SD-FOO-001', dimension: 'alignment', score: 42, threshold: 70 });
    await new Promise(r => setTimeout(r, 10));
    const output = consoleSpy.mock.calls.map(c => c[0]).join(' ');
    expect(output).toContain('alignment');
    consoleSpy.mockRestore();
  });
});

// ─── registerVisionProcessGapDetectedHandlers ───────────────────────────────

describe('registerVisionProcessGapDetectedHandlers', () => {
  beforeEach(() => {
    clearVisionSubscribers();
    _resetVisionProcessGapDetectedHandlers();
  });

  afterEach(() => {
    clearVisionSubscribers();
    _resetVisionProcessGapDetectedHandlers();
  });

  it('registers 1 subscriber for process gap events', () => {
    registerVisionProcessGapDetectedHandlers();
    expect(getSubscriberCount(VISION_EVENTS.PROCESS_GAP_DETECTED)).toBe(1);
  });

  it('is idempotent', () => {
    registerVisionProcessGapDetectedHandlers();
    registerVisionProcessGapDetectedHandlers();
    expect(getSubscriberCount(VISION_EVENTS.PROCESS_GAP_DETECTED)).toBe(1);
  });

  it('logs process gap when event fires', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    registerVisionProcessGapDetectedHandlers();
    publishVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, {
      gapType: 'dimension_systemic',
      description: 'A05 consistently low',
      sdKey: 'SD-BAR-001',
      severity: 'high',
    });
    await new Promise(r => setTimeout(r, 10));
    const output = consoleSpy.mock.calls.map(c => c[0]).join(' ');
    expect(output).toContain('dimension_systemic');
    consoleSpy.mockRestore();
  });
});
