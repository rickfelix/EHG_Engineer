import { describe, it, expect } from 'vitest';
import { formatMeasuredAtLine } from '../../scripts/coordinator-capacity-forecast.mjs';

/**
 * SD-LEO-INFRA-FORECASTER-MEASURED-AT-001.
 *
 * The Adam-facing sourcing ask previously carried NO measurement time at all, so a forecast read at
 * 14:00 and acted on at 17:00 was indistinguishable from a live one to its reader. This guard exists
 * because losing the stamp is SILENT — the ask still sends and still reads as authoritative.
 *
 * Verified end-to-end on a real dispatched row before this guard was written (session_coordination
 * a51adaf6, 2026-08-29): payload.forecast.measured_at = 2026-08-29T16:36:55.822Z with the row
 * created at 16:36:57.278Z. That ~1.5s gap is the point — measured-at and sent-at are now separable.
 */
describe('formatMeasuredAtLine', () => {
  const f = { measuredAt: '2026-08-29T16:36:55.822Z', beltDepth: 3, demandSoon: 6, deficit: 4, verdict: 'DEFICIT' };

  it('carries the measurement instant, not the send time', () => {
    expect(formatMeasuredAtLine(f)).toContain('MEASURED-AT 2026-08-29T16:36:55.822Z');
  });

  it('carries the full belt/demand/deficit triple plus the verdict', () => {
    const line = formatMeasuredAtLine(f);
    expect(line).toContain('belt=3');
    expect(line).toContain('demand=6');
    expect(line).toContain('deficit=4');
    expect(line).toContain('verdict=DEFICIT');
  });

  it('renders a NEGATIVE deficit unclamped — a surplus is a legitimate reading, not an error', () => {
    expect(formatMeasuredAtLine({ ...f, deficit: -2, verdict: 'SURPLUS' })).toContain('deficit=-2');
  });

  it('renders zero as zero, so an absent number can never be mistaken for a measured zero', () => {
    const line = formatMeasuredAtLine({ ...f, beltDepth: 0, demandSoon: 0, deficit: 0 });
    expect(line).toContain('belt=0');
    expect(line).toContain('demand=0');
    expect(line).toContain('deficit=0');
  });
});
