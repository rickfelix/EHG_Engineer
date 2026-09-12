/**
 * QF-20260911-484
 *
 * lib/sd-creation/source-adapters/qf.js's createFromQF() had NO --roadmap-link-reason path
 * at all (unlike --from-plan/--from-proposal/--proposal-b64/--proposal-stdin/--child), so an
 * SD escalated from a QF via --from-qf always recorded the register-first exception with
 * metadata.roadmap_link_exception.reason_supplied=false -- the counted gap the sourcing
 * health probe drives to zero. The sensitive-path rail escalates hooks/migrations/workflows
 * QFs through exactly this route, so every such escalation landed reason-less.
 *
 * resolveQfRoadmapLinkReason() is the pure, extracted fix: a caller-supplied non-blank
 * opts.roadmapLinkReason always wins (mirrors --from-plan's/--child's identical wiring), but
 * --from-qf is the one lane where a real default is ALWAYS available when the caller omits
 * the flag -- the QF's own escalation_reason (its tier-3 routing rationale, stamped at QF
 * creation by create-quick-fix.js) -- so the exception is NEVER stamped no-reason-supplied
 * for this lane.
 *
 * Deterministic/offline -- pure function, no mocking required (mirrors
 * leo-create-sd-from-qf-target-application.test.js's resolveExplicitTargetApplication pattern).
 */
import { describe, it, expect } from 'vitest';
import { resolveQfRoadmapLinkReason } from '../../lib/sd-creation/source-adapters/qf.js';

describe('resolveQfRoadmapLinkReason (QF-20260911-484)', () => {
  it('a caller-supplied non-blank --roadmap-link-reason always wins over the QF default', () => {
    expect(resolveQfRoadmapLinkReason(
      { id: 'QF-20260911-001', escalation_reason: 'contains risk keyword: schema' },
      { roadmapLinkReason: 'operator-supplied reason' }
    )).toBe('operator-supplied reason');
  });

  it('a blank/whitespace-only --roadmap-link-reason is treated as omitted, not as a supplied reason', () => {
    expect(resolveQfRoadmapLinkReason(
      { id: 'QF-20260911-002', escalation_reason: 'contains risk keyword: auth' },
      { roadmapLinkReason: '   ' }
    )).toBe('escalated from QF-20260911-002: contains risk keyword: auth');
  });

  it('omitted opts defaults to "escalated from <QF-id>: <escalation_reason>" using the QF\'s own tier-3 routing rationale', () => {
    expect(resolveQfRoadmapLinkReason(
      { id: 'QF-20260911-003', escalation_reason: 'sensitive-path registry (.github/workflows/) blocked autonomous QF close' }
    )).toBe('escalated from QF-20260911-003: sensitive-path registry (.github/workflows/) blocked autonomous QF close');
  });

  it('a QF with no opts argument at all still defaults (opts defaults to {})', () => {
    expect(resolveQfRoadmapLinkReason({ id: 'QF-20260911-004', escalation_reason: 'x' }))
      .toBe('escalated from QF-20260911-004: x');
  });

  it('a QF with no escalation_reason (null/blank) still yields a non-empty default reason -- never unreasoned', () => {
    expect(resolveQfRoadmapLinkReason({ id: 'QF-20260911-005', escalation_reason: null }, {}))
      .toBe('escalated from QF-20260911-005: no reason recorded on the quick-fix');
    expect(resolveQfRoadmapLinkReason({ id: 'QF-20260911-006', escalation_reason: '   ' }, {}))
      .toBe('escalated from QF-20260911-006: no reason recorded on the quick-fix');
    expect(resolveQfRoadmapLinkReason({ id: 'QF-20260911-007' }, {}))
      .toBe('escalated from QF-20260911-007: no reason recorded on the quick-fix');
  });

  it('the resolved value is always a non-empty, non-whitespace string (buildRoadmapLinkException\'s reason_supplied check would otherwise flip false)', () => {
    const cases = [
      resolveQfRoadmapLinkReason({ id: 'QF-A' }, {}),
      resolveQfRoadmapLinkReason({ id: 'QF-B', escalation_reason: null }, { roadmapLinkReason: null }),
      resolveQfRoadmapLinkReason({ id: 'QF-C', escalation_reason: 'y' }, { roadmapLinkReason: undefined }),
    ];
    for (const reason of cases) {
      expect(typeof reason).toBe('string');
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
