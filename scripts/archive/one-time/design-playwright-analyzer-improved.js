#!/usr/bin/env node

/**
 * Improved Playwright Design Analyzer
 * Fixes timeout issues and improves robustness for UI/UX analysis
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

class ImprovedPlaywrightDesignAnalyzer {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000; // Reduced to 10s
    this.retryAttempts = options.retryAttempts || 2;
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1280, height: 720 };
  }

  async analyze(url) {
    console.log('🎨 Improved Playwright Design Analyzer - Starting');
    console.log(`📍 Target: ${url}`);
    console.log(`⏱️  Timeout: ${this.timeout}ms, Retries: ${this.retryAttempts}`);

    let browser = null;
    const results = {
      timestamp: new Date().toISOString(),
      url,
      success: false,
      darkModeCompatibility: {},
      basicAnalysis: {},
      issues: [],
      recommendations: []
    };

    try {
      // Launch browser with improved settings
      browser = await chromium.launch({
        headless: this.headless,
        timeout: this.timeout,
        args: ['--disable-dev-shm-usage', '--no-sandbox']
      });

      // Test URL accessibility first
      const isAccessible = await this.testUrlAccessibility(browser, url);
      if (!isAccessible) {
        throw new Error(`URL ${url} is not accessible`);
      }

      // Run dark mode compatibility test
      results.darkModeCompatibility = await this.testDarkModeCompatibility(browser, url);
      
      // Run basic analysis
      results.basicAnalysis = await this.runBasicAnalysis(browser, url);
      
      // Generate recommendations
      results.recommendations = this.generateImprovements(results);
      
      results.success = true;
      console.log('✅ Analysis completed successfully');

    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      results.error = error.message;
      results.success = false;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    return results;
  }

  async testUrlAccessibility(browser, url) {
    let page = null;
    try {
      page = await browser.newPage();
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // More reliable than networkidle
        timeout: this.timeout 
      });
      
      // Check if page loaded successfully
      const title = await page.title();
      return title.length > 0;
    } catch (error) {
      console.log(`⚠️  URL accessibility test failed: ${error.message}`);
      return false;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  async testDarkModeCompatibility(browser, url) {
    const results = {
      lightModeClasses: 0,
      darkModeClasses: 0,
      missingDarkClasses: [],
      compatible: false,
      issues: []
    };

    let page = null;
    try {
      page = await browser.newPage();
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: this.timeout 
      });

      // Wait for React to render
      await page.waitForTimeout(1000);

      const darkModeAnalysis = await page.evaluate(() => {
        const analysis = {
          lightClasses: 0,
          darkClasses: 0,
          missingDark: [],
          elements: 0
        };

        // Find all elements with color/background classes
        const allElements = document.querySelectorAll('*');
        
        allElements.forEach(el => {
          const classes = el.className;
          if (typeof classes === 'string' && classes.length > 0) {
            analysis.elements++;
            
            // Count light mode classes
            const lightMatches = classes.match(/(bg-|text-|border-)(gray|blue|green|red|yellow)-/g);
            if (lightMatches) {
              analysis.lightClasses += lightMatches.length;
              
              // Check for corresponding dark classes
              lightMatches.forEach(lightClass => {
                const darkEquivalent = 'dark:' + lightClass;
                if (!classes.includes(darkEquivalent)) {
                  analysis.missingDark.push(lightClass);
                }
              });
            }
            
            // Count dark mode classes
            const darkMatches = classes.match(/dark:(bg-|text-|border-)/g);
            if (darkMatches) {
              analysis.darkClasses += darkMatches.length;
            }
          }
        });

        return analysis;
      });

      results.lightModeClasses = darkModeAnalysis.lightClasses;
      results.darkModeClasses = darkModeAnalysis.darkClasses;
      results.missingDarkClasses = [...new Set(darkModeAnalysis.missingDark)].slice(0, 10); // Top 10 missing

      // Calculate compatibility score
      const compatibilityRatio = results.darkModeClasses / Math.max(results.lightModeClasses, 1);
      results.compatible = compatibilityRatio > 0.8; // 80% coverage is good
      results.compatibilityScore = Math.round(compatibilityRatio * 100);

      if (!results.compatible) {
        results.issues.push({
          type: 'INSUFFICIENT_DARK_MODE_COVERAGE',
          severity: 'HIGH',
          message: `Only ${results.compatibilityScore}% of light mode classes have dark mode equivalents`
        });
      }

      // Test actual dark mode toggle if possible
      try {
        await page.evaluate(() => {
          document.documentElement.classList.add('dark');
        });
        
        await page.waitForTimeout(500);
        
        const darkModeStyles = await page.evaluate(() => {
          const body = document.body;
          const computedStyle = window.getComputedStyle(body);
          return {
            backgroundColor: computedStyle.backgroundColor,
            color: computedStyle.color
          };
        });
        
        results.darkModeActive = darkModeStyles;
      } catch (_error) {
        console.log('⚠️  Could not test dark mode toggle');
      }

    } catch (error) {
      console.error('❌ Dark mode test failed:', error.message);
      results.issues.push({
        type: 'DARK_MODE_TEST_FAILED',
        severity: 'HIGH',
        message: error.message
      });
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }

    return results;
  }

  async runBasicAnalysis(browser, url) {
    const results = {
      pageLoad: false,
      hasContent: false,
      responsive: false,
      accessibility: {},
      performance: {}
    };

    let page = null;
    try {
      page = await browser.newPage();
      
      // Set viewport for desktop analysis
      await page.setViewportSize(this.viewport);
      
      const startTime = Date.now();
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: this.timeout 
      });
      const loadTime = Date.now() - startTime;

      results.pageLoad = true;
      results.performance.loadTime = loadTime;

      // Wait for content to render
      await page.waitForTimeout(500);

      // Check if page has meaningful content
      const contentCheck = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return {
          hasText: text.trim().length > 100,
          elementCount: document.querySelectorAll('*').length,
          hasButtons: document.querySelectorAll('button').length > 0,
          hasInputs: document.querySelectorAll('input, textarea, select').length > 0
        };
      });

      results.hasContent = contentCheck.hasText && contentCheck.elementCount > 10;
      results.interactiveElements = {
        buttons: contentCheck.hasButtons,
        forms: contentCheck.hasInputs
      };

      // Basic accessibility check
      const accessibilityCheck = await page.evaluate(() => {
        const issues = [];
        
        // Check for missing alt text
        const images = document.querySelectorAll('img');
        const imagesWithoutAlt = Array.from(images).filter(img => !img.alt).length;
        if (imagesWithoutAlt > 0) {
          issues.push(`${imagesWithoutAlt} images missing alt text`);
        }

        // Check for missing labels
        const inputs = document.querySelectorAll('input, textarea, select');
        const inputsWithoutLabels = Array.from(inputs).filter(input => {
          return !input.labels || input.labels.length === 0;
        }).length;
        if (inputsWithoutLabels > 0) {
          issues.push(`${inputsWithoutLabels} form elements missing labels`);
        }

        // Check for focus indicators
        const focusableElements = document.querySelectorAll('button, a, input, textarea, select');
        return {
          totalIssues: issues.length,
          issues,
          focusableElementCount: focusableElements.length
        };
      });

      results.accessibility = accessibilityCheck;

      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      
      const mobileCheck = await page.evaluate(() => {
        const body = document.body;
        return {
          hasHorizontalScroll: body.scrollWidth > window.innerWidth,
          hasMobileMenu: document.querySelector('[class*="mobile"]') !== null
        };
      });

      results.responsive = !mobileCheck.hasHorizontalScroll;

    } catch (error) {
      console.error('❌ Basic analysis failed:', error.message);
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }

    return results;
  }

  generateImprovements(results) {
    const recommendations = [];

    // Dark mode recommendations
    if (results.darkModeCompatibility.compatible === false) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Dark Mode',
        issue: 'Insufficient dark mode coverage',
        solution: `Add dark mode variants for ${results.darkModeCompatibility.missingDarkClasses.length} missing classes`,
        example: 'bg-gray-50 → bg-gray-50 dark:bg-gray-900'
      });
    }

    // Performance recommendations
    if (results.basicAnalysis.performance?.loadTime > 3000) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Performance',
        issue: `Slow page load time: ${results.basicAnalysis.performance.loadTime}ms`,
        solution: 'Optimize bundle size and implement code splitting'
      });
    }

    // Accessibility recommendations
    if (results.basicAnalysis.accessibility?.totalIssues > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Accessibility',
        issue: `${results.basicAnalysis.accessibility.totalIssues} accessibility issues found`,
        solution: 'Add missing alt text and form labels'
      });
    }

    // Responsive design recommendations
    if (!results.basicAnalysis.responsive) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Responsive Design',
        issue: 'Horizontal scroll on mobile viewport',
        solution: 'Implement responsive design with proper breakpoints'
      });
    }

    return recommendations;
  }

  async saveResults(results, outputPath = './design-analysis-results.json') {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`📄 Results saved to: ${outputPath}`);
      
      // Also create a readable report
      const reportPath = outputPath.replace('.json', '-report.md');
      const report = this.generateMarkdownReport(results);
      fs.writeFileSync(reportPath, report);
      console.log(`📄 Report saved to: ${reportPath}`);
    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }
  }

  generateMarkdownReport(results) {
    const timestamp = new Date(results.timestamp).toLocaleString();
    
    return `# Improved Design Analysis Report

**Generated:** ${timestamp}  
**URL:** ${results.url}  
**Status:** ${results.success ? '✅ Success' : '❌ Failed'}

## Dark Mode Compatibility ${results.darkModeCompatibility.compatible ? '✅' : '❌'}

- **Compatibility Score:** ${results.darkModeCompatibility.compatibilityScore || 0}%
- **Light Mode Classes:** ${results.darkModeCompatibility.lightModeClasses || 0}
- **Dark Mode Classes:** ${results.darkModeCompatibility.darkModeClasses || 0}

${results.darkModeCompatibility.missingDarkClasses?.length > 0 ? `
### Missing Dark Mode Classes:
${results.darkModeCompatibility.missingDarkClasses.map(c => `- \`${c}\``).join('\n')}
` : ''}

## Basic Analysis

- **Page Load:** ${results.basicAnalysis.pageLoad ? '✅' : '❌'}
- **Has Content:** ${results.basicAnalysis.hasContent ? '✅' : '❌'}
- **Responsive:** ${results.basicAnalysis.responsive ? '✅' : '❌'}
- **Load Time:** ${results.basicAnalysis.performance?.loadTime || 'N/A'}ms

## Accessibility Issues

${results.basicAnalysis.accessibility?.issues?.length > 0 ? 
  results.basicAnalysis.accessibility.issues.map(issue => `- ${issue}`).join('\n') : 
  'No major issues detected'}

## Recommendations

${results.recommendations.length > 0 ? 
  results.recommendations.map(rec => `
### ${rec.priority} Priority: ${rec.category}
**Issue:** ${rec.issue}  
**Solution:** ${rec.solution}
${rec.example ? `**Example:** \`${rec.example}\`` : ''}
`).join('\n') : 'No recommendations at this time.'}

---
*Generated by Improved Playwright Design Analyzer*
`;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const url = args.find(arg => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000/directive-lab';
  const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1]) || 10000;
  const headless = !args.includes('--headed');
  
  const analyzer = new ImprovedPlaywrightDesignAnalyzer({
    timeout,
    headless,
    retryAttempts: 2
  });

  const results = await analyzer.analyze(url);
  await analyzer.saveResults(results, './directive-lab-analysis-improved.json');
  
  // Exit with appropriate code
  process.exit(results.success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default ImprovedPlaywrightDesignAnalyzer;