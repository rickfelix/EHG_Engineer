/**
 * LEO v4.4 LLM UX Oracle Fixture
 *
 * Multi-lens GPT-5.2 evaluation for human-like UX assessment:
 * - First-time user perspective
 * - Accessibility beyond WCAG
 * - Mobile usability
 * - Error recovery paths
 * - Cognitive load assessment
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/llm-ux-oracle';
 *
 * test('page has good UX', async ({ page, uxOracle }) => {
 *   await page.goto('/');
 *   const result = await uxOracle.evaluate('first-time-user');
 *   expect(result.score).toBeGreaterThan(70);
 * });
 * ```
 */

import { test as base, expect } from '@playwright/test';
import OpenAI from 'openai';

/**
 * Available evaluation lenses
 */
type EvaluationLens =
  | 'first-time-user'
  | 'accessibility'
  | 'mobile-user'
  | 'error-recovery'
  | 'cognitive-load';

/**
 * Lens prompts for different evaluation perspectives
 */
const LENS_PROMPTS: Record<EvaluationLens, string> = {
  'first-time-user': `Evaluate this UI as a first-time user who has never seen this application before.

Check:
- Is the purpose of this page immediately clear?
- Are the primary call-to-action buttons obvious and compelling?
- Is there adequate guidance or onboarding for new users?
- Would a user know what to do next?
- Are there confusing elements or unclear terminology?

Return JSON: { "score": 0-100, "issues": [...], "strengths": [...], "suggestions": [...] }`,

  'accessibility': `Evaluate this UI for visual accessibility issues that automated WCAG checkers miss.

Check:
- Color contrast and color-only meaning (can you understand without color?)
- Icon-only buttons without text labels
- Text readability and font sizes
- Visual hierarchy and focus indicators
- Motion or animation that could cause issues
- Spacing and touch/click target sizes

Return JSON: { "score": 0-100, "issues": [...], "strengths": [...], "suggestions": [...] }`,

  'mobile-user': `Evaluate this UI for mobile usability (assume this is viewed on a phone).

Check:
- Touch target sizes (should be at least 44x44px)
- Thumb-friendly placement (important actions in bottom half)
- Scroll depth (is critical content above the fold?)
- Pinch-zoom requirements (is text readable without zooming?)
- Form input friendliness
- Navigation accessibility on mobile

Return JSON: { "score": 0-100, "issues": [...], "strengths": [...], "suggestions": [...] }`,

  'error-recovery': `Evaluate the error handling and recovery UX of this page.

Check:
- Are any error messages visible? Are they helpful and specific?
- Is the recovery path clear to users?
- Can users recover without starting over?
- Are error states distinguishable from normal states?
- Is there guidance on how to fix issues?

Return JSON: { "score": 0-100, "issues": [...], "strengths": [...], "suggestions": [...] }`,

  'cognitive-load': `Evaluate this UI for cognitive load and decision fatigue.

Check:
- Too many choices presented at once?
- Overwhelming forms or information density?
- Clear visual hierarchy guiding the eye?
- Progressive disclosure used appropriately?
- Consistent patterns and predictable behavior?
- Distracting elements or competing for attention?

Return JSON: { "score": 0-100, "issues": [...], "strengths": [...], "suggestions": [...] }`
};

/**
 * Critical paths that warrant deeper analysis
 */
const CRITICAL_PATHS = ['/checkout', '/auth', '/payment', '/onboarding', '/signup', '/login'];

/**
 * UX evaluation result
 */
interface UXEvaluationResult {
  lens: EvaluationLens;
  score: number;
  issues: string[];
  strengths: string[];
  suggestions: string[];
  shouldBlock: boolean;
  stringency: 'strict' | 'standard' | 'relaxed';
  model: string;
  tokensUsed: number;
}

/**
 * Before/after comparison result
 */
interface ComparisonResult {
  verdict: 'improvement' | 'regression' | 'neutral';
  confidence: number;
  reasoning: string;
  changes: string[];
}

/**
 * User journey evaluation result
 */
interface JourneyEvaluationResult {
  overallScore: number;
  dropOffRisks: Array<{ step: number; risk: string; severity: 'high' | 'medium' | 'low' }>;
  frictionPoints: Array<{ step: number; description: string }>;
  recommendations: string[];
}

/**
 * LLM UX Oracle fixture
 */
interface LLMUXOracleFixture {
  /** Evaluate current page with a specific lens */
  evaluate: (lens: EvaluationLens, stringency?: 'strict' | 'standard' | 'relaxed') => Promise<UXEvaluationResult>;

  /** Evaluate with all lenses */
  evaluateAll: (stringency?: 'strict' | 'standard' | 'relaxed') => Promise<UXEvaluationResult[]>;

  /** Compare baseline screenshot to current state */
  compareVersions: (baselineScreenshot: Buffer) => Promise<ComparisonResult>;

  /** Evaluate a multi-step user journey */
  evaluateJourney: (screenshots: Array<{ step: string; image: Buffer }>) => Promise<JourneyEvaluationResult>;

  /** Get all evaluation results */
  getResults: () => UXEvaluationResult[];

  /** Check if any evaluation should block based on stringency */
  hasBlockingIssues: () => boolean;
}

/**
 * Stringency thresholds
 */
const STRINGENCY_THRESHOLDS: Record<'strict' | 'standard' | 'relaxed', number> = {
  strict: 70,
  standard: 50,
  relaxed: 0
};

/**
 * Create OpenAI client (lazy initialization)
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for LLM UX evaluation');
  }
  return new OpenAI({ apiKey });
}

/**
 * Check if current route is a critical path
 */
function isCriticalPath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return CRITICAL_PATHS.some(p => pathname.startsWith(p));
  } catch {
    return false;
  }
}

/**
 * Extended test fixtures including LLM UX oracle
 */
type LLMUXFixtures = {
  uxOracle: LLMUXOracleFixture;
};

/**
 * Extended test with LLM UX oracle fixture
 */
export const test = base.extend<LLMUXFixtures>({
  uxOracle: [async ({ page }, use, testInfo) => {
    const results: UXEvaluationResult[] = [];
    let openai: OpenAI | null = null;

    const fixture: LLMUXOracleFixture = {
      evaluate: async (
        lens: EvaluationLens,
        stringency: 'strict' | 'standard' | 'relaxed' = 'standard'
      ): Promise<UXEvaluationResult> => {
        if (!openai) openai = getOpenAIClient();

        // Capture screenshot
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        const base64Image = screenshot.toString('base64');

        // Determine token limit based on critical path
        const isCritical = isCriticalPath(page.url());
        const maxTokens = isCritical ? 2048 : 1024;

        // Call GPT-5.2
        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${base64Image}` }
              },
              {
                type: 'text',
                text: LENS_PROMPTS[lens]
              }
            ]
          }],
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);

        const result: UXEvaluationResult = {
          lens,
          score: parsed.score ?? 50,
          issues: parsed.issues ?? [],
          strengths: parsed.strengths ?? [],
          suggestions: parsed.suggestions ?? [],
          shouldBlock: (parsed.score ?? 50) < STRINGENCY_THRESHOLDS[stringency],
          stringency,
          model: 'gpt-5.2',
          tokensUsed: response.usage?.total_tokens ?? 0
        };

        results.push(result);
        return result;
      },

      evaluateAll: async (
        stringency: 'strict' | 'standard' | 'relaxed' = 'standard'
      ): Promise<UXEvaluationResult[]> => {
        const lenses: EvaluationLens[] = [
          'first-time-user',
          'accessibility',
          'mobile-user',
          'error-recovery',
          'cognitive-load'
        ];

        const evaluations: UXEvaluationResult[] = [];
        for (const lens of lenses) {
          const result = await fixture.evaluate(lens, stringency);
          evaluations.push(result);
        }

        return evaluations;
      },

      compareVersions: async (baselineScreenshot: Buffer): Promise<ComparisonResult> => {
        if (!openai) openai = getOpenAIClient();

        const currentScreenshot = await page.screenshot({ type: 'png', fullPage: false });

        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Compare these two UI versions. The first image is the baseline, the second is the current version.'
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${baselineScreenshot.toString('base64')}` }
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${currentScreenshot.toString('base64')}` }
              },
              {
                type: 'text',
                text: `Is this change an improvement, regression, or neutral?
Return JSON: { "verdict": "improvement|regression|neutral", "confidence": 0-100, "reasoning": "...", "changes": ["..."] }`
              }
            ]
          }],
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);

        return {
          verdict: parsed.verdict ?? 'neutral',
          confidence: parsed.confidence ?? 50,
          reasoning: parsed.reasoning ?? '',
          changes: parsed.changes ?? []
        };
      },

      evaluateJourney: async (
        screenshots: Array<{ step: string; image: Buffer }>
      ): Promise<JourneyEvaluationResult> => {
        if (!openai) openai = getOpenAIClient();

        const imageContents = screenshots.map(s => ({
          type: 'image_url' as const,
          image_url: { url: `data:image/png;base64,${s.image.toString('base64')}` }
        }));

        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Evaluate this ${screenshots.length}-step user journey for friction and drop-off risks.
Steps: ${screenshots.map((s, i) => `${i + 1}. ${s.step}`).join(', ')}`
              },
              ...imageContents,
              {
                type: 'text',
                text: `Return JSON: {
  "overallScore": 0-100,
  "dropOffRisks": [{ "step": number, "risk": "...", "severity": "high|medium|low" }],
  "frictionPoints": [{ "step": number, "description": "..." }],
  "recommendations": ["..."]
}`
              }
            ]
          }],
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);

        return {
          overallScore: parsed.overallScore ?? 50,
          dropOffRisks: parsed.dropOffRisks ?? [],
          frictionPoints: parsed.frictionPoints ?? [],
          recommendations: parsed.recommendations ?? []
        };
      },

      getResults: () => [...results],

      hasBlockingIssues: () => results.some(r => r.shouldBlock)
    };

    await use(fixture);

    // After test: attach LLM UX results to artifacts
    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);
      const blockingCount = results.filter(r => r.shouldBlock).length;

      const artifact = {
        testTitle: testInfo.title,
        testFile: testInfo.file,
        status: testInfo.status,
        summary: {
          evaluationsPerformed: results.length,
          averageScore: Math.round(avgScore),
          blockingIssues: blockingCount,
          totalTokensUsed: totalTokens,
          estimatedCost: `$${(totalTokens * 0.000003).toFixed(4)}`
        },
        evaluations: results,
        capturedAt: new Date().toISOString()
      };

      await testInfo.attach('llm-ux-evaluation.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json'
      });

      // If there were blocking issues, create separate summary
      if (blockingCount > 0) {
        await testInfo.attach('llm-ux-blocking-issues.json', {
          body: JSON.stringify({
            testTitle: testInfo.title,
            blockingCount,
            issues: results
              .filter(r => r.shouldBlock)
              .map(r => ({
                lens: r.lens,
                score: r.score,
                threshold: STRINGENCY_THRESHOLDS[r.stringency],
                issues: r.issues
              }))
          }, null, 2),
          contentType: 'application/json'
        });
      }
    }
  }, { auto: false }]
});

// Re-export expect from Playwright
export { expect };

/**
 * Assert UX score meets minimum threshold
 */
export function assertMinimumUXScore(
  result: UXEvaluationResult,
  minScore?: number
): void {
  const threshold = minScore ?? STRINGENCY_THRESHOLDS[result.stringency];

  if (result.score < threshold) {
    throw new Error(
      `UX evaluation failed for lens "${result.lens}"\n` +
      `Score: ${result.score} (threshold: ${threshold})\n` +
      `Issues:\n${result.issues.map(i => `  - ${i}`).join('\n')}`
    );
  }
}

/**
 * Assert no regressions in version comparison
 */
export function assertNoRegression(result: ComparisonResult): void {
  if (result.verdict === 'regression' && result.confidence > 60) {
    throw new Error(
      `UX regression detected (confidence: ${result.confidence}%)\n` +
      `Reasoning: ${result.reasoning}\n` +
      `Changes: ${result.changes.join(', ')}`
    );
  }
}

/**
 * Assert journey has no high-risk drop-off points
 */
export function assertNoHighRiskDropOff(result: JourneyEvaluationResult): void {
  const highRisks = result.dropOffRisks.filter(r => r.severity === 'high');

  if (highRisks.length > 0) {
    throw new Error(
      'High-risk drop-off points detected in user journey:\n' +
      highRisks.map(r => `  Step ${r.step}: ${r.risk}`).join('\n')
    );
  }
}

/**
 * Get summary of all evaluations for reporting
 */
export function getEvaluationSummary(results: UXEvaluationResult[]): {
  overallScore: number;
  passed: boolean;
  byLens: Record<string, number>;
  totalIssues: number;
  criticalIssues: string[];
} {
  if (results.length === 0) {
    return {
      overallScore: 0,
      passed: true,
      byLens: {},
      totalIssues: 0,
      criticalIssues: []
    };
  }

  const overallScore = Math.round(
    results.reduce((sum, r) => sum + r.score, 0) / results.length
  );

  const byLens: Record<string, number> = {};
  results.forEach(r => {
    byLens[r.lens] = r.score;
  });

  const allIssues = results.flatMap(r => r.issues);
  const criticalIssues = results
    .filter(r => r.score < 30)
    .flatMap(r => r.issues.slice(0, 2));

  return {
    overallScore,
    passed: !results.some(r => r.shouldBlock),
    byLens,
    totalIssues: allIssues.length,
    criticalIssues
  };
}
