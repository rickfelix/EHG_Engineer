// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4.
import { describe, it, expect } from 'vitest';
import { isUnprovenancedPostCutover, DELIVERABLES_PROVENANCE_CUTOVER } from '../../../scripts/modules/handoff/validation/semantic-gate-utils.js';

const AFTER = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() + 86400000).toISOString();
const BEFORE = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() - 86400000).toISOString();

describe('isUnprovenancedPostCutover', () => {
  it('flags a completed row with a post-cutover completed_at and no metadata.producer', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'completed', completed_at: AFTER, metadata: {} })).toBe(true);
  });

  it('does not flag a row with metadata.producer set', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'hand_completed' } })).toBe(false);
  });

  it('exempts a row with no completed_at at all -- predates the FR-4 migration', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'completed', completed_at: null, metadata: {} })).toBe(false);
  });

  it('exempts a row whose completed_at predates the cutover', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'completed', completed_at: BEFORE, metadata: {} })).toBe(false);
  });

  it('ignores non-completed rows regardless of provenance', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'in_progress', completed_at: AFTER, metadata: {} })).toBe(false);
  });

  it('treats "done" the same as "completed"', () => {
    expect(isUnprovenancedPostCutover({ completion_status: 'done', completed_at: AFTER, metadata: {} })).toBe(true);
  });

  it('handles a null/undefined item without throwing', () => {
    expect(isUnprovenancedPostCutover(null)).toBe(false);
    expect(isUnprovenancedPostCutover(undefined)).toBe(false);
  });
});
