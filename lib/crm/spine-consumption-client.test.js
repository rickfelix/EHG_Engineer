/**
 * Tests for the spine-consumption stub client.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C (FR-5)
 */
import { describe, it, expect } from 'vitest';
import { checkAuthority, routeException, registerObjective } from './spine-consumption-client.js';

describe('spine-consumption-client (stub mode, spine-stub SD not yet live)', () => {
  it('checkAuthority defaults to born-denied (S-1) even in stub mode', async () => {
    const result = await checkAuthority('venture-ceo', 'advance_pipeline_stage');
    expect(result.authorized).toBe(false);
    expect(result.source).toBe('stub');
  });

  it('routeException never auto-escalates to chairman tier in stub mode (S-2 conservative default)', async () => {
    const result = await routeException('pipeline_stage_anomaly', { caseId: 'fixture-case' });
    expect(result.routed_to).toBe('venture-ceo-tier');
    expect(result.exception_type).toBe('pipeline_stage_anomaly');
  });

  it('registerObjective reports unavailable rather than silently succeeding (S-3)', async () => {
    const result = await registerObjective('crm-satellite', 'qualified-pipeline-value', 'no-stage-skipping');
    expect(result.registered).toBe(false);
    expect(result.source).toBe('stub');
  });
});
