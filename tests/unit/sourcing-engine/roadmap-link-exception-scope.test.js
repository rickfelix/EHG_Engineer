/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D — non-terminal scope split (FR-2).
 *
 * countRoadmapLinkExceptions tallies the FULL historical corpus (6,141+ rows). A CI gate that
 * asserts without_reason===0 against that denominator can never pass — most of the corpus predates
 * this module. countRoadmapLinkExceptionsByScope must delegate to countRoadmapLinkExceptions TWICE
 * (never reimplement the reason_supplied===true predicate) so the all-corpus and non-terminal
 * figures can never diverge in tally logic — only in which rows they see.
 */
import { describe, it, expect } from 'vitest';
import {
  countRoadmapLinkExceptions,
  countRoadmapLinkExceptionsByScope,
  classifyExceptionShape,
  TERMINAL_SD_STATUSES,
} from '../../../lib/sourcing-engine/roadmap-link-exception.js';

function row(status, exception) {
  return { status, metadata: exception === undefined ? {} : { roadmap_link_exception: exception } };
}

describe('classifyExceptionShape', () => {
  it('canonical reasoned object', () => {
    expect(classifyExceptionShape({ reason_supplied: true, operator_reason: 'x' })).toBe('canonical_reasoned');
  });
  it('canonical no-reason marker', () => {
    expect(classifyExceptionShape({ reason_supplied: false, operator_reason: 'no-reason-supplied' })).toBe('no_reason_marker');
  });
  it('bare string (the .artifacts/michael-002-fences-20260905.mjs:30 writer defect)', () => {
    expect(classifyExceptionShape('chairman order: some prose reason')).toBe('bare_string');
  });
  it('empty string is malformed, not a reason', () => {
    expect(classifyExceptionShape('')).toBe('malformed_object');
  });
  it('object missing reason_supplied entirely is malformed', () => {
    expect(classifyExceptionShape({ operator_reason: 'x' })).toBe('malformed_object');
  });
});

describe('countRoadmapLinkExceptionsByScope — FR-2', () => {
  it('all deep-equals countRoadmapLinkExceptions for a mixed-status fixture', () => {
    const rows = [
      row('completed', { reason_supplied: true, operator_reason: 'r1' }),
      row('completed', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('draft', { reason_supplied: true, operator_reason: 'r2' }),
      row('active', 'a bare string reason'),
      row('in_progress'),
    ];
    const scoped = countRoadmapLinkExceptionsByScope(rows);
    expect(scoped.all).toEqual(countRoadmapLinkExceptions(rows));
  });

  it('non_terminal excludes a completed reasonless row and counts only the live one', () => {
    const rows = [
      row('completed', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('draft', { reason_supplied: true, operator_reason: 'reasoned' }),
    ];
    const scoped = countRoadmapLinkExceptionsByScope(rows);
    expect(scoped.non_terminal.without_reason).toBe(0);
    expect(scoped.all.without_reason).toBe(1);
  });

  it('classifies non_terminal shapes: bare_string vs no_reason_marker', () => {
    const rows = [
      row('draft', 'bare string reason'),
      row('active', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('pending_approval', { reason_supplied: true, operator_reason: 'reasoned' }),
    ];
    const scoped = countRoadmapLinkExceptionsByScope(rows);
    expect(scoped.non_terminal.shapes.bare_string).toBe(1);
    expect(scoped.non_terminal.shapes.no_reason_marker).toBe(1);
    expect(scoped.non_terminal.shapes.canonical_reasoned).toBe(1);
    expect(scoped.non_terminal.without_reason).toBe(2);
  });

  it('every TERMINAL_SD_STATUSES entry is excluded from non_terminal, even when reasonless', () => {
    const rows = TERMINAL_SD_STATUSES.map((status) =>
      row(status, { reason_supplied: false, operator_reason: 'no-reason-supplied' }));
    const scoped = countRoadmapLinkExceptionsByScope(rows);
    expect(scoped.non_terminal.total).toBe(0);
    expect(scoped.all.total).toBe(TERMINAL_SD_STATUSES.length);
  });

  it('accepts an injectable terminalStatuses list for tests without touching production default', () => {
    const rows = [row('custom_closed', { reason_supplied: false, operator_reason: 'no-reason-supplied' })];
    const scoped = countRoadmapLinkExceptionsByScope(rows, { terminalStatuses: ['custom_closed'] });
    expect(scoped.non_terminal.total).toBe(0);
    expect(TERMINAL_SD_STATUSES).not.toContain('custom_closed');
  });

  it('rows with no roadmap_link_exception key at all are not counted', () => {
    const rows = [row('draft')];
    const scoped = countRoadmapLinkExceptionsByScope(rows);
    expect(scoped.non_terminal.total).toBe(0);
    expect(scoped.all.total).toBe(0);
  });
});
