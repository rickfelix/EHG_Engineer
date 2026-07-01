/**
 * Shared hardened AST parse helper — Blast-Radius Consumer Analysis
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Parser configuration is hardcoded here rather than resolved from the
 * repo's own build/lint config files: config resolution can execute
 * arbitrary code, unlike @babel/parser's static tokenizer (SECURITY finding,
 * agentId a997e58734a1fe858). Analyzed files and their configs are only ever
 * read as plain text, never dynamically loaded or executed.
 */

import * as parser from '@babel/parser';

/** Per-file byte cap: skip minified/generated/oversized files (DoS hardening). */
export const MAX_ANALYZABLE_BYTES = 2 * 1024 * 1024;

/**
 * Parse JS/TS source into a Babel AST using a fixed, hardcoded plugin set.
 *
 * @param {string} content - File source text
 * @param {string} filePath - Path (only used to decide JSX/TS plugin flags)
 * @returns {Object} Babel File AST node
 */
export function parseSource(content, filePath) {
  const isTypeScript = /\.tsx?$/.test(filePath);
  return parser.parse(content, {
    sourceType: 'module',
    plugins: [
      'jsx',
      isTypeScript && 'typescript',
      'classProperties',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator',
    ].filter(Boolean),
  });
}
