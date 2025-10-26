/**
 * Test Utilities - Reusable helpers for Playwright E2E tests
 *
 * Part of Phase 1 Testing Framework Enhancements (B1.1)
 * Provides common patterns and helpers to reduce test boilerplate
 */

/**
 * Wait for a specific condition with custom polling interval
 * @param {Function} condition - Function that returns true when condition is met
 * @param {Object} options - Polling options
 * @returns {Promise<void>}
 */
export async function waitForCondition(condition, options = {}) {
  const {
    timeout = 10000,
    interval = 100,
    timeoutMessage = 'Condition not met within timeout',
  } = options;

  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(timeoutMessage);
}

/**
 * Wait for network to be idle (no pending requests)
 * @param {Page} page - Playwright page object
 * @param {Object} options - Wait options
 */
export async function waitForNetworkIdle(page, options = {}) {
  const { timeout = 5000, maxInflightRequests = 0 } = options;

  return page.waitForLoadState('networkidle', { timeout });
}

/**
 * Take a full-page screenshot with automatic naming
 * @param {Page} page - Playwright page object
 * @param {string} name - Screenshot name
 * @param {Object} options - Screenshot options
 */
export async function takeScreenshot(page, name, options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.png`;

  await page.screenshot({
    path: `test-results/screenshots/${filename}`,
    fullPage: true,
    ...options,
  });

  return filename;
}

/**
 * Check if element is visible in viewport
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @returns {Promise<boolean>}
 */
export async function isInViewport(page, selector) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }, selector);
}

/**
 * Scroll element into view
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {Object} options - Scroll options
 */
export async function scrollIntoView(page, selector, options = {}) {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);

  // Wait for scroll to complete
  await page.waitForTimeout(300);
}

/**
 * Fill form with data object
 * @param {Page} page - Playwright page object
 * @param {Object} formData - Form field data { selector: value }
 */
export async function fillForm(page, formData) {
  for (const [selector, value] of Object.entries(formData)) {
    await page.fill(selector, value);
  }
}

/**
 * Wait for API response matching URL pattern
 * @param {Page} page - Playwright page object
 * @param {string|RegExp} urlPattern - URL pattern to match
 * @param {Object} options - Wait options
 * @returns {Promise<Response>}
 */
export async function waitForApiResponse(page, urlPattern, options = {}) {
  const { timeout = 10000 } = options;

  return page.waitForResponse(
    (response) => {
      const url = response.url();
      return typeof urlPattern === 'string'
        ? url.includes(urlPattern)
        : urlPattern.test(url);
    },
    { timeout }
  );
}

/**
 * Mock API response
 * @param {Page} page - Playwright page object
 * @param {string|RegExp} urlPattern - URL pattern to intercept
 * @param {Object} mockData - Mock response data
 * @param {Object} options - Mock options
 */
export async function mockApiResponse(page, urlPattern, mockData, options = {}) {
  const { status = 200, contentType = 'application/json' } = options;

  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType,
      body: JSON.stringify(mockData),
    });
  });
}

/**
 * Clear all cookies and local storage
 * @param {BrowserContext} context - Playwright browser context
 */
export async function clearBrowserData(context) {
  await context.clearCookies();

  // Clear localStorage and sessionStorage in all pages
  const pages = context.pages();
  for (const page of pages) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }
}

/**
 * Get element text content, trimmed
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @returns {Promise<string>}
 */
export async function getTextContent(page, selector) {
  const element = await page.locator(selector);
  const text = await element.textContent();
  return text ? text.trim() : '';
}

/**
 * Get all matching elements' text content
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @returns {Promise<string[]>}
 */
export async function getAllTextContent(page, selector) {
  const elements = await page.locator(selector).all();
  const texts = await Promise.all(
    elements.map(async (el) => {
      const text = await el.textContent();
      return text ? text.trim() : '';
    })
  );
  return texts;
}

/**
 * Check if element has specific class
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {string} className - Class name to check
 * @returns {Promise<boolean>}
 */
export async function hasClass(page, selector, className) {
  const element = await page.locator(selector);
  const classes = await element.getAttribute('class');
  return classes ? classes.split(' ').includes(className) : false;
}

/**
 * Wait for element to have specific attribute value
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {string} attribute - Attribute name
 * @param {string} expectedValue - Expected attribute value
 * @param {Object} options - Wait options
 */
export async function waitForAttributeValue(page, selector, attribute, expectedValue, options = {}) {
  const { timeout = 5000 } = options;

  await waitForCondition(
    async () => {
      const value = await page.locator(selector).getAttribute(attribute);
      return value === expectedValue;
    },
    {
      timeout,
      timeoutMessage: `Element ${selector} attribute ${attribute} did not become ${expectedValue}`,
    }
  );
}

/**
 * Press key combination (e.g., 'Control+C', 'Meta+V')
 * @param {Page} page - Playwright page object
 * @param {string} keys - Key combination
 */
export async function pressKeys(page, keys) {
  const parts = keys.split('+');

  // Press modifier keys
  for (let i = 0; i < parts.length - 1; i++) {
    await page.keyboard.down(parts[i]);
  }

  // Press final key
  await page.keyboard.press(parts[parts.length - 1]);

  // Release modifier keys
  for (let i = parts.length - 2; i >= 0; i--) {
    await page.keyboard.up(parts[i]);
  }
}

/**
 * Get console messages during test execution
 * @param {Page} page - Playwright page object
 * @returns {Array} Array of console messages
 */
export function captureConsoleLogs(page) {
  const logs = [];

  page.on('console', (msg) => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString(),
    });
  });

  return logs;
}

/**
 * Get network errors during test execution
 * @param {Page} page - Playwright page object
 * @returns {Array} Array of failed requests
 */
export function captureNetworkErrors(page) {
  const errors = [];

  page.on('requestfailed', (request) => {
    errors.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure(),
      timestamp: new Date().toISOString(),
    });
  });

  return errors;
}

/**
 * Retry an action until it succeeds or max attempts reached
 * @param {Function} action - Async action to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of successful action
 */
export async function retryAction(action, options = {}) {
  const { maxAttempts = 3, delay = 1000, backoff = 2 } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= backoff;
      }
    }
  }

  throw new Error(`Action failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Generate unique test ID
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
export function generateTestId(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a test context with common setup
 * @param {Object} options - Context options
 * @returns {Object} Test context
 */
export function createTestContext(options = {}) {
  return {
    testId: generateTestId(options.prefix),
    startTime: Date.now(),
    screenshots: [],
    logs: [],
    errors: [],
    metadata: options.metadata || {},
  };
}

/**
 * Assert accessibility (basic checks)
 * @param {Page} page - Playwright page object
 * @param {Object} options - Accessibility options
 */
export async function assertAccessibility(page, options = {}) {
  const { checkContrast = false, checkAriaLabels = true } = options;

  const issues = [];

  // Check for missing alt text on images
  const imagesWithoutAlt = await page.locator('img:not([alt])').count();
  if (imagesWithoutAlt > 0) {
    issues.push(`${imagesWithoutAlt} images missing alt text`);
  }

  // Check for ARIA labels on interactive elements if requested
  if (checkAriaLabels) {
    const buttonsWithoutLabel = await page.locator('button:not([aria-label]):not([aria-labelledby])').count();
    if (buttonsWithoutLabel > 0) {
      issues.push(`${buttonsWithoutLabel} buttons missing aria-label`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Accessibility issues found:\n- ${issues.join('\n- ')}`);
  }
}
