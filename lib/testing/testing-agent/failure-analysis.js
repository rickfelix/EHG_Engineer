/**
 * Failure Analysis
 * Error analysis and fix recommendations
 */

/**
 * Analyze failure and determine root cause
 */
export async function analyzeFailure(page, error, target) {
  console.log(`\u{1F52C} Analyzing failure for ${target.name}...`);

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
    if (page) {
      analysis.domState = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          hasErrors: document.querySelectorAll('.error, .alert-danger, [data-error]').length > 0,
          missingElements: []
        };
      });

      if (target.selectors) {
        for (const selector of target.selectors) {
          try {
            const count = await page.locator(selector).count();
            if (count === 0) {
              analysis.domState.missingElements.push(selector);
            }
          } catch (_e) {
            analysis.domState.missingElements.push(`${selector} (invalid selector)`);
          }
        }
      }

      analysis.consoleErrors = await page.evaluate(() => {
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

    analysis.codeLocation = guessCodeLocation(target, analysis);

  } catch (analysisError) {
    console.warn(`\u26A0\uFE0F Could not complete full analysis: ${analysisError.message}`);
  }

  return analysis;
}

/**
 * Classify error type based on error message and context
 */
export function classifyErrorType(error) {
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
export function generateFixRecommendation(analysis, target) {
  console.log(`\u{1F4A1} Generating fix recommendation for ${target.name}...`);

  const recommendation = {
    summary: '',
    steps: [],
    codeExample: null,
    confidence: analysis.confidence,
    priority: 'medium',
    estimatedEffort: 'low',
    validation: null
  };

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
        recommendation.codeExample = generateElementAdditionExample(analysis.domState.missingElements[0]);
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
      recommendation.codeExample = generateInteractionFixExample();
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

  recommendation.validation = {
    command: `node lib/testing/testing-sub-agent.js --validate-fix ${target.name}`,
    description: 'Run this after applying fix to verify resolution'
  };

  if (analysis.codeLocation) {
    recommendation.steps.unshift(`Check file: ${analysis.codeLocation}`);
  }

  return recommendation;
}

/**
 * Guess likely code location based on target and error
 */
function guessCodeLocation(target, _analysis) {
  const componentName = target.name.replace(/\s+/g, '');
  const possiblePaths = [
    `/src/components/${componentName}.jsx`,
    `/src/components/${componentName}.tsx`,
    `/src/components/${componentName}/index.jsx`,
    `/src/pages/${componentName}.jsx`,
    `/lib/dashboard/client/${componentName}.js`
  ];
  return possiblePaths[0];
}

/**
 * Generate code example for adding missing element
 */
function generateElementAdditionExample(selector) {
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
  <div${className ? ` className="${className}"` : ''}${id ? ` id="${id}"` : ''}>
    {/* Add content here */}
  </div>
</div>`,
    description: `Add missing element with selector: ${selector}`
  };
}

/**
 * Generate code example for fixing interaction
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
