#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Failure Analysis Module
 * Handles failure analysis and fix recommendation generation
 */

import path from 'path';

/**
 * Error type classifications
 */
const ERROR_TYPES = {
  TIMEOUT: 'TIMEOUT',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  INTERACTION_FAILED: 'INTERACTION_FAILED',
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SCRIPT_ERROR: 'SCRIPT_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Analyze failure and determine root cause
 * @param {Error} error - The error that occurred
 * @param {object} target - Test target configuration
 * @param {object} page - Playwright page object
 * @returns {Promise<object>}
 */
async function analyzeFailure(error, target, page) {
  console.log(`Analyzing failure for ${target.name}...`);

  const analysis = {
    errorType: classifyErrorType(error),
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
    if (page) {
      analysis.domState = await captureDomState(page, target);
      analysis.consoleErrors = await captureConsoleErrors(page);
    }

    // Determine root cause based on error type
    const rootCauseResult = determineRootCause(error, analysis);
    analysis.rootCause = rootCauseResult.rootCause;
    analysis.confidence = rootCauseResult.confidence;

    // Try to identify code location (approximate)
    analysis.codeLocation = guessCodeLocation(target, analysis);

  } catch (analysisError) {
    console.warn(`Could not complete full analysis: ${analysisError.message}`);
  }

  return analysis;
}

/**
 * Classify error type based on error message and context
 * @param {Error} error - The error that occurred
 * @returns {string}
 */
function classifyErrorType(error) {
  const message = error.message.toLowerCase();

  if (message.includes('timeout')) {
    return ERROR_TYPES.TIMEOUT;
  }
  if (message.includes('not found') || message.includes('no element')) {
    return ERROR_TYPES.ELEMENT_NOT_FOUND;
  }
  if (message.includes('click')) {
    return ERROR_TYPES.INTERACTION_FAILED;
  }
  if (message.includes('navigation') || message.includes('navigate')) {
    return ERROR_TYPES.NAVIGATION_ERROR;
  }
  if (message.includes('network') || message.includes('fetch')) {
    return ERROR_TYPES.NETWORK_ERROR;
  }
  if (message.includes('script') || message.includes('javascript')) {
    return ERROR_TYPES.SCRIPT_ERROR;
  }

  return ERROR_TYPES.UNKNOWN_ERROR;
}

/**
 * Capture DOM state for debugging
 * @param {object} page - Playwright page object
 * @param {object} target - Test target configuration
 * @returns {Promise<object>}
 */
async function captureDomState(page, target) {
  const domState = await page.evaluate(() => {
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
        const count = await page.locator(selector).count();
        if (count === 0) {
          domState.missingElements.push(selector);
        }
      } catch (_e) {
        domState.missingElements.push(`${selector} (invalid selector)`);
      }
    }
  }

  return domState;
}

/**
 * Capture console errors from the page
 * @param {object} page - Playwright page object
 * @returns {Promise<Array>}
 */
async function captureConsoleErrors(page) {
  return page.evaluate(() => {
    return window.__capturedErrors || [];
  });
}

/**
 * Determine root cause based on error type and analysis
 * @param {Error} error - The error that occurred
 * @param {object} analysis - Current analysis object
 * @returns {object}
 */
function determineRootCause(error, analysis) {
  if (error.message.includes('Timeout')) {
    return {
      rootCause: 'Element or page took too long to load',
      confidence: 85
    };
  }

  if (error.message.includes('not found') || error.message.includes('no element')) {
    const missingElement = analysis.domState?.missingElements?.[0] || 'unknown';
    return {
      rootCause: `Missing UI element: ${missingElement}`,
      confidence: 90
    };
  }

  if (error.message.includes('click')) {
    return {
      rootCause: 'Element exists but is not clickable (may be hidden or disabled)',
      confidence: 75
    };
  }

  if (error.message.includes('navigation')) {
    return {
      rootCause: 'Page navigation failed or redirected unexpectedly',
      confidence: 70
    };
  }

  return {
    rootCause: 'Unknown error - manual investigation required',
    confidence: 30
  };
}

/**
 * Guess likely code location based on target and error
 * @param {object} target - Test target configuration
 * @param {object} analysis - Current analysis object
 * @returns {string}
 */
function guessCodeLocation(target, analysis) {
  const componentName = target.name.replace(/\s+/g, '');
  const possiblePaths = [
    `/src/components/${componentName}.jsx`,
    `/src/components/${componentName}.tsx`,
    `/src/components/${componentName}/index.jsx`,
    `/src/pages/${componentName}.jsx`,
    `/lib/dashboard/client/${componentName}.js`
  ];

  // Return most likely path based on error type
  return possiblePaths[0];
}

/**
 * Generate actionable fix recommendation based on failure analysis
 * @param {object} analysis - Failure analysis object
 * @param {object} target - Test target configuration
 * @returns {Promise<object>}
 */
async function generateFixRecommendation(_analysis, target) {
  console.log(`Generating fix recommendation for ${target.name}...`);

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
    case ERROR_TYPES.ELEMENT_NOT_FOUND:
      if (analysis.domState?.missingElements?.length > 0) {
        recommendation.summary = `Add missing UI element: ${analysis.domState.missingElements[0]}`;
        recommendation.steps = [
          `Open the component file for ${target.name}`,
          `Add element with selector: ${analysis.domState.missingElements[0]}`,
          'Ensure element is visible and properly rendered',
          'Verify parent component includes this component'
        ];
        recommendation.codeExample = generateElementAdditionExample(analysis.domState.missingElements[0]);
        recommendation.priority = 'high';
      }
      break;

    case ERROR_TYPES.TIMEOUT:
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

    case ERROR_TYPES.INTERACTION_FAILED:
      recommendation.summary = 'Fix element interactivity';
      recommendation.steps = [
        'Verify element is not disabled or hidden',
        'Check z-index and overlapping elements',
        'Ensure event handlers are properly attached',
        'Verify element is within viewport'
      ];
      recommendation.codeExample = generateInteractionFixExample();
      recommendation.priority = 'high';
      break;

    case ERROR_TYPES.NAVIGATION_ERROR:
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
 * Generate code example for adding missing element
 * @param {string} selector - The selector for the missing element
 * @returns {object}
 */
function generateElementAdditionExample(selector) {
  let elementType = 'div';
  let className = '';
  let id = '';

  if (selector.startsWith('.')) {
    className = selector.substring(1);
  } else if (selector.startsWith('#')) {
    id = selector.substring(1);
  } else if (selector.includes('[data-testid')) {
    const match = selector.match(/data-testid.*?=.*?"(.*?)"/);
    if (match) {
      id = match[1];
    }
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
 * @returns {object}
 */
function generateInteractionFixExample() {
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
 * Capture error state for debugging
 * @param {object} page - Playwright page object
 * @param {string} context - Error context description
 * @param {string} _errorMessage - Error message (unused but kept for API compatibility)
 * @param {object} config - Configuration options
 * @param {object} testResults - Results accumulator
 * @returns {Promise<void>}
 */
async function captureErrorState(page, context, _errorMessage, config, testResults) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorScreenshot = `error-${context}-${timestamp}.png`;

    await page.screenshot({
      path: path.join(config.screenshotDir, errorScreenshot),
      fullPage: true
    });

    testResults.screenshots.push(errorScreenshot);

    console.log(`Error state captured: ${errorScreenshot}`);
  } catch (error) {
    console.log('Could not capture error state:', error.message);
  }
}

export {
  analyzeFailure,
  classifyErrorType,
  generateFixRecommendation,
  generateElementAdditionExample,
  generateInteractionFixExample,
  captureErrorState,
  guessCodeLocation,
  captureDomState,
  captureConsoleErrors,
  determineRootCause,
  ERROR_TYPES
};
