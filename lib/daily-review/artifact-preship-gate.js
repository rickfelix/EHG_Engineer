/**
 * artifact-preship-gate.js — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C (FR-3).
 *
 * Chairman-directed after the invented-Gantt-dates incident: before ANY brief is written or
 * delivered, verify it. This is a PURE gate (brief-in / verdict-out with an injected forecast
 * accessor) so it is unit-testable without live data.
 *
 * Rules:
 *   1. source-attribution — every number/date element must trace to a named source.
 *   2. forecast values come ONLY from the Solomon-calibrated forecast engine. If the engine
 *      output is unavailable, the element RENDERS 'no forecast available' — NEVER an invented or
 *      estimated date. A forecast value present that diverges from the engine output is treated
 *      as invented and BLOCKS delivery.
 *   3. render-verify — a provided label must match its source label (label/data match).
 *
 * A blocking verdict withholds the doc; a sanitized 'no forecast available' render is the safe
 * graceful path (false-KEEP-of-cruft is harmless; shipping an invented date is not).
 */

export const NO_FORECAST = 'no forecast available';

/**
 * @param {{elements?: Array<{id?:string, kind?:string, value?:*, source?:string, label?:string, source_label?:string, isForecast?:boolean}>}} brief
 * @param {{ getForecast?: (id:string)=>* }} [opts] getForecast: returns the Solomon engine value for a forecast element id, or undefined/null when unavailable.
 * @returns {{ blocked:boolean, offending:Array<{id:string,reason:string}>, rendered:Array<object> }}
 */
export function runPreShipGate(brief = {}, { getForecast = () => undefined } = {}) {
  const offending = [];
  const elements = Array.isArray(brief.elements) ? brief.elements : [];

  const rendered = elements.map((el) => {
    const out = { ...el };
    const id = el.id || '(unnamed)';
    const isNumeric = el.kind === 'number' || el.kind === 'date';

    if (el.isForecast) {
      // Rule 2 — forecast values ONLY from the Solomon-calibrated engine.
      const fv = getForecast(el.id);
      if (fv === undefined || fv === null || String(fv).trim() === '') {
        out.value = NO_FORECAST; // unavailable -> render placeholder, never an invented date
        out.forecast_unavailable = true;
      } else if (el.value !== undefined && el.value !== null && String(el.value) !== String(fv)) {
        offending.push({ id, reason: `forecast ${el.kind || 'value'} does not match the Solomon engine output (invented/estimated)` });
        out.value = fv;
      } else {
        out.value = fv;
      }
      return out;
    }

    // Rule 1 — source-attribution for numbers/dates.
    if (isNumeric && (!el.source || String(el.source).trim() === '')) {
      offending.push({ id, reason: `un-sourced ${el.kind} (no named source)` });
    }
    // Rule 3 — render-verify: label matches its source label when both are present.
    if (el.label && el.source_label && el.label !== el.source_label) {
      offending.push({ id, reason: `label/data mismatch: "${el.label}" != source "${el.source_label}"` });
    }
    return out;
  });

  return { blocked: offending.length > 0, offending, rendered };
}
