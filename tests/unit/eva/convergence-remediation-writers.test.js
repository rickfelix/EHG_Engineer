/**
 * QF-20260705-633: minimal DB-insert-only remediation writers for the convergence-loop
 * router. Verifies createQuickFixWriter/createSdWriter build functions matching the
 * (gap: {title, dimension}) => Promise<string> contract routeRemediation/fileAdherenceFix
 * expect, without invoking the heavyweight CLI creation paths (which also create git
 * branches/worktrees as a side effect).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/utils/work-item-router.js', () => ({
  routeWorkItem: vi.fn(),
}));
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn(),
}));
vi.mock('../../../scripts/leo-create-sd.js', () => ({
  createSD: vi.fn(),
  resolveVenturePrefix: vi.fn(),
}));

import { routeWorkItem } from '../../../lib/utils/work-item-router.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import { createSD, resolveVenturePrefix } from '../../../scripts/leo-create-sd.js';
import { createQuickFixWriter, createSdWriter } from '../../../lib/eva/convergence-remediation-writers.js';

function makeSupabaseInsertStub(returnError = null) {
  const insert = vi.fn().mockResolvedValue({ error: returnError });
  return { client: { from: () => ({ insert }) }, insert };
}

describe('createQuickFixWriter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a tier-1/2 quick_fixes row with status=open when routing tier is not 3', async () => {
    routeWorkItem.mockResolvedValue({ tier: 2, escalationReason: null });
    const stub = makeSupabaseInsertStub();
    const writer = createQuickFixWriter(stub.client);

    const id = await writer({ title: 'Fix X', dimension: 'user-story-coverage' });

    expect(id).toMatch(/^QF-\d{8}-\d{3}$/);
    const insertedRow = stub.insert.mock.calls[0][0];
    expect(insertedRow.status).toBe('open');
    expect(insertedRow.title).toBe('Fix X');
    expect(insertedRow.description).toMatch(/user-story-coverage/);
  });

  it('inserts an escalated quick_fixes row when routing tier is 3', async () => {
    routeWorkItem.mockResolvedValue({ tier: 3, escalationReason: 'too large for a QF' });
    const stub = makeSupabaseInsertStub();
    const writer = createQuickFixWriter(stub.client);

    await writer({ title: 'Fix Y', dimension: 'architecture-conformance' });

    const insertedRow = stub.insert.mock.calls[0][0];
    expect(insertedRow.status).toBe('escalated');
    expect(insertedRow.escalation_reason).toBe('too large for a QF');
  });

  it('throws (does not swallow) on an insert error, so routeRemediation records it in errors/deferred', async () => {
    routeWorkItem.mockResolvedValue({ tier: 2 });
    const stub = makeSupabaseInsertStub({ message: 'duplicate key' });
    const writer = createQuickFixWriter(stub.client);

    await expect(writer({ title: 'Fix Z', dimension: 'data-model-fidelity' })).rejects.toThrow(/duplicate key/);
  });
});

describe('createSdWriter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a key, creates a bugfix-type draft SD, and returns its sd_key', async () => {
    resolveVenturePrefix.mockResolvedValue(null);
    generateSDKey.mockResolvedValue('SD-LEO-FIX-EXAMPLE-001');
    createSD.mockResolvedValue({ sd_key: 'SD-LEO-FIX-EXAMPLE-001' });

    const writer = createSdWriter();
    const result = await writer({ title: 'Persona surface missing', dimension: 'persona-surface-coverage' });

    expect(result).toBe('SD-LEO-FIX-EXAMPLE-001');
    expect(createSD).toHaveBeenCalledTimes(1);
    const callArg = createSD.mock.calls[0][0];
    expect(callArg.type).toBe('bugfix');
    expect(callArg.metadata).toMatchObject({ source: 'convergence_gate_remediation', dimension: 'persona-surface-coverage' });
  });
});
