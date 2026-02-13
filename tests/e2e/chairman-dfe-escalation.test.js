/**
 * E2E Test: Chairman DFE Escalation API
 * SD-EVA-FEAT-DFE-PRESENTATION-001
 *
 * Tests the full API flow for DFE escalation context retrieval
 * and mitigation action recording.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = `http://localhost:${process.env.PORT || 3000}/api/chairman`;

// Skip if no Supabase credentials
const canRun = SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL !== 'your_supabase_url_here';

describe.skipIf(!canRun)('Chairman DFE Escalation API (E2E)', () => {
  let supabase;
  let testDecisionId;
  let testVentureId;

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Find an existing venture to use as test context
    const { data: ventures } = await supabase
      .from('ventures')
      .select('id')
      .limit(1);

    testVentureId = ventures?.[0]?.id;

    if (!testVentureId) {
      // Create a test venture if none exist
      const { data: newVenture } = await supabase
        .from('ventures')
        .insert({
          name: 'E2E Test Venture - DFE',
          description: 'Test venture for DFE escalation E2E',
          status: 'active',
        })
        .select('id')
        .single();
      testVentureId = newVenture?.id;
    }

    // Create a test chairman_decision with DFE context
    const { data: decision, error } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: testVentureId,
        lifecycle_stage: 3,
        health_score: 55,
        recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
        decision: null,
        status: 'pending',
        summary: 'E2E test decision with DFE escalation',
        dfe_context: {
          auto_proceed: false,
          triggers: [
            {
              type: 'cost_threshold',
              severity: 'HIGH',
              message: 'Budget exceeded by 40%',
              details: { projected: 140000, approved: 100000 },
            },
            {
              type: 'novel_pattern',
              severity: 'INFO',
              message: 'New technology stack detected',
              details: { tech: 'Rust WASM' },
            },
          ],
          recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
          evaluated_at: new Date().toISOString(),
        },
        mitigation_actions: [],
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create test decision:', error.message);
    }
    testDecisionId = decision?.id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testDecisionId && supabase) {
      await supabase.from('chairman_decisions').delete().eq('id', testDecisionId);
    }
  });

  describe('GET /api/chairman/decisions/:decisionId/dfe-escalation', () => {
    it('returns 404 for non-existent decision', async () => {
      const res = await fetch(`${API_BASE}/decisions/00000000-0000-0000-0000-000000000000/dfe-escalation`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 for invalid decision ID', async () => {
      const res = await fetch(`${API_BASE}/decisions//dfe-escalation`);
      // Route won't match with empty param, expect 404 from Express
      expect([400, 404]).toContain(res.status);
    });

    it('returns full escalation context for valid decision', async () => {
      if (!testDecisionId) return;

      const res = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      // Verify payload structure
      const { data } = body;
      expect(data.decisionId).toBe(testDecisionId);
      expect(data.ventureId).toBe(testVentureId);
      expect(data.lifecycleStage).toBe(3);
      expect(data.recommendation).toBe('PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS');
      expect(data.autoProceeded).toBe(false);

      // Verify triggers are normalized and sorted by severity
      expect(data.triggers).toHaveLength(2);
      expect(data.triggers[0].severity).toBe('HIGH');
      expect(data.triggers[0].label).toBe('Cost Threshold Exceeded');
      expect(data.triggers[1].severity).toBe('INFO');
      expect(data.triggers[1].label).toBe('Novel Pattern Detected');

      // Verify counts
      expect(data.triggerCount).toBe(2);
      expect(data.highSeverityCount).toBe(1);

      // Verify mitigation and pattern arrays exist
      expect(Array.isArray(data.mitigationActions)).toBe(true);
      expect(Array.isArray(data.historicalPatterns)).toBe(true);
      expect(Array.isArray(data.recentEvents)).toBe(true);
    });
  });

  describe('POST /api/chairman/decisions/:decisionId/dfe-escalation/mitigate', () => {
    it('returns 400 for missing required fields', async () => {
      if (!testDecisionId) return;

      const res = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 for invalid action value', async () => {
      if (!testDecisionId) return;

      const res = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mitigationId: 'cost_threshold',
          action: 'maybe',
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('accept');
    });

    it('records an accept action successfully', async () => {
      if (!testDecisionId) return;

      const idempotencyKey = `e2e-test-${Date.now()}`;
      const res = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mitigationId: 'cost_threshold',
          action: 'accept',
          reason: 'Budget approved by finance team',
          idempotencyKey,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify the action was persisted
      const { data: decision } = await supabase
        .from('chairman_decisions')
        .select('mitigation_actions')
        .eq('id', testDecisionId)
        .single();

      const actions = decision.mitigation_actions;
      expect(actions).toHaveLength(1);
      expect(actions[0].mitigation_id).toBe('cost_threshold');
      expect(actions[0].action).toBe('accept');
      expect(actions[0].reason).toBe('Budget approved by finance team');
    });

    it('is idempotent for duplicate requests', async () => {
      if (!testDecisionId) return;

      const idempotencyKey = `e2e-idempotent-${Date.now()}`;
      const payload = {
        mitigationId: 'novel_pattern',
        action: 'reject',
        reason: 'Tech stack not approved',
        idempotencyKey,
      };

      // First request
      const res1 = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res1.status).toBe(200);

      // Second request (same idempotency key)
      const res2 = await fetch(`${API_BASE}/decisions/${testDecisionId}/dfe-escalation/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res2.status).toBe(200);

      // Should only have the actions from both test cases, not duplicate
      const { data: decision } = await supabase
        .from('chairman_decisions')
        .select('mitigation_actions')
        .eq('id', testDecisionId)
        .single();

      const novelActions = decision.mitigation_actions.filter(
        a => a.mitigation_id === 'novel_pattern' && a.idempotency_key === idempotencyKey,
      );
      expect(novelActions).toHaveLength(1);
    });
  });
});
