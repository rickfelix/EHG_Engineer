import { describe, it, expect } from 'vitest';
import { validatePlaywrightReport } from '../../../../scripts/modules/handoff/validators/playwright-report-validator.js';

describe('validatePlaywrightReport', () => {
  it('returns score 50 (non-blocking) when no report URL found', async () => {
    const result = await validatePlaywrightReport({});
    expect(result.passed).toBe(true); // non-blocking
    expect(result.score).toBe(50);
    expect(result.max_score).toBe(100);
    expect(result.warnings[0]).toContain('No Playwright report URL found');
    expect(result.details.hasReport).toBe(false);
  });

  it('returns score 50 when handoff and sd have no report data', async () => {
    const result = await validatePlaywrightReport({ handoff: {}, sd: {} });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(50);
  });

  it('returns score 100 with valid http URL in handoff metadata', async () => {
    const result = await validatePlaywrightReport({
      handoff: { metadata: { playwright_report_url: 'https://example.com/report' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.hasReport).toBe(true);
    expect(result.details.reportUrl).toBe('https://example.com/report');
  });

  it('returns score 100 with URL containing "playwright-report"', async () => {
    const result = await validatePlaywrightReport({
      handoff: { metadata: { playwright_report_url: '/path/to/playwright-report/index.html' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('reads from handoff.evidence.playwright_report', async () => {
    const result = await validatePlaywrightReport({
      handoff: { evidence: { playwright_report: 'http://ci.example.com/report/123' } }
    });
    expect(result.score).toBe(100);
    expect(result.details.hasReport).toBe(true);
  });

  it('reads from sd.test_evidence.playwright_report', async () => {
    const result = await validatePlaywrightReport({
      sd: { test_evidence: { playwright_report: 'https://ci.example.com/playwright' } }
    });
    expect(result.score).toBe(100);
  });

  it('returns score 70 when URL format is invalid', async () => {
    const result = await validatePlaywrightReport({
      handoff: { metadata: { playwright_report_url: 'not-a-valid-url' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings[0]).toContain('URL format may be invalid');
    expect(result.details.hasReport).toBe(true);
    expect(result.details.urlValid).toBe(false);
  });

  it('returns score 70 for non-string URL (number)', async () => {
    const result = await validatePlaywrightReport({
      handoff: { metadata: { playwright_report_url: 12345 } }
    });
    expect(result.score).toBe(70);
    expect(result.details.urlValid).toBe(false);
  });

  it('prefers handoff.metadata over handoff.evidence', async () => {
    const result = await validatePlaywrightReport({
      handoff: {
        metadata: { playwright_report_url: 'https://primary.com/report' },
        evidence: { playwright_report: 'https://fallback.com/report' }
      }
    });
    expect(result.details.reportUrl).toBe('https://primary.com/report');
  });
});
