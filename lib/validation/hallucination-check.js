/**
 * LEO v4.4 Hallucination Detection Module
 *
 * Validates sub-agent output for hallucinations by checking:
 * - L1: File existence (referenced files must exist)
 * - L2: Symbol existence (referenced functions/classes must exist in files)
 * - L3: Signature match (future: function signatures match expectations)
 *
 * Part of LEO Protocol v4.4 - Sub-Agent Output Validation
 *
 * Usage:
 * ```javascript
 * import { validateSubAgentOutput, HallucinationLevel } from './validation/hallucination-check.js';
 *
 * const validation = await validateSubAgentOutput(subAgentResults, {
 *   baseDir: process.cwd(),
 *   levels: [HallucinationLevel.L1, HallucinationLevel.L2]
 * });
 *
 * if (!validation.passed) {
 *   console.log('Hallucinations detected:', validation.issues);
 * }
 * ```
 *
 * @module hallucination-check
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hallucination detection levels
 */
export const HallucinationLevel = {
  L1: 'file_exists',      // File path references exist
  L2: 'symbol_exists',    // Function/class symbols exist in referenced files
  L3: 'signature_match'   // Function signatures match (future)
};

/**
 * Regular expressions for extracting references from sub-agent output
 */
const REFERENCE_PATTERNS = {
  // File paths with common extensions
  filePath: /(?:^|\s|["'`])([./]?(?:[\w-]+\/)*[\w.-]+\.(?:js|ts|jsx|tsx|json|sql|md|yaml|yml|css|scss|html|sh|py|rb))(?:["'`]|\s|$|:)/gi,

  // File:line references like "src/foo.js:123"
  fileLineRef: /([./]?(?:[\w-]+\/)*[\w.-]+\.(?:js|ts|jsx|tsx)):(\d+)/gi,

  // Function calls like "function foo(" or "const foo = ("
  functionDef: /(?:function|const|let|var|async function)\s+(\w+)\s*(?:=\s*)?\(/g,

  // Class definitions
  classDef: /class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g,

  // Export statements
  exportDef: /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g,

  // Import statements (to find expected symbols)
  importStmt: /import\s+\{?\s*([^}]+)\s*\}?\s+from\s+['"]([^'"]+)['"]/g,

  // Symbol references in backticks (common in AI output)
  backtickSymbol: /`(\w+(?:\.\w+)*)`/g,

  // Database table references
  tableName: /(?:from|into|update|table|TABLE)\s+['"]?(\w+)['"]?/gi
};

/**
 * Extract file references from sub-agent output
 */
function extractFileReferences(output) {
  const files = new Set();
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Extract from file path pattern
  let match;
  const pathRegex = new RegExp(REFERENCE_PATTERNS.filePath.source, 'gi');
  while ((match = pathRegex.exec(outputStr)) !== null) {
    const filePath = match[1].trim();
    // Filter out common false positives
    if (!filePath.startsWith('.git') &&
        !filePath.includes('node_modules') &&
        filePath.length > 3) {
      files.add(filePath);
    }
  }

  // Extract from file:line references
  const lineRefRegex = new RegExp(REFERENCE_PATTERNS.fileLineRef.source, 'gi');
  while ((match = lineRefRegex.exec(outputStr)) !== null) {
    files.add(match[1]);
  }

  return Array.from(files);
}

/**
 * Extract symbol references from sub-agent output
 */
function extractSymbolReferences(output) {
  const symbols = new Map(); // symbol -> context
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let match;

  // Extract from backtick references
  const backtickRegex = new RegExp(REFERENCE_PATTERNS.backtickSymbol.source, 'gi');
  while ((match = backtickRegex.exec(outputStr)) !== null) {
    const symbol = match[1];
    // Filter out common false positives (keywords, common words)
    if (!isCommonWord(symbol) && symbol.length > 1) {
      symbols.set(symbol, { source: 'backtick', context: getContext(outputStr, match.index) });
    }
  }

  // Extract from import statements
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
function extractTableReferences(output) {
  const tables = new Set();
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let match;
  const tableRegex = new RegExp(REFERENCE_PATTERNS.tableName.source, 'gi');
  while ((match = tableRegex.exec(outputStr)) !== null) {
    const tableName = match[1].toLowerCase();
    // Filter out SQL keywords that might be captured
    if (!isSqlKeyword(tableName) && tableName.length > 2) {
      tables.add(tableName);
    }
  }

  return Array.from(tables);
}

/**
 * Check if word is a common programming keyword
 */
function isCommonWord(word) {
  const common = new Set([
    'const', 'let', 'var', 'function', 'class', 'async', 'await', 'return',
    'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
    'import', 'export', 'from', 'default', 'true', 'false', 'null', 'undefined',
    'this', 'new', 'try', 'catch', 'throw', 'finally', 'typeof', 'instanceof',
    'string', 'number', 'boolean', 'object', 'array', 'Promise', 'Error',
    'console', 'log', 'error', 'warn', 'info', 'debug', 'test', 'describe', 'it'
  ]);
  return common.has(word) || common.has(word.toLowerCase());
}

/**
 * Check if word is a SQL keyword
 */
function isSqlKeyword(word) {
  const keywords = new Set([
    'select', 'from', 'where', 'insert', 'update', 'delete', 'into', 'values',
    'set', 'join', 'left', 'right', 'inner', 'outer', 'on', 'and', 'or', 'not',
    'order', 'by', 'group', 'having', 'limit', 'offset', 'create', 'table',
    'drop', 'alter', 'index', 'primary', 'key', 'foreign', 'references',
    'null', 'default', 'constraint', 'unique', 'check'
  ]);
  return keywords.has(word.toLowerCase());
}

/**
 * Get surrounding context for a match
 */
function getContext(str, index, radius = 50) {
  const start = Math.max(0, index - radius);
  const end = Math.min(str.length, index + radius);
  return str.substring(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * L1: Check if file exists
 */
function checkFileExists(filePath, baseDir) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(baseDir, filePath);

  try {
    return fs.existsSync(absolutePath);
  } catch {
    return false;
  }
}

/**
 * L2: Check if symbol exists in file
 */
function checkSymbolExistsInFile(filePath, symbolName, baseDir) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(baseDir, filePath);

  try {
    if (!fs.existsSync(absolutePath)) {
      return { exists: false, reason: 'file_not_found' };
    }

    const content = fs.readFileSync(absolutePath, 'utf8');

    // Check for function/class/export definitions
    const patterns = [
      new RegExp(`function\\s+${symbolName}\\s*\\(`),
      new RegExp(`(?:const|let|var)\\s+${symbolName}\\s*=`),
      new RegExp(`class\\s+${symbolName}(?:\\s|\\{)`),
      new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${symbolName}`),
      new RegExp(`['"]${symbolName}['"]\\s*:`) // Object property
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return { exists: true };
      }
    }

    // Also check for simple occurrence (less strict)
    if (content.includes(symbolName)) {
      return { exists: true, confidence: 'low', reason: 'string_match_only' };
    }

    return { exists: false, reason: 'symbol_not_found' };
  } catch (error) {
    return { exists: false, reason: `error: ${error.message}` };
  }
}

/**
 * Validate sub-agent output for hallucinations
 *
 * @param {Object} output - Sub-agent output (results object)
 * @param {Object} options - Validation options
 * @param {string} options.baseDir - Base directory for resolving paths
 * @param {Array<string>} options.levels - Validation levels to apply
 * @param {Array<string>} options.knownTables - Known database tables (for table validation)
 * @returns {Object} Validation result
 */
export async function validateSubAgentOutput(output, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const levels = options.levels || [HallucinationLevel.L1, HallucinationLevel.L2];
  const knownTables = new Set(options.knownTables || []);

  const result = {
    passed: true,
    score: 100,
    levels_checked: levels,
    issues: [],
    warnings: [],
    file_references: {
      total: 0,
      valid: 0,
      invalid: []
    },
    symbol_references: {
      total: 0,
      valid: 0,
      invalid: []
    },
    table_references: {
      total: 0,
      valid: 0,
      unknown: []
    }
  };

  // Prepare output for analysis
  const analysisContent = prepareOutputForAnalysis(output);

  // L1: File Existence Check
  if (levels.includes(HallucinationLevel.L1)) {
    const fileRefs = extractFileReferences(analysisContent);
    result.file_references.total = fileRefs.length;

    for (const filePath of fileRefs) {
      if (checkFileExists(filePath, baseDir)) {
        result.file_references.valid++;
      } else {
        result.file_references.invalid.push({
          path: filePath,
          level: 'L1',
          issue: 'File does not exist'
        });
        result.issues.push({
          level: 'L1',
          type: 'file_not_found',
          reference: filePath,
          message: `Referenced file does not exist: ${filePath}`
        });
      }
    }

    // Update pass status
    if (result.file_references.invalid.length > 0) {
      result.passed = false;
      // Deduct points for each invalid file reference
      result.score -= result.file_references.invalid.length * 10;
    }
  }

  // L2: Symbol Existence Check
  if (levels.includes(HallucinationLevel.L2)) {
    const symbolRefs = extractSymbolReferences(analysisContent);
    result.symbol_references.total = symbolRefs.size;

    // Only check symbols that have associated file context
    for (const [symbol, context] of symbolRefs) {
      if (context.module) {
        // Check if symbol exists in the imported module
        const modulePath = resolveModulePath(context.module, baseDir);
        if (modulePath) {
          const check = checkSymbolExistsInFile(modulePath, symbol, baseDir);
          if (check.exists) {
            result.symbol_references.valid++;
          } else {
            result.symbol_references.invalid.push({
              symbol,
              module: context.module,
              level: 'L2',
              reason: check.reason
            });
            result.warnings.push({
              level: 'L2',
              type: 'symbol_not_found',
              reference: `${symbol} in ${context.module}`,
              message: `Symbol '${symbol}' not found in module '${context.module}'`
            });
          }
        }
      }
    }

    // Symbol issues are warnings by default (L2 is less critical than L1)
    if (result.symbol_references.invalid.length > 0) {
      result.score -= result.symbol_references.invalid.length * 5;
    }
  }

  // Table Reference Check (if known tables provided)
  if (knownTables.size > 0) {
    const tableRefs = extractTableReferences(analysisContent);
    result.table_references.total = tableRefs.length;

    for (const tableName of tableRefs) {
      if (knownTables.has(tableName)) {
        result.table_references.valid++;
      } else {
        result.table_references.unknown.push(tableName);
        result.warnings.push({
          level: 'DB',
          type: 'unknown_table',
          reference: tableName,
          message: `Referenced table '${tableName}' not in known tables list`
        });
      }
    }
  }

  // Ensure score doesn't go below 0
  result.score = Math.max(0, result.score);

  // Add summary
  result.summary = generateSummary(result);

  return result;
}

/**
 * Prepare sub-agent output for analysis
 */
function prepareOutputForAnalysis(output) {
  if (typeof output === 'string') {
    return output;
  }

  // Extract relevant fields from output object
  const fieldsToAnalyze = [
    'message',
    'summary',
    'recommendations',
    'critical_issues',
    'warnings',
    'detailed_analysis',
    'findings'
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

/**
 * Resolve module path from import statement
 */
function resolveModulePath(modulePath, baseDir) {
  // Handle relative imports
  if (modulePath.startsWith('.')) {
    const resolved = path.join(baseDir, modulePath);
    // Try with common extensions
    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // For node_modules, we skip validation (they're external)
  return null;
}

/**
 * Generate human-readable summary
 */
function generateSummary(result) {
  const parts = [];

  if (result.passed) {
    parts.push(`PASS (Score: ${result.score}/100)`);
  } else {
    parts.push(`FAIL (Score: ${result.score}/100)`);
  }

  if (result.file_references.total > 0) {
    parts.push(`Files: ${result.file_references.valid}/${result.file_references.total} valid`);
  }

  if (result.symbol_references.total > 0) {
    parts.push(`Symbols: ${result.symbol_references.valid}/${result.symbol_references.total} valid`);
  }

  if (result.issues.length > 0) {
    parts.push(`Issues: ${result.issues.length}`);
  }

  if (result.warnings.length > 0) {
    parts.push(`Warnings: ${result.warnings.length}`);
  }

  return parts.join(' | ');
}

/**
 * Quick check for obvious hallucinations
 * Faster than full validation, suitable for real-time checks
 */
export function quickHallucinationCheck(output, baseDir = process.cwd()) {
  const analysisContent = prepareOutputForAnalysis(output);
  const fileRefs = extractFileReferences(analysisContent);

  const invalid = fileRefs.filter(f => !checkFileExists(f, baseDir));

  return {
    hasHallucinations: invalid.length > 0,
    invalidFiles: invalid,
    totalFiles: fileRefs.length
  };
}

/**
 * Add hallucination validation to sub-agent execution results
 * Call this after sub-agent execution to validate output
 */
export async function addHallucinationValidation(results, options = {}) {
  const validation = await validateSubAgentOutput(results, options);

  return {
    ...results,
    hallucination_check: {
      performed: true,
      timestamp: new Date().toISOString(),
      ...validation
    }
  };
}
