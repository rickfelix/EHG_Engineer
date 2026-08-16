import { describe, it, expect } from 'vitest';
import { extractGuard4StatusSet } from './orchestrator-completion-guard4-extract.cjs';
import { TERMINAL_CHILD_STATUSES } from './orchestrator-completion.cjs';

const REAL_SHAPE_SNIPPET = `
  completed_children INTEGER;
  total_children INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')), COUNT(*)
    INTO completed_children, total_children
    FROM strategic_directives_v2
   WHERE parent_sd_id = sd_id_param;
`;

const DOCTORED_MISMATCH_SNIPPET = `
  completed_children INTEGER;
  total_children INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'deferred')), COUNT(*)
    INTO completed_children, total_children
    FROM strategic_directives_v2
   WHERE parent_sd_id = sd_id_param;
`;

const MISSING_ANCHOR_SNIPPET = 'SELECT 1;';

const ANCHOR_BUT_NO_IN_LIST_SNIPPET = `
  completed_children INTEGER := 0;
  total_children INTEGER := 0;
`;

describe('extractGuard4StatusSet (proves the FR-3 cross-check comparator actually rejects a mismatch)', () => {
  it('extracts (completed, cancelled) from a realistic guard-4 shape', () => {
    expect(extractGuard4StatusSet(REAL_SHAPE_SNIPPET)).toEqual(['cancelled', 'completed']);
  });

  it('matches TERMINAL_CHILD_STATUSES when the extracted set agrees (the passing case)', () => {
    const extracted = extractGuard4StatusSet(REAL_SHAPE_SNIPPET);
    const expected = [...TERMINAL_CHILD_STATUSES].sort();
    expect(extracted).toEqual(expected);
  });

  it('DOES NOT match TERMINAL_CHILD_STATUSES against a doctored function body -- proves the comparator can reject, not just always agree', () => {
    const extracted = extractGuard4StatusSet(DOCTORED_MISMATCH_SNIPPET);
    const expected = [...TERMINAL_CHILD_STATUSES].sort();
    expect(extracted).not.toEqual(expected);
    expect(extracted).toEqual(['completed', 'deferred']);
  });

  it('throws (never silently returns an empty set) when the anchor is missing', () => {
    expect(() => extractGuard4StatusSet(MISSING_ANCHOR_SNIPPET)).toThrow(/anchor/i);
  });

  it('throws (never silently returns an empty set) when the anchor exists but no IN-list follows it', () => {
    expect(() => extractGuard4StatusSet(ANCHOR_BUT_NO_IN_LIST_SNIPPET)).toThrow(/IN-list|status IN/i);
  });
});
