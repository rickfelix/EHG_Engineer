/**
 * Integration tests for the Relationship Engine satellite against a live schema.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C
 *
 * REQUIRES database/migrations/20260711_crm_identity_graph.sql and
 * 20260711_crm_pipeline_transition_engine.sql to be applied (delegated-apply,
 * Adam-scoped — see worker-signal e248ac5b). Skips (does not fail) if the
 * crm_inbound_events table is not yet present, so this file can land now and
 * activate automatically once the migration ships — it must never silently
 * report a false pass by skipping without saying so.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { recordInboundEvent, createOrg, createContact } from './crm-identity-graph.js';
import { createPipelineCase, advancePipelineStage } from './pipeline-transition-engine.js';
import { getPipelineMeetingSurfaceReport } from './meeting-surface-adapter.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Top-level await: vitest collects describe blocks synchronously, so the
// live-schema check must resolve before describe.runIf is evaluated.
const { error: schemaProbeError } = await supabase.from('crm_inbound_events').select('id').limit(1);
const migrationLive = !schemaProbeError;
if (!migrationLive) {
  // eslint-disable-next-line no-console
  console.warn('[SKIP] crm_inbound_events not found — migration not yet applied (delegated-apply pending). Skipping live-schema integration tests, not marking as passed.');
}

describe.runIf(migrationLive)('Relationship Engine — fixture-venture traversal (TS-1..TS-5)', () => {
  let fixtureVentureId;

  beforeAll(async () => {
    const { data } = await supabase.from('ventures').select('id').limit(1).single();
    fixtureVentureId = data?.id;
  });

  it('TS-1: stranger event traverses inbound -> contact -> pipeline-stage -> qualified, provenance-stamped', async () => {
    const event = await recordInboundEvent(supabase, { source: 'fixture-demand-engine', payload: { channel: 'test' } });
    const contact = await createContact(supabase, {
      email: 'stranger@fixture.test',
      provenanceEventId: event.id,
      provenanceSource: 'fixture-demand-engine',
      ventureId: fixtureVentureId,
    });
    const pipelineCase = await createPipelineCase(supabase, { contactId: contact.id, ventureId: fixtureVentureId, caseType: 'pipeline' });
    expect(pipelineCase.current_stage).toBe('inbound');

    const step1 = await advancePipelineStage(supabase, { caseId: pipelineCase.id, fromStage: 'inbound', toStage: 'contacted', provenanceEventId: event.id });
    expect(step1.success).toBe(true);
    const step2 = await advancePipelineStage(supabase, { caseId: pipelineCase.id, fromStage: 'contacted', toStage: 'qualified', provenanceEventId: event.id });
    expect(step2.success).toBe(true);
  });

  it('TS-2: a hand-inserted pipeline row with no inbound provenance is rejected at write time', async () => {
    const { error } = await supabase.from('crm_pipeline_transitions').insert({
      case_id: '00000000-0000-0000-0000-000000000000',
      from_stage: 'inbound',
      to_stage: 'contacted',
      provenance_event_id: '00000000-0000-0000-0000-000000000000', // does not exist in crm_inbound_events
    });
    expect(error).not.toBeNull();
  });

  it('TS-3: stage-skipping is rejected by the no-stage-skipping guard', async () => {
    const event = await recordInboundEvent(supabase, { source: 'fixture-demand-engine', payload: {} });
    const contact = await createContact(supabase, { provenanceEventId: event.id, provenanceSource: 'fixture-demand-engine', ventureId: fixtureVentureId });
    const pipelineCase = await createPipelineCase(supabase, { contactId: contact.id, ventureId: fixtureVentureId });

    const skip = await advancePipelineStage(supabase, { caseId: pipelineCase.id, fromStage: 'inbound', toStage: 'won', provenanceEventId: event.id });
    expect(skip.success).toBe(false);
  });

  it('TS-4: EVA meeting surface reads live pipeline data for the venture', async () => {
    const report = await getPipelineMeetingSurfaceReport(supabase, fixtureVentureId);
    expect(['available', 'empty']).toContain(report.data_state);
    expect(typeof report.qualified_pipeline_value).toBe('number');
  });
});
