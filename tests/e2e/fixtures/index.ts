/**
 * LEO v4.4 Human-Like E2E Testing Fixtures
 *
 * Unified export for all testing fixtures
 *
 * Usage:
 * ```typescript
 * import { mergeTests } from '@playwright/test';
 * import { test as a11yTest } from './fixtures/accessibility';
 * import { test as chaosTest } from './fixtures/chaos-saboteur';
 *
 * const test = mergeTests(a11yTest, chaosTest);
 * ```
 */

// Accessibility Testing (axe-core)
export {
  test as accessibilityTest,
  expect as a11yExpect,
  checkAccessibility,
  assertNoBlockingA11yViolations,
  WCAG_TAGS
} from './accessibility';

// Keyboard Navigation Oracle
export {
  test as keyboardTest,
  assertTabOrder,
  assertNoFocusTrap
} from './keyboard-oracle';

// Console Capture (auto-enabled)
export {
  test as consoleTest,
  assertNoJSErrors,
  assertNoConsoleErrors,
  assertNoWarnings,
  assertCleanConsole,
  getConsoleSummary,
  getConsoleErrorCount
} from './console-capture';

// Chaos/Resilience Testing
export {
  test as chaosTest,
  assertRecoveryRate,
  assertNoDuplicateSubmit
} from './chaos-saboteur';

// Visual Oracle (CLS)
export {
  test as visualTest,
  assertAcceptableCLS,
  assertValidHeadingHierarchy,
  assertViewportStable
} from './visual-oracle';

// LLM UX Oracle (GPT-5.2)
export {
  test as uxTest,
  assertMinimumUXScore,
  assertNoRegression,
  assertNoHighRiskDropOff,
  getEvaluationSummary
} from './llm-ux-oracle';

// Stringency Resolver
export {
  test as stringencyTest,
  getDefaultStringency,
  shouldBlockForStringency,
  describeStringency,
  THRESHOLDS as STRINGENCY_THRESHOLDS,
  CRITICAL_PATHS,
  ADMIN_PATHS
} from './stringency-resolver';

// Re-export types
export type { StringencyLevel, StringencyThresholds, StringencySignals } from './stringency-resolver';
