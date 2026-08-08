// QF-20260807-278: a preview verdict must state its OWN reason.
//
// The summary line printed only two numbers and a verdict:
//   Aggregate: 83% (threshold: 75%) => WOULD FAIL
// 83 is ABOVE 75. The verdict is correct — a blocking gate fails the handoff at any score —
// but those two numbers are all a reader has, so the line taught a threshold rule that is not
// the rule. Measured live on SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-E before the fix.
//
// SCOPE, stated so a green run is not over-read: this covers the aggregate-line legibility
// defect found while investigating QF-278. The ticket's parity legs — (a) the witnessed PRD
// replaying to the SAME rejection as execute, (b) a passing PRD passing both identically —
// are NOT closed here and are NOT asserted below. Claiming them would be exactly the
// trusted-optimistic-preview trap this QF is about.
import { describe, it, expect } from 'vitest';
import { formatDryRunVerdict } from '../../scripts/modules/handoff/cli/cli-main.js';

const render = (result) => formatDryRunVerdict(result).join('\n');

describe('dry-run verdict states its own reason', () => {
  it('names the blocking gates when the aggregate MEETS the threshold but the verdict is FAIL', () => {
    // The exact measured shape: 83 >= 75 yet WOULD FAIL.
    const out = render({
      aggregateScore: 83,
      gateThreshold: 75,
      wouldPass: false,
      evaluationResults: [
        { name: 'GATE_SUBAGENT_EVIDENCE', enabled: true, passed: false },
        { name: 'GATE_PRD_EXISTS', enabled: true, passed: false },
        { name: 'SOMETHING_PASSING', enabled: true, passed: true },
      ],
    });
    expect(out).toContain('=> WOULD FAIL');
    expect(out).toContain('the aggregate MEETS the threshold');
    expect(out).toContain('GATE_SUBAGENT_EVIDENCE');
    expect(out).toContain('GATE_PRD_EXISTS');
    expect(out).not.toContain('SOMETHING_PASSING'); // passing gates are never named as blockers
  });

  it('does NOT claim the aggregate met the threshold when it genuinely did not', () => {
    // Two-sided: a note that printed on every failure would say nothing at all.
    const out = render({
      aggregateScore: 40,
      gateThreshold: 75,
      wouldPass: false,
      evaluationResults: [{ name: 'GATE_A', enabled: true, passed: false }],
    });
    expect(out).toContain('=> WOULD FAIL');
    expect(out).not.toContain('the aggregate MEETS the threshold');
    expect(out).toContain('GATE_A'); // still names what blocked
  });

  // POSITIVE CONTROL — without this the suite would pass if the code always appended a note.
  it('stays silent on a genuinely passing preview', () => {
    const out = render({
      aggregateScore: 95,
      gateThreshold: 75,
      wouldPass: true,
      evaluationResults: [{ name: 'GATE_A', enabled: true, passed: true }],
    });
    expect(out).toContain('=> WOULD PASS');
    expect(out).not.toContain('the aggregate MEETS the threshold');
    expect(out).not.toContain('Blocking gate');
  });

  it('ignores DISABLED gates when naming blockers', () => {
    const out = render({
      aggregateScore: 83,
      gateThreshold: 75,
      wouldPass: false,
      evaluationResults: [
        { name: 'DISABLED_ONE', enabled: false, passed: false },
        { name: 'REAL_BLOCKER', enabled: true, passed: false },
      ],
    });
    expect(out).toContain('REAL_BLOCKER');
    expect(out).not.toContain('DISABLED_ONE');
  });

  it('does not crash when evaluationResults is absent', () => {
    const out = render({ aggregateScore: 83, gateThreshold: 75, wouldPass: false });
    expect(out).toContain('=> WOULD FAIL');
  });
});
