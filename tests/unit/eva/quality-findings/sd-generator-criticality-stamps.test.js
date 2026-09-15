/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-4, TS-6) — direct-insert bypass paths in
 * sd-generator.js always stamp metadata.criticality='later', never absent, never 'critical'.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-LEO-FIX-REMEDIATION-TEST-001'),
}));

import { insertDraftRemediationSd, mintVentureQuickFix } from '../../../../lib/eva/quality-findings/sd-generator.js';

function buildSupabase({ insertResult = { id: 'sd-1', sd_key: 'SD-LEO-FIX-REMEDIATION-TEST-001' }, insertError = null, qfInsertError = null } = {}) {
  const sdInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: insertResult, error: insertError }),
    })),
  }));
  const qfInsert = vi.fn().mockResolvedValue({ error: qfInsertError });
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') return { insert: sdInsert };
      if (table === 'quick_fixes') return { insert: qfInsert };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
    _sdInsert: sdInsert,
    _qfInsert: qfInsert,
  };
}

const sampleFinding = { target_application: 'EHG', evidence_pointer: { file: 'src/foo.js' } };

describe('insertDraftRemediationSd (FR-4)', () => {
  it('always stamps metadata.criticality="later" with a reason', async () => {
    const supabase = buildSupabase();
    await insertDraftRemediationSd(supabase, {
      ventureId: 'v-1',
      findingCategory: 'lint',
      severity: 'medium',
      findingIds: ['f-1', 'f-2'],
      sampleFinding,
    });
    const insertCall = supabase._sdInsert.mock.calls[0][0];
    expect(insertCall.metadata.criticality).toBe('later');
    expect(insertCall.metadata.criticality_reason).toMatch(/sd-generator/);
  });

  it('never stamps criticality="critical"', async () => {
    const supabase = buildSupabase();
    await insertDraftRemediationSd(supabase, {
      ventureId: 'v-2',
      findingCategory: 'secrets',
      severity: 'critical',
      findingIds: ['f-3'],
      sampleFinding,
    });
    const insertCall = supabase._sdInsert.mock.calls[0][0];
    expect(insertCall.metadata.criticality).not.toBe('critical');
    expect(insertCall.metadata.criticality).toBe('later');
  });
});

describe('mintVentureQuickFix (FR-4)', () => {
  it('always stamps metadata.criticality="later" with a reason', async () => {
    const supabase = buildSupabase();
    await mintVentureQuickFix(supabase, {
      ventureId: 'v-1',
      targetApp: 'EHG',
      finding: { finding_category: 'lint', severity: 'medium', id: 'f-1', evidence_pointer: {} },
    });
    const insertCall = supabase._qfInsert.mock.calls[0][0];
    expect(insertCall.metadata.criticality).toBe('later');
    expect(insertCall.metadata.criticality_reason).toMatch(/sd-generator/);
  });

  it('never stamps criticality="critical"', async () => {
    const supabase = buildSupabase();
    await mintVentureQuickFix(supabase, {
      ventureId: 'v-1',
      targetApp: 'EHG',
      finding: { finding_category: 'secrets', severity: 'critical', id: 'f-2', evidence_pointer: {} },
    });
    const insertCall = supabase._qfInsert.mock.calls[0][0];
    expect(insertCall.metadata.criticality).not.toBe('critical');
  });
});
