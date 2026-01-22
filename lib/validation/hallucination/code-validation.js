/**
 * Hallucination Detection - Code Syntax Validation
 * L3 validation using acorn parser
 */

import { parse as acornParse } from 'acorn';

/**
 * Validate code snippet syntax using acorn parser
 */
export function validateCodeSyntax(code, language = 'javascript') {
  // Only validate JavaScript/TypeScript
  if (!['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(language)) {
    return { valid: true, skipped: true, reason: 'unsupported_language' };
  }

  try {
    // Try parsing as module first (supports import/export)
    acornParse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    });
    return { valid: true };
  } catch (moduleError) {
    try {
      // Try as script (no import/export)
      acornParse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true
      });
      return { valid: true };
    } catch (_scriptError) {
      // Check if it's a partial snippet
      if (isValidPartialCode(code)) {
        return { valid: true, partial: true };
      }

      return {
        valid: false,
        error: moduleError.message,
        location: {
          line: moduleError.loc?.line,
          column: moduleError.loc?.column
        }
      };
    }
  }
}

/**
 * Check if code is a valid partial snippet
 */
export function isValidPartialCode(code) {
  const validPartialPatterns = [
    /^\s*\{[\s\S]*\}\s*$/,    // Object literals
    /^\s*\[[\s\S]*\]\s*$/,    // Array literals
    /^\s*\.\w+\(/,            // Method chains
    /^\s*=>\s*\{?/,           // Arrow function body
    /^\s*\w+\s*:\s*/,         // Property definitions
    /^\s*<[\w.]+/             // JSX fragments
  ];

  return validPartialPatterns.some(pattern => pattern.test(code));
}
