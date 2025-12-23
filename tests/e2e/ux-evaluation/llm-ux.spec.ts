/**
 * LEO v4.4 LLM UX Evaluation Tests
 *
 * Multi-lens GPT-5.2 evaluation for human-like UX assessment
 * Part of Human-Like E2E Testing Enhancements
 *
 * Note: These tests require OPENAI_API_KEY environment variable
 */

import {
  test,
  expect,
  assertMinimumUXScore,
  assertNoHighRiskDropOff,
  getEvaluationSummary
} from '../fixtures/llm-ux-oracle';

// Skip LLM tests if API key not available
const apiKeyAvailable = !!process.env.OPENAI_API_KEY;

test.describe('First-Time User Experience', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('home page is clear for new users', async ({ page, uxOracle }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await uxOracle.evaluate('first-time-user');

    console.log(`First-time user score: ${result.score}/100`);
    console.log(`Issues: ${result.issues.length}`);
    result.issues.forEach(i => console.log(`  - ${i}`));

    assertMinimumUXScore(result);
  });

  test('login page has clear guidance', async ({ page, uxOracle }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const result = await uxOracle.evaluate('first-time-user');
    assertMinimumUXScore(result);
  });
});

test.describe('Visual Accessibility', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('home page visual accessibility', async ({ page, uxOracle }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await uxOracle.evaluate('accessibility');

    console.log(`Visual a11y score: ${result.score}/100`);
    result.issues.forEach(i => console.log(`  - ${i}`));

    assertMinimumUXScore(result);
  });
});

test.describe('Mobile Usability', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('home page mobile-friendly', async ({ page, uxOracle }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await uxOracle.evaluate('mobile-user');

    console.log(`Mobile UX score: ${result.score}/100`);
    result.issues.forEach(i => console.log(`  - ${i}`));

    assertMinimumUXScore(result);
  });
});

test.describe('Cognitive Load', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('dashboard cognitive load acceptable', async ({ page, uxOracle }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const result = await uxOracle.evaluate('cognitive-load');

    console.log(`Cognitive load score: ${result.score}/100`);
    result.suggestions.forEach(s => console.log(`  Suggestion: ${s}`));

    assertMinimumUXScore(result);
  });
});

test.describe('Error States', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('error state provides recovery guidance', async ({ page, uxOracle }) => {
    // Force an error state
    await page.route('**/api/**', route => route.fulfill({ status: 500 }));
    await page.goto('/dashboard');

    const result = await uxOracle.evaluate('error-recovery');

    console.log(`Error recovery score: ${result.score}/100`);
    assertMinimumUXScore(result, 40); // Lower threshold for error states
  });
});

test.describe('Multi-Lens Evaluation', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('home page comprehensive evaluation', async ({ page, uxOracle }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Evaluate with all lenses
    const results = await uxOracle.evaluateAll();

    const summary = getEvaluationSummary(results);
    console.log(`Overall score: ${summary.overallScore}/100`);
    console.log(`Passed: ${summary.passed}`);
    console.log('Scores by lens:');
    Object.entries(summary.byLens).forEach(([lens, score]) => {
      console.log(`  ${lens}: ${score}`);
    });

    expect(summary.passed).toBe(true);
  });
});

test.describe('User Journey', () => {
  test.skip(!apiKeyAvailable, 'OPENAI_API_KEY not available');

  test('login journey has no high-risk drop-offs', async ({ page, uxOracle }) => {
    const screenshots: Array<{ step: string; image: Buffer }> = [];

    // Step 1: Home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    screenshots.push({
      step: 'Home page',
      image: await page.screenshot()
    });

    // Step 2: Navigate to login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    screenshots.push({
      step: 'Login page',
      image: await page.screenshot()
    });

    // Step 3: Fill form
    await page.fill('input[name="email"]', 'test@example.com').catch(() => {});
    screenshots.push({
      step: 'Form filled',
      image: await page.screenshot()
    });

    // Evaluate the journey
    const result = await uxOracle.evaluateJourney(screenshots);

    console.log(`Journey score: ${result.overallScore}/100`);
    console.log(`Drop-off risks: ${result.dropOffRisks.length}`);
    result.dropOffRisks.forEach(r => {
      console.log(`  Step ${r.step} (${r.severity}): ${r.risk}`);
    });

    assertNoHighRiskDropOff(result);
  });
});
