/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-2 / FR-3) — "Done in the last hour" section.
 * Proves plain-language rendering, the honest empty-state, contiguous windows, the
 * chairman_summary-vs-cleaned-title choice, and fail-soft loading.
 */
import { describe, it, expect } from 'vitest';
import {
  cleanTitle,
  itemLine,
  resolveWindow,
  renderRecentWork,
  loadRecentWork,
} from '../../../lib/fleet/exec-email-recent-work.js';

const NOW = 1_700_000_000_000;

describe('cleanTitle — strip SD jargon to a plain phrase', () => {
  it('drops a leading SD key and a trailing parenthetical', () => {
    expect(cleanTitle('SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001: Unblock portfolio-wide compounding (land the never-executed SD-3 keystone)'))
      .toBe('Unblock portfolio-wide compounding');
    expect(cleanTitle('Historize the hourly vision-gauge run (FR-2)')).toBe('Historize the hourly vision-gauge run');
  });
  it('handles empty/garbage', () => {
    expect(cleanTitle('')).toBe('an internal change');
    expect(cleanTitle(null)).toBe('an internal change');
  });
});

describe('itemLine — chairman_summary preferred, cleaned title fallback', () => {
  it('uses chairman_summary when present', () => {
    expect(itemLine({ title: 'SD-X: technical thing', metadata: { chairman_summary: 'We made the dashboard load faster.' } }))
      .toBe('We made the dashboard load faster.');
  });
  it('falls back to a cleaned title when chairman_summary is absent/blank', () => {
    expect(itemLine({ title: 'SD-X-001: Improve the thing', metadata: { chairman_summary: '   ' } })).toBe('Improve the thing');
    expect(itemLine({ title: 'SD-Y-001: Improve the other thing' })).toBe('Improve the other thing');
  });
});

describe('resolveWindow — contiguous half-open window, cold-start cap', () => {
  it('uses the prior window_end as the start when valid', () => {
    const prior = new Date(NOW - 40 * 60_000).toISOString();
    const w = resolveWindow({ windowEndIso: prior, nowMs: NOW });
    expect(w.startIso).toBe(prior);
    expect(Date.parse(w.nowIso)).toBe(NOW);
  });
  it('cold-start (no marker) looks back 1h', () => {
    const w = resolveWindow({ windowEndIso: null, nowMs: NOW });
    expect(Date.parse(w.startIso)).toBe(NOW - 60 * 60_000);
  });
  it('ignores a future or >24h-stale boundary (falls back to 1h)', () => {
    expect(Date.parse(resolveWindow({ windowEndIso: new Date(NOW + 1e6).toISOString(), nowMs: NOW }).startIso)).toBe(NOW - 60 * 60_000);
    expect(Date.parse(resolveWindow({ windowEndIso: new Date(NOW - 48 * 3600_000).toISOString(), nowMs: NOW }).startIso)).toBe(NOW - 60 * 60_000);
  });
});

describe('renderRecentWork — plain section + honest empty-state', () => {
  it('renders a count, item lines, and an in-progress line', () => {
    const r = renderRecentWork({
      completed: [
        { sd_key: 'SD-A-001', title: 'SD-A-001: Make claims more reliable (hardening)' },
        { sd_key: 'SD-B-001', title: 'SD-B-001: Add a report', metadata: { chairman_summary: 'Chairman now sees a weekly report.' } },
      ],
      inProgress: [{ sd_key: 'SD-C', title: 'SD-C-001: Design the cockpit (phase 0)' }],
    });
    expect(r.text).toContain('Done in the last hour: 2 items shipped.');
    expect(r.text).toContain('• Make claims more reliable');
    expect(r.text).toContain('• Chairman now sees a weekly report.');
    expect(r.text).toContain('In progress now: Design the cockpit.');
    expect(r.html).toContain('<ul');
  });
  it('honest empty-state when nothing shipped', () => {
    const r = renderRecentWork({ completed: [], inProgress: [] });
    expect(r.text).toBe('Done in the last hour: nothing shipped this hour.');
    expect(r.html).not.toContain('<ul');
  });
  it('never throws on malformed input', () => {
    expect(() => renderRecentWork({})).not.toThrow();
    expect(() => renderRecentWork({ completed: null, inProgress: null })).not.toThrow();
  });
});

describe('loadRecentWork — fail-soft + window filter', () => {
  it('keeps only completions inside [start, now) by completion_date/updated_at', async () => {
    const inWin = new Date(NOW - 30 * 60_000).toISOString();
    const outWin = new Date(NOW - 5 * 3600_000).toISOString();
    const db = {
      from: (t) => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: [
            { sd_key: 'IN', title: 'SD-IN: in window', completion_date: inWin, updated_at: inWin },
            { sd_key: 'OUT', title: 'SD-OUT: too old', completion_date: outWin, updated_at: outWin },
          ], error: null }) }) }),
          in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        }),
      }),
    };
    const r = await loadRecentWork(db, { startIso: new Date(NOW - 60 * 60_000).toISOString(), nowIso: new Date(NOW).toISOString() });
    expect(r.completed.map((c) => c.sd_key)).toEqual(['IN']);
    expect(r.degraded).toBe(false);
  });
  it('degrades to empty lists on a query error (never throws)', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) };
    const r = await loadRecentWork(db, { startIso: new Date(NOW - 3600_000).toISOString(), nowIso: new Date(NOW).toISOString() });
    expect(r).toMatchObject({ completed: [], inProgress: [], degraded: true });
  });
});
