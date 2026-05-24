/**
 * QF-20260524-418 / feedback 0ee3c3b8: leo-create-sd auto-route must not count a
 * prose-STRING `implementation_phases` as a structured phase count.
 *
 * `countArchPhases` did `implementation_phases?.length`; when that field is prose
 * text, `.length` returns the CHARACTER count (e.g. 1140), which tripped
 * hasMultipleStructured and falsely auto-routed a single feature SD to the
 * orchestrator creator → an empty 0-child orchestrator shell.
 */
import { describe, it, expect } from 'vitest';
import { countArchPhases, shouldAutoRouteToOrchestrator } from '../../scripts/modules/leo-create-sd/auto-route-decider.js';

const route = (archPlan) => shouldAutoRouteToOrchestrator({
  archPlan, brainstormSession: null, archKey: 'k', visionKey: 'v', title: 't', env: {},
});

describe('countArchPhases (0ee3c3b8)', () => {
  it('counts a prose-string implementation_phases as 0 structured phases (not char length)', () => {
    const archPlan = { sections: { implementation_phases: 'x'.repeat(1140) } };
    expect(countArchPhases(archPlan).structuredPhaseCount).toBe(0);
  });

  it('counts array length when implementation_phases is an array', () => {
    const archPlan = { sections: { implementation_phases: [{}, {}, {}] } };
    expect(countArchPhases(archPlan).structuredPhaseCount).toBe(3);
  });

  it('returns 0 when implementation_phases is missing or archPlan is null', () => {
    expect(countArchPhases({ sections: {} }).structuredPhaseCount).toBe(0);
    expect(countArchPhases(null).structuredPhaseCount).toBe(0);
  });
});

describe('shouldAutoRouteToOrchestrator (0ee3c3b8: no false orchestrator route from a prose string)', () => {
  it('routes SINGLE when implementation_phases is prose and content has no phase headings', () => {
    const archPlan = {
      sections: { implementation_phases: 'x'.repeat(1140) },
      content: 'A plan written as prose with no structured phase headings.',
    };
    const d = route(archPlan);
    expect(d.telemetry.structured_phase_count).toBe(0);
    expect(d.route).toBe('single');
  });

  it('still routes ORCHESTRATOR for a genuine array of >= 2 structured phases', () => {
    const archPlan = {
      sections: { implementation_phases: [{ name: 'Phase 1' }, { name: 'Phase 2' }] },
      content: '',
    };
    const d = route(archPlan);
    expect(d.telemetry.structured_phase_count).toBe(2);
    expect(d.route).toBe('orchestrator');
  });
});
