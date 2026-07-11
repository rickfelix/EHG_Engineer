/**
 * Tests for the branching pipeline-stage transition engine.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C (FR-2, FR-3)
 */
import { describe, it, expect } from 'vitest';
import { advancePipelineStage, createPipelineCase } from './pipeline-transition-engine.js';

// Live-DB paths (fn_advance_pipeline_stage RPC, crm_pipeline_cases inserts) are
// tested via integration only, once the migration is applied.

describe('advancePipelineStage (stranger-provenance guard, no DB required)', () => {
  it('rejects at call time when provenanceEventId is missing — never reaches the database', async () => {
    const result = await advancePipelineStage(/* supabase */ undefined, {
      caseId: 'fixture-case',
      fromStage: 'inbound',
      toStage: 'contacted',
      provenanceEventId: null,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/provenance_missing/);
  });
});

describe('createPipelineCase (input validation, no DB required)', () => {
  it('throws when contactId is missing', async () => {
    await expect(createPipelineCase(undefined, { ventureId: 'v1', caseType: 'pipeline' }))
      .rejects.toThrow(/contactId is required/);
  });

  it('throws when ventureId is missing', async () => {
    await expect(createPipelineCase(undefined, { contactId: 'c1', caseType: 'pipeline' }))
      .rejects.toThrow(/ventureId is required/);
  });

  it('throws on an unknown caseType before touching the database', async () => {
    await expect(createPipelineCase(undefined, { contactId: 'c1', ventureId: 'v1', caseType: 'bogus' }))
      .rejects.toThrow(/unknown caseType/);
  });
});
