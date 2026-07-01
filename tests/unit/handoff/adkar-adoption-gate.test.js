/**
 * Tests for ADKAR_ADOPTION gate (SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-B).
 *
 * Covers:
 *  - No metadata.requires_adoption → no-op pass (score 100)
 *  - requires_adoption=true, incomplete adkar_checklist + ENFORCE_ADKAR_GATE=true → BLOCKS (score 0)
 *  - requires_adoption=true, incomplete adkar_checklist + ENFORCE_ADKAR_GATE unset/false → WARNS (score 60, passed=true)
 *  - requires_adoption=true, all 5 stages evidenced-or-waived → passes (score 100) regardless of the flag
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createAdkarAdoptionGate } from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/adkar-adoption-gate.js';

describe('ADKAR_ADOPTION gate (SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-B)', () => {
  const originalFlag = process.env.ENFORCE_ADKAR_GATE;
  const gate = createAdkarAdoptionGate();

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENFORCE_ADKAR_GATE;
    else process.env.ENFORCE_ADKAR_GATE = originalFlag;
  });

  it('passes with score 100 as a no-op when metadata.requires_adoption is not set', async () => {
    const result = await gate.validator({ sd: { id: 'sd-fixture-1', metadata: {} } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.details.requires_adoption).toBe(false);
  });

  it('passes with score 100 as a no-op when metadata is entirely absent', async () => {
    const result = await gate.validator({ sd: { id: 'sd-fixture-2' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('BLOCKS (score 0) when requires_adoption=true, stages missing, ENFORCE_ADKAR_GATE=true', async () => {
    process.env.ENFORCE_ADKAR_GATE = 'true';
    const result = await gate.validator({
      sd: {
        id: 'sd-fixture-3',
        metadata: {
          requires_adoption: true,
          adkar_checklist: {
            awareness: { evidence: 'role-contract wired at CLAUDE_ADAM.md' },
            desire: { evidence: 'Why: rationale present in the rollout PR' },
            // knowledge, ability, reinforcement missing
          },
        },
      },
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]).toContain('knowledge');
    expect(result.issues[0]).toContain('ability');
    expect(result.issues[0]).toContain('reinforcement');
    expect(result.details.missing_stages).toEqual(['knowledge', 'ability', 'reinforcement']);
  });

  it('WARNS (score 60, passed=true) when requires_adoption=true, stages missing, ENFORCE_ADKAR_GATE unset', async () => {
    delete process.env.ENFORCE_ADKAR_GATE;
    const result = await gate.validator({
      sd: {
        id: 'sd-fixture-4',
        metadata: {
          requires_adoption: true,
          adkar_checklist: {},
        },
      },
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(60);
    expect(result.issues).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.details.missing_stages).toEqual(['awareness', 'desire', 'knowledge', 'ability', 'reinforcement']);
  });

  it('passes (score 100) with all 5 stages evidenced or waived, even with ENFORCE_ADKAR_GATE=true', async () => {
    process.env.ENFORCE_ADKAR_GATE = 'true';
    const result = await gate.validator({
      sd: {
        id: 'sd-fixture-5',
        metadata: {
          requires_adoption: true,
          adkar_checklist: {
            awareness: { evidence: 'role-contract wired at CLAUDE_ADAM.md' },
            desire: { evidence: 'Why: rationale present in the rollout PR' },
            knowledge: { evidence: 'docs/protocol/adkar-change-adoption-framework.md' },
            ability: { evidence: 'coordinator_reminder payload.kind mechanism dispatches hourly' },
            reinforcement: { waived: true, reason: 'self-adherence probe scheduled for a follow-up SD' },
          },
        },
      },
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.missing_stages).toEqual([]);
  });

  it('treats a stage entry with neither evidence nor a valid waiver as missing', async () => {
    const result = await gate.validator({
      sd: {
        id: 'sd-fixture-6',
        metadata: {
          requires_adoption: true,
          adkar_checklist: {
            awareness: { waived: true }, // waived but no reason string — should NOT count as satisfied
            desire: { evidence: '' }, // empty string — should NOT count as satisfied
          },
        },
      },
    });
    expect(result.details.missing_stages).toEqual(['awareness', 'desire', 'knowledge', 'ability', 'reinforcement']);
  });
});
