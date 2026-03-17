#!/usr/bin/env node

/**
 * Playwright-Enhanced Design UI Analyzer for Directive Lab
 * Real-time UI/UX analysis with visual testing and interaction validation
 *
 * REFACTORED: This file is now a thin wrapper around the domain modules.
 * See scripts/playwright-analyzer/ for the extracted domain architecture.
 *
 * Domains:
 * - config.js: Breakpoints, WCAG criteria, and constants
 * - analyzers.js: Core analysis methods
 * - recommendations.js: Recommendation generation
 * - report-generators.js: HTML, Markdown, JSON report output
 * - index.js: Main orchestrator with re-exports
 */

// Re-export everything from the domain modules for backward compatibility
export {
  PlaywrightDesignAnalyzer,
  BREAKPOINTS,
  WCAG_CRITERIA,
  OUTPUT_FILES,
  analyzeProcessFlow,
  analyzeConsistency,
  testAccessibility,
  testResponsive,
  measurePerformance,
  testInteractions,
  generateRecommendations,
  saveReport,
  generateHTMLReport,
  generateMarkdownSummary
} from './playwright-analyzer/index.js';

export { default } from './playwright-analyzer/index.js';

// CLI execution - delegate to the domain module
if (import.meta.url === `file://${process.argv[1]}`) {
  const { PlaywrightDesignAnalyzer } = await import('./playwright-analyzer/index.js');
  const analyzer = new PlaywrightDesignAnalyzer();
  analyzer.analyze().then(results => {
    console.log('\n✅ Analysis complete!');
    console.log('\n📋 Top Recommendations:');

    results.recommendations.slice(0, 3).forEach((rec, i) => {
      console.log(`\n${i + 1}. [${rec.priority}] ${rec.title}`);
      console.log(`   ${rec.description}`);
    });

    process.exit(0);
  }).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}
