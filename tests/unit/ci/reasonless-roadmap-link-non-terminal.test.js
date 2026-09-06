/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D FR-3 — CI predicate buildVerdict pure core.
 */
import { describe, it, expect } from 'vitest';
import { buildVerdict } from '../../../scripts/ci/reasonless-roadmap-link-non-terminal.mjs';

function row(sd_key, status, exception) {
  return { sd_key, status, metadata: exception === undefined ? {} : { roadmap_link_exception: exception } };
}

describe('TS-5 — CI predicate fails loudly with named offenders', () => {
  it('a draft bare-string row yields FAIL with the offender named and shaped', () => {
    const result = buildVerdict([row('SD-DRAFT-1', 'draft', 'a bare string reason')]);
    expect(result.status).toBe('FAIL');
    expect(result.scope).toBe('non_terminal');
    expect(result.offending_rows).toEqual([{ sd_key: 'SD-DRAFT-1', status: 'draft', shape: 'bare_string' }]);
  });
});

describe('TS-6 — CI predicate refuses to call an empty read a PASS', () => {
  it('zero rows carrying the key yields INSUFFICIENT_DATA, not PASS', () => {
    const result = buildVerdict([]);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.note).toMatch(/NOT the same as zero defects/);
  });
});

describe('scope correctness', () => {
  it('PASS when every reasonless row is terminal — offenders list is empty', () => {
    const result = buildVerdict([
      row('SD-DONE-1', 'completed', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('SD-LIVE-1', 'draft', { reason_supplied: true, operator_reason: 'ok' }),
    ]);
    expect(result.status).toBe('PASS');
    expect(result.offending_rows).toEqual([]);
    expect(result.all.without_reason).toBe(1);
    expect(result.non_terminal.without_reason).toBe(0);
  });

  it('a terminal SD with a reasonless row is never listed as an offender', () => {
    const result = buildVerdict([
      row('SD-DONE-1', 'completed', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('SD-DRAFT-1', 'draft', 'a bare string reason'),
    ]);
    expect(result.status).toBe('FAIL');
    expect(result.offending_rows).toEqual([{ sd_key: 'SD-DRAFT-1', status: 'draft', shape: 'bare_string' }]);
    expect(result.offending_rows.some((r) => r.sd_key === 'SD-DONE-1')).toBe(false);
  });

  it('multiple non-terminal offenders across shapes are all named', () => {
    const result = buildVerdict([
      row('SD-A', 'draft', 'bare string'),
      row('SD-B', 'active', { reason_supplied: false, operator_reason: 'no-reason-supplied' }),
      row('SD-C', 'in_progress', { operator_reason: 'x' }),
    ]);
    expect(result.status).toBe('FAIL');
    expect(result.offending_rows.map((r) => r.sd_key).sort()).toEqual(['SD-A', 'SD-B', 'SD-C']);
  });
});
