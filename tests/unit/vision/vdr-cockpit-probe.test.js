// SD-LEO-INFRA-VDR-COCKPIT-PROBE-STALE-FIX-001 — regression guard for the 'The cockpit' VDR probe.
//
// The prior pattern (CANONICAL_SURFACES|six_surfaces|SURFACE_REGISTRY) matched NOTHING in ehg/src,
// so a BUILT capability scored unbuilt(0) and under-counted the vision gauge. This test pins the
// CORRECTED pattern to the canonical chairman cockpit surfaces and — critically — proves the probe
// is NOT a tautology: a fixture where the surfaces are PRESENT scores partial, where ABSENT scores
// unbuilt, so a future genuine cockpit regression (surfaces deleted) is still caught.
//
// Hermetic: the grep seam is injected and applies the probe's OWN regex against fixture source text,
// so the test exercises the real registered pattern (not a hand-copied duplicate).
import { describe, it, expect } from 'vitest';
import { VDR_REGISTRY } from '../../../lib/vision/vdr-registry.js';
import { runProbe } from '../../../lib/vision/vdr-probes.js';

const COCKPIT = 'The cockpit';
const entry = VDR_REGISTRY.find((e) => e.capability === COCKPIT);

// The seven canonical surfaces (FR-1, verified shipped in ehg/src + mounted in VisionAlignmentPage /
// BriefingDashboard). Used only to build realistic PRESENT/ABSENT fixtures.
const CANONICAL_SURFACES = [
  'SurvivabilityCockpit', 'SystemAlertsBoardView', 'OpsBalancedScorecardView',
  'PortfolioGapAnalysisView', 'RoadmapWaveView', 'InitiativeRollupView', 'MonthlyCeoReportViewer',
];

// A grep seam that runs the probe's actual regex against the provided fixture source text. This is
// what makes the test non-tautological: it uses entry.probe.pattern, not a re-typed copy.
function fixtureGrepSeam(sourceText) {
  return (pattern /*, sub, repo */) => {
    const re = new RegExp(pattern);
    return { accessible: true, matched: re.test(sourceText) };
  };
}

describe('FR-2: the cockpit probe targets the real shipped surfaces (no stale tokens)', () => {
  it('is a code_grep over ehg/src for the canonical surfaces, builtWhen present', () => {
    expect(entry).toBeTruthy();
    expect(entry.layer).toBe('application');
    expect(entry.probe).toMatchObject({ type: 'code_grep', repo: 'ehg', path: 'src', builtWhen: 'present' });
  });
  it('every canonical surface name is an alternative in the pattern; no dead stale tokens remain', () => {
    for (const s of CANONICAL_SURFACES) expect(entry.probe.pattern).toContain(s);
    for (const stale of ['CANONICAL_SURFACES', 'SURFACE_REGISTRY', 'six']) {
      expect(entry.probe.pattern).not.toContain(stale);
    }
  });
});

describe('FR-5 regression guard: the probe band moves with reality (NOT a tautology)', () => {
  it('PRESENT (surfaces mounted) → partial (code presence is honest intent, capped at 0.5)', async () => {
    const src = CANONICAL_SURFACES.map((s) => `import { ${s} } from "@/components/chairman-v3/${s}";`).join('\n');
    const res = await runProbe(entry.probe, { grep: fixtureGrepSeam(src) });
    expect(res.status).toBe('partial');
    expect(res.value).toBe(true);
  });
  it('PRESENT with only ONE surface still matches (alternation) → partial', async () => {
    const res = await runProbe(entry.probe, { grep: fixtureGrepSeam('export function RoadmapWaveView(){}') });
    expect(res.status).toBe('partial');
  });
  it('ABSENT (surfaces deleted — a real regression) → unbuilt(0), so the regression is caught', async () => {
    const src = 'export function SomeUnrelatedThing(){}\nimport { Foo } from "./bar";';
    const res = await runProbe(entry.probe, { grep: fixtureGrepSeam(src) });
    expect(res.status).toBe('unbuilt');
    expect(res.value).toBe(false);
  });
  it('the OLD stale tokens alone do NOT satisfy the corrected probe (proves the fix, not a rename)', async () => {
    const staleOnly = 'const CANONICAL_SURFACES = []; // six_surfaces SURFACE_REGISTRY';
    const res = await runProbe(entry.probe, { grep: fixtureGrepSeam(staleOnly) });
    expect(res.status).toBe('unbuilt');
  });
  it('an inaccessible ehg checkout → unknown (never a fabricated build credit)', async () => {
    const res = await runProbe(entry.probe, { grep: () => ({ accessible: false, matched: false }) });
    expect(res.status).toBe('unknown');
  });
});
