import { describe, it, expect } from 'vitest';
import { validateActionItems } from '../../../../scripts/modules/handoff/validators/action-items-validator.js';

describe('validateActionItems', () => {
  it('returns score 0 when handoff is missing', async () => {
    const result = await validateActionItems({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('No action items for next phase');
    expect(result.details.count).toBe(0);
  });

  it('returns score 0 when action_items is empty array', async () => {
    const result = await validateActionItems({ handoff: { action_items: [] } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toContain('No action items for next phase');
  });

  it('returns score 0 when action_items is null', async () => {
    const result = await validateActionItems({ handoff: { action_items: null } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns partial score when fewer than 3 action items', async () => {
    const result = await validateActionItems({
      handoff: { action_items: ['Item one is descriptive', 'Item two is descriptive'] }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(67); // Math.round(2/3 * 100)
    expect(result.issues[0]).toContain('Only 2 action items');
    expect(result.details.count).toBe(2);
    expect(result.details.minRequired).toBe(3);
  });

  it('returns partial score with 1 action item', async () => {
    const result = await validateActionItems({
      handoff: { action_items: ['Single item'] }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(33); // Math.round(1/3 * 100)
  });

  it('returns score 100 with 3+ specific string action items', async () => {
    const result = await validateActionItems({
      handoff: {
        action_items: [
          'Implement the database migration for users table',
          'Write unit tests for the new validator logic',
          'Update the API documentation with new endpoints'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.count).toBe(3);
    expect(result.details.specific).toBe(3);
  });

  it('returns score 100 with object action items that have description', async () => {
    const result = await validateActionItems({
      handoff: {
        action_items: [
          { description: 'First task' },
          { action: 'Second task' },
          { task: 'Third task' }
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.specific).toBe(3);
  });

  it('warns when some string items are too short (not specific)', async () => {
    const result = await validateActionItems({
      handoff: {
        action_items: [
          'Do it',  // too short (<=15)
          'This is a sufficiently long action item description',
          'Another sufficiently long action item for testing'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toContain('Some action items may need more specificity');
    expect(result.details.specific).toBe(2);
  });

  it('handles more than 3 action items', async () => {
    const result = await validateActionItems({
      handoff: {
        action_items: [
          'Implement database migration scripts',
          'Write comprehensive unit tests for validators',
          'Update API documentation with endpoints',
          'Review and update the deployment config',
          'Add monitoring and alerting rules'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.count).toBe(5);
  });

  it('handles mixed types in action items', async () => {
    const result = await validateActionItems({
      handoff: {
        action_items: [
          { description: 'Object item' },
          'This is a string item that is long enough',
          42 // non-string, non-object
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toContain('Some action items may need more specificity');
    expect(result.details.specific).toBe(2);
  });
});
