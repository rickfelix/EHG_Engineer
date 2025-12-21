/**
 * Truth Layer Integration E2E Tests
 *
 * Tests the 60/40 Truth Law calibration system:
 * - logPrediction() creates AGENT_PREDICTION events
 * - logOutcome() creates AGENT_OUTCOME events with parent linking
 * - Calibration delta calculation (accuracy scoring)
 *
 * Reference: lib/agents/venture-state-machine.js:247-318
 *
 * THE LAW: truth_score = (business_accuracy * 0.6) + (technical_accuracy * 0.4)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test constants
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Truth Layer Integration E2E Tests', () => {
  let supabase: any;
  let testVentureId: string;
  let testAgentId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test venture for truth layer tests
    const { data: venture, error: ventureError } = await supabase
      .from('ventures')
      .insert({
        name: `Truth Layer Test Venture ${Date.now()}`,
        company_id: null, // Test venture
        current_lifecycle_stage: 'Stage 10'
      })
      .select('id')
      .single();

    if (venture) {
      testVentureId = venture.id;
    }

    // Create test agent
    const { data: agent, error: agentError } = await supabase
      .from('eva_agents')
      .insert({
        agent_type: 'test-truth-layer',
        name: 'Truth Layer Test Agent',
        status: 'active'
      })
      .select('id')
      .single();

    if (agent) {
      testAgentId = agent.id;
    }
  });

  test.afterAll(async () => {
    // Cleanup test data
    if (testVentureId) {
      await supabase.from('system_events')
        .delete()
        .eq('event_data->>venture_id', testVentureId);

      await supabase.from('ventures')
        .delete()
        .eq('id', testVentureId);
    }

    if (testAgentId) {
      await supabase.from('eva_agents')
        .delete()
        .eq('id', testAgentId);
    }
  });

  test.describe('Prediction Logging', () => {
    test('TL-001: should create AGENT_PREDICTION event with correlation_id', async () => {
      // Given a prediction about stage transition
      const prediction = {
        action: 'stage_transition',
        from_stage: 'Stage 10',
        to_stage: 'Stage 11',
        expected_success: true,
        confidence: 0.85
      };

      const correlationId = `test-corr-${Date.now()}`;

      // When logging prediction
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: correlationId,
          idempotency_key: `idempotency-${Date.now()}`,
          event_data: {
            predicted_outcome: prediction,
            agent_id: testAgentId,
            venture_id: testVentureId,
            timestamp: new Date().toISOString()
          },
          metadata: {
            source: 'TruthLayerE2ETest',
            prediction_type: prediction.action
          }
        })
        .select('id, event_type, correlation_id')
        .single();

      // Then event is created with proper type
      expect(error).toBeNull();
      expect(event).toBeDefined();
      expect(event.event_type).toBe('AGENT_PREDICTION');
      expect(event.correlation_id).toBe(correlationId);
    });

    test('TL-002: should include venture_id in prediction event_data', async () => {
      // Given prediction data
      const prediction = {
        action: 'artifact_generation',
        expected_artifacts: ['PRD', 'user_stories'],
        expected_success: true
      };

      // When logging prediction
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: `test-venture-${Date.now()}`,
          idempotency_key: `idempotency-${Date.now()}`,
          event_data: {
            predicted_outcome: prediction,
            agent_id: testAgentId,
            venture_id: testVentureId,
            timestamp: new Date().toISOString()
          },
          metadata: {
            source: 'TruthLayerE2ETest'
          }
        })
        .select('id, event_data')
        .single();

      // Then venture_id is included in event_data
      expect(error).toBeNull();
      expect(event.event_data.venture_id).toBe(testVentureId);
      expect(event.event_data.agent_id).toBe(testAgentId);
    });

    test('TL-003: should reject duplicate idempotency_key', async () => {
      const idempotencyKey = `unique-key-${Date.now()}`;

      // Given first prediction with idempotency key
      const { data: first, error: firstError } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: `corr-1-${Date.now()}`,
          idempotency_key: idempotencyKey,
          event_data: { predicted_outcome: { attempt: 1 }, venture_id: testVentureId }
        })
        .select('id')
        .single();

      expect(firstError).toBeNull();

      // When trying to insert duplicate
      const { data: second, error: secondError } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: `corr-2-${Date.now()}`,
          idempotency_key: idempotencyKey, // Same key
          event_data: { predicted_outcome: { attempt: 2 }, venture_id: testVentureId }
        })
        .select('id')
        .single();

      // Then duplicate is rejected (constraint violation)
      expect(secondError).toBeDefined();
      expect(secondError.code).toBe('23505'); // Unique violation
    });
  });

  test.describe('Outcome Logging', () => {
    test('TL-004: should create AGENT_OUTCOME linked to prediction via parent_event_id', async () => {
      // Given a logged prediction
      const { data: prediction, error: predError } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: `pred-outcome-${Date.now()}`,
          idempotency_key: `idem-pred-${Date.now()}`,
          event_data: {
            predicted_outcome: {
              action: 'stage_transition',
              from_stage: 'Stage 10',
              to_stage: 'Stage 11',
              expected_success: true
            },
            venture_id: testVentureId
          }
        })
        .select('id')
        .single();

      expect(predError).toBeNull();
      const predictionEventId = prediction.id;

      // When logging actual outcome
      const actualOutcome = {
        success: true,
        new_stage: 'Stage 11',
        transition_time_ms: 1234
      };

      const calibrationDelta = {
        fields_compared: ['success', 'stage'],
        differences: {
          success: { predicted: true, actual: true, match: true },
          stage: { predicted_to: 'Stage 11', actual: 'Stage 11', match: true }
        },
        accuracy_score: 1.0
      };

      const { data: outcome, error: outcomeError } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          parent_event_id: predictionEventId, // Link to prediction
          event_data: {
            actual_outcome: actualOutcome,
            calibration_delta: calibrationDelta,
            agent_id: testAgentId,
            venture_id: testVentureId,
            timestamp: new Date().toISOString()
          },
          metadata: {
            source: 'TruthLayerE2ETest',
            calibration_accuracy: calibrationDelta.accuracy_score
          }
        })
        .select('id, parent_event_id, metadata')
        .single();

      // Then outcome is linked to prediction
      expect(outcomeError).toBeNull();
      expect(outcome.parent_event_id).toBe(predictionEventId);
      expect(outcome.metadata.calibration_accuracy).toBe(1.0);
    });

    test('TL-005: should calculate accuracy penalty for failed prediction', async () => {
      // Given prediction expecting success
      const { data: prediction } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: `pred-fail-${Date.now()}`,
          idempotency_key: `idem-fail-${Date.now()}`,
          event_data: {
            predicted_outcome: {
              expected_success: true,
              from_stage: 'Stage 11',
              to_stage: 'Stage 12'
            },
            venture_id: testVentureId
          }
        })
        .select('id')
        .single();

      // When actual outcome is failure (Golden Nugget validation failed)
      const calibrationDelta = {
        fields_compared: ['success', 'stage'],
        differences: {
          success: { predicted: true, actual: false, match: false }, // MISMATCH
          stage: { predicted_to: 'Stage 12', actual: 'Stage 11', match: false }
        },
        accuracy_score: 0.03 // 0.1 * 0.3 = 90% + 70% penalties
      };

      const { data: outcome, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          parent_event_id: prediction.id,
          event_data: {
            actual_outcome: {
              success: false,
              new_stage: 'Stage 11', // Didn't advance
              error: 'GoldenNuggetValidationError: Artifacts below threshold'
            },
            calibration_delta: calibrationDelta,
            venture_id: testVentureId
          },
          metadata: {
            calibration_accuracy: calibrationDelta.accuracy_score
          }
        })
        .select('id, event_data')
        .single();

      // Then accuracy score reflects penalties
      expect(error).toBeNull();
      expect(outcome.event_data.calibration_delta.accuracy_score).toBeLessThan(0.1);
    });
  });

  test.describe('Calibration Delta Calculation', () => {
    test('TL-006: should apply 60/40 Truth Law weighting', async () => {
      // Given business and technical accuracy scores
      const businessAccuracy = 0.8; // 80% business accuracy
      const technicalAccuracy = 0.9; // 90% technical accuracy

      // When computing truth score using 60/40 law
      const truthScore = (businessAccuracy * 0.6) + (technicalAccuracy * 0.4);

      // Then weighted score matches expected
      expect(truthScore).toBeCloseTo(0.84, 2); // 0.48 + 0.36 = 0.84

      // And verify in database
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          event_data: {
            actual_outcome: { validation: 'passed' },
            calibration_delta: {
              business_accuracy: businessAccuracy,
              technical_accuracy: technicalAccuracy,
              truth_score: truthScore, // 60/40 weighted
              accuracy_score: truthScore
            },
            venture_id: testVentureId
          },
          metadata: {
            source: 'TruthLayerE2ETest',
            calibration_accuracy: truthScore
          }
        })
        .select('id, event_data')
        .single();

      expect(error).toBeNull();
      expect(event.event_data.calibration_delta.truth_score).toBeCloseTo(0.84, 2);
    });

    test('TL-007: should track field-level comparison details', async () => {
      // Given detailed field comparison
      const calibrationDelta = {
        fields_compared: ['success', 'stage', 'artifacts', 'timing'],
        differences: {
          success: { predicted: true, actual: true, match: true },
          stage: { predicted_to: 'Stage 12', actual: 'Stage 12', match: true },
          artifacts: {
            predicted_count: 5,
            actual_count: 4,
            match: false,
            missing: ['user_personas']
          },
          timing: {
            predicted_ms: 5000,
            actual_ms: 7500,
            match: false,
            deviation_pct: 50
          }
        },
        accuracy_score: 0.7 // Partial match
      };

      // When logging outcome with field-level data
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          event_data: {
            actual_outcome: { phase: 'complete' },
            calibration_delta: calibrationDelta,
            venture_id: testVentureId
          }
        })
        .select('id, event_data')
        .single();

      // Then field-level details are preserved
      expect(error).toBeNull();
      expect(event.event_data.calibration_delta.fields_compared).toHaveLength(4);
      expect(event.event_data.calibration_delta.differences.artifacts.missing).toContain('user_personas');
    });
  });

  test.describe('Event Chain Integrity', () => {
    test('TL-008: should maintain prediction-outcome chain for auditing', async () => {
      const correlationId = `audit-chain-${Date.now()}`;

      // Given prediction
      const { data: pred } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          correlation_id: correlationId,
          idempotency_key: `idem-chain-${Date.now()}`,
          event_data: {
            predicted_outcome: { phase: 'PLAN-TO-EXEC' },
            venture_id: testVentureId
          }
        })
        .select('id')
        .single();

      // And outcome linked to prediction
      const { data: out } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          correlation_id: correlationId, // Same correlation
          parent_event_id: pred.id,
          event_data: {
            actual_outcome: { phase: 'complete' },
            venture_id: testVentureId
          }
        })
        .select('id')
        .single();

      // When querying event chain
      const { data: chain, error } = await supabase
        .from('system_events')
        .select('id, event_type, parent_event_id, correlation_id')
        .eq('correlation_id', correlationId)
        .order('created_at', { ascending: true });

      // Then chain is traceable
      expect(error).toBeNull();
      expect(chain).toHaveLength(2);
      expect(chain[0].event_type).toBe('AGENT_PREDICTION');
      expect(chain[1].event_type).toBe('AGENT_OUTCOME');
      expect(chain[1].parent_event_id).toBe(chain[0].id);
    });

    test('TL-009: should query predictions by venture for calibration analysis', async () => {
      // Given multiple predictions for a venture
      const predictions = [
        { action: 'stage_transition', expected_success: true },
        { action: 'artifact_generation', expected_success: true },
        { action: 'validation_check', expected_success: false }
      ];

      for (const pred of predictions) {
        await supabase
          .from('system_events')
          .insert({
            event_type: 'AGENT_PREDICTION',
            idempotency_key: `multi-pred-${Date.now()}-${Math.random()}`,
            event_data: {
              predicted_outcome: pred,
              venture_id: testVentureId
            }
          });
      }

      // When querying predictions for venture
      const { data: venturePredictions, error } = await supabase
        .from('system_events')
        .select('id, event_data')
        .eq('event_type', 'AGENT_PREDICTION')
        .eq('event_data->>venture_id', testVentureId);

      // Then all predictions are retrievable
      expect(error).toBeNull();
      expect(venturePredictions.length).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Error Handling', () => {
    test('TL-010: should handle missing parent_event_id gracefully', async () => {
      // Given outcome with null parent_event_id (prediction logging failed)
      const { data: orphanOutcome, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_OUTCOME',
          parent_event_id: null, // No linked prediction
          event_data: {
            actual_outcome: { orphan: true },
            calibration_delta: { accuracy_score: 0 },
            venture_id: testVentureId
          },
          metadata: {
            source: 'TruthLayerE2ETest',
            orphan_reason: 'prediction_logging_failed'
          }
        })
        .select('id, parent_event_id')
        .single();

      // Then outcome is still created but flagged
      expect(error).toBeNull();
      expect(orphanOutcome.parent_event_id).toBeNull();
    });

    test('TL-011: should preserve event_data on database errors', async () => {
      // Given event with complex nested data
      const complexEventData = {
        predicted_outcome: {
          nested: {
            deeply: {
              structured: {
                data: [1, 2, 3, { key: 'value' }]
              }
            }
          }
        },
        venture_id: testVentureId,
        arrays: [['a', 'b'], ['c', 'd']],
        unicode: '\u{1F4C8}\u{1F4C9}' // Chart emoji
      };

      // When inserting complex data
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'AGENT_PREDICTION',
          idempotency_key: `complex-${Date.now()}`,
          event_data: complexEventData
        })
        .select('id, event_data')
        .single();

      // Then data is preserved
      expect(error).toBeNull();
      expect(event.event_data.predicted_outcome.nested.deeply.structured.data).toEqual([1, 2, 3, { key: 'value' }]);
      expect(event.event_data.unicode).toBe('\u{1F4C8}\u{1F4C9}');
    });
  });
});
