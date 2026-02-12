#!/usr/bin/env node

/**
 * Playwright Design Analyzer - Main Orchestrator
 * Coordinates all analysis modules for UI/UX evaluation
 *
 * REFACTORED: This module orchestrates the domain modules.
 * See playwright-analyzer/ for domain architecture.
 *
 * @module playwright-analyzer
 */

import { chromium } from 'playwright';

// Domain imports
import { BREAKPOINTS, WCAG_CRITERIA, _OUTPUT_FILES } from './config.js';
import {
  analyzeProcessFlow,
  analyzeConsistency,
  testAccessibility,
  testResponsive,
  measurePerformance,
  testInteractions
} from './analyzers.js';
import { generateRecommendations } from './recommendations.js';
import { saveReport, _generateHTMLReport, _generateMarkdownSummary } from './report-generators.js';

/**
 * PlaywrightDesignAnalyzer class
 * Main analyzer orchestrating all analysis domains
 */
export class PlaywrightDesignAnalyzer {
  constructor() {
    this.breakpoints = BREAKPOINTS;
    this.wcagCriteria = WCAG_CRITERIA;
  }

  /**
   * Run complete UI/UX analysis
   * @param {string} url - Target URL to analyze
   * @returns {Promise<Object>} Complete analysis results
   */
  async analyze(url = 'http://localhost:3000/directive-lab') {
    console.log('🎨 Playwright Design Analyzer - Starting');
    console.log(`📍 Target: ${url}\n`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    const results = {
      timestamp: new Date().toISOString(),
      url,
      consistency: {},
      endToEndFlow: {},
      accessibility: {},
      responsive: {},
      performance: {},
      interactions: {},
      recommendations: []
    };

    try {
      // 1. End-to-End Process Flow Analysis
      console.log('🔄 Analyzing end-to-end process flow...');
      results.endToEndFlow = await analyzeProcessFlow(browser, url);

      // 2. Visual Consistency Analysis
      console.log('🎯 Checking visual consistency...');
      results.consistency = await analyzeConsistency(browser, url);

      // 3. Accessibility Testing
      console.log('♿ Running accessibility tests...');
      results.accessibility = await testAccessibility(browser, url);

      // 4. Responsive Design Testing
      console.log('📱 Testing responsive behavior...');
      results.responsive = await testResponsive(browser, url);

      // 5. Performance Metrics
      console.log('⚡ Measuring performance...');
      results.performance = await measurePerformance(browser, url);

      // 6. Interactive Elements Testing
      console.log('👆 Testing interactive elements...');
      results.interactions = await testInteractions(browser, url);

      // Generate recommendations
      results.recommendations = generateRecommendations(results);

      // Save report
      await saveReport(results);

    } finally {
      await browser.close();
    }

    return results;
  }
}

// CLI execution
async function main() {
  const analyzer = new PlaywrightDesignAnalyzer();
  try {
    const results = await analyzer.analyze();
    console.log('\n✅ Analysis complete!');
    console.log('\n📋 Top Recommendations:');

    results.recommendations.slice(0, 3).forEach((rec, i) => {
      console.log(`\n${i + 1}. [${rec.priority}] ${rec.title}`);
      console.log(`   ${rec.description}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Re-exports for external use
export { BREAKPOINTS, WCAG_CRITERIA, OUTPUT_FILES } from './config.js';
export {
  analyzeProcessFlow,
  analyzeConsistency,
  testAccessibility,
  testResponsive,
  measurePerformance,
  testInteractions
} from './analyzers.js';
export { generateRecommendations } from './recommendations.js';
export { saveReport, generateHTMLReport, generateMarkdownSummary } from './report-generators.js';

export default { PlaywrightDesignAnalyzer };
