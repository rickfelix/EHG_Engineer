/**
 * Tests for the CRM contact/org identity graph.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C (FR-1)
 */
import { describe, it, expect } from 'vitest';
import { recordInboundEvent, createOrg, createContact } from './crm-identity-graph.js';

// Live-DB write paths are tested via integration only, once the migration is applied.

describe('input validation (no DB required — reject before touching the database)', () => {
  it('recordInboundEvent throws when source is missing', async () => {
    await expect(recordInboundEvent(undefined, { payload: {} })).rejects.toThrow(/source is required/);
  });

  it('createOrg throws when name is missing', async () => {
    await expect(createOrg(undefined, { provenanceEventId: 'e1' })).rejects.toThrow(/name is required/);
  });

  it('createOrg throws when provenanceEventId is missing (stranger-provenance guard)', async () => {
    await expect(createOrg(undefined, { name: 'Acme' })).rejects.toThrow(/provenanceEventId is required/);
  });

  it('createContact throws when provenanceEventId is missing (stranger-provenance guard)', async () => {
    await expect(createContact(undefined, { ventureId: 'v1' })).rejects.toThrow(/provenanceEventId is required/);
  });

  it('createContact throws when ventureId is missing', async () => {
    await expect(createContact(undefined, { provenanceEventId: 'e1' })).rejects.toThrow(/ventureId is required/);
  });
});
