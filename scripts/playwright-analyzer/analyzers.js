/**
 * Analyzers Domain
 * Core analysis methods for UI/UX evaluation
 *
 * @module playwright-analyzer/analyzers
 */

import { BREAKPOINTS, WCAG_CRITERIA } from './config.js';

/**
 * Analyze end-to-end process flow
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Process flow analysis results
 */
export async function analyzeProcessFlow(browser, url) {
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

/**
 * Analyze visual consistency
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Consistency analysis results
 */
export async function analyzeConsistency(browser, url) {
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

    const elements = document.querySelectorAll('*');
    const colors = new Map();
    const fonts = new Map();
    const spacings = new Map();

    elements.forEach(el => {
      const computed = window.getComputedStyle(el);

      if (computed.color) colors.set(computed.color, (colors.get(computed.color) || 0) + 1);
      if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        colors.set(computed.backgroundColor, (colors.get(computed.backgroundColor) || 0) + 1);
      }

      const fontKey = `${computed.fontFamily}-${computed.fontSize}-${computed.fontWeight}`;
      fonts.set(fontKey, (fonts.get(fontKey) || 0) + 1);

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

/**
 * Test accessibility compliance
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Accessibility test results
 */
export async function testAccessibility(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // Inject axe-core for accessibility testing
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js'
  });

  const a11y = await page.evaluate(() => {
    return new Promise(resolve => {
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

/**
 * Test responsive design at multiple breakpoints
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Responsive test results
 */
export async function testResponsive(browser, url) {
  const results = {
    breakpoints: {},
    issues: []
  };

  for (const [name, viewport] of Object.entries(BREAKPOINTS)) {
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

/**
 * Measure performance metrics
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Performance metrics
 */
export async function measurePerformance(browser, url) {
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
      } catch (_e) {
        // Cross-origin stylesheets
      }
    });

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
    issues: loadTime > WCAG_CRITERIA.maxLoadTime ? [{
      type: 'SLOW_LOAD',
      loadTime,
      maxAllowed: WCAG_CRITERIA.maxLoadTime,
      severity: 'HIGH',
      fix: 'Optimize assets and lazy load non-critical resources'
    }] : []
  };
}

/**
 * Test interactive elements
 * @param {Browser} browser - Playwright browser instance
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Interaction test results
 */
export async function testInteractions(browser, url) {
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
    } catch (_hoverError) {
      console.log('   Note: Button hover test skipped (element not visible)');
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

export default {
  analyzeProcessFlow,
  analyzeConsistency,
  testAccessibility,
  testResponsive,
  measurePerformance,
  testInteractions
};
