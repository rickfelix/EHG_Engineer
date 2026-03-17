import { describe, it, expect } from 'vitest';
import { validateKeyDecisions } from '../../../../scripts/modules/handoff/validators/key-decisions-validator.js';

describe('validateKeyDecisions', () => {
  it('returns score 50 when handoff is missing', async () => {
    const result = await validateKeyDecisions({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('No key decisions documented');
    expect(result.details.count).toBe(0);
  });

  it('returns score 50 when decisions is empty array', async () => {
    const result = await validateKeyDecisions({ handoff: { key_decisions: [] } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.issues).toContain('No key decisions documented');
  });

  it('returns score 50 when decisions is null', async () => {
    const result = await validateKeyDecisions({ handoff: { key_decisions: null } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
  });

  it('returns score 100 when all decisions have rationale (strings >20 chars)', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          'Chose PostgreSQL over MongoDB for ACID compliance and relational queries',
          'Selected JWT over session-based auth for stateless microservice architecture'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.count).toBe(2);
    expect(result.details.withRationale).toBe(2);
  });

  it('returns reduced score when some string decisions are too short', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          'Use React',  // too short (<=20)
          'Chose PostgreSQL over MongoDB for better relational data handling'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(50); // 1/2 have rationale
    expect(result.warnings[0]).toContain('1 decisions may need rationale');
    expect(result.details.withRationale).toBe(1);
  });

  it('accepts object decisions with rationale field', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          { decision: 'Use PostgreSQL', rationale: 'ACID compliance needed' }
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.withRationale).toBe(1);
  });

  it('accepts object decisions with reason field', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          { decision: 'Use JWT', reason: 'Stateless architecture' }
        ]
      }
    });
    expect(result.score).toBe(100);
  });

  it('accepts object decisions with description field', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          { description: 'Chose REST over GraphQL for simplicity' }
        ]
      }
    });
    expect(result.score).toBe(100);
  });

  it('returns score 0 when all decisions lack rationale', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          'Use X',  // too short
          { id: 1 } // no rationale/reason/description
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.details.withRationale).toBe(0);
    expect(result.details.quality).toBe(0);
  });

  it('handles non-string non-object items', async () => {
    const result = await validateKeyDecisions({
      handoff: {
        key_decisions: [
          42,
          true,
          'A decision with enough text to be considered rationale-bearing'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(33); // 1/3 valid
  });
});
