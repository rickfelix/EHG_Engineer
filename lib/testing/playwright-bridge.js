#!/usr/bin/env node

/**
 * Playwright Bridge for Vision QA
 * Translates AI decisions into Playwright actions
 */

class PlaywrightBridge {
  constructor(config = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || 10000,
      selectorStrategy: config.selectorStrategy || 'smart', // 'strict', 'smart', 'fuzzy'
      waitForNavigation: config.waitForNavigation !== false,
      scrollBehavior: config.scrollBehavior || 'smooth',
      ...config
    };

    // Action type mappings
    this.actionTypes = {
      click: this.handleClick.bind(this),
      type: this.handleType.bind(this),
      scroll: this.handleScroll.bind(this),
      navigate: this.handleNavigate.bind(this),
      wait: this.handleWait.bind(this),
      hover: this.handleHover.bind(this),
      select: this.handleSelect.bind(this),
      upload: this.handleUpload.bind(this),
      press: this.handlePress.bind(this),
      screenshot: this.handleScreenshot.bind(this)
    };
  }

  /**
   * Translate AI decision to Playwright action
   */
  async translateToPlaywright(aiAction, page) {
    try {
      // Validate action type
      if (!this.actionTypes[aiAction.type]) {
        throw new Error(`Unknown action type: ${aiAction.type}`);
      }

      // Build Playwright-compatible action
      const playwrightAction = {
        type: aiAction.type,
        selector: await this.resolveSelector(aiAction.selector, page),
        value: aiAction.value,
        description: aiAction.description || `${aiAction.type} action`,
        options: this.buildActionOptions(aiAction)
      };

      return playwrightAction;

    } catch (error) {
      console.error('Translation failed:', error);
      throw error;
    }
  }

  /**
   * Execute Playwright action
   */
  async executeAction(page, action) {
    const startTime = Date.now();
    
    try {
      // Get handler for action type
      const handler = this.actionTypes[action.type];
      if (!handler) {
        throw new Error(`No handler for action type: ${action.type}`);
      }

      // Execute with retry logic
      const result = await this.executeWithRetry(
        () => handler(page, action),
        3
      );

      return {
        success: true,
        duration: Date.now() - startTime,
        ...result
      };

    } catch (error) {
      console.error(`Action failed: ${action.description}`, error);
      
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Handle click action
   */
  async handleClick(page, action) {
    console.log(`🖱️  Clicking: ${action.selector}`);
    
    // Try different strategies
    try {
      // First try exact selector
      await page.click(action.selector, {
        timeout: this.config.defaultTimeout,
        ...action.options
      });
      
      return { clicked: true, selector: action.selector };
      
    } catch (error) {
      // Fallback to text-based selection
      if (action.selector.includes('text=') || action.description) {
        const textToFind = action.description || action.selector.replace('text=', '');
        
        try {
          await page.getByText(textToFind, { exact: false }).first().click({
            timeout: this.config.defaultTimeout
          });
          
          return { clicked: true, method: 'text', text: textToFind };
          
        } catch (textError) {
          // Try role-based selection
          const role = this.guessRole(action.description);
          if (role) {
            await page.getByRole(role, { name: textToFind }).click();
            return { clicked: true, method: 'role', role };
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * Handle type/input action
   */
  async handleType(page, action) {
    console.log(`⌨️  Typing: "${action.value}" into ${action.selector}`);
    
    try {
      // Clear existing value if needed
      if (action.options?.clear) {
        await page.fill(action.selector, '');
      }
      
      // Type the value
      await page.type(action.selector, action.value, {
        delay: action.options?.delay || 50,
        timeout: this.config.defaultTimeout
      });
      
      return { typed: true, value: action.value };
      
    } catch (error) {
      // Try alternative input methods
      const input = await this.findInputByLabel(page, action.description);
      if (input) {
        await input.type(action.value);
        return { typed: true, method: 'label' };
      }
      
      throw error;
    }
  }

  /**
   * Handle scroll action
   */
  async handleScroll(page, action) {
    console.log(`📜 Scrolling: ${action.value || 'page'}`);
    
    const scrollOptions = {
      behavior: this.config.scrollBehavior
    };
    
    // Determine scroll target
    if (action.value === 'bottom') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else if (action.value === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (action.selector) {
      // Scroll to element
      await page.locator(action.selector).scrollIntoViewIfNeeded();
    } else {
      // Default scroll down
      await page.evaluate(() => window.scrollBy(0, 500));
    }
    
    // Wait for any lazy-loaded content
    await page.waitForTimeout(500);
    
    return { scrolled: true, target: action.value || 'default' };
  }

  /**
   * Handle navigation
   */
  async handleNavigate(page, action) {
    console.log(`🌐 Navigating to: ${action.value}`);
    
    await page.goto(action.value, {
      waitUntil: 'networkidle',
      timeout: this.config.defaultTimeout * 2
    });
    
    return { navigated: true, url: action.value };
  }

  /**
   * Handle wait action
   */
  async handleWait(page, action) {
    const duration = action.value || 1000;
    console.log(`⏱️  Waiting: ${duration}ms`);
    
    await page.waitForTimeout(duration);
    
    return { waited: true, duration };
  }

  /**
   * Handle hover action
   */
  async handleHover(page, action) {
    console.log(`👆 Hovering: ${action.selector}`);
    
    await page.hover(action.selector, {
      timeout: this.config.defaultTimeout
    });
    
    // Wait for any tooltips or dropdowns
    await page.waitForTimeout(300);
    
    return { hovered: true };
  }

  /**
   * Handle select/dropdown action
   */
  async handleSelect(page, action) {
    console.log(`📝 Selecting: ${action.value} from ${action.selector}`);
    
    await page.selectOption(action.selector, action.value, {
      timeout: this.config.defaultTimeout
    });
    
    return { selected: true, value: action.value };
  }

  /**
   * Handle file upload
   */
  async handleUpload(page, action) {
    console.log(`📎 Uploading: ${action.value}`);
    
    const fileInput = await page.locator(action.selector);
    await fileInput.setInputFiles(action.value);
    
    return { uploaded: true, file: action.value };
  }

  /**
   * Handle keyboard press
   */
  async handlePress(page, action) {
    console.log(`⌨️  Pressing key: ${action.value}`);
    
    await page.keyboard.press(action.value);
    
    return { pressed: true, key: action.value };
  }

  /**
   * Handle screenshot
   */
  async handleScreenshot(page, action) {
    console.log('📸 Taking screenshot');
    
    const screenshot = await page.screenshot({
      fullPage: action.options?.fullPage || false,
      path: action.value // Optional save path
    });
    
    return { screenshot: true, size: screenshot.length };
  }

  /**
   * Resolve selector using multiple strategies
   */
  async resolveSelector(selector, page) {
    // If already a valid selector, return it
    if (this.isValidSelector(selector)) {
      return selector;
    }

    // Try smart resolution
    if (this.config.selectorStrategy === 'smart') {
      // Try to find by aria-label
      const ariaSelector = `[aria-label*="${selector}"]`;
      const ariaElements = await page.$$(ariaSelector);
      if (ariaElements.length === 1) {
        return ariaSelector;
      }

      // Try by placeholder
      const placeholderSelector = `[placeholder*="${selector}"]`;
      const placeholderElements = await page.$$(placeholderSelector);
      if (placeholderElements.length === 1) {
        return placeholderSelector;
      }

      // Try by text content
      return `text="${selector}"`;
    }

    return selector;
  }

  /**
   * Build action options
   */
  buildActionOptions(action) {
    const options = {
      timeout: this.config.defaultTimeout
    };

    // Add action-specific options
    if (action.type === 'click') {
      options.button = action.button || 'left';
      options.clickCount = action.clickCount || 1;
      options.delay = action.delay || 0;
    }

    if (action.type === 'type') {
      options.delay = action.delay || 50;
    }

    return { ...options, ...action.options };
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(fn, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`Retry ${i + 1}/${maxRetries} after error:`, error.message);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    
    throw lastError;
  }

  /**
   * Check if selector is valid
   */
  isValidSelector(selector) {
    if (!selector || typeof selector !== 'string') {
      return false;
    }
    
    // Check for common selector patterns
    const patterns = [
      /^#[\w-]+$/,              // ID selector
      /^\.[\w-]+$/,             // Class selector
      /^\[[\w-]+.*\]$/,         // Attribute selector
      /^[\w-]+$/,               // Tag selector
      /^text=/,                 // Playwright text selector
      /^\/\//,                  // XPath
    ];
    
    return patterns.some(pattern => pattern.test(selector));
  }

  /**
   * Guess element role from description
   */
  guessRole(description) {
    if (!description) return null;
    
    const roleMap = {
      button: /button|click|submit|cancel|close/i,
      link: /link|navigate|go to|open/i,
      textbox: /input|type|enter|fill|search/i,
      checkbox: /check|toggle|select|option/i,
      combobox: /dropdown|select|choose/i,
      tab: /tab|switch/i
    };
    
    for (const [role, pattern] of Object.entries(roleMap)) {
      if (pattern.test(description)) {
        return role;
      }
    }
    
    return null;
  }

  /**
   * Find input by label
   */
  async findInputByLabel(page, labelText) {
    if (!labelText) return null;
    
    try {
      // Try to find label element
      const label = await page.getByText(labelText, { exact: false }).first();
      
      // Get associated input
      const forAttribute = await label.getAttribute('for');
      if (forAttribute) {
        return page.locator(`#${forAttribute}`);
      }
      
      // Try finding input near label
      return label.locator('xpath=following-sibling::input[1]');
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Get element info for debugging
   */
  async getElementInfo(page, selector) {
    try {
      const element = await page.$(selector);
      if (!element) {
        return { found: false };
      }
      
      const boundingBox = await element.boundingBox();
      const isVisible = await element.isVisible();
      const isEnabled = await element.isEnabled();
      const tagName = await element.evaluate(el => el.tagName);
      const text = await element.textContent();
      
      return {
        found: true,
        visible: isVisible,
        enabled: isEnabled,
        tagName,
        text: text?.substring(0, 100),
        position: boundingBox
      };
      
    } catch (error) {
      return { found: false, error: error.message };
    }
  }
}

module.exports = PlaywrightBridge;