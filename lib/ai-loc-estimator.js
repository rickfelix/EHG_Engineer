/**
 * AI-Powered LOC Estimation
 * Uses pattern matching and heuristics to estimate lines of code for quick-fixes
 *
 * Enhancement #12 for QUICKFIX sub-agent
 * Created: 2025-11-17
 */

/**
 * Estimate LOC based on issue description, error type, and context
 * @param {Object} params - Estimation parameters
 * @returns {Object} { estimatedLoc: number, confidence: number (0-100), reasoning: string }
 */
export function estimateLOC(params) {
  const {
    description = '',
    title = '',
    errorType = '',
    file = '',
    consoleError = '',
    type = 'bug'
  } = params;

  const combined = `${title} ${description} ${errorType} ${consoleError}`.toLowerCase();

  let estimatedLoc = 10; // Default
  let confidence = 50; // Default confidence
  let reasoning = [];

  // Pattern 1: Error-based estimation
  const errorPatterns = [
    { pattern: /undefined|null|cannot read property/i, loc: 3, confidence: 85, reason: 'Missing variable/property - typically 1-5 LOC' },
    { pattern: /typo|spelling|text change/i, loc: 1, confidence: 95, reason: 'Text change - single line' },
    { pattern: /onclick|onchange|event handler/i, loc: 5, confidence: 80, reason: 'Event handler addition - 3-7 LOC' },
    { pattern: /import|export/i, loc: 2, confidence: 90, reason: 'Import/export statement - 1-3 LOC' },
    { pattern: /css|style|tailwind|className/i, loc: 8, confidence: 75, reason: 'Styling change - 5-15 LOC' },
    { pattern: /link|href|navigation|route/i, loc: 4, confidence: 80, reason: 'Link/route fix - 2-6 LOC' },
    { pattern: /validation|regex|pattern/i, loc: 12, confidence: 70, reason: 'Validation logic - 8-15 LOC' },
    { pattern: /conditional|if statement/i, loc: 8, confidence: 75, reason: 'Conditional logic - 5-12 LOC' },
    { pattern: /api call|fetch|axios/i, loc: 15, confidence: 65, reason: 'API integration - 10-20 LOC' },
    { pattern: /state|useState|setState/i, loc: 10, confidence: 70, reason: 'State management - 7-15 LOC' }
  ];

  for (const { pattern, loc, confidence: patternConfidence, reason } of errorPatterns) {
    if (pattern.test(combined)) {
      estimatedLoc = loc;
      confidence = patternConfidence;
      reasoning.push(reason);
      break; // Use first match
    }
  }

  // Pattern 2: Type-based adjustment
  if (type === 'typo' || type === 'documentation') {
    estimatedLoc = Math.min(estimatedLoc, 3);
    confidence = Math.max(confidence, 90);
    reasoning.push('Documentation/typo changes are typically minimal');
  }

  // Pattern 3: File type adjustment
  if (file) {
    if (file.endsWith('.md') || file.endsWith('.txt')) {
      estimatedLoc = Math.min(estimatedLoc, 5);
      confidence = 95;
      reasoning.push('Documentation file - minimal code changes');
    } else if (file.endsWith('.sql')) {
      estimatedLoc = Math.max(estimatedLoc, 20);
      confidence = 60;
      reasoning.push('SQL file - likely requires schema review (escalate if >50 LOC)');
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      // React components tend to be verbose
      estimatedLoc = Math.round(estimatedLoc * 1.2);
      reasoning.push('React component - slightly higher LOC estimate');
    }
  }

  // Pattern 4: Complexity keywords (increase estimate)
  const complexityKeywords = [
    { keyword: 'refactor', multiplier: 2.5, reason: 'Refactoring typically requires more changes' },
    { keyword: 'multiple', multiplier: 2.0, reason: 'Multiple changes indicated' },
    { keyword: 'complex', multiplier: 1.8, reason: 'Complexity flag detected' },
    { keyword: 'several', multiplier: 1.7, reason: 'Several items mentioned' },
    { keyword: 'across', multiplier: 2.2, reason: 'Cross-cutting concern detected' },
    { keyword: 'entire', multiplier: 3.0, reason: 'Entire component/file mentioned - likely >50 LOC' }
  ];

  for (const { keyword, multiplier, reason } of complexityKeywords) {
    if (combined.includes(keyword)) {
      estimatedLoc = Math.round(estimatedLoc * multiplier);
      confidence = Math.max(confidence - 20, 40); // Reduce confidence
      reasoning.push(reason);
      break;
    }
  }

  // Pattern 5: Simplicity keywords (decrease estimate)
  const simplicityKeywords = [
    { keyword: 'just', multiplier: 0.7, reason: 'Simplicity indicator - "just" implies minimal change' },
    { keyword: 'only', multiplier: 0.7, reason: 'Simplicity indicator - "only" implies minimal change' },
    { keyword: 'quick', multiplier: 0.8, reason: 'Quick fix indicator' },
    { keyword: 'simple', multiplier: 0.7, reason: 'Simple change indicated' },
    { keyword: 'small', multiplier: 0.7, reason: 'Small change indicated' }
  ];

  for (const { keyword, multiplier, reason } of simplicityKeywords) {
    if (combined.includes(keyword)) {
      estimatedLoc = Math.round(estimatedLoc * multiplier);
      confidence = Math.min(confidence + 10, 95); // Increase confidence
      reasoning.push(reason);
      break; // Only apply one simplicity modifier
    }
  }

  // Pattern 6: Stack trace analysis (high confidence)
  if (consoleError && consoleError.includes('at ') && consoleError.includes(':')) {
    // Has line number in stack trace
    confidence = Math.max(confidence, 85);
    reasoning.push('Stack trace with line number provided - high confidence');
  }

  // Cap at reasonable values
  estimatedLoc = Math.max(1, Math.min(estimatedLoc, 100)); // 1-100 range
  confidence = Math.max(40, Math.min(confidence, 95)); // 40-95% range

  // Final reasoning
  if (reasoning.length === 0) {
    reasoning.push('Default estimation based on typical quick-fix patterns');
  }

  return {
    estimatedLoc,
    confidence,
    reasoning: reasoning.join('; ')
  };
}

/**
 * Determine if estimated LOC suggests escalation
 * @param {number} estimatedLoc - Estimated lines of code
 * @param {number} confidence - Confidence level (0-100)
 * @returns {Object} { shouldEscalate: boolean, reason: string }
 */
export function shouldEscalateByLOC(estimatedLoc, confidence) {
  // Hard threshold: >50 LOC
  if (estimatedLoc > 50) {
    return {
      shouldEscalate: true,
      reason: `Estimated LOC (${estimatedLoc}) exceeds quick-fix threshold (50)`
    };
  }

  // Soft threshold: 40-50 LOC with low confidence
  if (estimatedLoc >= 40 && confidence < 70) {
    return {
      shouldEscalate: true,
      reason: `Estimated LOC (${estimatedLoc}) near threshold with low confidence (${confidence}%) - safer to use full SD`
    };
  }

  // Very low confidence
  if (confidence < 50 && estimatedLoc > 20) {
    return {
      shouldEscalate: true,
      reason: `Low confidence (${confidence}%) on non-trivial change (${estimatedLoc} LOC) - recommend full SD for proper scoping`
    };
  }

  return {
    shouldEscalate: false,
    reason: `Estimated LOC (${estimatedLoc}) within quick-fix range with ${confidence}% confidence`
  };
}

/**
 * Extract file path and line number from console error
 * @param {string} consoleError - Console error message
 * @returns {Object} { file: string|null, line: number|null }
 */
export function extractFileInfo(consoleError) {
  if (!consoleError) return { file: null, line: null };

  // Pattern: "at ComponentName (file.tsx:45:12)"
  const stackTracePattern = /at .+? \((.+?):(\d+):\d+\)/;
  const match = consoleError.match(stackTracePattern);

  if (match) {
    return {
      file: match[1],
      line: parseInt(match[2])
    };
  }

  // Pattern: "file.tsx:45:12"
  const simplePattern = /([^\s]+?\.(tsx?|jsx?|js)):(\d+)/;
  const simpleMatch = consoleError.match(simplePattern);

  if (simpleMatch) {
    return {
      file: simpleMatch[1],
      line: parseInt(simpleMatch[3])
    };
  }

  return { file: null, line: null };
}
