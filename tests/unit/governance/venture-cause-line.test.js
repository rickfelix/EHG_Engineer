/**
 * lib/governance/venture-cause-line.js — SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-5.
 * PRD test scenarios TS-2/TS-3 (three-state render contract) applied to the status-line surface.
 */
import { describe, it, expect } from 'vitest';
import { formatCauseLine, formatLegLine } from '../../../lib/governance/venture-cause-line.js';

const populatedLeg = (n, producer = 'test_producer', run_id = 'run-id-1234567890') => ({
  producer, run_id, content_hash: 'hash', item_count: n,
  items: Array.from({ length: n }, (_, i) => `item-${i}`), items_truncated: false, absent: false, absent_reason: null,
});
const emptyLeg = () => populatedLeg(0);
const absentLeg = (reason) => ({ producer: 'p', run_id: null, content_hash: null, item_count: 0, items: [], items_truncated: false, absent: true, absent_reason: reason });

describe('formatCauseLine', () => {
  it('renders "not captured" when captured_cause itself is missing', () => {
    expect(formatCauseLine(null)).toBe('cause: not captured for this walk');
    expect(formatCauseLine(undefined)).toBe('cause: not captured for this walk');
  });

  it('TS-3: renders capture-unavailable distinctly when every leg is absent', () => {
    const line = formatCauseLine({ worker_logs: absentLeg('fetch_failed'), venture_errors: absentLeg('not_attempted'), d1_failures: absentLeg('fetch_failed') });
    expect(line).toContain('capture unavailable');
    expect(line).toContain('fetch_failed');
    expect(line).not.toContain('no matching entries');
  });

  it('TS-2: renders "no matching entries...(capture succeeded)" distinctly when every leg ran but found nothing', () => {
    const line = formatCauseLine({ worker_logs: emptyLeg(), venture_errors: emptyLeg(), d1_failures: emptyLeg() });
    expect(line).toBe('cause: no matching entries in window (capture succeeded)');
  });

  it('the empty-but-succeeded rendering is textually distinct from the capture-unavailable rendering', () => {
    const unavailable = formatCauseLine({ worker_logs: absentLeg('fetch_failed'), venture_errors: absentLeg('fetch_failed'), d1_failures: absentLeg('fetch_failed') });
    const empty = formatCauseLine({ worker_logs: emptyLeg(), venture_errors: emptyLeg(), d1_failures: emptyLeg() });
    expect(unavailable).not.toBe(empty);
  });

  it('renders a populated cause with producer and a shortened run_id', () => {
    const line = formatCauseLine({
      worker_logs: absentLeg('not_attempted'),
      venture_errors: populatedLeg(2, 'record_venture_error_feedback', 'feedback-row-id-abcdef'),
      d1_failures: absentLeg('not_attempted'),
      summary: 'captured cause: venture_errors=2',
    });
    expect(line).toContain('captured cause: venture_errors=2');
    expect(line).toContain('record_venture_error_feedback');
    expect(line).toContain('feedback-row'); // 'feedback-row-id-abcdef'.slice(0, 12)
  });

  it('never exceeds 160 chars and stays a single line', () => {
    const line = formatCauseLine({
      worker_logs: populatedLeg(10, 'p'.repeat(50), 'r'.repeat(50)),
      venture_errors: emptyLeg(),
      d1_failures: emptyLeg(),
      summary: 'x'.repeat(500),
    });
    expect(line.length).toBeLessThanOrEqual(160);
    expect(line).not.toContain('\n');
  });

  it('handles a captured_cause object with no recognizable legs gracefully', () => {
    expect(formatCauseLine({})).toBe('cause: not captured for this walk');
  });
});

describe('formatLegLine', () => {
  it('TS-3: distinguishes absent from empty at the per-leg level', () => {
    expect(formatLegLine('worker_logs', absentLeg('dispatch_failed'))).toContain('capture unavailable (dispatch_failed)');
    expect(formatLegLine('worker_logs', emptyLeg())).toContain('no matching entries in window (capture succeeded)');
  });

  it('renders a populated leg with its own producer/run_id', () => {
    const line = formatLegLine('d1_failures', populatedLeg(3, 'cloudflare_d1', 'ray-id-here'));
    expect(line).toContain('3 entries');
    expect(line).toContain('cloudflare_d1');
  });

  it('singularizes a one-item leg', () => {
    expect(formatLegLine('venture_errors', populatedLeg(1))).toContain('1 entry');
  });

  it('handles a null/undefined leg without throwing', () => {
    expect(() => formatLegLine('worker_logs', null)).not.toThrow();
    expect(formatLegLine('worker_logs', null)).toContain('capture unavailable');
  });
});
