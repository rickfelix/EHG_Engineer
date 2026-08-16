// QF-20260816-014. checkItemHasConsumer interpolated free-text PRD prose (itemName) directly
// into `new RegExp(...)` without escaping metacharacters. Any FR containing parens/brackets
// threw and fail-opened the gate: 'Unmatched )' (SD-LEO-INFRA-COMPLETION-TIER-SCRIPT-EXIT-001,
// signal 21f9ea4d) and 'Range out of order in character class'
// (SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001, signal cfa13b3c).
import { describe, it, expect } from 'vitest';
import { checkItemHasConsumer, escapeRegExp } from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/infrastructure-consumer-check.js';

const MINIMAL_CONFIG = { consumerHints: [] };

describe('escapeRegExp', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeRegExp('plain text 123')).toBe('plain text 123');
  });
});

describe('checkItemHasConsumer — QF-20260816-014 crash reproductions', () => {
  it('does not throw on an unmatched paren in itemName (Unmatched ")" repro)', () => {
    const itemName = 'compute the score (deprecated in favor of the new ladder';
    expect(() => checkItemHasConsumer(itemName, 'some content', MINIMAL_CONFIG)).not.toThrow();
  });

  it('does not throw on an unbalanced character class in itemName (Range out of order repro)', () => {
    const itemName = 'validate range [z-a] input';
    expect(() => checkItemHasConsumer(itemName, 'some content', MINIMAL_CONFIG)).not.toThrow();
  });

  it('still detects a real item_usage match after escaping', () => {
    const itemName = 'my_table(v2)';
    const content = 'the service will query my_table(v2) directly';
    const result = checkItemHasConsumer(itemName, content, MINIMAL_CONFIG);
    expect(result.hasConsumer).toBe(true);
    expect(result.evidence.some((e) => e.type === 'item_usage')).toBe(true);
  });
});
