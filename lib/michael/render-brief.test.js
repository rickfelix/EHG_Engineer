// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-3, TS-4.
import { describe, it, expect } from 'vitest';
import { renderBrief, verifyRender, formatLongDate } from './render-brief.js';
import { buildBriefData } from './brief-model.mjs';

const DATA = buildBriefData({
  etDate: '2026-09-07',
  calendarRows: [{ event_id: 'e1', coded_marker: true }],
  triageRows: [{ thread_id: 't1', class: null, needs_you: true, needs_you_reason: 'ambiguous' }],
  snapshotRows: [{ task_id: 'x1', effort_grade: 'S' }],
  feederRuns: [
    { feeder: 'tasks-classifier', attempt: 1, status: 'ok', id: 'r1' },
    { feeder: 'calendar-read', attempt: 1, status: 'ok', id: 'r2' },
    { feeder: 'gmail-triage', attempt: 1, status: 'ok', id: 'r3' },
    { feeder: 'todoist-brief', attempt: 1, status: 'ok', id: 'r4', counts: { ehg_pointer: 1 } },
  ],
});

describe('formatLongDate', () => {
  it('renders YYYY-MM-DD as "Month D, YYYY" with fixed month names', () => {
    expect(formatLongDate('2026-09-07')).toBe('September 7, 2026');
    expect(formatLongDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatLongDate('2026-12-31')).toBe('December 31, 2026');
  });
  it('returns empty string for malformed input', () => {
    expect(formatLongDate('not-a-date')).toBe('');
    expect(formatLongDate(undefined)).toBe('');
    expect(formatLongDate('2026-13-01')).toBe('');
  });
});

describe('renderBrief + verifyRender', () => {
  it('a good render sets verified true with empty verify_notes', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' });
    const v = verifyRender(html, { etDate: '2026-09-07' });
    expect(v).toEqual({ verified: true, verify_notes: '' });
    expect(html).toContain('September 7, 2026');
    expect(html).toContain(DATA.lede);
  });

  it('missing doctype leaves verified false and names doctype', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' }).replace('<!DOCTYPE html>\n', '');
    const v = verifyRender(html, { etDate: '2026-09-07' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('doctype');
  });

  it('missing closing </html> leaves verified false and names closing_tag', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' }).replace(/\n<\/html>$/, '');
    const v = verifyRender(html, { etDate: '2026-09-07' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('closing_tag');
  });

  it('wrong long date leaves verified false and names date', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' });
    const v = verifyRender(html, { etDate: '2026-09-08' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('date');
  });

  it('a residual {{TOKEN}} leaves verified false and names template_token', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' }) + '\n<!-- {{UNRENDERED}} -->';
    const v = verifyRender(html, { etDate: '2026-09-07' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('template_token');
  });

  it('an embedded NUL byte leaves verified false and names nul_byte', () => {
    const html = renderBrief(DATA, { etDate: '2026-09-07' }) + String.fromCharCode(0);
    const v = verifyRender(html, { etDate: '2026-09-07' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('nul_byte');
  });

  it('multiple simultaneous failures are all named', () => {
    const v = verifyRender('<html><body>no doctype, no close, no date</body>', { etDate: '2026-09-07' });
    expect(v.verified).toBe(false);
    expect(v.verify_notes).toContain('doctype');
    expect(v.verify_notes).toContain('closing_tag');
    expect(v.verify_notes).toContain('date');
  });
});
