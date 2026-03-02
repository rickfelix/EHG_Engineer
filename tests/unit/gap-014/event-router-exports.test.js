/**
 * Tests for event-router.js exports added by GAP-014
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-014 (A04)
 */

import { describe, it, expect } from 'vitest';
import {
  checkEscalationThreshold,
  ESCALATION_THRESHOLD_MS,
  classifyRoutingMode,
  ROUTING_MODES,
} from '../../../lib/eva/event-bus/event-router.js';

describe('event-router GAP-014 exports', () => {
  it('exports checkEscalationThreshold as a function', () => {
    expect(typeof checkEscalationThreshold).toBe('function');
  });

  it('exports ESCALATION_THRESHOLD_MS as a number', () => {
    expect(typeof ESCALATION_THRESHOLD_MS).toBe('number');
    expect(ESCALATION_THRESHOLD_MS).toBeGreaterThan(0);
  });

  it('classifyRoutingMode routes governance events to PRIORITY_QUEUE', () => {
    expect(classifyRoutingMode('guardrail.violated', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('chairman.decision_required', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('gate.blocked', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
  });

  it('classifyRoutingMode routes critical payload to PRIORITY_QUEUE', () => {
    expect(classifyRoutingMode('custom.event', { priority: 'critical' })).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('custom.event', { urgent: true })).toBe(ROUTING_MODES.PRIORITY_QUEUE);
  });

  it('classifyRoutingMode routes standard events to EVENT', () => {
    expect(classifyRoutingMode('stage.completed', {})).toBe(ROUTING_MODES.EVENT);
    expect(classifyRoutingMode('decision.submitted', {})).toBe(ROUTING_MODES.EVENT);
  });

  it('classifyRoutingMode routes round events to ROUND', () => {
    expect(classifyRoutingMode('round.daily', {})).toBe(ROUTING_MODES.ROUND);
    expect(classifyRoutingMode('cadence.weekly', {})).toBe(ROUTING_MODES.ROUND);
  });
});
