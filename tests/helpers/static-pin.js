/**
 * Static-Pin Helper — Source-Slice Brace-Depth Walker
 *
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 *
 * Static-pin tests need to assert patterns inside a specific function body,
 * not file-wide. Comments and JSDoc may legitimately mention "forbidden"
 * patterns (e.g., reference docs that show the wrong approach), so a file-wide
 * regex produces false positives.
 *
 * sliceFunctionBody finds the named function and returns the substring from
 * `{` after the function signature through the matching `}`. Pure string-based
 * brace walking — no AST parser dependency.
 *
 * Per memory note (cadence-vocab discriminator SD): dual-anchor pattern —
 * whole-file regex for module-level declarations + scoped slice for in-function
 * usage. This helper handles the scoped-slice half.
 */

/**
 * Extract a function body slice by name using brace-depth walking.
 *
 * @param {string} source - Full source code
 * @param {string} fnName - Function or method name (e.g. 'revertSD')
 * @returns {string|null} Substring from opening `{` through matching `}`, or null if not found
 */
export function sliceFunctionBody(source, fnName) {
  // Match the declaration position, then walk through the parameter list to find
  // the function body brace. The naive "first { after declaration" approach
  // mismatches default-value braces like `options = {}` in the parameter list.
  const escName = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // function-statement form: matches just past the opening (
  const fnRe = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escName}\\s*\\(`, 'g');
  // arrow form: matches up through the `=> {`
  const arrowRe = new RegExp(
    `(?:export\\s+)?const\\s+${escName}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`,
    'g'
  );

  let i;
  const fnMatch = fnRe.exec(source);
  if (fnMatch) {
    // We're positioned just after the opening `(`. Walk through paren depth.
    i = fnMatch.index + fnMatch[0].length;
    let parenDepth = 1;
    while (i < source.length && parenDepth > 0) {
      const ch = source[i];
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      i++;
    }
    if (parenDepth !== 0) return null;
    // i is now just past the closing `)` — skip whitespace to the body `{`
    while (i < source.length && source[i] !== '{') i++;
    if (i >= source.length) return null;
  } else {
    const arrowMatch = arrowRe.exec(source);
    if (!arrowMatch) return null;
    // Arrow form already includes the body `{` in the match
    i = arrowMatch.index + arrowMatch[0].length - 1;
  }

  const start = i;
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Count occurrences of a regex match within a function body slice.
 *
 * @param {string} source - Full source code
 * @param {string} fnName - Function name to slice
 * @param {RegExp} pattern - Pattern to count (must have /g flag)
 * @returns {number}
 */
export function countMatchesInFunctionBody(source, fnName, pattern) {
  if (!pattern.flags.includes('g')) {
    throw new Error('countMatchesInFunctionBody requires a global regex (set the /g flag)');
  }
  const body = sliceFunctionBody(source, fnName);
  if (body == null) return 0;
  const matches = body.match(pattern);
  return matches ? matches.length : 0;
}
