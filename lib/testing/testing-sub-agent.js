#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Automated Testing Sub-Agent
 * Fully automated visual inspection and test execution system
 * Activates automatically when LEO Protocol testing criteria are met
 */

import { chromium } from 'playwright';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import PlaywrightBridge from './playwright-bridge';

class AutomatedTestingSubAgent {
  constructor(config = {}) {
    this.config = {
      autoRun: true,
      headless: config.headless !== false, // Default headless for automation
      timeout: config.timeout || 30000,
      baseURL: config.baseURL || 'http://localhost:8080', // SD-ARCH-EHG-007: EHG unified frontend
      outputDir: config.outputDir || 'test-results/automated',
      screenshotDir: 'test-results/automated/screenshots',
      reportDir: 'test-results/automated/reports',
      ...config
    };
    
    this.browser = null;
    this.page = null;
    this.bridge = new PlaywrightBridge();
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      screenshots: [],
      issues: [],
      failureAnalysis: [],
      fixRecommendations: []
    };
    
    // Activation criteria per LEO Protocol v4.1
    this.activationTriggers = {
      coverageThreshold: 80,
      e2eRequired: true,
      complexTestScenarios: 10,
      visualInspection: true
    };
  }

  /**
   * Auto-activate based on LEO Protocol criteria
   */
  async checkActivationCriteria() {
    console.log('🔍 LEO Protocol v4.1 - Checking Testing Sub-Agent activation criteria...');
    
    const criteria = {
      coverageRequired: await this.checkCoverageRequirement(),
      e2eTestingMentioned: await this.checkE2ERequirement(),
      complexScenarios: await this.checkComplexScenarios(),
      visualTestingNeeded: true // Always true for this implementation
    };
    
    const shouldActivate = criteria.coverageRequired || 
                          criteria.e2eTestingMentioned || 
                          criteria.complexScenarios || 
                          criteria.visualTestingNeeded;
    
    if (shouldActivate) {
      console.log('✅ Testing Sub-Agent activation criteria met');
      console.log('📋 Criteria:', JSON.stringify(criteria, null, 2));
      return true;
    }
    
    console.log('❌ Testing Sub-Agent activation criteria not met');
    return false;
  }

  /**
   * Fully automated test execution
   */
  async executeAutomatedTesting() {
    console.log('🚀 Starting fully automated visual inspection...');
    
    try {
      // 1. Setup
      await this.setup();
      
      // 2. Auto-discovery of test targets
      const targets = await this.discoverTestTargets();
      
      // 3. Execute all tests automatically
      for (const target of targets) {
        await this.executeTargetTests(target);
      }
      
      // 4. Generate comprehensive report
      await this.generateAutomatedReport();
      
      // 5. Auto-cleanup
      await this.cleanup();
      
      console.log('✅ Automated testing completed successfully');
      return this.testResults;
      
    } catch (error) {
      console.error('❌ Automated testing failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize browser and setup
   */
  async setup() {
    console.log('🔧 Setting up automated testing environment...');
    
    // Create output directories
    await this.ensureDirectories();
    
    // Launch browser
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    // Create page with standard configuration
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    // Setup auto-screenshot on failures
    this.page.on('pageerror', async (error) => {
      await this.captureErrorState('pageerror', error.message);
    });
    
    console.log('✅ Environment ready');
  }

  /**
   * Auto-discover what needs to be tested
   */
  async discoverTestTargets() {
    console.log('🔍 Auto-discovering test targets...');
    
    const targets = [
      {
        name: 'Dashboard Overview',
        url: '/',
        type: 'page',
        critical: true
      },
      {
        name: 'Strategic Directives',
        url: '/',
        type: 'component',
        selectors: ['.strategic-directives', '[data-testid*="sd"]', '.directive'],
        critical: true
      },
      {
        name: 'Navigation',
        url: '/',
        type: 'component',
        selectors: ['nav', '.navigation', '.navbar', '.menu'],
        critical: false
      },
      {
        name: 'Progress Indicators',
        url: '/',
        type: 'component',
        selectors: ['.progress', '.progress-bar', '[data-testid*="progress"]'],
        critical: false
      }
    ];
    
    console.log(`📋 Found ${targets.length} test targets`);
    return targets;
  }

  /**
   * Execute tests for a specific target
   */
  async executeTargetTests(target) {
    console.log(`🎯 Testing: ${target.name}`);
    
    try {
      // Navigate to target
      await this.page.goto(`${this.config.baseURL}${target.url}`, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });
      
      // Wait for page to stabilize
      await this.page.waitForTimeout(2000);
      
      // Execute different test types based on target
      switch (target.type) {
        case 'page':
          await this.testFullPage(target);
          break;
        case 'component':
          await this.testComponent(target);
          break;
        default:
          await this.testGeneric(target);
      }
      
      console.log(`✅ ${target.name} testing completed`);
      this.testResults.passed++;
      
    } catch (error) {
      console.error(`❌ ${target.name} testing failed:`, error.message);
      this.testResults.failed++;
      
      // Enhanced failure analysis
      const failureAnalysis = await this.analyzeFailure(error, target);
      const fixRecommendation = await this.generateFixRecommendation(failureAnalysis, target);
      
      this.testResults.issues.push({
        target: target.name,
        error: error.message,
        timestamp: new Date().toISOString(),
        analysis: failureAnalysis,
        recommendation: fixRecommendation
      });
      
      this.testResults.failureAnalysis.push(failureAnalysis);
      this.testResults.fixRecommendations.push(fixRecommendation);
      
      await this.captureErrorState(target.name, error.message);
    }
  }

  /**
   * Test full page functionality
   */
  async testFullPage(target) {
    const pageName = target.name.toLowerCase().replace(/\s+/g, '-');
    
    // 1. Basic page load verification
    await this.page.waitForLoadState('networkidle');
    
    // 2. Full page screenshot
    const fullScreenshot = `${pageName}-full-page.png`;
    await this.page.screenshot({
      path: path.join(this.config.screenshotDir, fullScreenshot),
      fullPage: true
    });
    this.testResults.screenshots.push(fullScreenshot);
    
    // 3. Responsive testing - automatically test multiple viewports
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 }
    ];
    
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await this.page.waitForTimeout(1000); // Allow layout to adjust
      
      const responsiveScreenshot = `${pageName}-${viewport.name}.png`;
      await this.page.screenshot({
        path: path.join(this.config.screenshotDir, responsiveScreenshot),
        fullPage: true
      });
      this.testResults.screenshots.push(responsiveScreenshot);
    }
    
    // Reset to standard viewport
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    // 4. Performance check
    await this.checkPagePerformance(target);
    
    // 5. Accessibility quick scan
    await this.checkBasicAccessibility(target);
  }

  /**
   * Test specific components
   */
  async testComponent(target) {
    const componentName = target.name.toLowerCase().replace(/\s+/g, '-');
    
    // Try to find component using provided selectors
    let component = null;
    
    for (const selector of target.selectors || []) {
      try {
        const elements = await this.page.locator(selector);
        const count = await elements.count();
        
        if (count > 0) {
          component = elements.first();
          console.log(`📍 Found ${target.name} using selector: ${selector}`);
          break;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    
    if (component) {
      // Component found - capture it
      const componentScreenshot = `${componentName}-component.png`;
      await component.screenshot({
        path: path.join(this.config.screenshotDir, componentScreenshot)
      });
      this.testResults.screenshots.push(componentScreenshot);
      
      // Test component interactivity if applicable
      await this.testComponentInteractivity(component, target);
      
    } else {
      // Component not found - capture evidence
      const notFoundScreenshot = `${componentName}-not-found.png`;
      await this.page.screenshot({
        path: path.join(this.config.screenshotDir, notFoundScreenshot),
        fullPage: true
      });
      
      this.testResults.warnings++;
      this.testResults.issues.push({
        target: target.name,
        issue: 'Component not found with provided selectors',
        selectors: target.selectors,
        type: 'warning'
      });
    }
  }

  /**
   * Test component interactivity
   */
  async testComponentInteractivity(component, target) {
    const componentName = target.name.toLowerCase().replace(/\s+/g, '-');
    
    try {
      // Check if component is interactive
      const isClickable = await component.evaluate(el => {
        return el.tagName === 'BUTTON' || 
               el.tagName === 'A' || 
               el.onclick !== null ||
               el.style.cursor === 'pointer' ||
               el.getAttribute('role') === 'button';
      });
      
      if (isClickable) {
        // Test hover state
        await component.hover();
        await this.page.waitForTimeout(300);
        
        const hoverScreenshot = `${componentName}-hover-state.png`;
        await component.screenshot({
          path: path.join(this.config.screenshotDir, hoverScreenshot)
        });
        this.testResults.screenshots.push(hoverScreenshot);
        
        // Test focus state
        await component.focus();
        await this.page.waitForTimeout(300);
        
        const focusScreenshot = `${componentName}-focus-state.png`;
        await component.screenshot({
          path: path.join(this.config.screenshotDir, focusScreenshot)
        });
        this.testResults.screenshots.push(focusScreenshot);
      }
    } catch (error) {
      // Non-critical - log but don't fail
      console.log(`ℹ️  Could not test interactivity for ${target.name}: ${error.message}`);
    }
  }

  /**
   * Check page performance automatically
   */
  async checkPagePerformance(target) {
    try {
      // Get page metrics
      const metrics = await this.page.evaluate(() => {
        const performance = window.performance;
        const timing = performance.timing;
        
        return {
          loadTime: timing.loadEventEnd - timing.navigationStart,
          domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
          firstPaint: performance.getEntriesByType('paint')[0]?.startTime || null,
          resourceCount: performance.getEntriesByType('resource').length
        };
      });
      
      // Check against LEO Protocol performance standards
      const performanceIssues = [];
      
      if (metrics.loadTime > 3000) {
        performanceIssues.push(`Page load time ${metrics.loadTime}ms exceeds 3s threshold`);
      }
      
      if (metrics.domReady > 2000) {
        performanceIssues.push(`DOM ready time ${metrics.domReady}ms exceeds 2s threshold`);
      }
      
      if (performanceIssues.length > 0) {
        this.testResults.issues.push({
          target: target.name,
          type: 'performance',
          issues: performanceIssues,
          metrics
        });
      }
      
      console.log(`⚡ Performance check completed for ${target.name}`);
      
    } catch (error) {
      console.log(`⚠️  Performance check failed for ${target.name}: ${error.message}`);
    }
  }

  /**
   * Basic accessibility checks
   */
  async checkBasicAccessibility(target) {
    try {
      const accessibilityIssues = await this.page.evaluate(() => {
        const issues = [];
        
        // Check for missing alt text on images
        const images = document.querySelectorAll('img');
        images.forEach((img, index) => {
          if (!img.alt && !img.getAttribute('aria-label')) {
            issues.push(`Image ${index + 1} missing alt text`);
          }
        });
        
        // Check for buttons without accessible names
        const buttons = document.querySelectorAll('button');
        buttons.forEach((btn, index) => {
          if (!btn.textContent.trim() && 
              !btn.getAttribute('aria-label') && 
              !btn.getAttribute('aria-labelledby')) {
            issues.push(`Button ${index + 1} has no accessible name`);
          }
        });
        
        // Check for form inputs without labels
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
        inputs.forEach((input, index) => {
          const hasLabel = input.labels?.length > 0 || 
                          input.getAttribute('aria-label') || 
                          input.getAttribute('aria-labelledby');
          if (!hasLabel) {
            issues.push(`Input ${index + 1} has no associated label`);
          }
        });
        
        return issues;
      });
      
      if (accessibilityIssues.length > 0) {
        this.testResults.issues.push({
          target: target.name,
          type: 'accessibility',
          issues: accessibilityIssues
        });
      }
      
      console.log(`♿ Accessibility check completed for ${target.name}`);
      
    } catch (error) {
      console.log(`⚠️  Accessibility check failed for ${target.name}: ${error.message}`);
    }
  }

  /**
   * Capture error state for debugging
   */
  async captureErrorState(context, errorMessage) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const errorScreenshot = `error-${context}-${timestamp}.png`;
      
      await this.page.screenshot({
        path: path.join(this.config.screenshotDir, errorScreenshot),
        fullPage: true
      });
      
      this.testResults.screenshots.push(errorScreenshot);
      
      console.log(`📸 Error state captured: ${errorScreenshot}`);
    } catch (error) {
      console.log('⚠️  Could not capture error state:', error.message);
    }
  }

  /**
   * Generate comprehensive automated report
   */
  async generateAutomatedReport() {
    console.log('📊 Generating automated test report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      protocol: 'LEO v4.1',
      testType: 'Automated Visual Inspection',
      summary: {
        totalTests: this.testResults.passed + this.testResults.failed,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        warnings: this.testResults.warnings,
        successRate: this.testResults.passed / (this.testResults.passed + this.testResults.failed) * 100
      },
      screenshots: this.testResults.screenshots,
      issues: this.testResults.issues,
      recommendations: this.generateRecommendations()
    };
    
    // Save JSON report
    const reportPath = path.join(this.config.reportDir, 'automated-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Generate HTML report
    const htmlReport = this.generateHTMLReport(report);
    const htmlPath = path.join(this.config.reportDir, 'automated-test-report.html');
    await fs.writeFile(htmlPath, htmlReport);
    
    console.log('📋 Reports generated:');
    console.log(`   JSON: ${reportPath}`);
    console.log(`   HTML: ${htmlPath}`);
    
    // Output summary to console
    console.log('\n🎯 Test Summary:');
    console.log(`   Passed: ${report.summary.passed}`);
    console.log(`   Failed: ${report.summary.failed}`);
    console.log(`   Warnings: ${report.summary.warnings}`);
    console.log(`   Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`   Screenshots: ${report.screenshots.length}`);
  }

  /**
   * Generate automated recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Analyze issues and generate recommendations
    if (this.testResults.failed > 0) {
      recommendations.push({
        type: 'critical',
        message: `${this.testResults.failed} tests failed. Review error screenshots and fix critical issues before deployment.`
      });
    }
    
    const performanceIssues = this.testResults.issues.filter(issue => issue.type === 'performance');
    if (performanceIssues.length > 0) {
      recommendations.push({
        type: 'performance',
        message: 'Performance issues detected. Consider optimizing load times and resource usage.'
      });
    }
    
    const accessibilityIssues = this.testResults.issues.filter(issue => issue.type === 'accessibility');
    if (accessibilityIssues.length > 0) {
      recommendations.push({
        type: 'accessibility',
        message: 'Accessibility improvements needed. Add missing alt text, labels, and ARIA attributes.'
      });
    }
    
    if (this.testResults.warnings > 0) {
      recommendations.push({
        type: 'warning',
        message: `${this.testResults.warnings} warnings detected. Review component structure and selectors.`
      });
    }
    
    return recommendations;
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>LEO Protocol v4.1 - Automated Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .metric.success { border-left-color: #28a745; }
        .metric.danger { border-left-color: #dc3545; }
        .metric.warning { border-left-color: #ffc107; }
        .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
        .screenshot { background: white; padding: 10px; border-radius: 6px; border: 1px solid #dee2e6; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 LEO Protocol v4.1 - Automated Testing Report</h1>
        <p><strong>Generated:</strong> ${report.timestamp}</p>
        <p><strong>Test Type:</strong> ${report.testType}</p>
    </div>
    
    <h2>📊 Summary</h2>
    <div class="summary">
        <div class="metric success">
            <h3>Passed</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.passed}</p>
        </div>
        <div class="metric ${report.summary.failed > 0 ? 'danger' : 'success'}">
            <h3>Failed</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.failed}</p>
        </div>
        <div class="metric ${report.summary.warnings > 0 ? 'warning' : 'success'}">
            <h3>Warnings</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.warnings}</p>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <p style="font-size: 2em; margin: 0;">${report.summary.successRate.toFixed(1)}%</p>
        </div>
    </div>
    
    ${report.recommendations.length > 0 ? `
    <h2>💡 Recommendations</h2>
    <div class="recommendations">
        ${report.recommendations.map(rec => `<p><strong>${rec.type.toUpperCase()}:</strong> ${rec.message}</p>`).join('')}
    </div>
    ` : ''}
    
    <h2>📸 Screenshots (${report.screenshots.length})</h2>
    <p>Screenshots saved to: <code>${this.config.screenshotDir}</code></p>
    
    <h2>🔍 Issues (${report.issues.length})</h2>
    ${report.issues.length > 0 ? `
        ${report.issues.map(issue => `
            <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px;">
                <h4>${issue.target} - ${issue.type || 'Error'}</h4>
                <p>${issue.error || issue.issue || JSON.stringify(issue.issues)}</p>
            </div>
        `).join('')}
    ` : '<p>No issues detected! ✅</p>'}
    
    <footer style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 6px;">
        <p><small>Generated by LEO Protocol v4.1 Automated Testing Sub-Agent</small></p>
    </footer>
</body>
</html>`;
  }

  /**
   * Check coverage requirement
   */
  async checkCoverageRequirement() {
    // Check if coverage >80% is mentioned in PRD or requirements
    try {
      const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
      const pkg = JSON.parse(packageJson);
      
      // Check if test:coverage script exists
      return pkg.scripts && pkg.scripts['test:coverage'];
    } catch {
      return false;
    }
  }

  /**
   * Check E2E requirement
   */
  async checkE2ERequirement() {
    // Check if E2E testing is mentioned
    try {
      const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
      const content = packageJson.toLowerCase();
      
      return content.includes('e2e') || content.includes('playwright') || content.includes('cypress');
    } catch {
      return false;
    }
  }

  /**
   * Check complex scenarios
   */
  async checkComplexScenarios() {
    // Check if there are >10 test files or complex test scenarios
    try {
      const testDir = path.join(process.cwd(), 'tests');
      const files = await fs.readdir(testDir, { recursive: true });
      return files.filter(file => file.endsWith('.spec.js') || file.endsWith('.test.js')).length >= 10;
    } catch {
      return false;
    }
  }

  /**
   * Ensure output directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.config.outputDir,
      this.config.screenshotDir,
      this.config.reportDir
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Analyze failure and determine root cause
   */
  async analyzeFailure(error, target) {
    console.log(`🔬 Analyzing failure for ${target.name}...`);
    
    const analysis = {
      errorType: this.classifyErrorType(error),
      rootCause: null,
      affectedComponent: target.name,
      codeLocation: null,
      domState: null,
      consoleErrors: [],
      networkFailures: [],
      confidence: 0
    };
    
    try {
      // Capture current DOM state if page is available
      if (this.page) {
        analysis.domState = await this.page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hasErrors: document.querySelectorAll('.error, .alert-danger, [data-error]').length > 0,
            missingElements: []
          };
        });
        
        // Check for missing expected elements
        if (target.selectors) {
          for (const selector of target.selectors) {
            try {
              const count = await this.page.locator(selector).count();
              if (count === 0) {
                analysis.domState.missingElements.push(selector);
              }
            } catch (e) {
              // Selector itself might be invalid
              analysis.domState.missingElements.push(`${selector} (invalid selector)`);
            }
          }
        }
        
        // Capture console errors
        analysis.consoleErrors = await this.page.evaluate(() => {
          return window.__capturedErrors || [];
        });
      }
      
      // Determine root cause based on error type
      if (error.message.includes('Timeout')) {
        analysis.rootCause = 'Element or page took too long to load';
        analysis.confidence = 85;
      } else if (error.message.includes('not found') || error.message.includes('no element')) {
        analysis.rootCause = `Missing UI element: ${analysis.domState?.missingElements[0] || 'unknown'}`;
        analysis.confidence = 90;
      } else if (error.message.includes('click')) {
        analysis.rootCause = 'Element exists but is not clickable (may be hidden or disabled)';
        analysis.confidence = 75;
      } else if (error.message.includes('navigation')) {
        analysis.rootCause = 'Page navigation failed or redirected unexpectedly';
        analysis.confidence = 70;
      } else {
        analysis.rootCause = 'Unknown error - manual investigation required';
        analysis.confidence = 30;
      }
      
      // Try to identify code location (approximate)
      analysis.codeLocation = this.guessCodeLocation(target, analysis);
      
    } catch (analysisError) {
      console.warn(`⚠️ Could not complete full analysis: ${analysisError.message}`);
    }
    
    return analysis;
  }
  
  /**
   * Classify error type based on error message and context
   */
  classifyErrorType(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('not found') || message.includes('no element')) return 'ELEMENT_NOT_FOUND';
    if (message.includes('click')) return 'INTERACTION_FAILED';
    if (message.includes('navigation') || message.includes('navigate')) return 'NAVIGATION_ERROR';
    if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR';
    if (message.includes('script') || message.includes('javascript')) return 'SCRIPT_ERROR';
    
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * Generate actionable fix recommendation based on failure analysis
   */
  async generateFixRecommendation(analysis, target) {
    console.log(`💡 Generating fix recommendation for ${target.name}...`);
    
    const recommendation = {
      summary: '',
      steps: [],
      codeExample: null,
      confidence: analysis.confidence,
      priority: 'medium',
      estimatedEffort: 'low',
      validation: null
    };
    
    // Generate specific recommendations based on error type
    switch (analysis.errorType) {
      case 'ELEMENT_NOT_FOUND':
        if (analysis.domState?.missingElements?.length > 0) {
          recommendation.summary = `Add missing UI element: ${analysis.domState.missingElements[0]}`;
          recommendation.steps = [
            `Open the component file for ${target.name}`,
            `Add element with selector: ${analysis.domState.missingElements[0]}`,
            'Ensure element is visible and properly rendered',
            'Verify parent component includes this component'
          ];
          recommendation.codeExample = this.generateElementAdditionExample(analysis.domState.missingElements[0]);
          recommendation.priority = 'high';
        }
        break;
        
      case 'TIMEOUT':
        recommendation.summary = 'Optimize loading time or increase timeout threshold';
        recommendation.steps = [
          'Check if API calls are responding slowly',
          'Verify database queries are optimized',
          'Consider adding loading states',
          'Potentially increase timeout in test configuration'
        ];
        recommendation.priority = 'medium';
        recommendation.estimatedEffort = 'medium';
        break;
        
      case 'INTERACTION_FAILED':
        recommendation.summary = 'Fix element interactivity';
        recommendation.steps = [
          'Verify element is not disabled or hidden',
          'Check z-index and overlapping elements',
          'Ensure event handlers are properly attached',
          'Verify element is within viewport'
        ];
        recommendation.codeExample = this.generateInteractionFixExample();
        recommendation.priority = 'high';
        break;
        
      case 'NAVIGATION_ERROR':
        recommendation.summary = 'Fix routing or navigation logic';
        recommendation.steps = [
          'Verify route is properly defined',
          'Check authentication/authorization guards',
          'Ensure navigation logic is correct',
          'Verify base URL configuration'
        ];
        recommendation.priority = 'high';
        recommendation.estimatedEffort = 'medium';
        break;
        
      default:
        recommendation.summary = 'Manual investigation required';
        recommendation.steps = [
          'Review error logs for more details',
          'Check browser console for JavaScript errors',
          'Verify component renders correctly',
          'Test manually to reproduce issue'
        ];
        recommendation.priority = 'medium';
        recommendation.confidence = 30;
    }
    
    // Add validation command
    recommendation.validation = {
      command: `node lib/testing/testing-sub-agent.js --validate-fix ${target.name}`,
      description: 'Run this after applying fix to verify resolution'
    };
    
    // Estimate code location if available
    if (analysis.codeLocation) {
      recommendation.steps.unshift(`Check file: ${analysis.codeLocation}`);
    }
    
    return recommendation;
  }
  
  /**
   * Guess likely code location based on target and error
   */
  guessCodeLocation(target, analysis) {
    // Common patterns for locating component files
    const componentName = target.name.replace(/\s+/g, '');
    const possiblePaths = [
      `/src/components/${componentName}.jsx`,
      `/src/components/${componentName}.tsx`,
      `/src/components/${componentName}/index.jsx`,
      `/src/pages/${componentName}.jsx`,
      `/lib/dashboard/client/${componentName}.js`
    ];
    
    // Return most likely path based on error type
    if (analysis.errorType === 'ELEMENT_NOT_FOUND') {
      return possiblePaths[0]; // Component file most likely
    }
    
    return possiblePaths[0];
  }
  
  /**
   * Generate code example for adding missing element
   */
  generateElementAdditionExample(selector) {
    // Parse selector to understand what needs to be added
    let elementType = 'div';
    let className = '';
    let id = '';
    
    if (selector.startsWith('.')) {
      className = selector.substring(1);
    } else if (selector.startsWith('#')) {
      id = selector.substring(1);
    } else if (selector.includes('[data-testid')) {
      const match = selector.match(/data-testid.*?=.*?"(.*?)"/);
      if (match) id = match[1];
    }
    
    return {
      before: `<div>
  {/* Existing content */}
</div>`,
      after: `<div>
  {/* Existing content */}
  <${elementType}${className ? ` className="${className}"` : ''}${id ? ` id="${id}"` : ''}>
    {/* Add content here */}
  </${elementType}>
</div>`,
      description: `Add missing element with selector: ${selector}`
    };
  }
  
  /**
   * Generate code example for fixing interaction
   */
  generateInteractionFixExample() {
    return {
      before: `<button disabled={true} onClick={handleClick}>
  Submit
</button>`,
      after: `<button disabled={false} onClick={handleClick}>
  Submit
</button>`,
      description: 'Ensure element is not disabled and has proper event handler'
    };
  }
  
  /**
   * Validate a fix by re-running specific test
   */
  async validateFix(targetName, attempt = 1) {
    console.log(`🔄 Validating fix for ${targetName} (attempt ${attempt})...`);
    
    try {
      // Setup if not already
      if (!this.browser) {
        await this.setup();
      }
      
      // Find the specific target
      const targets = await this.discoverTestTargets();
      const target = targets.find(t => t.name === targetName);
      
      if (!target) {
        throw new Error(`Target ${targetName} not found`);
      }
      
      // Re-run test for this target
      await this.executeTargetTests(target);
      
      // Check if it passed this time
      const lastIssue = this.testResults.issues[this.testResults.issues.length - 1];
      
      if (!lastIssue || lastIssue.target !== targetName) {
        console.log('✅ Fix validated successfully!');
        return { success: true, attempt };
      } else if (attempt < 3) {
        console.log('❌ Fix incomplete, generating refined recommendation...');
        const refinedAnalysis = await this.analyzeFailure(new Error(lastIssue.error), target);
        const refinedRecommendation = await this.generateFixRecommendation(refinedAnalysis, target);
        
        return {
          success: false,
          attempt,
          refinedRecommendation
        };
      } else {
        console.log('❌ Fix validation failed after 3 attempts');
        return { success: false, attempt, finalFailure: true };
      }
      
    } catch (error) {
      console.error('💥 Validation error:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Auto-execution when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const agent = new AutomatedTestingSubAgent();
  
  // Check for validate-fix command
  if (args[0] === '--validate-fix' && args[1]) {
    agent.validateFix(args[1])
      .then(result => {
        if (result.success) {
          console.log('✅ Validation passed!');
          process.exit(0);
        } else {
          console.log('❌ Validation failed');
          if (result.refinedRecommendation) {
            console.log('\n📋 Refined Fix Recommendation:');
            console.log(JSON.stringify(result.refinedRecommendation, null, 2));
          }
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('💥 Validation error:', error);
        process.exit(1);
      });
  } else {
    // Normal execution
    agent.checkActivationCriteria()
      .then(shouldActivate => {
        if (shouldActivate) {
          return agent.executeAutomatedTesting();
        } else {
          console.log('🔒 Testing Sub-Agent not activated - criteria not met');
          process.exit(0);
        }
      })
      .then(results => {
        console.log('🎉 Automated testing completed successfully');
        
        // Output fix recommendations if there were failures
        if (results.failed > 0 && results.fixRecommendations.length > 0) {
          console.log('\n📋 Fix Recommendations:');
          console.log('='.repeat(50));
          for (const rec of results.fixRecommendations) {
            console.log(`\n🔧 ${rec.summary}`);
            console.log(`Priority: ${rec.priority} | Confidence: ${rec.confidence}%`);
            console.log('Steps:');
            rec.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
            if (rec.validation) {
              console.log(`\nValidation: ${rec.validation.command}`);
            }
          }
        }
        
        process.exit(results.failed > 0 ? 1 : 0);
      })
      .catch(error => {
        console.error('💥 Automated testing failed:', error);
        process.exit(1);
      });
  }
}

export default AutomatedTestingSubAgent;