import { describe, it, expect } from 'vitest';
import { validateSDObjectives } from '../../../../scripts/modules/handoff/validators/sd-objectives-validator.js';

describe('validateSDObjectives', () => {
  it('returns score 0 and fails when sd is missing', async () => {
    const result = await validateSDObjectives({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('SD has no strategic objectives defined');
    expect(result.details.objectivesCount).toBe(0);
    expect(result.details.metricsCount).toBe(0);
  });

  it('returns score 0 and fails when strategic_objectives is empty', async () => {
    const result = await validateSDObjectives({ sd: { strategic_objectives: [] } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toContain('SD has no strategic objectives defined');
  });

  it('returns score 35 with 1 objective and no metrics (passes at >= 30)', async () => {
    const result = await validateSDObjectives({
      sd: { strategic_objectives: ['Improve user auth'] }
    });
    expect(result.passed).toBe(true); // 35 >= 30 threshold
    expect(result.score).toBe(35);
    expect(result.warnings).toContain('SD has 1 strategic objective, 2+ recommended');
    expect(result.warnings).toContain('SD should have success metrics defined');
    expect(result.details.objectivesCount).toBe(1);
  });

  it('returns score 65 with 1 objective and metrics', async () => {
    const result = await validateSDObjectives({
      sd: {
        strategic_objectives: ['Improve auth'],
        success_metrics: ['Reduce auth failures by 50%']
      }
    });
    expect(result.passed).toBe(true); // 65 >= 30
    expect(result.score).toBe(65);
    expect(result.warnings).toContain('SD has 1 strategic objective, 2+ recommended');
    expect(result.details.objectivesCount).toBe(1);
    expect(result.details.metricsCount).toBe(1);
  });

  it('returns score 70 with 2+ objectives but no metrics', async () => {
    const result = await validateSDObjectives({
      sd: {
        strategic_objectives: ['Objective A', 'Objective B']
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toContain('SD should have success metrics defined');
    expect(result.details.objectivesCount).toBe(2);
  });

  it('returns score 100 with 2+ objectives and success metrics', async () => {
    const result = await validateSDObjectives({
      sd: {
        strategic_objectives: ['Implement feature X', 'Improve performance by 30%'],
        success_metrics: ['Response time < 200ms', 'Zero downtime deployment']
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.objectivesCount).toBe(2);
    expect(result.details.metricsCount).toBe(2);
  });

  it('returns score 100 with many objectives and metrics', async () => {
    const result = await validateSDObjectives({
      sd: {
        strategic_objectives: ['Obj A', 'Obj B', 'Obj C', 'Obj D'],
        success_metrics: ['Metric 1', 'Metric 2', 'Metric 3']
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.objectivesCount).toBe(4);
    expect(result.details.metricsCount).toBe(3);
  });

  it('fails when score is below 30 (no objectives, no metrics)', async () => {
    const result = await validateSDObjectives({
      sd: { strategic_objectives: [], success_metrics: [] }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('handles missing success_metrics gracefully', async () => {
    const result = await validateSDObjectives({
      sd: { strategic_objectives: ['Obj A', 'Obj B'] }
    });
    expect(result.details.metricsCount).toBe(0);
    expect(result.warnings).toContain('SD should have success metrics defined');
  });

  it('treats empty success_metrics as no metrics', async () => {
    const result = await validateSDObjectives({
      sd: { strategic_objectives: ['Obj A', 'Obj B'], success_metrics: [] }
    });
    expect(result.score).toBe(70); // 70 for objectives only
    expect(result.warnings).toContain('SD should have success metrics defined');
  });
});
