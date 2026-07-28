/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-3 — pins for the escalated-QF orphan sweep.
 *
 * sdKeysNamedInQf exists because the first version of this report was WRONG. It searched one
 * direction only — does an SD mention this QF — and reported 2 link-dropped / 14 never-created,
 * including two criticals as unreferenced. Adding the reverse direction moved six rows and put all
 * three criticals into link-dropped; they were never stranded, only their pointers were missing.
 *
 * The instance that exposed it is pinned below verbatim: QF-20260722-214 is titled
 * "[Retro action items] SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001". The QF names the SD, not the other
 * way round, and that SD exists and is completed — so a one-directional matcher classified finished
 * work as needing materialisation.
 */
import { describe, it, expect } from 'vitest';
import { rankOrphans, classifyOrphan, sdKeysNamedInQf } from '../../../scripts/audit/escalated-qf-orphans.mjs';

describe('sdKeysNamedInQf — the reverse direction that was missing', () => {
  it('finds the SD named in the real row that exposed the defect', () => {
    const qf = { title: '[Retro action items] SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001' };
    expect(sdKeysNamedInQf(qf)).toEqual(['SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001']);
  });

  it('searches description and escalation_reason, not just the title', () => {
    expect(sdKeysNamedInQf({ description: 'superseded by SD-LEO-INFRA-FOO-BAR-001' }))
      .toEqual(['SD-LEO-INFRA-FOO-BAR-001']);
    expect(sdKeysNamedInQf({ escalation_reason: 'rolled into SD-APEXNICHE-AI-MAN-FIX-001' }))
      .toEqual(['SD-APEXNICHE-AI-MAN-FIX-001']);
  });

  it('de-duplicates a key repeated across fields', () => {
    const qf = { title: 'SD-LEO-X-001', description: 'again SD-LEO-X-001', escalation_reason: 'SD-LEO-X-001' };
    expect(sdKeysNamedInQf(qf)).toEqual(['SD-LEO-X-001']);
  });

  it('returns every distinct key when several are named', () => {
    const qf = { description: 'see SD-LEO-A-001 and SD-LEO-B-002' };
    expect(sdKeysNamedInQf(qf)).toEqual(['SD-LEO-A-001', 'SD-LEO-B-002']);
  });

  it('does NOT match a QF id — matching those was the original one-directional bug', () => {
    expect(sdKeysNamedInQf({ title: 'duplicate of QF-20260712-778, do not work it' })).toEqual([]);
  });

  it('requires at least two segments, so a bare SD- prefix is not a key', () => {
    expect(sdKeysNamedInQf({ title: 'the SD- prefix alone' })).toEqual([]);
  });

  it('is empty and never throws on absent or malformed input', () => {
    expect(sdKeysNamedInQf(null)).toEqual([]);
    expect(sdKeysNamedInQf({})).toEqual([]);
    expect(sdKeysNamedInQf({ title: null, description: undefined })).toEqual([]);
  });
});

describe('classifyOrphan — repairable vs needs-a-human', () => {
  it('LINK_DROPPED when any SD is known — the pointer is missing, not the work', () => {
    expect(classifyOrphan([{ sd_key: 'SD-X-001' }])).toBe('LINK_DROPPED');
  });

  it('NEVER_CREATED when nothing references it', () => {
    expect(classifyOrphan([])).toBe('NEVER_CREATED');
    expect(classifyOrphan(null)).toBe('NEVER_CREATED');
  });
});

describe('rankOrphans — the report must not bury its own findings', () => {
  it('puts critical first and orders by age within a severity', () => {
    const ranked = rankOrphans([
      { id: 'c', severity: 'low', created_at: '2026-01-01' },
      { id: 'b', severity: 'critical', created_at: '2026-02-01' },
      { id: 'a', severity: 'critical', created_at: '2026-01-01' },
      { id: 'd', severity: 'medium', created_at: '2026-01-01' }
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('does not mutate the caller array', () => {
    const input = [{ id: 'x', severity: 'low', created_at: '2026-01-01' }, { id: 'y', severity: 'critical', created_at: '2026-01-01' }];
    rankOrphans(input);
    expect(input.map((r) => r.id)).toEqual(['x', 'y']);
  });

  it('sorts an unknown severity last rather than crashing or promoting it', () => {
    const ranked = rankOrphans([{ id: 'weird', severity: 'bogus', created_at: '2026-01-01' }, { id: 'crit', severity: 'critical', created_at: '2026-01-01' }]);
    expect(ranked.map((r) => r.id)).toEqual(['crit', 'weird']);
  });

  it('handles empty and null input', () => {
    expect(rankOrphans([])).toEqual([]);
    expect(rankOrphans(null)).toEqual([]);
  });
});
