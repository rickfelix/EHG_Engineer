/**
 * SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-B (FR-1)
 *
 * lib/sd-creation/source-adapters/qf.js's createFromQF() previously never passed an
 * explicit target_application to createSD(), so a venture-targeted QF escalated from a
 * session running in EHG_Engineer minted a new SD with target_application='EHG_Engineer'
 * (lib/sd-creation/pipeline.js:1004's getCurrentVenture() fallback) -- the true target
 * survived only in metadata.qf_target_application, unread by the LEAD-TO-PLAN gate until
 * FR-2. resolveExplicitTargetApplication() is the pure, extracted fix: gated on
 * isVentureRepo() so the platform-QF majority (36/39 measured live) passes no explicit
 * param and stays byte-identical to pre-fix behavior -- an ungated version would
 * unconditionally stamp metadata.target_application_explicit=true on every escalated SD,
 * silently disabling the LEAD-TO-PLAN auto-corrector for that majority (validation-agent
 * V-8, evidence 41b9d501).
 *
 * Deterministic/offline -- pure function, no mocking required.
 */
import { describe, it, expect } from 'vitest';
import { resolveExplicitTargetApplication } from '../../lib/sd-creation/source-adapters/qf.js';

describe('resolveExplicitTargetApplication (FR-1)', () => {
  it('TS-1: a venture-targeted QF spreads an explicit target_application', () => {
    expect(resolveExplicitTargetApplication({ target_application: 'altifyai' }))
      .toEqual({ target_application: 'altifyai' });
  });

  it('TS-2: a platform-targeted QF (EHG_Engineer) spreads nothing -- call-argument proof, not resolved-output', () => {
    expect(resolveExplicitTargetApplication({ target_application: 'EHG_Engineer' })).toEqual({});
  });

  it('a platform-targeted QF (EHG) spreads nothing', () => {
    expect(resolveExplicitTargetApplication({ target_application: 'EHG' })).toEqual({});
  });

  it('case-insensitive platform match (ehg_engineer) spreads nothing', () => {
    expect(resolveExplicitTargetApplication({ target_application: 'ehg_engineer' })).toEqual({});
  });

  it('null/absent target_application spreads nothing (isVentureRepo(null) is false)', () => {
    expect(resolveExplicitTargetApplication({ target_application: null })).toEqual({});
    expect(resolveExplicitTargetApplication({})).toEqual({});
  });
});
