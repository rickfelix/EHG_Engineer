/**
 * Tests for DFE Adapter Layer
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V04: governance_enforcement_consistency)
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateEscalation } from '../../../lib/governance/dfe-adapter.js';

// Mock the dependencies
vi.mock('../../../lib/governance/decision-filter-engine.js', () => ({
  evaluate: vi.fn().mockReturnValue({
    decision: 'PROCEED',
    reasoning: 'Confidence above threshold',
    confidence: 0.9,
  }),
}));

vi.mock('../../../lib/governance/chairman-escalation.js', () => ({
  evaluateAndEscalate: vi.fn().mockResolvedValue({
    dfeResult: { decision: 'PROCEED', reasoning: 'High confidence' },
    escalation: null,
  }),
  requiresEscalation: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../lib/eva/unified-escalation-router.js', () => ({
  routeEscalation: vi.fn().mockResolvedValue({
    action: 'log_and_continue',
    eventId: 'evt-123',
    requiresChairman: false,
    severity: 'L1',
    severityLabel: 'Low',
  }),
  ESCALATION_TYPES: {
    DFE_SEVERITY: 'DFE_SEVERITY',
    CHAIRMAN_TIMEOUT: 'CHAIRMAN_TIMEOUT',
    GATE_FAILURE: 'GATE_FAILURE',
    MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
  },
}));

const mockSupabase = {};

describe('DFE Adapter Layer (GAP-012)', () => {
  it('routes handoff context to gate-based evaluation', async () => {
    const result = await evaluateEscalation(mockSupabase, {
      source: 'handoff',
      confidence: 0.9,
      sdId: 'test-sd',
      handoffType: 'plan-to-exec',
    });

    expect(result.decision).toBe('PROCEED');
    expect(result.escalated).toBe(false);
    expect(result.details.path).toBe('gate');
  });

  it('routes eva_service context to unified router', async () => {
    const result = await evaluateEscalation(mockSupabase, {
      source: 'eva_service',
      confidence: 0.85,
      type: 'cost_override',
      ventureId: 'venture-123',
    });

    expect(result.decision).toBe('PROCEED');
    expect(result.escalated).toBe(false);
    expect(result.details.path).toBe('router');
    expect(result.details.severity).toBe('L1');
  });

  it('routes manual context to unified router', async () => {
    const result = await evaluateEscalation(mockSupabase, {
      source: 'manual',
      confidence: 0.7,
      type: 'manual',
      ventureId: 'venture-456',
    });

    expect(result.details.path).toBe('router');
  });

  it('throws on missing supabase', async () => {
    await expect(evaluateEscalation(null, { source: 'handoff' }))
      .rejects.toThrow(/supabase client is required/);
  });

  it('throws on missing source', async () => {
    await expect(evaluateEscalation(mockSupabase, {}))
      .rejects.toThrow(/context.source is required/);
  });

  it('throws on unknown source', async () => {
    await expect(evaluateEscalation(mockSupabase, { source: 'alien' }))
      .rejects.toThrow(/unknown source 'alien'/);
  });
});
