/**
 * Unit tests for Stage 25 - Launch Execution template
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Test Scenario: Stage 25 validation enforces distribution channel requirements,
 * operations handoff structure, launch summary, and chairman gate authorization
 * from Stage 24.
 *
 * @module tests/unit/eva/stage-templates/stage-25.test
 */

import { describe, it, expect } from 'vitest';
import stage25, {
  verifyLaunchAuthorization,
  CHANNEL_STATUSES,
  PIPELINE_MODES,
  ESCALATION_LEVELS,
  MIN_DISTRIBUTION_CHANNELS,
} from '../../../../lib/eva/stage-templates/stage-25.js';

describe('stage-25.js - Launch Execution template', () => {
  describe('Template contract', () => {
    it('should export TEMPLATE with required properties', () => {
      expect(stage25).toBeDefined();
      expect(stage25.id).toBeDefined();
      expect(stage25.slug).toBeDefined();
      expect(stage25.title).toBeDefined();
      expect(stage25.version).toBeDefined();
    });

    it('should have correct id, slug, title, version', () => {
      expect(stage25.id).toBe('stage-25');
      expect(stage25.slug).toBe('launch-execution');
      expect(stage25.title).toBe('Launch Execution');
      expect(stage25.version).toBe('2.0.0');
    });

    it('should have schema, defaultData, validate, computeDerived', () => {
      expect(stage25.schema).toBeDefined();
      expect(stage25.defaultData).toBeDefined();
      expect(typeof stage25.validate).toBe('function');
      expect(typeof stage25.computeDerived).toBe('function');
    });

    it('should have analysisStep function', () => {
      expect(typeof stage25.analysisStep).toBe('function');
    });

    it('should have outputSchema from extractOutputSchema', () => {
      expect(stage25.outputSchema).toBeDefined();
    });

    it('should have schema with expected fields', () => {
      expect(stage25.schema.distribution_channels).toBeDefined();
      expect(stage25.schema.operations_handoff).toBeDefined();
      expect(stage25.schema.launch_summary).toBeDefined();
      expect(stage25.schema.go_live_timestamp).toBeDefined();
      expect(stage25.schema.pipeline_terminus).toBeDefined();
      expect(stage25.schema.pipeline_mode).toBeDefined();
      expect(stage25.schema.channels_active_count).toBeDefined();
      expect(stage25.schema.channels_total_count).toBeDefined();
    });

    it('should have correct defaultData', () => {
      expect(stage25.defaultData).toEqual({
        distribution_channels: [],
        operations_handoff: {
          monitoring: { dashboards: [], alerts: [], health_check_url: null },
          escalation: { contacts: [], runbook_url: null, sla_targets: {} },
          maintenance: { schedule: null, backup_strategy: null, update_policy: null },
        },
        launch_summary: null,
        go_live_timestamp: null,
        pipeline_terminus: false,
        pipeline_mode: 'launch',
        channels_active_count: 0,
        channels_total_count: 0,
      });
    });

    it('should export constants', () => {
      expect(CHANNEL_STATUSES).toEqual(['inactive', 'activating', 'active', 'failed', 'paused']);
      expect(PIPELINE_MODES).toEqual(['discovery', 'build', 'launch', 'operations']);
      expect(ESCALATION_LEVELS).toEqual(['L1', 'L2', 'L3']);
      expect(MIN_DISTRIBUTION_CHANNELS).toBe(1);
    });

    it('should export verifyLaunchAuthorization function', () => {
      expect(typeof verifyLaunchAuthorization).toBe('function');
    });
  });

  describe('validate() - Distribution channels', () => {
    const validBase = {
      operations_handoff: {
        monitoring: { dashboards: [], alerts: [] },
        escalation: { contacts: [], runbook_url: null },
      },
      launch_summary: 'Comprehensive launch summary for the venture go-live',
    };

    it('should pass for valid data with 1+ distribution channels', () => {
      const validData = {
        ...validBase,
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'active' },
        ],
      };
      const result = stage25.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for multiple distribution channels', () => {
      const validData = {
        ...validBase,
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'active' },
          { name: 'Mobile App', type: 'mobile', status: 'activating' },
          { name: 'API Gateway', type: 'api', status: 'inactive' },
        ],
      };
      const result = stage25.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });

    it('should fail for missing distribution_channels', () => {
      const invalidData = { ...validBase };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels'))).toBe(true);
    });

    it('should fail for empty distribution_channels array', () => {
      const invalidData = {
        ...validBase,
        distribution_channels: [],
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for channel missing name', () => {
      const invalidData = {
        ...validBase,
        distribution_channels: [
          { type: 'web', status: 'active' },
        ],
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels[0].name'))).toBe(true);
    });

    it('should fail for channel missing type', () => {
      const invalidData = {
        ...validBase,
        distribution_channels: [
          { name: 'Web App', status: 'active' },
        ],
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels[0].type'))).toBe(true);
    });

    it('should fail for channel with invalid status', () => {
      const invalidData = {
        ...validBase,
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'invalid_status' },
        ],
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels[0].status'))).toBe(true);
    });

    it('should accept all valid CHANNEL_STATUSES', () => {
      for (const status of CHANNEL_STATUSES) {
        const validData = {
          ...validBase,
          distribution_channels: [
            { name: 'Web App', type: 'web', status },
          ],
        };
        const result = stage25.validate(validData, { logger: { warn: () => {} } });
        expect(result.valid).toBe(true);
      }
    });

    it('should validate multiple channels and collect errors', () => {
      const invalidData = {
        ...validBase,
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'active' },
          { type: 'mobile', status: 'active' }, // missing name
          { name: 'API Gateway', status: 'active' }, // missing type
        ],
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels[1].name'))).toBe(true);
      expect(result.errors.some(e => e.includes('distribution_channels[2].type'))).toBe(true);
    });
  });

  describe('validate() - Operations handoff', () => {
    const validChannels = [{ name: 'Web App', type: 'web', status: 'active' }];
    const validSummary = 'Comprehensive launch summary for the venture';

    it('should fail for missing operations_handoff', () => {
      const invalidData = {
        distribution_channels: validChannels,
        launch_summary: validSummary,
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operations_handoff'))).toBe(true);
    });

    it('should fail for non-object operations_handoff', () => {
      const invalidData = {
        distribution_channels: validChannels,
        operations_handoff: 'not an object',
        launch_summary: validSummary,
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operations_handoff'))).toBe(true);
    });

    it('should fail for missing monitoring in operations_handoff', () => {
      const invalidData = {
        distribution_channels: validChannels,
        operations_handoff: {
          escalation: { contacts: [] },
        },
        launch_summary: validSummary,
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operations_handoff.monitoring'))).toBe(true);
    });

    it('should fail for missing escalation in operations_handoff', () => {
      const invalidData = {
        distribution_channels: validChannels,
        operations_handoff: {
          monitoring: { dashboards: [] },
        },
        launch_summary: validSummary,
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operations_handoff.escalation'))).toBe(true);
    });

    it('should pass with valid monitoring and escalation', () => {
      const validData = {
        distribution_channels: validChannels,
        operations_handoff: {
          monitoring: { dashboards: ['main-dashboard'], alerts: ['cpu-alert'] },
          escalation: { contacts: ['on-call@example.com'], runbook_url: 'https://runbook.example.com' },
        },
        launch_summary: validSummary,
      };
      const result = stage25.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });

    it('should pass with maintenance included (optional)', () => {
      const validData = {
        distribution_channels: validChannels,
        operations_handoff: {
          monitoring: { dashboards: [], alerts: [] },
          escalation: { contacts: [] },
          maintenance: { schedule: 'weekly', backup_strategy: 'daily snapshots', update_policy: 'rolling' },
        },
        launch_summary: validSummary,
      };
      const result = stage25.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Launch summary', () => {
    const validBase = {
      distribution_channels: [{ name: 'Web App', type: 'web', status: 'active' }],
      operations_handoff: {
        monitoring: { dashboards: [] },
        escalation: { contacts: [] },
      },
    };

    it('should fail for missing launch_summary', () => {
      const invalidData = { ...validBase };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_summary'))).toBe(true);
    });

    it('should fail for launch_summary < 10 characters', () => {
      const invalidData = {
        ...validBase,
        launch_summary: 'Short',
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_summary'))).toBe(true);
    });

    it('should fail for empty launch_summary', () => {
      const invalidData = {
        ...validBase,
        launch_summary: '',
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_summary'))).toBe(true);
    });

    it('should pass for valid launch_summary', () => {
      const validData = {
        ...validBase,
        launch_summary: 'Comprehensive launch execution summary with all details',
      };
      const result = stage25.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });
  });

  describe('verifyLaunchAuthorization() - Pure function', () => {
    it('should return authorized when chairman gate is approved and decision is go', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'approved' },
          go_no_go_decision: 'go',
        },
      });
      expect(result.authorized).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should return authorized when decision is conditional_go', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'approved' },
          go_no_go_decision: 'conditional_go',
        },
      });
      expect(result.authorized).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should return not authorized when stage24Data is not provided', () => {
      const result = verifyLaunchAuthorization({ stage24Data: undefined });
      expect(result.authorized).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('not available');
    });

    it('should return not authorized when stage24Data is null', () => {
      const result = verifyLaunchAuthorization({ stage24Data: null });
      expect(result.authorized).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should return not authorized when chairman gate is not approved', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'pending' },
          go_no_go_decision: 'go',
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('chairman gate'))).toBe(true);
    });

    it('should return not authorized when chairman gate is rejected', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'rejected' },
          go_no_go_decision: 'go',
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('chairman gate'))).toBe(true);
    });

    it('should return not authorized when decision is no_go', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'approved' },
          go_no_go_decision: 'no_go',
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('go/no-go decision'))).toBe(true);
    });

    it('should return not authorized when decision is not set', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'approved' },
          go_no_go_decision: null,
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('go/no-go decision'))).toBe(true);
    });

    it('should collect multiple reasons when both gate and decision fail', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'pending' },
          go_no_go_decision: 'no_go',
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons.some(r => r.includes('chairman gate'))).toBe(true);
      expect(result.reasons.some(r => r.includes('go/no-go decision'))).toBe(true);
    });

    it('should handle missing chairmanGate in stage24Data', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          go_no_go_decision: 'go',
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('chairman gate'))).toBe(true);
    });

    it('should handle missing go_no_go_decision in stage24Data', () => {
      const result = verifyLaunchAuthorization({
        stage24Data: {
          chairmanGate: { status: 'approved' },
        },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasons.some(r => r.includes('go/no-go decision'))).toBe(true);
    });
  });

  describe('computeDerived()', () => {
    it('should spread input data to output', () => {
      const data = {
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'active' },
        ],
        operations_handoff: {
          monitoring: { dashboards: ['main'] },
          escalation: { contacts: ['ops@example.com'] },
        },
        launch_summary: 'Launch summary text',
        go_live_timestamp: '2026-03-01T00:00:00Z',
      };
      const result = stage25.computeDerived(data);
      expect(result.distribution_channels).toEqual(data.distribution_channels);
      expect(result.operations_handoff).toEqual(data.operations_handoff);
      expect(result.launch_summary).toBe(data.launch_summary);
      expect(result.go_live_timestamp).toBe(data.go_live_timestamp);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage25.validate(null, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage25.validate(undefined, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle non-array distribution_channels', () => {
      const invalidData = {
        distribution_channels: 'not an array',
        operations_handoff: {
          monitoring: { dashboards: [] },
          escalation: { contacts: [] },
        },
        launch_summary: 'Valid launch summary text',
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('distribution_channels'))).toBe(true);
    });

    it('should handle whitespace-only launch_summary', () => {
      const invalidData = {
        distribution_channels: [{ name: 'Web', type: 'web', status: 'active' }],
        operations_handoff: {
          monitoring: { dashboards: [] },
          escalation: { contacts: [] },
        },
        launch_summary: '          ',
      };
      const result = stage25.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_summary'))).toBe(true);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        distribution_channels: [
          { name: 'Web App', type: 'web', status: 'active' },
          { name: 'Mobile App', type: 'mobile', status: 'activating' },
        ],
        operations_handoff: {
          monitoring: { dashboards: ['main-dashboard'], alerts: ['cpu-alert'], health_check_url: 'https://health.example.com' },
          escalation: { contacts: ['ops@example.com'], runbook_url: 'https://runbook.example.com', sla_targets: { p1: '15m' } },
          maintenance: { schedule: 'weekly', backup_strategy: 'daily', update_policy: 'rolling' },
        },
        launch_summary: 'Comprehensive launch execution summary with distribution channels active',
        go_live_timestamp: '2026-03-01T00:00:00Z',
      };
      const validation = stage25.validate(data, { logger: { warn: () => {} } });
      expect(validation.valid).toBe(true);

      const computed = stage25.computeDerived(data);
      expect(computed.distribution_channels).toEqual(data.distribution_channels);
      expect(computed.operations_handoff).toEqual(data.operations_handoff);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        distribution_channels: [],
        operations_handoff: {},
        launch_summary: 'Short',
      };
      const computed = stage25.computeDerived(data);
      expect(computed.distribution_channels).toEqual([]);
    });
  });
});
