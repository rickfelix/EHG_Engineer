/**
 * Testing Sub-Agent V2 - Intelligent Test Coverage Analyzer
 * Extends IntelligentBaseSubAgent for full integration with improvements
 * Analyzes test coverage, quality, and identifies missing tests
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

class TestingSubAgentV2 extends IntelligentBaseSubAgent {
  constructor() {
    super('Testing', '🧪');
    
    // Testing thresholds
    this.thresholds = {
      coverage: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      },
      testRatio: 0.5,  // Tests per source file
      assertionDensity: 2  // Assertions per test
    };
    
    // Test health metrics
    this.testHealth = {
      totalTests: 0,
      passingTests: 0,
      failingTests: 0,
      skippedTests: 0,
      coverage: null,
      missingTests: []
    };
  }

  /**
   * Intelligent testing analysis using codebase understanding
   */
  async intelligentAnalyze(basePath, context) {
    console.log('🧪 Intelligent Testing Analysis Starting...');
    
    // Use inherited codebase knowledge for better test framework detection
    const framework = this.codebaseProfile.testing || await this.detectTestFramework(basePath);
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
    
    // Run coverage analysis
    await this.analyzeCoverage(basePath, framework);
    
    // Find test files
    const testFiles = await this.findTestFiles(basePath);
    this.testHealth.totalTests = testFiles.length;
    
    // Analyze test quality
    for (const testFile of testFiles.slice(0, 20)) { // Limit for performance
      await this.analyzeTestQuality(testFile, basePath);
    }
    
    // Find untested files
    await this.findUntestedFiles(basePath);
    
    // Check for E2E tests
    await this.checkE2ETests(basePath);
    
    // Check for flaky tests
    await this.detectFlakyTests(basePath);
    
    // Analyze test performance
    await this.analyzeTestPerformance(basePath, framework);
    
    console.log(`✓ Analyzed ${testFiles.length} test files`);
  }

  /**
   * Detect test framework
   */
  async detectTestFramework(basePath) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if ('jest' in deps) return 'jest';
      if ('mocha' in deps) return 'mocha';
      if ('vitest' in deps) return 'vitest';
      if ('ava' in deps) return 'ava';
      if ('tape' in deps) return 'tape';
      if ('jasmine' in deps) return 'jasmine';
      if ('@playwright/test' in deps) return 'playwright';
      if ('cypress' in deps) return 'cypress';
      
      // Check scripts for test commands
      if (pkg.scripts?.test) {
        if (pkg.scripts.test.includes('jest')) return 'jest';
        if (pkg.scripts.test.includes('mocha')) return 'mocha';
        if (pkg.scripts.test.includes('vitest')) return 'vitest';
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Analyze test coverage - SAFE MODE (no automatic command execution)
   */
  async analyzeCoverage(basePath, framework) {
    try {
      // SAFETY: Only read existing coverage data, never execute commands
      let coverageData = null;
      
      // Check if coverage already exists
      const coverageFile = path.join(basePath, 'coverage', 'coverage-summary.json');
      try {
        coverageData = JSON.parse(await fs.readFile(coverageFile, 'utf8'));
        console.log('   Found existing coverage report');
      } catch {
        // Recommend running coverage instead of auto-executing
        console.log('   No existing coverage found - recommend running: npm test -- --coverage');
        this.addFinding({
          type: 'NO_COVERAGE_REPORT',
          severity: 'medium',
          confidence: 1.0,
          file: 'coverage',
          description: 'No coverage report found',
          recommendation: `Run coverage manually: npm test -- --coverage${framework === 'jest' ? ' --coverageReporters=json-summary' : ''}`,
          metadata: {
            framework,
            command: `npm test -- --coverage${framework === 'jest' ? ' --coverageReporters=json-summary' : ''}`
          }
        });
      }
      
      if (coverageData && coverageData.total) {
        this.testHealth.coverage = coverageData.total;
        
        // Check coverage thresholds
        for (const [metric, threshold] of Object.entries(this.thresholds.coverage)) {
          const value = coverageData.total[metric]?.pct || 0;
          
          if (value < threshold) {
            this.addFinding({
              type: 'LOW_TEST_COVERAGE',
              severity: value < threshold * 0.5 ? 'high' : 'medium',
              confidence: 1.0,
              file: 'coverage',
              description: `${metric} coverage is ${value.toFixed(1)}% (threshold: ${threshold}%)`,
              recommendation: `Increase ${metric} coverage to at least ${threshold}%`,
              metadata: {
                metric,
                current: value,
                threshold,
                gap: threshold - value
              }
            });
          }
        }
        
        console.log(`   Coverage: ${coverageData.total.lines.pct.toFixed(1)}% lines`);
      } else {
        this.addFinding({
          type: 'NO_COVERAGE_DATA',
          severity: 'high',
          confidence: 0.9,
          file: 'coverage',
          description: 'No test coverage data available',
          recommendation: 'Run tests with coverage enabled',
          metadata: {
            command: 'npm test -- --coverage'
          }
        });
      }
    } catch (error) {
      console.log('   Coverage analysis failed:', error.message);
    }
  }

  /**
   * Find test files
   */
  async findTestFiles(basePath) {
    const testFiles = [];
    const testPatterns = ['.test.', '.spec.', '__tests__', 'test/', 'tests/'];
    
    async function scan(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile()) {
            // Check if it's a test file
            const isTest = testPatterns.some(pattern => 
              entry.name.includes(pattern) || fullPath.includes(pattern)
            );
            
            if (isTest && (entry.name.endsWith('.js') || entry.name.endsWith('.ts') || 
                          entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx'))) {
              testFiles.push(fullPath);
            }
          }
        }
      } catch {
        // Directory access error
      }
    }
    
    await scan(basePath);
    return testFiles;
  }

  /**
   * Analyze test quality
   */
  async analyzeTestQuality(testFile, basePath) {
    try {
      const content = await fs.readFile(testFile, 'utf8');
      const relativePath = path.relative(basePath, testFile);
      
      // Count test cases
      const testMatches = content.match(/\b(it|test|describe)\s*\(/g) || [];
      const testCount = testMatches.length;
      
      // Count assertions
      const assertionPatterns = [
        /expect\s*\(/g,
        /assert\./g,
        /should\./g,
        /\.to\./g,
        /\.toBe/g,
        /\.toEqual/g
      ];
      
      let assertionCount = 0;
      for (const pattern of assertionPatterns) {
        const matches = content.match(pattern) || [];
        assertionCount += matches.length;
      }
      
      // Check assertion density
      if (testCount > 0) {
        const density = assertionCount / testCount;
        
        if (density < this.thresholds.assertionDensity) {
          this.addFinding({
            type: 'LOW_ASSERTION_DENSITY',
            severity: 'medium',
            confidence: 0.8,
            file: relativePath,
            description: `Only ${density.toFixed(1)} assertions per test (recommended: ${this.thresholds.assertionDensity}+)`,
            recommendation: 'Add more assertions to thoroughly test behavior',
            metadata: {
              tests: testCount,
              assertions: assertionCount,
              density: density.toFixed(1)
            }
          });
        }
      }
      
      // Check for skipped tests
      const skippedTests = content.match(/\.(skip|only)\s*\(/g) || [];
      if (skippedTests.length > 0) {
        this.addFinding({
          type: 'SKIPPED_TESTS',
          severity: 'medium',
          confidence: 1.0,
          file: relativePath,
          description: `${skippedTests.length} skipped or focused tests found`,
          recommendation: 'Remove .skip() and .only() modifiers',
          metadata: {
            count: skippedTests.length
          }
        });
        this.testHealth.skippedTests += skippedTests.length;
      }
      
      // Check for console.log in tests
      if (content.includes('console.log')) {
        this.addFinding({
          type: 'CONSOLE_LOG_IN_TESTS',
          severity: 'low',
          confidence: 0.9,
          file: relativePath,
          description: 'Console.log statements found in tests',
          recommendation: 'Remove console.log statements from tests',
          metadata: {
            count: (content.match(/console\.log/g) || []).length
          }
        });
      }
      
      // Check for async tests without proper handling
      const asyncTests = content.match(/async\s+(?:function|\(\))/g) || [];
      const awaitStatements = content.match(/await\s+/g) || [];
      
      if (asyncTests.length > 0 && awaitStatements.length === 0) {
        this.addFinding({
          type: 'ASYNC_WITHOUT_AWAIT',
          severity: 'high',
          confidence: 0.85,
          file: relativePath,
          description: 'Async test functions without await statements',
          recommendation: 'Add await statements or remove async keyword',
          metadata: {
            asyncTests: asyncTests.length
          }
        });
      }
      
      // Check for test timeouts
      if (content.includes('timeout(') || content.includes('setTimeout')) {
        const timeoutMatch = content.match(/timeout\((\d+)\)/);
        if (timeoutMatch) {
          const timeout = parseInt(timeoutMatch[1]);
          if (timeout > 5000) {
            this.addFinding({
              type: 'LONG_TEST_TIMEOUT',
              severity: 'medium',
              confidence: 0.9,
              file: relativePath,
              description: `Test timeout set to ${timeout}ms (too long)`,
              recommendation: 'Optimize test to run faster or mock slow operations',
              metadata: {
                timeout
              }
            });
          }
        }
      }
      
    } catch (error) {
      // File read error
    }
  }

  /**
   * Find untested files
   */
  async findUntestedFiles(basePath) {
    const sourceFiles = await this.findSourceFiles(basePath);
    const testFiles = await this.findTestFiles(basePath);
    
    // Create a map of tested files
    const testedFiles = new Set();
    
    for (const testFile of testFiles) {
      // Extract what file is being tested
      const testName = path.basename(testFile);
      const sourceFileName = testName
        .replace('.test.', '.')
        .replace('.spec.', '.')
        .replace('.test', '')
        .replace('.spec', '');
      
      testedFiles.add(sourceFileName);
      
      // Also check imports in test file
      try {
        const content = await fs.readFile(testFile, 'utf8');
        const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        imports.forEach(imp => {
          const file = imp.match(/from\s+['"]([^'"]+)['"]/)[1];
          if (file.startsWith('.')) {
            testedFiles.add(path.basename(file));
          }
        });
      } catch {
        // Ignore read errors
      }
    }
    
    // Find untested files
    const untestedFiles = [];
    for (const sourceFile of sourceFiles) {
      const fileName = path.basename(sourceFile);
      
      // Skip index files and configs
      if (fileName === 'index.js' || fileName === 'index.ts' || 
          fileName.includes('.config.') || fileName.includes('.d.ts')) {
        continue;
      }
      
      if (!testedFiles.has(fileName) && !testedFiles.has(fileName.replace(/\.(js|ts)x?$/, ''))) {
        untestedFiles.push(sourceFile);
        this.testHealth.missingTests.push(sourceFile);
      }
    }
    
    if (untestedFiles.length > 0) {
      // Report most critical untested files
      const criticalUntested = untestedFiles.filter(file => 
        file.includes('auth') || file.includes('payment') || 
        file.includes('api') || file.includes('service')
      );
      
      if (criticalUntested.length > 0) {
        this.addFinding({
          type: 'CRITICAL_FILES_UNTESTED',
          severity: 'critical',
          confidence: 0.95,
          file: 'tests',
          description: `${criticalUntested.length} critical files have no tests`,
          recommendation: 'Add tests for critical business logic files',
          metadata: {
            files: criticalUntested.slice(0, 5).map(f => path.relative(basePath, f))
          }
        });
      }
      
      // General untested files
      const testRatio = testFiles.length / sourceFiles.length;
      if (testRatio < this.thresholds.testRatio) {
        this.addFinding({
          type: 'LOW_TEST_RATIO',
          severity: 'high',
          confidence: 0.9,
          file: 'tests',
          description: `Only ${(testRatio * 100).toFixed(1)}% of source files have tests`,
          recommendation: 'Increase test coverage for source files',
          metadata: {
            sourceFiles: sourceFiles.length,
            testFiles: testFiles.length,
            untested: untestedFiles.length
          }
        });
      }
    }
  }

  /**
   * Find source files
   */
  async findSourceFiles(basePath) {
    const sourceFiles = [];
    const srcDirs = ['src', 'lib', 'app', 'components', 'services', 'utils'];
    
    for (const dir of srcDirs) {
      const fullPath = path.join(basePath, dir);
      
      async function scan(scanDir) {
        try {
          const entries = await fs.readdir(scanDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = path.join(scanDir, entry.name);
            
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
              continue;
            }
            
            if (entry.isDirectory()) {
              await scan(entryPath);
            } else if (entry.isFile() && 
                      (entry.name.endsWith('.js') || entry.name.endsWith('.ts') ||
                       entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) &&
                      !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
              sourceFiles.push(entryPath);
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }
      
      await scan(fullPath);
    }
    
    return sourceFiles;
  }

  /**
   * Check for E2E tests
   */
  async checkE2ETests(basePath) {
    const e2eDirs = ['e2e', 'integration', 'cypress', 'playwright'];
    let hasE2E = false;
    
    for (const dir of e2eDirs) {
      try {
        await fs.access(path.join(basePath, dir));
        hasE2E = true;
        
        // Count E2E tests
        const e2eFiles = await this.findTestFiles(path.join(basePath, dir));
        
        if (e2eFiles.length === 0) {
          this.addFinding({
            type: 'EMPTY_E2E_DIRECTORY',
            severity: 'medium',
            confidence: 0.9,
            file: dir,
            description: 'E2E test directory exists but contains no tests',
            recommendation: 'Add end-to-end tests for critical user flows',
            metadata: {
              directory: dir
            }
          });
        }
        
        break;
      } catch {
        // Directory doesn't exist
      }
    }
    
    // Check if project needs E2E but doesn't have it
    if (!hasE2E) {
      const needsE2E = await this.projectNeedsE2E(basePath);
      
      if (needsE2E) {
        this.addFinding({
          type: 'MISSING_E2E_TESTS',
          severity: 'high',
          confidence: 0.85,
          file: 'e2e',
          description: 'No end-to-end tests found',
          recommendation: 'Add E2E tests using Playwright or Cypress',
          metadata: {
            suggestion: 'Critical user journeys should be tested end-to-end'
          }
        });
      }
    }
  }

  /**
   * Detect if project needs E2E tests
   */
  async projectNeedsE2E(basePath) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Frontend frameworks that typically need E2E
      const frontendFrameworks = ['react', 'vue', 'angular', 'next', 'nuxt', 'svelte'];
      
      return frontendFrameworks.some(fw => fw in deps);
    } catch {
      return false;
    }
  }

  /**
   * Detect flaky tests
   */
  async detectFlakyTests(basePath) {
    // Look for common flaky test patterns
    const testFiles = await this.findTestFiles(basePath);
    
    for (const testFile of testFiles.slice(0, 10)) { // Check sample
      try {
        const content = await fs.readFile(testFile, 'utf8');
        const relativePath = path.relative(basePath, testFile);
        
        // Common flaky patterns
        const flakyPatterns = [
          { pattern: /Math\.random/g, issue: 'Uses Math.random without seeding' },
          { pattern: /Date\.now/g, issue: 'Uses Date.now without mocking' },
          { pattern: /setTimeout.*expect/g, issue: 'Assertion inside setTimeout' },
          { pattern: /\.wait\(\d+\)/g, issue: 'Uses arbitrary wait times' },
          { pattern: /real.*api|fetch.*http/gi, issue: 'Makes real HTTP requests' }
        ];
        
        for (const { pattern, issue } of flakyPatterns) {
          const matches = content.match(pattern);
          if (matches && matches.length > 0) {
            this.addFinding({
              type: 'FLAKY_TEST_PATTERN',
              severity: 'medium',
              confidence: 0.8,
              file: relativePath,
              description: `Potential flaky test: ${issue}`,
              recommendation: 'Fix test to be deterministic',
              metadata: {
                pattern: pattern.source,
                occurrences: matches.length
              }
            });
          }
        }
      } catch {
        // File read error
      }
    }
  }

  /**
   * Analyze test performance
   */
  async analyzeTestPerformance(basePath, framework) {
    // Check if tests are too slow
    try {
      // Look for test timing information
      const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
      
      if (pkg.scripts?.test) {
        console.log('   Checking test performance...');
        
        // SAFETY: Don't execute test commands automatically
        // Just analyze script complexity and provide recommendations
        const testScript = pkg.scripts.test;
        
        if (testScript.includes('--watchAll') || testScript.includes('--watch')) {
          this.addFinding({
            type: 'TEST_WATCH_MODE_IN_SCRIPT',
            severity: 'low',
            confidence: 0.8,
            file: 'package.json',
            description: 'Test script includes watch mode which may slow CI',
            recommendation: 'Use separate test:watch script for development',
            metadata: {
              testScript
            }
          });
        }
        
        // Check for performance recommendations
        this.addFinding({
          type: 'TEST_PERFORMANCE_RECOMMENDATION',
          severity: 'info',
          confidence: 1.0,
          file: 'tests',
          description: 'For performance analysis, run tests with timing: npm test -- --verbose',
          recommendation: 'Monitor test execution time and optimize slow tests',
          metadata: {
            framework,
            command: 'npm test -- --verbose'
          }
        });
      }
    } catch {
      // Package.json error
    }
  }
}

export default TestingSubAgentV2;