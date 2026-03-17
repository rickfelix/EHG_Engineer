import { describe, it, expect } from 'vitest';
import { validateScreenshotEvidence } from '../../../../scripts/modules/handoff/validators/screenshot-evidence-validator.js';

describe('validateScreenshotEvidence', () => {
  it('returns score 50 (non-blocking) when no screenshots found', async () => {
    const result = await validateScreenshotEvidence({});
    expect(result.passed).toBe(true); // non-blocking
    expect(result.score).toBe(50);
    expect(result.max_score).toBe(100);
    expect(result.warnings[0]).toContain('No screenshot evidence found');
    expect(result.details.hasScreenshots).toBe(false);
  });

  it('returns score 50 when handoff and sd have no screenshot data', async () => {
    const result = await validateScreenshotEvidence({ handoff: {}, sd: {} });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(50);
  });

  it('returns score 100 with valid http URL in handoff metadata', async () => {
    const result = await validateScreenshotEvidence({
      handoff: { metadata: { screenshot_url: 'https://storage.example.com/screenshot.png' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.hasScreenshots).toBe(true);
    expect(result.details.count).toBe(1);
  });

  it('returns score 100 with path starting with /', async () => {
    const result = await validateScreenshotEvidence({
      handoff: { metadata: { screenshot_url: '/screenshots/test-result.png' } }
    });
    expect(result.score).toBe(100);
    expect(result.details.hasScreenshots).toBe(true);
  });

  it('reads from handoff.evidence.screenshots', async () => {
    const result = await validateScreenshotEvidence({
      handoff: { evidence: { screenshots: 'http://storage.example.com/shots/1.png' } }
    });
    expect(result.score).toBe(100);
    expect(result.details.hasScreenshots).toBe(true);
  });

  it('reads from sd.test_evidence.screenshots', async () => {
    const result = await validateScreenshotEvidence({
      sd: { test_evidence: { screenshots: 'https://example.com/screenshots' } }
    });
    expect(result.score).toBe(100);
  });

  it('returns score 100 with array of screenshots', async () => {
    const result = await validateScreenshotEvidence({
      handoff: {
        metadata: { screenshot_url: ['https://a.com/1.png', 'https://a.com/2.png', 'https://a.com/3.png'] }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.hasScreenshots).toBe(true);
    expect(result.details.count).toBe(3);
  });

  it('returns score 70 when URL format is invalid (not http or /)', async () => {
    const result = await validateScreenshotEvidence({
      handoff: { metadata: { screenshot_url: 'invalid-path' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings[0]).toContain('Screenshot URL format may be invalid');
    expect(result.details.hasScreenshots).toBe(true);
    expect(result.details.urlValid).toBe(false);
  });

  it('returns score 70 for non-string non-array URL', async () => {
    const result = await validateScreenshotEvidence({
      handoff: { metadata: { screenshot_url: 42 } }
    });
    expect(result.score).toBe(70);
  });

  it('prefers handoff.metadata.screenshot_url over other sources', async () => {
    const result = await validateScreenshotEvidence({
      handoff: {
        metadata: { screenshot_url: 'https://primary.com/shot.png' },
        evidence: { screenshots: 'https://fallback.com/shot.png' }
      }
    });
    expect(result.score).toBe(100);
    expect(result.details.count).toBe(1);
  });
});
