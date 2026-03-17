import { describe, it, expect } from 'vitest';
import { validateExecutionPlan } from '../../../../scripts/modules/handoff/validators/execution-plan-validator.js';

describe('validateExecutionPlan', () => {
  it('returns score 0 when prd is missing', async () => {
    const result = await validateExecutionPlan({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('Execution plan has no steps');
    expect(result.details.stepCount).toBe(0);
  });

  it('returns score 0 when execution_plan is empty', async () => {
    const result = await validateExecutionPlan({ prd: { execution_plan: [] } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('reads from prd.implementation_steps as fallback', async () => {
    const result = await validateExecutionPlan({
      prd: { implementation_steps: ['Step one is detailed enough', 'Step two is also detailed'] }
    });
    expect(result.passed).toBe(true);
    expect(result.details.stepCount).toBe(2);
  });

  it('reads from prd.metadata.execution_plan.steps as fallback', async () => {
    const result = await validateExecutionPlan({
      prd: { metadata: { execution_plan: { steps: ['Detailed step one for execution'] } } }
    });
    expect(result.passed).toBe(true);
    expect(result.details.stepCount).toBe(1);
  });

  it('returns score 100 when all steps are valid strings (>10 chars)', async () => {
    const result = await validateExecutionPlan({
      prd: {
        execution_plan: [
          'Implement the user authentication module',
          'Create database migration for new tables',
          'Write integration tests for all endpoints'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.stepCount).toBe(3);
    expect(result.details.validSteps).toBe(3);
  });

  it('returns reduced score when some steps are too short', async () => {
    const result = await validateExecutionPlan({
      prd: {
        execution_plan: [
          'Deploy',  // too short (<=10)
          'Test',    // too short
          'Implement the full database migration process'  // valid
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(33); // 1/3 valid
    expect(result.warnings[0]).toContain('2 steps may need more detail');
  });

  it('accepts object steps with description or title', async () => {
    const result = await validateExecutionPlan({
      prd: {
        execution_plan: [
          { description: 'Implement feature X' },
          { title: 'Write tests' }
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.validSteps).toBe(2);
  });

  it('flags object steps without description or title', async () => {
    const result = await validateExecutionPlan({
      prd: {
        execution_plan: [
          { id: 1, status: 'pending' },  // no description/title
          { description: 'Valid step description' }
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(50); // 1/2 valid
    expect(result.warnings).toHaveLength(1);
  });

  it('prefers execution_plan over implementation_steps', async () => {
    const result = await validateExecutionPlan({
      prd: {
        execution_plan: ['Primary plan step is detailed enough'],
        implementation_steps: ['Fallback step should not be used']
      }
    });
    expect(result.details.stepCount).toBe(1);
  });
});
