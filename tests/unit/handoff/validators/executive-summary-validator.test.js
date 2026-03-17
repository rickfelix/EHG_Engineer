import { describe, it, expect } from 'vitest';
import { validateExecutiveSummary } from '../../../../scripts/modules/handoff/validators/executive-summary-validator.js';

describe('validateExecutiveSummary', () => {
  it('returns score 0 when handoff is missing', async () => {
    const result = await validateExecutiveSummary({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('Executive summary is missing');
    expect(result.details.length).toBe(0);
  });

  it('returns score 0 when summary is empty string', async () => {
    const result = await validateExecutiveSummary({ handoff: { executive_summary: '' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toContain('Executive summary is missing');
  });

  it('returns score 50 when summary is too short (<100 chars)', async () => {
    const shortSummary = 'This is a short summary that does not meet the minimum length requirement.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: shortSummary }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.issues[0]).toContain('too short');
    expect(result.issues[0]).toContain(`${shortSummary.length} chars`);
    expect(result.details.length).toBe(shortSummary.length);
    expect(result.details.minLength).toBe(100);
  });

  it('returns score 100 for valid summary without generic content', async () => {
    const goodSummary = 'Implemented the new user authentication module with JWT token support, ' +
      'integrated OAuth2 providers, and added comprehensive rate limiting to prevent brute force attacks.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: goodSummary }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.hasGenericContent).toBe(false);
  });

  it('returns score 80 when summary contains "this handoff"', async () => {
    const genericSummary = 'This handoff covers the implementation of the new authentication system ' +
      'with multiple provider support and comprehensive testing coverage included.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: genericSummary }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings).toContain('Executive summary may contain generic content');
    expect(result.details.hasGenericContent).toBe(true);
  });

  it('returns score 80 when summary contains "summary of"', async () => {
    const genericSummary = 'A summary of the work done to implement the new feature including database ' +
      'migrations, API endpoints, and frontend components for the dashboard module.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: genericSummary }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.details.hasGenericContent).toBe(true);
  });

  it('returns score 80 when summary contains "overview of"', async () => {
    const genericSummary = 'An overview of the changes made to the system architecture including ' +
      'microservice decomposition and event-driven communication patterns implemented.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: genericSummary }
    });
    expect(result.score).toBe(80);
  });

  it('returns score 80 when summary contains "please review"', async () => {
    const genericSummary = 'The authentication module has been completely rewritten with new security ' +
      'standards and improved error handling. Please review the implementation carefully.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: genericSummary }
    });
    expect(result.score).toBe(80);
  });

  it('detects generic content case-insensitively', async () => {
    const genericSummary = 'THIS HANDOFF documents the complete redesign of the payment processing ' +
      'pipeline with improved error handling and retry logic for failed transactions.';
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: genericSummary }
    });
    expect(result.score).toBe(80);
    expect(result.details.hasGenericContent).toBe(true);
  });

  it('passes summary exactly at 100 chars', async () => {
    // Create a string of exactly 100 characters
    const exactSummary = 'A'.repeat(100);
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: exactSummary }
    });
    expect(result.passed).toBe(true);
    expect(result.details.length).toBe(100);
  });

  it('fails summary at 99 chars', async () => {
    const shortSummary = 'A'.repeat(99);
    const result = await validateExecutiveSummary({
      handoff: { executive_summary: shortSummary }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
  });
});
