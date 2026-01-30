/**
 * DOM Capture Module for UAT Visual Failures
 *
 * Captures DOM element information when visual failures occur during UAT,
 * enabling EXEC agents to target exact elements via selectors.
 *
 * Uses Playwright MCP browser_snapshot for element capture.
 */

/**
 * Capture visual defect details from the current page
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} element - Element context (can be locator or selector)
 * @param {Object} options - Capture options
 * @returns {Promise<Object>} DOM capture metadata
 */
export async function captureVisualDefect(page, element, options = {}) {
  const {
    includeScreenshot = true,
    outputDir = './visual-polish-reports/screenshots',
    defectId = `defect-${Date.now()}`
  } = options;

  try {
    // Get element locator from various input types
    const locator = await resolveLocator(page, element);

    if (!locator) {
      return {
        success: false,
        error: 'Could not resolve element to locator',
        element_ref: null
      };
    }

    // Capture element information
    const elementInfo = await captureElementInfo(page, locator);

    // Generate selectors with fallbacks
    const selectors = await generateSelectors(page, locator);

    // Get bounding box
    const boundingBox = await locator.boundingBox();

    // Capture annotated screenshot if requested
    let annotatedScreenshot = null;
    if (includeScreenshot && boundingBox) {
      const { addBoundingBoxOverlay } = await import('./screenshot-annotator.js');
      const screenshotPath = `${outputDir}/${defectId}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      annotatedScreenshot = await addBoundingBoxOverlay(
        screenshotPath,
        boundingBox,
        `${outputDir}/${defectId}-annotated.png`
      );
    }

    // Try to resolve component path from source maps
    const componentPath = await resolveComponentPath(page, locator);

    return {
      success: true,
      element_ref: elementInfo.elementRef,
      primary_selector: selectors.primary,
      alternative_selectors: selectors.alternatives,
      component_path: componentPath,
      bounding_box: boundingBox ? {
        x: Math.round(boundingBox.x),
        y: Math.round(boundingBox.y),
        width: Math.round(boundingBox.width),
        height: Math.round(boundingBox.height)
      } : null,
      annotated_screenshot: annotatedScreenshot,
      captured_at: new Date().toISOString(),
      tag_name: elementInfo.tagName,
      text_content: elementInfo.textContent?.substring(0, 100),
      attributes: elementInfo.attributes
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      element_ref: null
    };
  }
}

/**
 * Resolve various element inputs to a Playwright locator
 */
async function resolveLocator(page, element) {
  if (!element) return null;

  // Already a locator
  if (element.locator || element._selector) {
    return element;
  }

  // String selector
  if (typeof element === 'string') {
    return page.locator(element).first();
  }

  // Object with selector property
  if (element.selector) {
    return page.locator(element.selector).first();
  }

  // ElementHandle
  if (element.asElement) {
    return element;
  }

  return null;
}

/**
 * Capture detailed element information
 */
async function captureElementInfo(page, locator) {
  return await locator.evaluate((el) => {
    // Generate a unique reference for this element
    const elementRef = `e${Math.random().toString(36).substring(2, 8)}`;

    // Get computed attributes
    const attributes = {};
    for (const attr of el.attributes) {
      if (['id', 'class', 'data-testid', 'name', 'type', 'role', 'aria-label'].includes(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    }

    return {
      elementRef,
      tagName: el.tagName.toLowerCase(),
      textContent: el.textContent?.trim(),
      attributes
    };
  });
}

/**
 * Generate multiple selector strategies for element targeting
 */
async function generateSelectors(page, locator) {
  const selectors = await locator.evaluate((el) => {
    const results = [];

    // Strategy 1: data-testid (most stable)
    if (el.dataset.testid) {
      results.push({
        selector: `[data-testid="${el.dataset.testid}"]`,
        strategy: 'data-testid',
        confidence: 0.95
      });
    }

    // Strategy 2: ID (stable if not dynamically generated)
    if (el.id && !el.id.match(/^\d|^:r|^__/)) {
      results.push({
        selector: `#${el.id}`,
        strategy: 'id',
        confidence: 0.9
      });
    }

    // Strategy 3: Unique class combination
    if (el.className) {
      const classes = el.className.split(' ').filter(c =>
        c && !c.match(/^(hover|active|focus|disabled|hidden|visible)/)
      ).slice(0, 3);
      if (classes.length > 0) {
        results.push({
          selector: `${el.tagName.toLowerCase()}.${classes.join('.')}`,
          strategy: 'class',
          confidence: 0.7
        });
      }
    }

    // Strategy 4: Role + accessible name
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const name = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30);
    if (name) {
      results.push({
        selector: `[role="${role}"]`,
        strategy: 'role',
        confidence: 0.6,
        textHint: name
      });
    }

    // Strategy 5: CSS path (least stable, last resort)
    const path = [];
    let current = el;
    while (current && current.tagName) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }
      const siblings = current.parentElement?.children || [];
      const sameTag = Array.from(siblings).filter(s => s.tagName === current.tagName);
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = current.parentElement;
      if (path.length > 4) break;
    }
    results.push({
      selector: path.join(' > '),
      strategy: 'css-path',
      confidence: 0.4
    });

    return results;
  });

  // Sort by confidence and select primary + alternatives
  selectors.sort((a, b) => b.confidence - a.confidence);

  return {
    primary: selectors[0]?.selector || null,
    alternatives: selectors.slice(1).map(s => s.selector),
    all: selectors
  };
}

/**
 * Try to resolve the React/Vue component file path from source maps
 */
async function resolveComponentPath(page, locator) {
  try {
    const componentInfo = await locator.evaluate((el) => {
      // React DevTools integration
      if (el._reactRootContainer || el.__reactFiber$) {
        const fiber = el.__reactFiber$ || Object.keys(el).find(k => k.startsWith('__reactFiber'))
          ? el[Object.keys(el).find(k => k.startsWith('__reactFiber'))]
          : null;
        if (fiber && fiber._debugSource) {
          return {
            fileName: fiber._debugSource.fileName,
            lineNumber: fiber._debugSource.lineNumber
          };
        }
      }

      // Vue DevTools integration
      if (el.__vue__) {
        const vm = el.__vue__;
        if (vm.$options && vm.$options.__file) {
          return { fileName: vm.$options.__file };
        }
      }

      return null;
    });

    if (componentInfo) {
      return componentInfo.lineNumber
        ? `${componentInfo.fileName}:${componentInfo.lineNumber}`
        : componentInfo.fileName;
    }
  } catch {
    // Source maps not available
  }

  return null;
}

/**
 * Verify that a captured selector still matches an element
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} domCapture - Previously captured DOM metadata
 * @returns {Promise<Object>} Verification result with matched selector
 */
export async function verifySelector(page, domCapture) {
  const { primary_selector, alternative_selectors = [] } = domCapture;

  // Try primary selector first
  if (primary_selector) {
    const count = await page.locator(primary_selector).count();
    if (count > 0) {
      return {
        verified: true,
        matchedSelector: primary_selector,
        strategy: 'primary',
        message: `Selector verified: ${primary_selector} found`
      };
    }
  }

  // Try alternatives
  for (const selector of alternative_selectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      return {
        verified: true,
        matchedSelector: selector,
        strategy: 'fallback',
        message: `Fallback selector matched: ${selector}`
      };
    }
  }

  // No match - trigger drift recovery
  return {
    verified: false,
    matchedSelector: null,
    strategy: 'none',
    message: 'Selector not found: attempting drift recovery'
  };
}

/**
 * Prompt user for DOM capture during UAT (terminal interaction)
 * @param {string} failureType - Type of failure detected
 * @returns {Promise<boolean>} User's response
 */
export function shouldCaptureDom(failureType) {
  // Visual failures should prompt for DOM capture
  return failureType === 'visual' || failureType === 'Visual bug';
}

export default {
  captureVisualDefect,
  verifySelector,
  shouldCaptureDom
};
