/**
 * Testing Sub-Agent V2 - Intelligent Test Coverage Analyzer
 * Extends IntelligentBaseSubAgent for full integration with improvements
 * Analyzes test coverage, quality, and identifies missing tests
 *
 * REFACTORED: Modularized from 664 LOC to ~100 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, framework-detection, coverage-analyzer, file-discovery,
 *          quality-analyzer, e2e-checker, flaky-detector, performance-analyzer
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';

// Import from decomposed modules
import {
  THRESHOLDS,
  createTestHealthState,
  detectTestFramework,
  analyzeCoverage,
  findTestFiles,
  findUntestedFiles,
  analyzeTestQuality,
  checkE2ETests,
  detectFlakyTests,
  analyzeTestPerformance
} from './testing-agent/index.js';

class TestingSubAgentV2 extends IntelligentBaseSubAgent {
  constructor() {
    super('Testing', '🧪');
    this.thresholds = THRESHOLDS;
    this.testHealth = createTestHealthState();
  }

  /**
   * Intelligent testing analysis using codebase understanding
   */
  async intelligentAnalyze(basePath, _context) {
    console.log('🧪 Intelligent Testing Analysis Starting...');

    // Use inherited codebase knowledge for better test framework detection
    const framework = this.codebaseProfile.testing || await detectTestFramework(basePath);
    console.log(`   Test framework: ${framework || 'None detected'}`);
    console.log(`   Framework: ${this.codebaseProfile.framework}, Language: ${this.codebaseProfile.language}`);

    if (!framework) {
      this.addFinding({
        type: 'NO_TEST_FRAMEWORK',
        severity: 'critical',
        confidence: 1.0,
        file: 'package.json',
        description: 'No testing framework detected',
        recommendation: 'Install and configure Jest, Mocha, or another test framework',
        metadata: {
          suggestion: 'npm install --save-dev jest @types/jest'
        }
      });
      return;
    }

    // Helper to bind addFinding to this instance
    const addFinding = (finding) => this.addFinding(finding);

    // Run coverage analysis
    await analyzeCoverage(basePath, framework, this.testHealth, addFinding);

    // Find test files
    const testFiles = await findTestFiles(basePath);
    this.testHealth.totalTests = testFiles.length;

    // Analyze test quality
    for (const testFile of testFiles.slice(0, 20)) { // Limit for performance
      await analyzeTestQuality(
        testFile,
        basePath,
        this.thresholds.assertionDensity,
        this.testHealth,
        addFinding
      );
    }

    // Find untested files
    await findUntestedFiles(basePath, this.testHealth, this.thresholds.testRatio, addFinding);

    // Check for E2E tests
    await checkE2ETests(basePath, addFinding);

    // Check for flaky tests
    await detectFlakyTests(basePath, addFinding);

    // Analyze test performance
    await analyzeTestPerformance(basePath, framework, addFinding);

    console.log(`✓ Analyzed ${testFiles.length} test files`);
  }
}

export default TestingSubAgentV2;
