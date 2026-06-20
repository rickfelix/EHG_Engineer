/**
 * SD-LEO-INFRA-SOURCING-ENGINE-ROUTER-CORE-001 — unit tests for the pure sourcing router.
 * Covers each of the 5 lane rules, the lane/disposition separation (FR-3), and the
 * infra-shipped-but-outcome-open re-emit flag.
 */
import { describe, it, expect } from 'vitest';
import { routeCandidate, jaccard, LANES, CHAIRMAN_AUTHORITIES } from '../../lib/sourcing-engine/router.js';

describe('sourcing-engine router — lane vocabulary', () => {
  it('exposes exactly the five frozen lanes', () => {
    expect(Object.values(LANES).sort()).toEqual(
      ['belt-ready', 'blocked-on', 'chairman-gated', 'dedup', 'outcome-gated']
    );
    expect(Object.isFrozen(LANES)).toBe(true);
  });
});

describe('sourcing-engine router — belt-ready (the residual)', () => {
  it('routes a novel, non-gated, conflict-free candidate to belt-ready', () => {
    const r = routeCandidate(
      { source_id: 'intake-1', title: 'Guard the foo resolver', disposition: 'BUILD', rung: 'V1' },
      { existing: [], inFlight: [] }
    );
    expect(r.lane).toBe(LANES.BELT_READY);
    expect(r.rung).toBe('V1');
    expect(r.disposition).toBe('BUILD');
  });

  it('belt-ready carries no blocker/escalation payload', () => {
    const r = routeCandidate({ title: 'Net new thing' }, {});
    expect(r.lane).toBe(LANES.BELT_READY);
    expect(r.blocker).toBeUndefined();
    expect(r.escalation).toBeUndefined();
  });
});

describe('sourcing-engine router — chairman-gated', () => {
  it.each(CHAIRMAN_AUTHORITIES)('routes authority=%s to chairman-gated with escalation', (authority) => {
    const r = routeCandidate({ title: 'Touch RLS', authority }, {});
    expect(r.lane).toBe(LANES.CHAIRMAN_GATED);
    expect(r.escalation).toEqual({ to: 'chairman', reason: authority });
  });

  it('an unknown authority value does NOT gate (falls through to belt-ready)', () => {
    const r = routeCandidate({ title: 'Harmless', authority: 'cosmetic' }, {});
    expect(r.lane).toBe(LANES.BELT_READY);
  });
});

describe('sourcing-engine router — outcome-gated', () => {
  it('routes needsOutcome with the target rung and enabler hints', () => {
    const r = routeCandidate(
      { title: 'Autonomous campaign exec', rung: 'V1', needsOutcome: true, targetRung: 'V2', enablers: ['publisher live'] },
      {}
    );
    expect(r.lane).toBe(LANES.OUTCOME_GATED);
    expect(r.rung).toBe('V2'); // target rung overrides the item rung
    expect(r.enablers).toEqual(['publisher live']);
  });

  it('defaults enablers to [] and keeps item rung when targetRung absent', () => {
    const r = routeCandidate({ title: 'X', rung: 'V1', needsOutcome: true }, {});
    expect(r.lane).toBe(LANES.OUTCOME_GATED);
    expect(r.rung).toBe('V1');
    expect(r.enablers).toEqual([]);
  });
});

describe('sourcing-engine router — blocked-on', () => {
  it('routes a write-surface conflict with an in-flight SD to blocked-on', () => {
    const r = routeCandidate(
      { title: 'Edit the gauge', writeSurfaces: ['lib/vision/vdr-registry.js'] },
      { inFlight: [{ sd_key: 'SD-IN-FLIGHT-001', writeSurfaces: ['lib/vision/vdr-registry.js'] }] }
    );
    expect(r.lane).toBe(LANES.BLOCKED_ON);
    expect(r.blocker).toEqual({ sd_key: 'SD-IN-FLIGHT-001', reason: 'write_surface', surface: 'lib/vision/vdr-registry.js' });
  });

  it('routes a declared dependency on an in-flight SD to blocked-on', () => {
    const r = routeCandidate(
      { title: 'Child', dependsOn: ['SD-PARENT-001'] },
      { inFlight: [{ sd_key: 'SD-PARENT-001' }] }
    );
    expect(r.lane).toBe(LANES.BLOCKED_ON);
    expect(r.blocker).toEqual({ sd_key: 'SD-PARENT-001', reason: 'dependency' });
  });

  it('no conflict with the in-flight set → not blocked', () => {
    const r = routeCandidate(
      { title: 'Independent', writeSurfaces: ['lib/a.js'] },
      { inFlight: [{ sd_key: 'SD-OTHER-001', writeSurfaces: ['lib/b.js'] }] }
    );
    expect(r.lane).toBe(LANES.BELT_READY);
  });
});

describe('sourcing-engine router — dedup', () => {
  it('matches when source_id is itself an existing sd_key', () => {
    const r = routeCandidate(
      { source_id: 'SD-EXISTING-001', title: 'whatever' },
      { existing: [{ sd_key: 'SD-EXISTING-001', title: 'unrelated title' }] }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-EXISTING-001');
    expect(r.re_emit).toBe(false);
  });

  it('matches on exact (normalized) title', () => {
    const r = routeCandidate(
      { title: '  Fix   The Belt  ' },
      { existing: [{ sd_key: 'SD-DUP-001', title: 'fix the belt' }] }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-DUP-001');
  });

  it('matches on Jaccard >= threshold', () => {
    const r = routeCandidate(
      { title: 'guard the sourcing engine router core' },
      { existing: [{ sd_key: 'SD-SIM-001', title: 'guard the sourcing engine router' }], jaccardThreshold: 0.8 }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-SIM-001');
  });

  it('below the Jaccard threshold is NOT a dup', () => {
    const r = routeCandidate(
      { title: 'completely different subject matter entirely' },
      { existing: [{ sd_key: 'SD-SIM-001', title: 'guard the sourcing engine router' }], jaccardThreshold: 0.8 }
    );
    expect(r.lane).toBe(LANES.BELT_READY);
  });

  it('infra-shipped but outcome-NOT-realized sets re_emit=true', () => {
    const r = routeCandidate(
      { title: 'Autonomous campaign execution' },
      {
        existing: [{ sd_key: 'SD-INFRA-001', title: 'autonomous campaign execution' }],
        shippedInfraKeys: ['SD-INFRA-001'],
        outcomeRealizedKeys: [],
      }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-INFRA-001');
    expect(r.re_emit).toBe(true);
  });

  it('infra-shipped AND outcome-realized does NOT re-emit', () => {
    const r = routeCandidate(
      { title: 'Autonomous campaign execution' },
      {
        existing: [{ sd_key: 'SD-INFRA-001', title: 'autonomous campaign execution' }],
        shippedInfraKeys: ['SD-INFRA-001'],
        outcomeRealizedKeys: ['SD-INFRA-001'],
      }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.re_emit).toBe(false);
  });

  it('dedup wins over a chairman authority (already tracked short-circuits)', () => {
    const r = routeCandidate(
      { title: 'touch rls', authority: 'rls' },
      { existing: [{ sd_key: 'SD-DUP-002', title: 'touch rls' }] }
    );
    expect(r.lane).toBe(LANES.DEDUP);
  });
});

describe('sourcing-engine router — lane is DISTINCT from disposition (FR-3)', () => {
  it('passes disposition through unchanged across every lane', () => {
    for (const disposition of ['BUILD', 'RESEARCH', 'REFERENCE', 'CANCEL', null]) {
      const beltReady = routeCandidate({ title: `novel ${disposition}`, disposition }, {});
      expect(beltReady.disposition).toBe(disposition);
      expect(beltReady.lane).toBe(LANES.BELT_READY);
      const gated = routeCandidate({ title: 'x', disposition, authority: 'vision' }, {});
      expect(gated.disposition).toBe(disposition);
      expect(gated.lane).toBe(LANES.CHAIRMAN_GATED);
    }
  });

  it('never returns a lane value that collides with a disposition value', () => {
    const dispositions = new Set(['BUILD', 'RESEARCH', 'REFERENCE', 'CANCEL']);
    for (const lane of Object.values(LANES)) expect(dispositions.has(lane)).toBe(false);
  });
});

describe('sourcing-engine router — precedence order', () => {
  it('chairman-gated beats outcome-gated and blocked-on', () => {
    const r = routeCandidate(
      { title: 'x', authority: 'grant', needsOutcome: true, writeSurfaces: ['lib/a.js'] },
      { inFlight: [{ sd_key: 'SD-A-001', writeSurfaces: ['lib/a.js'] }] }
    );
    expect(r.lane).toBe(LANES.CHAIRMAN_GATED);
  });

  it('outcome-gated beats blocked-on', () => {
    const r = routeCandidate(
      { title: 'x', needsOutcome: true, writeSurfaces: ['lib/a.js'] },
      { inFlight: [{ sd_key: 'SD-A-001', writeSurfaces: ['lib/a.js'] }] }
    );
    expect(r.lane).toBe(LANES.OUTCOME_GATED);
  });
});

describe('sourcing-engine router — jaccard helper', () => {
  it('two empty titles yield 0 (no false dup on empty)', () => {
    expect(jaccard('', '')).toBe(0);
  });
  it('identical token sets yield 1', () => {
    expect(jaccard('alpha beta', 'beta alpha')).toBe(1);
  });
});

describe('sourcing-engine router — totality (no throw on sparse input)', () => {
  it('handles an empty item and empty context', () => {
    const r = routeCandidate({}, {});
    expect(r.lane).toBe(LANES.BELT_READY);
    expect(r.rung).toBeNull();
    expect(r.disposition).toBeNull();
  });
  it('handles a null item', () => {
    const r = routeCandidate(null);
    expect(r.lane).toBe(LANES.BELT_READY);
  });
});
