/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-4) — insertSDIdempotent() criticality stamp.
 * Mirrors the file's own sourced_by-stamping precedent (SD-LEO-INFRA-DISPATCH-AUTH-AUTO-
 * AUTHORIZE-001-B FR-4). The largest-volume bypass path (~30 SDs/30d, measured).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001'),
  generateChildKey: vi.fn(),
  generateGrandchildKey: vi.fn(),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { _internal } from '../../../lib/eva/lifecycle-sd-bridge.js';
const { insertSDIdempotent } = _internal;

function buildSupabase({ insertError = null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  return { from: vi.fn(() => ({ insert })), _insert: insert };
}

describe('insertSDIdempotent() criticality stamp (FR-4)', () => {
  it('stamps metadata.criticality="later" with a reason when unset', async () => {
    const supabase = buildSupabase();
    const row = { sd_key: 'SD-X-1', id: 'sd-x-1', metadata: {} };
    await insertSDIdempotent(supabase, row);
    expect(row.metadata.criticality).toBe('later');
    expect(row.metadata.criticality_reason).toMatch(/lifecycle-sd-bridge/);
  });

  it('never overwrites an already-set criticality value', async () => {
    const supabase = buildSupabase();
    const row = { sd_key: 'SD-X-2', id: 'sd-x-2', metadata: { criticality: 'critical', criticality_reason: 'real emergency' } };
    await insertSDIdempotent(supabase, row);
    expect(row.metadata.criticality).toBe('critical');
    expect(row.metadata.criticality_reason).toBe('real emergency');
  });

  it('the literal string "critical" never appears as a criticality stamp default (grep-testable invariant, TS-6 negative)', async () => {
    const supabase = buildSupabase();
    const row = { sd_key: 'SD-X-3', id: 'sd-x-3', metadata: {} };
    await insertSDIdempotent(supabase, row);
    expect(row.metadata.criticality).not.toBe('critical');
  });

  it('still stamps sourced_by alongside criticality (existing behavior unaffected)', async () => {
    const supabase = buildSupabase();
    const row = { sd_key: 'SD-X-4', id: 'sd-x-4', metadata: {} };
    await insertSDIdempotent(supabase, row);
    expect(row.metadata.sourced_by).toBe('lifecycle-sd-bridge');
    expect(row.metadata.criticality).toBe('later');
  });
});
