// SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C (FR-3) — artifact pre-ship gate.
import { describe, it, expect } from 'vitest';
import { runPreShipGate, NO_FORECAST } from '../../../lib/daily-review/artifact-preship-gate.js';

describe('runPreShipGate — source attribution', () => {
  it('BLOCKS an un-sourced number/date and names the offender', () => {
    const brief = { elements: [
      { id: 'rev', kind: 'number', value: 42, source: 'ledger:2026-07-21' },
      { id: 'due', kind: 'date', value: '2026-08-01' }, // no source
    ] };
    const v = runPreShipGate(brief);
    expect(v.blocked).toBe(true);
    expect(v.offending.map((o) => o.id)).toContain('due');
  });

  it('PASSES when every number/date traces to a named source', () => {
    const brief = { elements: [
      { id: 'rev', kind: 'number', value: 42, source: 'ledger' },
      { id: 'start', kind: 'date', value: '2026-07-22', source: 'roadmap' },
      { id: 'note', kind: 'text', value: 'hello' }, // text needs no source
    ] };
    const v = runPreShipGate(brief);
    expect(v.blocked).toBe(false);
    expect(v.offending).toEqual([]);
  });

  it('BLOCKS a label/data mismatch (render-verify)', () => {
    const brief = { elements: [{ id: 'x', kind: 'number', value: 1, source: 's', label: 'Q3', source_label: 'Q2' }] };
    expect(runPreShipGate(brief).blocked).toBe(true);
  });
});

describe('runPreShipGate — forecast dates (Solomon engine only)', () => {
  it('renders "no forecast available" when the engine output is absent (never an invented date)', () => {
    const brief = { elements: [{ id: 'ship', kind: 'date', value: '2026-09-01', isForecast: true }] };
    const v = runPreShipGate(brief, { getForecast: () => undefined });
    const el = v.rendered.find((e) => e.id === 'ship');
    expect(el.value).toBe(NO_FORECAST);
    expect(el.forecast_unavailable).toBe(true);
    expect(v.blocked).toBe(false); // sanitized, not blocked, when that is the only issue
  });

  it('BLOCKS a forecast value that diverges from the engine output (invented/estimated)', () => {
    const brief = { elements: [{ id: 'ship', kind: 'date', value: '2026-09-01', isForecast: true }] };
    const v = runPreShipGate(brief, { getForecast: (id) => (id === 'ship' ? '2026-10-15' : undefined) });
    expect(v.blocked).toBe(true);
    expect(v.offending[0].id).toBe('ship');
  });

  it('PASSES a forecast value that matches the engine output', () => {
    const brief = { elements: [{ id: 'ship', kind: 'date', value: '2026-10-15', isForecast: true }] };
    const v = runPreShipGate(brief, { getForecast: () => '2026-10-15' });
    expect(v.blocked).toBe(false);
  });
});

describe('runPreShipGate — combined smoke-3 brief', () => {
  it('BLOCKS on an un-sourced element AND renders the forecast placeholder', () => {
    const brief = { elements: [
      { id: 'due', kind: 'date', value: '2026-08-01' },                 // un-sourced -> block
      { id: 'ship', kind: 'date', value: '2026-09-01', isForecast: true }, // no engine -> placeholder
    ] };
    const v = runPreShipGate(brief, { getForecast: () => undefined });
    expect(v.blocked).toBe(true);
    expect(v.offending.map((o) => o.id)).toContain('due');
    expect(v.rendered.find((e) => e.id === 'ship').value).toBe(NO_FORECAST);
  });
});
