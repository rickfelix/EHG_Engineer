import { describe, it, expect } from 'vitest';

// Test the validateAssignmentIntegrity function logic inline
// (exported from roadmap-generate.js would require mocking supabase)

function validateAssignmentIntegrity(newItems, assignments, existingWaves) {
  const issues = [];

  const assignedIndices = new Set(assignments.filter(a => a.wave_index > 0).map(a => a.item_index));
  const orphaned = newItems.filter((_, i) => !assignedIndices.has(i + 1));
  if (orphaned.length > 0) {
    issues.push({ type: 'orphaned', count: orphaned.length, items: orphaned.map(i => i.title || i.id) });
  }

  const seenItems = new Map();
  for (const a of assignments) {
    if (a.wave_index === 0) continue;
    const key = a.item_index;
    if (seenItems.has(key)) {
      issues.push({ type: 'duplicate', itemIndex: key, waves: [seenItems.get(key), a.wave_index] });
    }
    seenItems.set(key, a.wave_index);
  }

  return { valid: issues.length === 0, issues };
}

describe('roadmap wave locking', () => {
  describe('validateAssignmentIntegrity', () => {
    it('passes when all items assigned exactly once', () => {
      const items = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
      const assignments = [
        { item_index: 1, wave_index: 1 },
        { item_index: 2, wave_index: 1 },
        { item_index: 3, wave_index: 2 },
      ];
      const result = validateAssignmentIntegrity(items, assignments, [{}, {}]);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('detects orphaned items', () => {
      const items = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
      const assignments = [
        { item_index: 1, wave_index: 1 },
        // item 2 and 3 not assigned
      ];
      const result = validateAssignmentIntegrity(items, assignments, [{}]);
      expect(result.valid).toBe(false);
      expect(result.issues[0].type).toBe('orphaned');
      expect(result.issues[0].count).toBe(2);
    });

    it('detects duplicate assignments', () => {
      const items = [{ title: 'A' }];
      const assignments = [
        { item_index: 1, wave_index: 1 },
        { item_index: 1, wave_index: 2 },
      ];
      const result = validateAssignmentIntegrity(items, assignments, [{}, {}]);
      expect(result.valid).toBe(false);
      expect(result.issues[0].type).toBe('duplicate');
    });

    it('ignores unmatched items (wave_index 0)', () => {
      const items = [{ title: 'A' }, { title: 'B' }];
      const assignments = [
        { item_index: 1, wave_index: 1 },
        { item_index: 2, wave_index: 0 }, // unmatched
      ];
      const result = validateAssignmentIntegrity(items, assignments, [{}]);
      expect(result.valid).toBe(false);
      expect(result.issues[0].type).toBe('orphaned');
      expect(result.issues[0].count).toBe(1);
    });

    it('handles empty assignments', () => {
      const result = validateAssignmentIntegrity([], [], []);
      expect(result.valid).toBe(true);
    });
  });
});
