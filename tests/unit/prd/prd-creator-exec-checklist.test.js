/**
 * SD-LEO-INFRA-SIZE-TIER-AWARE-001 — tier-aware PRD exec_checklist seeding.
 *
 * The PRD exec_checklist becomes the sd_scope_deliverables denominator (via
 * extract-deliverables-from-prd at PLAN-TO-EXEC). A fixed 6-item list put fast/small SDs at
 * 4/6 = 67% under the 80% SCOPE_AUDIT gate. buildExecChecklist() makes the denominator
 * size/tier-aware: fast types (bugfix/fix) get the focused 3-item subset; everything else gets
 * the full 6. resolveExecChecklist() fetches sd_type and is fail-safe (errors -> full list).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildExecChecklist, resolveExecChecklist } from '../../../scripts/prd/prd-creator.js';

const texts = (list) => list.map((i) => i.text);

describe('buildExecChecklist — tier-aware deliverable denominator', () => {
  it('bugfix → focused 3-item subset (no env-setup / integration-suite / separate-docs)', () => {
    const list = buildExecChecklist('bugfix');
    expect(texts(list)).toEqual(['Core functionality implemented', 'Unit tests written', 'Code review completed']);
    expect(texts(list)).not.toContain('Development environment setup');
    expect(texts(list)).not.toContain('Integration tests completed');
    expect(texts(list)).not.toContain('Documentation updated');
  });

  it("fix → same focused 3-item subset (escalated QFs land as 'fix')", () => {
    expect(texts(buildExecChecklist('fix'))).toHaveLength(3);
  });

  it('is case-insensitive (BUGFIX → fast)', () => {
    expect(texts(buildExecChecklist('BUGFIX'))).toHaveLength(3);
  });

  it('feature → full 6-item checklist', () => {
    const list = buildExecChecklist('feature');
    expect(list).toHaveLength(6);
    expect(texts(list)).toContain('Development environment setup');
    expect(texts(list)).toContain('Integration tests completed');
  });

  it('infrastructure / security / database → full 6-item checklist', () => {
    for (const t of ['infrastructure', 'security', 'database', 'refactor', 'enhancement']) {
      expect(buildExecChecklist(t)).toHaveLength(6);
    }
  });

  it('unknown / null / undefined type → full checklist (no regression)', () => {
    expect(buildExecChecklist(null)).toHaveLength(6);
    expect(buildExecChecklist(undefined)).toHaveLength(6);
    expect(buildExecChecklist('')).toHaveLength(6);
    expect(buildExecChecklist('totally-unknown-type')).toHaveLength(6);
  });

  it('every item has the {text, checked:false} shape', () => {
    for (const item of buildExecChecklist('bugfix').concat(buildExecChecklist('feature'))) {
      expect(item).toEqual({ text: expect.any(String), checked: false });
    }
  });
});

describe('resolveExecChecklist — sd_type lookup + fail-safe', () => {
  const mockSb = (result) => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => result) })),
      })),
    })),
  });

  it('resolves a bugfix SD to the fast 3-item checklist', async () => {
    const list = await resolveExecChecklist(mockSb({ data: { sd_type: 'bugfix' } }), '0d2216ca-50ac-48d1-9850-58926a3e53ed');
    expect(list).toHaveLength(3);
  });

  it('resolves a feature SD to the full 6-item checklist', async () => {
    const list = await resolveExecChecklist(mockSb({ data: { sd_type: 'feature' } }), 'SD-SOME-KEY-001');
    expect(list).toHaveLength(6);
  });

  it('fail-safe: a lookup error degrades to the full checklist (no regression)', async () => {
    const throwingSb = { from: vi.fn(() => { throw new Error('db down'); }) };
    const list = await resolveExecChecklist(throwingSb, 'whatever');
    expect(list).toHaveLength(6);
  });

  it('fail-safe: no matching SD (null data) degrades to the full checklist', async () => {
    const list = await resolveExecChecklist(mockSb({ data: null }), 'SD-MISSING-001');
    expect(list).toHaveLength(6);
  });
});
