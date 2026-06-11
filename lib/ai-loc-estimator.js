/**
 * AI-Powered LOC Estimation
 * Uses pattern matching and heuristics to estimate lines of code for quick-fixes
 *
 * Enhancement #12 for QUICKFIX sub-agent
 * Created: 2025-11-17
 */

// QF-20260610-234: lexical signals of probable multi-root-cause coupling. A factually-
// singular bug report ("X fails") can mask several coupled defects (QF-20260609-493:
// filed as one root cause, shipped 152 LOC / 4 defects, needed --force-complete).
// Pure/synchronous — stays on the hot triage path, no LLM call.
const FAILURE_VERB_RE = /\b(fail(?:s|ed|ing)?|crash(?:es|ed)?|throw(?:s|n)?|hang(?:s)?|block(?:s|ed)?|time(?:s)?\s*out|reject(?:s|ed)?|miss(?:es|ing)?|broken|break(?:s)?|leak(?:s|ed)?|corrupt(?:s|ed)?|ignore(?:s|d)?|drop(?:s|ped)?|mismatch(?:es)?|stuck|silently|no-?op(?:s)?)\b/g;
const CONJOINED_RE = /\b(and also|as well as|plus|additionally|; also|, also)\b/;
const ENUMERATED_RE = /(?:^|\s)\(?\d+[.)]\s/g; // "1. " / "2) " style symptom lists
const FILE_REF_RE = /\b[\w./-]+\.(?:c|m)?[jt]sx?\b|\b[\w./-]+\.(?:sql|py|cjs|mjs|json)\b/g;
const FUNC_REF_RE = /\b\w+\(\)/g;
const COMPOUNDING_PHRASES = [
  'no json found', 'cascade', 'chained', 'which then', 'in turn',
  'downstream', 'root causes', 'coupled', 'compounding',
];

/**
 * QF-20260610-234 (FR-1): detect probable multi-defect coupling in symptom text.
 * Conservative: requires >=2 DISTINCT signal categories so a single keyword never
 * flags a genuinely singular typo/null-access/single-file fix.
 *
 * @param {Object} params - { title, description, type, file, consoleError }
 * @returns {{ likelyMultiDefect: boolean, signals: string[], suggestedLocFloor: number|null }}
 */
export function detectMultiDefectScope(params) {
  const none = { likelyMultiDefect: false, signals: [], suggestedLocFloor: null };
  if (!params || typeof params !== 'object') return none;
  const { title = '', description = '', consoleError = '', file = '' } = params;
  const combined = [title, description, consoleError]
    .filter(v => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (!combined.trim()) return none;

  const signals = [];
  const verbs = new Set((combined.match(FAILURE_VERB_RE) || []).map(v => v.replace(/(s|ed|ing|es|n|ped)$/, '')));
  if (verbs.size >= 2) signals.push(`multiple_failure_verbs(${verbs.size})`);
  if (CONJOINED_RE.test(combined) || (combined.match(ENUMERATED_RE) || []).length >= 2) {
    signals.push('conjoined_or_enumerated_symptoms');
  }
  const refs = new Set([
    ...(combined.match(FILE_REF_RE) || []),
    ...(typeof file === 'string' && file ? [file.toLowerCase()] : []),
    ...(combined.match(FUNC_REF_RE) || []),
  ]);
  if (refs.size >= 2) signals.push(`multiple_code_references(${refs.size})`);
  if (COMPOUNDING_PHRASES.some(p => combined.includes(p))) signals.push('compounding_error_phrase');

  const likelyMultiDefect = signals.length >= 2;
  return {
    likelyMultiDefect,
    signals,
    // Floor lands the estimate in Tier 2 (31-75) so a would-be Tier-1 auto-approve
    // gets a second look; never enough to force Tier 3 on its own (advisory only).
    suggestedLocFloor: likelyMultiDefect ? 40 : null,
  };
}

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

  // Pattern 7 (QF-20260610-234): multi-defect scope-discovery soft floor. The
  // first-match break (Pattern 1) sizes off ONE error pattern, so a singular-sounding
  // report masking coupled defects under-estimates. The floor only ever RAISES the
  // estimate (Math.max — FR-3) and adds a reasoning line; it never lowers or replaces.
  const scope = detectMultiDefectScope(params);
  if (scope.likelyMultiDefect && scope.suggestedLocFloor > estimatedLoc) {
    estimatedLoc = scope.suggestedLocFloor;
    confidence = Math.max(confidence - 15, 40);
    reasoning.push(`Scope-discovery: probable multi-defect coupling (${scope.signals.join(', ')}) — floored estimate at ${scope.suggestedLocFloor} LOC; consider re-estimating / full SD`);
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
 * @deprecated Use routeWorkItem() from lib/utils/work-item-router.js for tier-based routing.
 * This function uses a hardcoded 50 LOC threshold. The router uses DB-driven 30/75 thresholds.
 * Retained for backward compatibility with the QUICKFIX sub-agent.
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
