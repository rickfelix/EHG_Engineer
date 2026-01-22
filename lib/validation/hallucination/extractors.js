/**
 * Hallucination Detection - Reference Extractors
 * Extract file, symbol, table, and code references from output
 */

import { REFERENCE_PATTERNS, isCommonWord, isSqlKeyword } from './constants.js';

/**
 * Extract file references from sub-agent output
 */
export function extractFileReferences(output) {
  const files = new Set();
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let match;
  const pathRegex = new RegExp(REFERENCE_PATTERNS.filePath.source, 'gi');
  while ((match = pathRegex.exec(outputStr)) !== null) {
    const filePath = match[1].trim();
    if (!filePath.startsWith('.git') &&
        !filePath.includes('node_modules') &&
        filePath.length > 3) {
      files.add(filePath);
    }
  }

  const lineRefRegex = new RegExp(REFERENCE_PATTERNS.fileLineRef.source, 'gi');
  while ((match = lineRefRegex.exec(outputStr)) !== null) {
    files.add(match[1]);
  }

  return Array.from(files);
}

/**
 * Extract symbol references from sub-agent output
 */
export function extractSymbolReferences(output) {
  const symbols = new Map();
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let match;

  const backtickRegex = new RegExp(REFERENCE_PATTERNS.backtickSymbol.source, 'gi');
  while ((match = backtickRegex.exec(outputStr)) !== null) {
    const symbol = match[1];
    if (!isCommonWord(symbol) && symbol.length > 1) {
      symbols.set(symbol, { source: 'backtick', context: getContext(outputStr, match.index) });
    }
  }

  const importRegex = new RegExp(REFERENCE_PATTERNS.importStmt.source, 'gi');
  while ((match = importRegex.exec(outputStr)) !== null) {
    const importedSymbols = match[1].split(',').map(s => s.trim());
    const fromModule = match[2];
    importedSymbols.forEach(sym => {
      if (sym && !isCommonWord(sym)) {
        symbols.set(sym, { source: 'import', module: fromModule });
      }
    });
  }

  return symbols;
}

/**
 * Extract database table references from sub-agent output
 */
export function extractTableReferences(output) {
  const tables = new Set();
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let match;
  const tableRegex = new RegExp(REFERENCE_PATTERNS.tableName.source, 'gi');
  while ((match = tableRegex.exec(outputStr)) !== null) {
    const tableName = match[1].toLowerCase();
    if (!isSqlKeyword(tableName) && tableName.length > 2) {
      tables.add(tableName);
    }
  }

  return Array.from(tables);
}

/**
 * Extract code snippets from sub-agent output
 */
export function extractCodeSnippets(output) {
  const snippets = [];
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Match fenced code blocks: ```language\ncode\n```
  const fencedRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fencedRegex.exec(outputStr)) !== null) {
    const language = match[1] || 'javascript';
    const code = match[2].trim();
    if (code.length > 10) {
      snippets.push({
        code,
        language: language.toLowerCase(),
        context: 'fenced_block',
        startIndex: match.index
      });
    }
  }

  // Match multi-line inline code
  const inlineRegex = /`([^`]{20,})`/g;
  while ((match = inlineRegex.exec(outputStr)) !== null) {
    const code = match[1].trim();
    if (looksLikeCode(code)) {
      snippets.push({
        code,
        language: 'javascript',
        context: 'inline',
        startIndex: match.index
      });
    }
  }

  return snippets;
}

/**
 * Check if a string looks like code
 */
export function looksLikeCode(str) {
  const codePatterns = [
    /\bfunction\b/,
    /\bconst\b/,
    /\blet\b/,
    /\bvar\b/,
    /\bclass\b/,
    /\bimport\b/,
    /\bexport\b/,
    /\breturn\b/,
    /\bif\s*\(/,
    /\bfor\s*\(/,
    /\bwhile\s*\(/,
    /=>/,
    /\(\s*\)\s*{/,
    /\.\w+\(/
  ];

  return codePatterns.some(pattern => pattern.test(str));
}

/**
 * Get surrounding context for a match
 */
export function getContext(str, index, radius = 50) {
  const start = Math.max(0, index - radius);
  const end = Math.min(str.length, index + radius);
  return str.substring(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Prepare sub-agent output for analysis
 */
export function prepareOutputForAnalysis(output) {
  if (typeof output === 'string') {
    return output;
  }

  const fieldsToAnalyze = [
    'message', 'summary', 'recommendations', 'critical_issues',
    'warnings', 'detailed_analysis', 'findings'
  ];

  const parts = [];
  for (const field of fieldsToAnalyze) {
    if (output[field]) {
      if (Array.isArray(output[field])) {
        parts.push(output[field].join('\n'));
      } else if (typeof output[field] === 'object') {
        parts.push(JSON.stringify(output[field]));
      } else {
        parts.push(String(output[field]));
      }
    }
  }

  return parts.join('\n');
}
