#!/usr/bin/env node

/**
 * Playwright-Enhanced Design UI Analyzer for Directive Lab
 * Real-time UI/UX analysis with visual testing and interaction validation
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

class PlaywrightDesignAnalyzer {
  constructor() {
    this.breakpoints = {
      mobile: { width: 375, height: 812 },  // iPhone X
      tablet: { width: 768, height: 1024 }, // iPad
      desktop: { width: 1440, height: 900 }, // Desktop
      wide: { width: 1920, height: 1080 }   // Full HD
    };
    
    this.wcagCriteria = {
      minContrast: 4.5,
      enhancedContrast: 7,
      minTouchTarget: 44,
      minFocusIndicator: 2,
      maxLoadTime: 3000,
      maxInteractionDelay: 100
    };
  }

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
      results.endToEndFlow = await this.analyzeProcessFlow(browser, url);
      
      // 2. Visual Consistency Analysis
      console.log('🎯 Checking visual consistency...');
      results.consistency = await this.analyzeConsistency(browser, url);
      
      // 3. Accessibility Testing
      console.log('♿ Running accessibility tests...');
      results.accessibility = await this.testAccessibility(browser, url);
      
      // 4. Responsive Design Testing
      console.log('📱 Testing responsive behavior...');
      results.responsive = await this.testResponsive(browser, url);
      
      // 5. Performance Metrics
      console.log('⚡ Measuring performance...');
      results.performance = await this.measurePerformance(browser, url);
      
      // 6. Interactive Elements Testing
      console.log('👆 Testing interactive elements...');
      results.interactions = await this.testInteractions(browser, url);
      
      // Generate recommendations
      results.recommendations = this.generateRecommendations(results);
      
      // Save report
      await this.saveReport(results);
      
    } finally {
      await browser.close();
    }
    
    return results;
  }

  async analyzeProcessFlow(browser, url) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const flow = {
      steps: [],
      navigation: {},
      userGuidance: {},
      issues: []
    };
    
    // Analyze step indicators
    const stepIndicators = await page.evaluate(() => {
      const steps = [];
      // Look for step indicators, progress bars, etc.
      const stepElements = document.querySelectorAll('[class*="step"], [class*="Step"], [class*="progress"]');
      
      stepElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        steps.push({
          text: el.textContent.trim(),
          visible: rect.height > 0 && rect.width > 0,
          position: { x: rect.x, y: rect.y },
          classes: el.className
        });
      });
      
      return steps;
    });
    
    flow.steps = stepIndicators;
    
    // Check for navigation elements
    flow.navigation = await page.evaluate(() => {
      const nav = {
        hasBackButton: !!document.querySelector('[class*="back"], [aria-label*="back"]'),
        hasNextButton: !!document.querySelector('[class*="next"], [aria-label*="next"]'),
        hasBreadcrumbs: !!document.querySelector('[class*="breadcrumb"], nav[aria-label*="breadcrumb"]'),
        hasProgressBar: !!document.querySelector('[role="progressbar"], [class*="progress"]'),
        hasSaveButton: !!document.querySelector('[class*="save"]') || 
                       Array.from(document.querySelectorAll('button')).some(b => b.textContent.toLowerCase().includes('save')),
      };
      
      // Check navigation consistency
      const buttons = document.querySelectorAll('button');
      const buttonStyles = new Set();
      buttons.forEach(btn => {
        const computed = window.getComputedStyle(btn);
        buttonStyles.add(`${computed.backgroundColor}-${computed.color}-${computed.borderRadius}`);
      });
      
      nav.buttonConsistency = buttonStyles.size <= 3;
      
      return nav;
    });
    
    // Analyze user guidance
    flow.userGuidance = await page.evaluate(() => {
      return {
        hasHelpText: !!document.querySelector('[class*="help"], [class*="hint"], [class*="tooltip"]'),
        hasErrorMessages: !!document.querySelector('[class*="error"], [role="alert"]'),
        hasSuccessIndicators: !!document.querySelector('[class*="success"], [aria-live="polite"]'),
        hasLoadingStates: !!document.querySelector('[class*="loading"], [class*="spinner"]'),
        hasEmptyStates: !!document.querySelector('[class*="empty"], [class*="no-data"]')
      };
    });
    
    // Identify flow issues
    if (!flow.navigation.hasProgressBar && flow.steps.length > 3) {
      flow.issues.push({
        type: 'MISSING_PROGRESS_INDICATOR',
        severity: 'HIGH',
        fix: 'Add a progress bar or step indicator for multi-step processes'
      });
    }
    
    if (!flow.navigation.hasBackButton && flow.steps.length > 1) {
      flow.issues.push({
        type: 'NO_BACK_NAVIGATION',
        severity: 'MEDIUM',
        fix: 'Add back navigation for better user control'
      });
    }
    
    if (!flow.userGuidance.hasHelpText) {
      flow.issues.push({
        type: 'MISSING_HELP_TEXT',
        severity: 'MEDIUM',
        fix: 'Add contextual help or tooltips for complex fields'
      });
    }
    
    await page.close();
    return flow;
  }

  async analyzeConsistency(browser, url) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const consistency = await page.evaluate(() => {
      const results = {
        colors: {},
        typography: {},
        spacing: {},
        components: {},
        issues: []
      };
      
      // Analyze color usage
      const elements = document.querySelectorAll('*');
      const colors = new Map();
      const fonts = new Map();
      const spacings = new Map();
      
      elements.forEach(el => {
        const computed = window.getComputedStyle(el);
        
        // Track colors
        if (computed.color) colors.set(computed.color, (colors.get(computed.color) || 0) + 1);
        if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          colors.set(computed.backgroundColor, (colors.get(computed.backgroundColor) || 0) + 1);
        }
        
        // Track fonts
        const fontKey = `${computed.fontFamily}-${computed.fontSize}-${computed.fontWeight}`;
        fonts.set(fontKey, (fonts.get(fontKey) || 0) + 1);
        
        // Track spacing
        const spacingKey = `${computed.padding}-${computed.margin}`;
        spacings.set(spacingKey, (spacings.get(spacingKey) || 0) + 1);
      });
      
      results.colors.unique = colors.size;
      results.colors.primary = Array.from(colors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      results.typography.unique = fonts.size;
      results.typography.variants = Array.from(fonts.keys()).slice(0, 10);
      
      results.spacing.unique = spacings.size;
      
      // Check component consistency
      const buttons = document.querySelectorAll('button');
      const buttonVariants = new Set();
      buttons.forEach(btn => {
        const computed = window.getComputedStyle(btn);
        buttonVariants.add(`${computed.height}-${computed.padding}-${computed.borderRadius}`);
      });
      
      results.components.buttonVariants = buttonVariants.size;
      
      // Input consistency
      const inputs = document.querySelectorAll('input, textarea, select');
      const inputVariants = new Set();
      inputs.forEach(input => {
        const computed = window.getComputedStyle(input);
        inputVariants.add(`${computed.height}-${computed.border}-${computed.borderRadius}`);
      });
      
      results.components.inputVariants = inputVariants.size;
      
      // Identify issues
      if (colors.size > 15) {
        results.issues.push({
          type: 'TOO_MANY_COLORS',
          count: colors.size,
          severity: 'MEDIUM',
          fix: 'Reduce to 5-8 colors max including shades'
        });
      }
      
      if (fonts.size > 10) {
        results.issues.push({
          type: 'INCONSISTENT_TYPOGRAPHY',
          count: fonts.size,
          severity: 'HIGH',
          fix: 'Standardize typography to 4-6 variants max'
        });
      }
      
      if (buttonVariants.size > 3) {
        results.issues.push({
          type: 'INCONSISTENT_BUTTONS',
          count: buttonVariants.size,
          severity: 'HIGH',
          fix: 'Create standard button components with consistent variants'
        });
      }
      
      if (inputVariants.size > 2) {
        results.issues.push({
          type: 'INCONSISTENT_INPUTS',
          count: inputVariants.size,
          severity: 'MEDIUM',
          fix: 'Standardize form input styling'
        });
      }
      
      return results;
    });
    
    await page.close();
    return consistency;
  }

  async testAccessibility(browser, url) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Inject axe-core for accessibility testing
    await page.addScriptTag({ 
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js' 
    });
    
    const a11y = await page.evaluate(() => {
      return new Promise(resolve => {
        // Wait for axe to be available
        setTimeout(async () => {
          if (typeof axe !== 'undefined') {
            const results = await axe.run();
            resolve({
              violations: results.violations,
              passes: results.passes.length,
              incomplete: results.incomplete.length
            });
          } else {
            resolve({ violations: [], passes: 0, incomplete: 0 });
          }
        }, 1000);
      });
    });
    
    // Additional keyboard navigation tests
    const keyboardNav = await page.evaluate(() => {
      const focusableElements = document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      let hasVisibleFocus = false;
      focusableElements.forEach(el => {
        el.focus();
        const computed = window.getComputedStyle(el);
        const hasFocusStyle = computed.outline !== 'none' || 
                             computed.boxShadow !== 'none' ||
                             computed.border !== el.blur() && window.getComputedStyle(el).border;
        if (hasFocusStyle) hasVisibleFocus = true;
      });
      
      return {
        focusableCount: focusableElements.length,
        hasVisibleFocusIndicators: hasVisibleFocus,
        tabIndexIssues: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length
      };
    });
    
    a11y.keyboard = keyboardNav;
    
    await page.close();
    return a11y;
  }

  async testResponsive(browser, url) {
    const results = {
      breakpoints: {},
      issues: []
    };
    
    for (const [name, viewport] of Object.entries(this.breakpoints)) {
      const page = await browser.newPage();
      await page.setViewportSize(viewport);
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // Take screenshot for visual comparison
      await page.screenshot({ 
        path: `screenshots/directive-lab-${name}.png`,
        fullPage: true 
      });
      
      const analysis = await page.evaluate((viewportName) => {
        const results = {
          viewport: viewportName,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
          textReadability: true,
          touchTargets: [],
          overflow: []
        };
        
        // Check text readability
        const textElements = document.querySelectorAll('p, span, div, li, h1, h2, h3, h4, h5, h6');
        textElements.forEach(el => {
          const computed = window.getComputedStyle(el);
          const fontSize = parseFloat(computed.fontSize);
          if (fontSize < 12) {
            results.textReadability = false;
          }
        });
        
        // Check touch targets on mobile/tablet
        if (viewportName === 'mobile' || viewportName === 'tablet') {
          const clickables = document.querySelectorAll('button, a, [onclick]');
          clickables.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) {
              results.touchTargets.push({
                element: el.tagName,
                size: `${rect.width}x${rect.height}`,
                text: el.textContent.substring(0, 30)
              });
            }
          });
        }
        
        // Check for overflow issues
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth || rect.left < 0) {
            results.overflow.push({
              element: el.tagName,
              class: el.className,
              overflow: rect.right - window.innerWidth
            });
          }
        });
        
        return results;
      }, name);
      
      results.breakpoints[name] = analysis;
      
      // Add issues
      if (analysis.hasHorizontalScroll) {
        results.issues.push({
          viewport: name,
          type: 'HORIZONTAL_SCROLL',
          severity: 'HIGH',
          fix: `Remove horizontal scroll at ${name} breakpoint`
        });
      }
      
      if (!analysis.textReadability) {
        results.issues.push({
          viewport: name,
          type: 'SMALL_TEXT',
          severity: 'MEDIUM',
          fix: `Increase text size for better readability at ${name}`
        });
      }
      
      if (analysis.touchTargets.length > 0) {
        results.issues.push({
          viewport: name,
          type: 'SMALL_TOUCH_TARGETS',
          count: analysis.touchTargets.length,
          severity: 'HIGH',
          fix: `Increase touch target size to minimum 44x44px at ${name}`
        });
      }
      
      await page.close();
    }
    
    return results;
  }

  async measurePerformance(browser, url) {
    const page = await browser.newPage();
    
    // Enable performance metrics
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    
    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - startTime;
    
    const metrics = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint');
      const navigation = performance.getEntriesByType('navigation')[0];
      
      return {
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        domContentLoaded: navigation?.domContentLoadedEventEnd || 0,
        loadComplete: navigation?.loadEventEnd || 0
      };
    });
    
    // Check for animations
    const animations = await page.evaluate(() => {
      const animated = [];
      const sheets = Array.from(document.styleSheets);
      
      sheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach(rule => {
            if (rule.cssText && (rule.cssText.includes('animation') || rule.cssText.includes('transition'))) {
              animated.push({
                type: rule.cssText.includes('animation') ? 'animation' : 'transition',
                rule: rule.cssText.substring(0, 100)
              });
            }
          });
        } catch (e) {
          // Cross-origin stylesheets
        }
      });
      
      // Check for reduced motion support
      const supportsReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      return {
        count: animated.length,
        supportsReducedMotion,
        samples: animated.slice(0, 5)
      };
    });
    
    await page.close();
    
    return {
      loadTime,
      metrics,
      animations,
      issues: loadTime > this.wcagCriteria.maxLoadTime ? [{
        type: 'SLOW_LOAD',
        loadTime,
        maxAllowed: this.wcagCriteria.maxLoadTime,
        severity: 'HIGH',
        fix: 'Optimize assets and lazy load non-critical resources'
      }] : []
    };
  }

  async testInteractions(browser, url) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const interactions = {
      forms: {},
      buttons: {},
      navigation: {},
      feedback: {}
    };
    
    // Test form interactions
    interactions.forms = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const formAnalysis = {
        count: forms.length,
        hasValidation: false,
        hasRequiredFields: false,
        hasLabels: true,
        hasPlaceholders: false
      };
      
      forms.forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const labels = form.querySelectorAll('label');
        
        inputs.forEach(input => {
          if (input.hasAttribute('required')) formAnalysis.hasRequiredFields = true;
          if (input.hasAttribute('placeholder')) formAnalysis.hasPlaceholders = true;
          if (input.getAttribute('aria-invalid') || input.classList.contains('error')) {
            formAnalysis.hasValidation = true;
          }
        });
        
        if (labels.length < inputs.length) formAnalysis.hasLabels = false;
      });
      
      return formAnalysis;
    });
    
    // Test button interactions
    const buttons = await page.$$('button');
    interactions.buttons.count = buttons.length;
    
    if (buttons.length > 0) {
      // Test hover states
      const firstButton = buttons[0];
      const normalStyle = await firstButton.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          background: computed.backgroundColor,
          color: computed.color,
          transform: computed.transform
        };
      });
      
      try {
        await firstButton.hover({ timeout: 5000 });
        await page.waitForTimeout(100);
      } catch (hoverError) {
        console.log('   Note: Button hover test skipped (element not visible)')
      }
      
      const hoverStyle = await firstButton.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          background: computed.backgroundColor,
          color: computed.color,
          transform: computed.transform,
          cursor: computed.cursor
        };
      });
      
      interactions.buttons.hasHoverState = JSON.stringify(normalStyle) !== JSON.stringify(hoverStyle);
      interactions.buttons.hasPointerCursor = hoverStyle.cursor === 'pointer';
    }
    
    // Test loading states
    interactions.feedback = await page.evaluate(() => {
      return {
        hasLoadingIndicators: !!document.querySelector('[class*="loading"], [class*="spinner"]'),
        hasSuccessMessages: !!document.querySelector('[class*="success"], [role="status"]'),
        hasErrorMessages: !!document.querySelector('[class*="error"], [role="alert"]'),
        hasToasts: !!document.querySelector('[class*="toast"], [class*="notification"]'),
        hasModals: !!document.querySelector('[role="dialog"], [class*="modal"]')
      };
    });
    
    await page.close();
    return interactions;
  }

  generateRecommendations(results) {
    const recommendations = [];
    
    // High Priority - End-to-End Flow
    if (results.endToEndFlow.issues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Process Flow',
        title: 'Improve User Journey Guidance',
        description: 'The multi-step process needs better visual guidance',
        actions: [
          'Add a persistent progress indicator showing current step and total steps',
          'Implement breadcrumb navigation for context',
          'Add "Save and Continue Later" functionality',
          'Include time estimates for each step',
          'Add contextual help tooltips for complex fields'
        ]
      });
    }
    
    // High Priority - Consistency
    if (results.consistency.issues.find(i => i.type === 'INCONSISTENT_BUTTONS')) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Visual Consistency',
        title: 'Standardize Button System',
        description: 'Multiple button styles create confusion',
        actions: [
          'Create 3 button variants: primary (main CTA), secondary (alternate actions), ghost (tertiary)',
          'Ensure consistent padding: 12px vertical, 24px horizontal',
          'Standardize border-radius to 8px across all buttons',
          'Implement consistent hover/active states',
          'Use consistent disabled state styling'
        ]
      });
    }
    
    // High Priority - Mobile Experience
    if (results.responsive.issues.find(i => i.viewport === 'mobile')) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Mobile Experience',
        title: 'Fix Mobile Navigation',
        description: 'Mobile users face navigation and interaction issues',
        actions: [
          'Implement stack-based navigation for mobile (no side panels)',
          'Increase touch targets to minimum 44x44px',
          'Add swipe gestures for step navigation',
          'Implement sticky action buttons at bottom',
          'Ensure forms are single-column on mobile'
        ]
      });
    }
    
    // Medium Priority - Form Experience
    if (!results.interactions.forms.hasValidation) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Form UX',
        title: 'Enhance Form Validation',
        description: 'Forms lack real-time validation and feedback',
        actions: [
          'Add inline validation with immediate feedback',
          'Show success checkmarks for valid fields',
          'Display helpful error messages with correction hints',
          'Implement auto-save for form progress',
          'Add field format hints (e.g., date format)'
        ]
      });
    }
    
    // Medium Priority - Accessibility
    if (results.accessibility.violations && results.accessibility.violations.length > 0) {
      const critical = results.accessibility.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
      if (critical.length > 0) {
        recommendations.push({
          priority: 'HIGH',
          category: 'Accessibility',
          title: 'Fix Critical Accessibility Issues',
          description: `${critical.length} critical WCAG violations found`,
          actions: critical.slice(0, 5).map(v => v.description)
        });
      }
    }
    
    // Low Priority - Performance
    if (results.performance.loadTime > 2000) {
      recommendations.push({
        priority: 'LOW',
        category: 'Performance',
        title: 'Optimize Loading Performance',
        description: `Page loads in ${results.performance.loadTime}ms (target: <2000ms)`,
        actions: [
          'Implement code splitting for large components',
          'Lazy load non-critical resources',
          'Optimize and compress images',
          'Enable browser caching',
          'Consider using a CDN for static assets'
        ]
      });
    }
    
    return recommendations;
  }

  async saveReport(results) {
    // Create screenshots directory if it doesn't exist
    await fs.mkdir('screenshots', { recursive: true });
    
    // Generate HTML report
    const html = this.generateHTMLReport(results);
    await fs.writeFile('directive-lab-ui-analysis.html', html);
    
    // Generate JSON report
    await fs.writeFile('directive-lab-ui-analysis.json', JSON.stringify(results, null, 2));
    
    // Generate Markdown summary
    const markdown = this.generateMarkdownSummary(results);
    await fs.writeFile('directive-lab-ui-recommendations.md', markdown);
    
    console.log('\n📊 Reports saved:');
    console.log('   - directive-lab-ui-analysis.html (visual report)');
    console.log('   - directive-lab-ui-analysis.json (detailed data)');
    console.log('   - directive-lab-ui-recommendations.md (action items)');
    console.log('   - screenshots/ (visual comparisons)');
  }

  generateHTMLReport(results) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Directive Lab UI Analysis</title>
  <style>
    body { font-family: system-ui; margin: 40px; line-height: 1.6; }
    .header { border-bottom: 3px solid #0066cc; padding-bottom: 20px; }
    .section { margin: 40px 0; }
    .priority-high { color: #d32f2f; }
    .priority-medium { color: #f57c00; }
    .priority-low { color: #388e3c; }
    .recommendation { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .actions { margin-left: 20px; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .issue { background: #fff3cd; padding: 10px; margin: 10px 0; border-left: 4px solid #ffc107; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Directive Lab UI Analysis Report</h1>
    <p>Generated: ${results.timestamp}</p>
    <p>URL: ${results.url}</p>
  </div>
  
  <div class="section">
    <h2>Key Metrics</h2>
    <div class="metric"><strong>Load Time:</strong> ${results.performance.loadTime}ms</div>
    <div class="metric"><strong>Accessibility Violations:</strong> ${results.accessibility.violations?.length || 0}</div>
    <div class="metric"><strong>Color Variants:</strong> ${results.consistency.colors.unique}</div>
    <div class="metric"><strong>Button Variants:</strong> ${results.consistency.components.buttonVariants}</div>
    <div class="metric"><strong>Typography Variants:</strong> ${results.consistency.typography.unique}</div>
  </div>
  
  <div class="section">
    <h2>Priority Recommendations</h2>
    ${results.recommendations.map(rec => `
      <div class="recommendation">
        <h3 class="priority-${rec.priority.toLowerCase()}">[${rec.priority}] ${rec.title}</h3>
        <p>${rec.description}</p>
        <ul class="actions">
          ${rec.actions.map(action => `<li>${action}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  </div>
  
  <div class="section">
    <h2>Responsive Design Issues</h2>
    ${results.responsive.issues.map(issue => `
      <div class="issue">
        <strong>${issue.viewport}:</strong> ${issue.type} - ${issue.fix}
      </div>
    `).join('')}
  </div>
</body>
</html>`;
  }

  generateMarkdownSummary(results) {
    let md = `# Directive Lab UI/UX Recommendations\n\n`;
    md += `**Analysis Date:** ${results.timestamp}\n\n`;
    
    md += `## Executive Summary\n\n`;
    md += `The Directive Lab interface analysis reveals opportunities to improve the end-to-end user experience, `;
    md += `visual consistency, and mobile responsiveness. Key focus areas include standardizing the component `;
    md += `system, improving process flow guidance, and ensuring accessibility compliance.\n\n`;
    
    md += `## Priority Action Items\n\n`;
    
    const highPriority = results.recommendations.filter(r => r.priority === 'HIGH');
    const mediumPriority = results.recommendations.filter(r => r.priority === 'MEDIUM');
    const lowPriority = results.recommendations.filter(r => r.priority === 'LOW');
    
    if (highPriority.length > 0) {
      md += `### 🔴 High Priority\n\n`;
      highPriority.forEach(rec => {
        md += `#### ${rec.title}\n`;
        md += `*${rec.description}*\n\n`;
        rec.actions.forEach(action => {
          md += `- [ ] ${action}\n`;
        });
        md += `\n`;
      });
    }
    
    if (mediumPriority.length > 0) {
      md += `### 🟡 Medium Priority\n\n`;
      mediumPriority.forEach(rec => {
        md += `#### ${rec.title}\n`;
        md += `*${rec.description}*\n\n`;
        rec.actions.forEach(action => {
          md += `- [ ] ${action}\n`;
        });
        md += `\n`;
      });
    }
    
    if (lowPriority.length > 0) {
      md += `### 🟢 Low Priority\n\n`;
      lowPriority.forEach(rec => {
        md += `#### ${rec.title}\n`;
        md += `*${rec.description}*\n\n`;
        rec.actions.forEach(action => {
          md += `- [ ] ${action}\n`;
        });
        md += `\n`;
      });
    }
    
    md += `## Consistency Metrics\n\n`;
    md += `- **Colors Used:** ${results.consistency.colors.unique} (Target: 5-8)\n`;
    md += `- **Button Styles:** ${results.consistency.components.buttonVariants} (Target: 3)\n`;
    md += `- **Input Styles:** ${results.consistency.components.inputVariants} (Target: 2)\n`;
    md += `- **Typography Variants:** ${results.consistency.typography.unique} (Target: 4-6)\n\n`;
    
    md += `## Implementation Estimates\n\n`;
    md += `- **Immediate Fixes (2-4 hours):** Button standardization, form consistency\n`;
    md += `- **Short-term (1-2 days):** Mobile navigation, progress indicators\n`;
    md += `- **Long-term (3-5 days):** Complete design system implementation, accessibility compliance\n\n`;
    
    md += `## Next Steps\n\n`;
    md += `1. Review and prioritize recommendations with stakeholders\n`;
    md += `2. Create design system documentation\n`;
    md += `3. Implement high-priority fixes\n`;
    md += `4. Conduct user testing on improved flows\n`;
    md += `5. Monitor performance and accessibility metrics\n`;
    
    return md;
  }
}

// Run the analyzer
const analyzer = new PlaywrightDesignAnalyzer();
analyzer.analyze().then(results => {
  console.log('\n✅ Analysis complete!');
  console.log(`\n📋 Top Recommendations:`);
  
  results.recommendations.slice(0, 3).forEach((rec, i) => {
    console.log(`\n${i + 1}. [${rec.priority}] ${rec.title}`);
    console.log(`   ${rec.description}`);
  });
  
  process.exit(0);
}).catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});