/**
 * Forecast availability classifier — SD-LEO-INFRA-EXEC-EMAIL-FORECAST-FROZEN-001 (FR-2).
 *
 * The exec-summary email must distinguish an ERROR-omitted build-completion forecast from a genuine
 * "no forecast yet". Before this, a query error and a present-but-empty table both left the forecast
 * line silently absent, so a broken forecast looked identical to no forecast. classifyForecastAvailability
 * is the pure discriminator the renderer keys on. These tests pin the three cases: real error → degraded
 * (show a marker), unprovisioned/dormant table → genuine no-forecast (silent), rows present → hasForecast.
 */
import { describe, it, expect } from 'vitest';
import { classifyForecastAvailability, FORECAST_DEGRADED_MARKER } from '../../lib/vision/build-completion-forecast.mjs';

describe('classifyForecastAvailability (FR-2)', () => {
  it('flags a real query error as degraded (render a marker, do not silently drop)', () => {
    const r = classifyForecastAvailability({ error: { message: 'connection reset by peer' }, rows: null });
    expect(r).toEqual({ degraded: true, hasForecast: false });
  });

  it('flags a thrown/string error as degraded', () => {
    const r = classifyForecastAvailability({ error: 'timeout', rows: undefined });
    expect(r.degraded).toBe(true);
    expect(r.hasForecast).toBe(false);
  });

  it('treats an UNPROVISIONED/dormant table as a genuine no-forecast (silent, not degraded)', () => {
    for (const msg of [
      'relation "build_completion_forecast_log" does not exist',
      'Could not find the table in the schema cache',
    ]) {
      const r = classifyForecastAvailability({ error: { message: msg }, rows: null });
      expect(r).toEqual({ degraded: false, hasForecast: false });
    }
  });

  it('treats a present-but-empty table as a genuine no-forecast (silent)', () => {
    expect(classifyForecastAvailability({ error: null, rows: [] })).toEqual({ degraded: false, hasForecast: false });
  });

  it('reports hasForecast when at least one row is returned', () => {
    expect(classifyForecastAvailability({ error: null, rows: [{ build_pct: 60 }] })).toEqual({ degraded: false, hasForecast: true });
  });

  it('is null-safe on missing input', () => {
    expect(classifyForecastAvailability()).toEqual({ degraded: false, hasForecast: false });
    expect(classifyForecastAvailability({})).toEqual({ degraded: false, hasForecast: false });
  });

  it('exposes a single-line degraded marker', () => {
    expect(typeof FORECAST_DEGRADED_MARKER).toBe('string');
    expect(FORECAST_DEGRADED_MARKER).not.toContain('\n');
    expect(FORECAST_DEGRADED_MARKER.toLowerCase()).toContain('unavailable');
  });
});
