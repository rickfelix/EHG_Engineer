import { describe, it, expect } from 'vitest';
import { validateSDPriority } from '../../../../scripts/modules/handoff/validators/sd-priority-validator.js';

describe('validateSDPriority', () => {
  it('returns score 0 when sd is missing', async () => {
    const result = await validateSDPriority({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('SD priority not set');
    expect(result.details.priority).toBeNull();
    expect(result.details.validPriorities).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('returns score 0 when priority is null', async () => {
    const result = await validateSDPriority({ sd: { priority: null } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toContain('SD priority not set');
  });

  it('returns score 0 when priority is empty string', async () => {
    const result = await validateSDPriority({ sd: { priority: '' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns score 0 for invalid priority value', async () => {
    const result = await validateSDPriority({ sd: { priority: 'urgent' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('Invalid priority: urgent');
    expect(result.issues[0]).toContain('critical, high, medium, low');
    expect(result.details.priority).toBe('urgent');
  });

  it.each(['critical', 'high', 'medium', 'low'])('returns score 100 for valid priority "%s"', async (priority) => {
    const result = await validateSDPriority({ sd: { priority } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.priority).toBe(priority);
  });

  it('handles case-insensitive priority (uppercase)', async () => {
    const result = await validateSDPriority({ sd: { priority: 'HIGH' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.priority).toBe('HIGH'); // preserves original case in details
  });

  it('handles mixed-case priority', async () => {
    const result = await validateSDPriority({ sd: { priority: 'Critical' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('returns score 0 for priority with extra whitespace', async () => {
    const result = await validateSDPriority({ sd: { priority: ' high ' } });
    // .toLowerCase() doesn't trim, so ' high ' won't match 'high'
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });
});
