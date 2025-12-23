/**
 * LEO v4.4 Stringency Resolver Fixture
 *
 * Automatically determines test stringency based on context signals:
 * - Critical paths (checkout, auth, payment)
 * - User story priority
 * - Recent incidents/failures
 * - PR size and scope
 * - Coverage gaps
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/stringency-resolver';
 *
 * test('feature test', async ({ page, stringency }) => {
 *   const level = await stringency.resolve('/checkout');
 *   // level is 'strict' for critical paths
 * });
 * ```
 */

import { test as base, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Stringency levels
 */
type StringencyLevel = 'strict' | 'standard' | 'relaxed';

/**
 * Context signals used to determine stringency
 */
interface StringencySignals {
  /** Route matches critical path patterns */
  isCriticalPath: boolean;
  /** Priority of linked user story (0=highest) */
  storyPriority: number | null;
  /** Number of recent incidents on this route */
  recentIncidents: number;
  /** Lines changed in current PR */
  prLinesChanged: number;
  /** Historical test failures for this route */
  historicalFailures: number;
  /** Whether this is a feature branch */
  isFeatureBranch: boolean;
  /** Test coverage percentage for this route */
  coveragePercent: number;
  /** Route matches admin/internal patterns */
  isAdminRoute: boolean;
}

/**
 * Resolution result with explanation
 */
interface StringencyResolution {
  level: StringencyLevel;
  signals: StringencySignals;
  reason: string;
  overridden: boolean;
}

/**
 * Stringency resolver fixture
 */
interface StringencyResolverFixture {
  /** Resolve stringency for a route */
  resolve: (route: string, storyId?: string) => Promise<StringencyLevel>;

  /** Get detailed resolution with signals */
  resolveWithDetails: (route: string, storyId?: string) => Promise<StringencyResolution>;

  /** Check if route is a critical path */
  isCriticalPath: (route: string) => boolean;

  /** Get thresholds for current stringency */
  getThresholds: (level: StringencyLevel) => StringencyThresholds;

  /** Override stringency for this test (use sparingly) */
  override: (level: StringencyLevel) => void;

  /** Get current stringency (after resolution or override) */
  current: () => StringencyLevel;
}

/**
 * Per-check thresholds for each stringency level
 */
interface StringencyThresholds {
  /** Accessibility: block on any | critical/serious | never */
  accessibility: 'any' | 'critical-serious' | 'warn-only';
  /** Console errors: block on any | errors | log-only */
  consoleErrors: 'any' | 'errors' | 'log-only';
  /** Visual diff percentage that blocks */
  visualDiffPercent: number;
  /** CLS score that blocks */
  maxCLS: number;
  /** Chaos recovery rate required */
  chaosRecoveryRate: number;
  /** Minimum LLM UX score */
  minUXScore: number;
}

/**
 * Critical path patterns
 */
const CRITICAL_PATHS = [
  '/checkout',
  '/auth',
  '/payment',
  '/onboarding',
  '/signup',
  '/login',
  '/register',
  '/billing',
  '/subscription'
];

/**
 * Admin/internal path patterns
 */
const ADMIN_PATHS = [
  '/admin',
  '/internal',
  '/settings/admin',
  '/debug',
  '/dev'
];

/**
 * Thresholds for each stringency level
 */
const THRESHOLDS: Record<StringencyLevel, StringencyThresholds> = {
  strict: {
    accessibility: 'any',
    consoleErrors: 'any',
    visualDiffPercent: 1,
    maxCLS: 0.05,
    chaosRecoveryRate: 100,
    minUXScore: 70
  },
  standard: {
    accessibility: 'critical-serious',
    consoleErrors: 'errors',
    visualDiffPercent: 5,
    maxCLS: 0.1,
    chaosRecoveryRate: 90,
    minUXScore: 50
  },
  relaxed: {
    accessibility: 'warn-only',
    consoleErrors: 'log-only',
    visualDiffPercent: 20,
    maxCLS: 0.25,
    chaosRecoveryRate: 0,
    minUXScore: 0
  }
};

/**
 * Get Supabase client (lazy initialization)
 */
function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

/**
 * Check if a route matches any pattern
 */
function matchesPattern(route: string, patterns: string[]): boolean {
  return patterns.some(p => route.startsWith(p));
}

/**
 * Gather context signals for stringency determination
 */
async function gatherSignals(
  route: string,
  storyId?: string
): Promise<StringencySignals> {
  const supabase = getSupabaseClient();

  // Default signals
  const signals: StringencySignals = {
    isCriticalPath: matchesPattern(route, CRITICAL_PATHS),
    storyPriority: null,
    recentIncidents: 0,
    prLinesChanged: parseInt(process.env.PR_LINES_CHANGED || '0', 10),
    historicalFailures: 0,
    isFeatureBranch: (process.env.GITHUB_HEAD_REF || '').includes('feat/'),
    coveragePercent: 80, // Default assumption
    isAdminRoute: matchesPattern(route, ADMIN_PATHS)
  };

  if (!supabase) {
    return signals;
  }

  // Check story priority if linked
  if (storyId) {
    try {
      const { data } = await supabase
        .from('user_stories')
        .select('priority')
        .eq('id', storyId)
        .single();
      signals.storyPriority = data?.priority ?? null;
    } catch {
      // Story lookup failed, continue with null
    }
  }

  // Check recent failures for this route
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('test_results')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .ilike('test_name', `%${route}%`)
      .gte('created_at', thirtyDaysAgo);
    signals.recentIncidents = count ?? 0;
  } catch {
    // Query failed, continue with 0
  }

  return signals;
}

/**
 * Determine stringency level from signals
 */
function determineLevel(signals: StringencySignals): { level: StringencyLevel; reason: string } {
  // Critical path → always strict
  if (signals.isCriticalPath) {
    return { level: 'strict', reason: 'Route is a critical path (checkout, auth, payment)' };
  }

  // High-priority story → strict
  if (signals.storyPriority !== null && signals.storyPriority <= 1) {
    return { level: 'strict', reason: `Linked to P${signals.storyPriority} priority story` };
  }

  // Recent incidents → strict
  if (signals.recentIncidents > 0) {
    return { level: 'strict', reason: `${signals.recentIncidents} recent failures on this route` };
  }

  // Large PR → strict (more risk)
  if (signals.prLinesChanged > 500) {
    return { level: 'strict', reason: `Large PR (${signals.prLinesChanged} lines changed)` };
  }

  // Historical failures → strict
  if (signals.historicalFailures > 3) {
    return { level: 'strict', reason: `Historically unstable (${signals.historicalFailures} past failures)` };
  }

  // Low coverage → strict (compensate)
  if (signals.coveragePercent < 50) {
    return { level: 'strict', reason: `Low test coverage (${signals.coveragePercent}%)` };
  }

  // Admin routes → standard
  if (signals.isAdminRoute) {
    return { level: 'standard', reason: 'Admin/internal route' };
  }

  // New feature branch with small changes → relaxed
  if (signals.isFeatureBranch && signals.prLinesChanged < 100) {
    return { level: 'relaxed', reason: 'Small feature branch (exploratory phase)' };
  }

  // Default to standard
  return { level: 'standard', reason: 'Default stringency' };
}

/**
 * Extended test fixtures including stringency resolver
 */
type StringencyFixtures = {
  stringency: StringencyResolverFixture;
};

/**
 * Extended test with stringency resolver fixture
 */
export const test = base.extend<StringencyFixtures>({
  stringency: [async ({ }, use, testInfo) => {
    let currentLevel: StringencyLevel = 'standard';
    let wasOverridden = false;
    let lastResolution: StringencyResolution | null = null;

    // Check for annotation-based override
    const annotations = testInfo.annotations;
    if (annotations.some(a => a.type === 'strict')) {
      currentLevel = 'strict';
      wasOverridden = true;
    } else if (annotations.some(a => a.type === 'relaxed')) {
      currentLevel = 'relaxed';
      wasOverridden = true;
    }

    const fixture: StringencyResolverFixture = {
      resolve: async (route: string, storyId?: string): Promise<StringencyLevel> => {
        if (wasOverridden) {
          return currentLevel;
        }

        const signals = await gatherSignals(route, storyId);
        const { level } = determineLevel(signals);
        currentLevel = level;
        return level;
      },

      resolveWithDetails: async (
        route: string,
        storyId?: string
      ): Promise<StringencyResolution> => {
        const signals = await gatherSignals(route, storyId);

        if (wasOverridden) {
          lastResolution = {
            level: currentLevel,
            signals,
            reason: 'Manually overridden via annotation',
            overridden: true
          };
        } else {
          const { level, reason } = determineLevel(signals);
          currentLevel = level;
          lastResolution = { level, signals, reason, overridden: false };
        }

        return lastResolution;
      },

      isCriticalPath: (route: string): boolean => {
        return matchesPattern(route, CRITICAL_PATHS);
      },

      getThresholds: (level: StringencyLevel): StringencyThresholds => {
        return { ...THRESHOLDS[level] };
      },

      override: (level: StringencyLevel): void => {
        currentLevel = level;
        wasOverridden = true;
      },

      current: (): StringencyLevel => currentLevel
    };

    await use(fixture);

    // After test: attach stringency resolution to artifacts
    if (lastResolution) {
      await testInfo.attach('stringency-resolution.json', {
        body: JSON.stringify({
          testTitle: testInfo.title,
          testFile: testInfo.file,
          resolution: lastResolution,
          thresholdsApplied: THRESHOLDS[lastResolution.level],
          capturedAt: new Date().toISOString()
        }, null, 2),
        contentType: 'application/json'
      });
    }
  }, { auto: false }]
});

// Re-export expect from Playwright
export { expect };

/**
 * Get stringency level from environment or default
 */
export function getDefaultStringency(): StringencyLevel {
  const envValue = process.env.E2E_STRINGENCY;
  if (envValue === 'strict' || envValue === 'standard' || envValue === 'relaxed') {
    return envValue;
  }
  return 'standard';
}

/**
 * Assert check passes for given stringency
 */
export function shouldBlockForStringency(
  checkType: keyof StringencyThresholds,
  value: number,
  level: StringencyLevel
): boolean {
  const thresholds = THRESHOLDS[level];

  switch (checkType) {
    case 'accessibility':
      // This is a string type, handle separately
      return false;

    case 'consoleErrors':
      // This is a string type, handle separately
      return false;

    case 'visualDiffPercent':
      return value > thresholds.visualDiffPercent;

    case 'maxCLS':
      return value > thresholds.maxCLS;

    case 'chaosRecoveryRate':
      return value < thresholds.chaosRecoveryRate;

    case 'minUXScore':
      return value < thresholds.minUXScore;

    default:
      return false;
  }
}

/**
 * Get human-readable stringency description
 */
export function describeStringency(level: StringencyLevel): string {
  switch (level) {
    case 'strict':
      return 'Strict: Block on any violation';
    case 'standard':
      return 'Standard: Block on critical/serious issues';
    case 'relaxed':
      return 'Relaxed: Warn only, collect data';
  }
}

/**
 * Export thresholds for external use
 */
export { THRESHOLDS, CRITICAL_PATHS, ADMIN_PATHS };
export type { StringencyLevel, StringencyThresholds, StringencySignals, StringencyResolution };
