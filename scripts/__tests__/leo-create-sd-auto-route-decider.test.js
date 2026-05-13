/**
 * leo-create-sd-auto-route-decider.test.js — SD-FDBK-REFAC-LEO-CREATE-003-001 FR-6
 *
 * 9 test cases covering the FR-003 auto-route decision matrix:
 *   TS-1: SD-GVOS-COMPOSER regression — locked_decisions blocks auto-route
 *   TS-2: structured phases override locked_decisions (route to orchestrator)
 *   TS-3: compound-phrase FP guard (validation WARNING-2)
 *   TS-4: intentional FN — benign phrasing does not match regex
 *   TS-5: Layer B PR-staged disambiguator fires
 *   TS-6: mixed Phase+PR-N headings stay orchestrator
 *   TS-7: 0-row brainstorm reverse-lookup → layer_a_signal=absent
 *   TS-8: --force-orchestrator override
 *   TS-9: kill-switch LEO_AUTO_ROUTE_LAYER_A=off
 */

import { describe, it, expect } from 'vitest';
import {
  shouldAutoRouteToOrchestrator,
  countArchPhases,
  hasLockedSingleSdIntent,
  allHeadingsArePrStaged,
  SINGLE_SD_INTENT_REGEX,
  LAYER_B_HEADING_REGEX,
  PR_N_PATTERN,
} from '../modules/leo-create-sd/auto-route-decider.js';

// Helpers --------------------------------------------------------------

function makeArchPlan({ structuredPhases = [], content = '' } = {}) {
  return {
    sections: structuredPhases.length ? { implementation_phases: structuredPhases } : {},
    content,
  };
}

function makeBrainstormSession(lockedDecisions = []) {
  return { metadata: { locked_decisions: lockedDecisions } };
}

const COMMON_TELEMETRY_KEYS = [
  'route', 'layer_a_signal', 'layer_b_signal', 'override',
  'structured_phase_count', 'content_phase_count', 'reason',
  'archKey', 'visionKey', 'title', 'timestamp',
];

// FR-6 acceptance tests -----------------------------------------------

describe('shouldAutoRouteToOrchestrator — FR-6 9-test acceptance matrix', () => {
  it('TS-1: GVOS-COMPOSER regression — locked_decisions blocks auto-route', () => {
    // Empirical: 10 locked_decisions including "One Tier-3 SD-B2 (no split)",
    // arch plan ARCH-GVOS-COMPOSER-001 has 6 content-only "## Phase N — PR-N" headings,
    // no structured implementation_phases.
    const archPlan = makeArchPlan({
      content: [
        '## Phase 1 — PR-1 Composer scaffold',
        '## Phase 2 — PR-2 Identity statement',
        '## Phase 3 — PR-3 Snapshot registry',
        '## Phase 4 — PR-4 GVOS profile',
        '## Phase 5 — PR-5 Adherence logs',
        '## Phase 6 — PR-6 Token versioning',
      ].join('\n\n'),
    });
    const brainstormSession = makeBrainstormSession([
      'Pipeline: Lovable replaces Stitch at S17',
      'One Tier-3 SD-B2 (no split)',
      'EVA docs updated to v2',
    ]);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'ARCH-GVOS-COMPOSER-001',
      visionKey: 'VISION-GVOS-COMPOSER-L2-001',
      title: 'GVOS Composer',
      env: {},
    });
    expect(d.route).toBe('single');
    expect(d.layer_a_signal).toBe('locked-decision-veto');
    expect(d.reason).toMatch(/chairman locked single-SD intent/i);
    for (const k of COMMON_TELEMETRY_KEYS) expect(d.telemetry).toHaveProperty(k);
  });

  it('TS-2: structured phases route to orchestrator regardless of locked_decisions', () => {
    const archPlan = makeArchPlan({
      structuredPhases: [
        { number: 1, title: 'Phase 1' },
        { number: 2, title: 'Phase 2' },
        { number: 3, title: 'Phase 3' },
      ],
    });
    const brainstormSession = makeBrainstormSession(['One Tier-3 SD-B2 (no split)']);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    expect(d.route).toBe('orchestrator');
    expect(d.layer_a_signal).toBe('absent'); // Layer A skipped because structuredPhaseCount > 0
    expect(d.telemetry.structured_phase_count).toBe(3);
  });

  it('TS-3: compound-phrase FP guard — "Split into 3 PRs but do not split DB layer" + structured', () => {
    const archPlan = makeArchPlan({
      structuredPhases: [
        { number: 1, title: 'Phase 1' },
        { number: 2, title: 'Phase 2' },
        { number: 3, title: 'Phase 3' },
      ],
    });
    const brainstormSession = makeBrainstormSession([
      'Split into 3 PRs but do not split DB layer',
    ]);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    // Even though the regex would match "do not split", Layer A is skipped
    // because structuredPhaseCount > 0 — chairman intent for orchestration honored.
    expect(d.route).toBe('orchestrator');
    expect(d.layer_a_signal).toBe('absent');
  });

  it('TS-4: intentional FN — benign phrasing does not match regex', () => {
    const archPlan = makeArchPlan({
      content: ['## Phase 1', '## Phase 2', '## Phase 3'].join('\n\n'),
    });
    const brainstormSession = makeBrainstormSession([
      'we should not split this until v2',
      'consider splitting later',
    ]);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    // Regex misses both phrasings → defaults to orchestrator (safe direction).
    expect(d.route).toBe('orchestrator');
    expect(d.layer_a_signal).toBe('absent');
    expect(d.layer_b_signal).toBe('absent');
  });

  it('TS-5: Layer B PR-staged disambiguator fires when all headings are PR-N', () => {
    const archPlan = makeArchPlan({
      content: [
        '## Phase 1 — PR-1',
        '## Phase 2 — PR-2',
        '## Phase 3 — PR-3',
      ].join('\n\n'),
    });
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession: null,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    expect(d.route).toBe('single');
    expect(d.layer_b_signal).toBe('pr-staged-phases');
  });

  it('TS-6: mixed Phase+PR-N headings stay orchestrator (not all PR-N)', () => {
    const archPlan = makeArchPlan({
      content: ['## Phase 1', '## Phase 2 — PR-2', '## Phase 3'].join('\n\n'),
    });
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession: null,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    expect(d.route).toBe('orchestrator');
    expect(d.layer_b_signal).toBe('absent');
  });

  it('TS-7: 0-row brainstorm reverse-lookup → layer_a_signal=absent', () => {
    const archPlan = makeArchPlan({
      content: ['## Phase 1', '## Phase 2', '## Phase 3'].join('\n\n'),
    });
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession: null, // caller passes null when 0 or 2+ rows
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    expect(d.route).toBe('orchestrator');
    expect(d.layer_a_signal).toBe('absent');
  });

  it('TS-8: --force-orchestrator override beats locked_decisions veto', () => {
    const archPlan = makeArchPlan({
      content: ['## Phase 1 — PR-1', '## Phase 2 — PR-2'].join('\n\n'),
    });
    const brainstormSession = makeBrainstormSession(['One Tier-3 SD-B2 (no split)']);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      options: { forceOrchestrator: true },
      env: {},
    });
    expect(d.route).toBe('orchestrator');
    expect(d.override).toBe('force-orchestrator');
  });

  it('TS-9: kill switch LEO_AUTO_ROUTE_LAYER_A=off bypasses Layer A', () => {
    const archPlan = makeArchPlan({
      content: ['## Phase 1', '## Phase 2', '## Phase 3'].join('\n\n'),
    });
    const brainstormSession = makeBrainstormSession(['One Tier-3 SD-B2 (no split)']);
    const d = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: { LEO_AUTO_ROUTE_LAYER_A: 'off' },
    });
    expect(d.layer_a_signal).toBe('kill-switch');
    expect(d.route).toBe('orchestrator'); // veto disabled → falls back to default route
  });
});

// Pure-helper unit tests -----------------------------------------------

describe('pure helpers', () => {
  it('countArchPhases counts structured and content phases independently', () => {
    expect(countArchPhases(null)).toEqual({ structuredPhaseCount: 0, contentMatches: [] });
    expect(countArchPhases({})).toEqual({ structuredPhaseCount: 0, contentMatches: [] });
    const p = makeArchPlan({
      structuredPhases: [{ number: 1 }, { number: 2 }],
      content: '## Phase 1\n## Phase 2\n### Phase 3 — PR-3',
    });
    const r = countArchPhases(p);
    expect(r.structuredPhaseCount).toBe(2);
    expect(r.contentMatches.length).toBe(3); // H2/H2/H3 all match the broader regex
  });

  it('hasLockedSingleSdIntent matches the documented phrasings and rejects benign ones', () => {
    expect(hasLockedSingleSdIntent(null)).toBe(false);
    expect(hasLockedSingleSdIntent({ metadata: {} })).toBe(false);
    expect(hasLockedSingleSdIntent(makeBrainstormSession([]))).toBe(false);
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['One Tier-3 SD-B2 (no split)']))).toBe(true);
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['Single SD'])))
      .toBe(true);
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['do not split']))).toBe(true);
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['keep as one']))).toBe(true);
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['we should not split this until v2'])))
      .toBe(false); // intentional FN
    expect(hasLockedSingleSdIntent(makeBrainstormSession(['consider splitting later'])))
      .toBe(false);
  });

  it('allHeadingsArePrStaged returns true iff all matches contain PR-N', () => {
    expect(allHeadingsArePrStaged([])).toBe(false);
    expect(allHeadingsArePrStaged(['## Phase 1 — PR-1', '## Phase 2 — PR-2'])).toBe(true);
    expect(allHeadingsArePrStaged(['## Phase 1 — PR-1', '## Phase 2'])).toBe(false);
    expect(allHeadingsArePrStaged(['## Phase 1', '## Phase 2'])).toBe(false);
  });

  it('exported regexes match expected patterns', () => {
    expect(SINGLE_SD_INTENT_REGEX.test('no split')).toBe(true);
    expect(SINGLE_SD_INTENT_REGEX.test('single SD')).toBe(true);
    expect(SINGLE_SD_INTENT_REGEX.test('do not split')).toBe(true);
    expect(LAYER_B_HEADING_REGEX.test('## Phase 1')).toBe(true);
    LAYER_B_HEADING_REGEX.lastIndex = 0;
    expect(LAYER_B_HEADING_REGEX.test('### Phase 1')).toBe(true); // broader than line 2302
    LAYER_B_HEADING_REGEX.lastIndex = 0;
    expect(PR_N_PATTERN.test('PR-12')).toBe(true);
    expect(PR_N_PATTERN.test('PR1')).toBe(false);
  });
});

// Telemetry contract ---------------------------------------------------

describe('telemetry contract', () => {
  it('emits all 11 keys on every decision and is JSON-stringifiable', () => {
    const d = shouldAutoRouteToOrchestrator({
      archPlan: makeArchPlan(),
      brainstormSession: null,
      archKey: 'AK',
      visionKey: 'VK',
      title: 'T',
      env: {},
    });
    const t = d.telemetry;
    const expected = [
      'route', 'layer_a_signal', 'layer_b_signal', 'override',
      'structured_phase_count', 'content_phase_count', 'reason',
      'archKey', 'visionKey', 'title', 'timestamp',
    ];
    for (const k of expected) expect(t).toHaveProperty(k);
    const json = JSON.stringify(t);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
