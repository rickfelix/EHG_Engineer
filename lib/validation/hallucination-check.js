/**
 * LEO v4.4 Hallucination Detection Module
 *
 * Validates sub-agent output for hallucinations by checking:
 * - L1: File existence (referenced files must exist)
 * - L2: Symbol existence (referenced functions/classes must exist in files)
 * - L3: Code syntax validation (code snippets must parse without errors)
 * - DB: Database table validation (tables must exist in schema)
 *
 * Part of LEO Protocol v4.4 - Sub-Agent Output Validation (PATCH-005)
 *
 * Usage:
 * ```javascript
 * import { validateSubAgentOutput, HallucinationLevel, loadKnownTables } from './validation/hallucination-check.js';
 *
 * // Tables auto-loaded from database if not provided
 * const validation = await validateSubAgentOutput(subAgentResults, {
 *   baseDir: process.cwd(),
 *   levels: [HallucinationLevel.L1, HallucinationLevel.L2, HallucinationLevel.L3]
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
import { parse as acornParse } from 'acorn';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hallucination detection levels
 */
export const HallucinationLevel = {
  L1: 'file_exists',      // File path references exist
  L2: 'symbol_exists',    // Function/class symbols exist in referenced files
  L3: 'syntax_valid',     // Code snippets parse without errors
  DB: 'table_exists'      // Database table references exist in schema
};

// Cache for known tables (loaded once per session)
let knownTablesCache = null;
let knownTablesCacheTime = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load known database tables from Supabase
 * Results are cached for 5 minutes to avoid repeated queries
 *
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {Promise<string[]>} Array of table names (lowercase)
 */
export async function loadKnownTables(forceRefresh = false) {
  // Check cache validity
  const now = Date.now();
  if (!forceRefresh && knownTablesCache && knownTablesCacheTime && (now - knownTablesCacheTime) < CACHE_TTL_MS) {
    return knownTablesCache;
  }

  try {
    // Lazy import to avoid loading in environments without Supabase
    const { createSupabaseServiceClient } = await import('../../scripts/lib/supabase-connection.js');
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    // Query information_schema for public tables
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
    });

    if (error) {
      console.warn('Failed to load known tables:', error.message);
      return knownTablesCache || [];
    }

    // Extract table names (lowercase for case-insensitive matching)
    knownTablesCache = (data || []).map(row => row.table_name.toLowerCase());
    knownTablesCacheTime = now;

    return knownTablesCache;
  } catch (err) {
    console.warn('Error loading known tables:', err.message);
    // Return cached value if available, empty array otherwise
    return knownTablesCache || [];
  }
}

/**
 * Clear the known tables cache
 * Useful for testing or after schema changes
 */
export function clearKnownTablesCache() {
  knownTablesCache = null;
  knownTablesCacheTime = null;
}

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
 * Extract code snippets from sub-agent output
 * Looks for fenced code blocks (```) and inline code (`)
 *
 * @param {string} output - Output to analyze
 * @returns {Array<{code: string, language: string, context: string}>}
 */
function extractCodeSnippets(output) {
  const snippets = [];
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  // Match fenced code blocks: ```language\ncode\n```
  const fencedRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fencedRegex.exec(outputStr)) !== null) {
    const language = match[1] || 'javascript';
    const code = match[2].trim();
    if (code.length > 10) { // Ignore very short snippets
      snippets.push({
        code,
        language: language.toLowerCase(),
        context: 'fenced_block',
        startIndex: match.index
      });
    }
  }

  // Match multi-line inline code (likely to be actual code)
  // Single backtick code that spans multiple lines or has JS-like content
  const inlineRegex = /`([^`]{20,})`/g;
  while ((match = inlineRegex.exec(outputStr)) !== null) {
    const code = match[1].trim();
    // Only include if it looks like code (contains common patterns)
    if (looksLikeCode(code)) {
      snippets.push({
        code,
        language: 'javascript', // Assume JS for inline
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
function looksLikeCode(str) {
  // Check for common code patterns
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
    /=>/,            // Arrow functions
    /\(\s*\)\s*{/,   // Function bodies
    /\.\w+\(/        // Method calls
  ];

  return codePatterns.some(pattern => pattern.test(str));
}

/**
 * Validate code snippet syntax using acorn parser
 *
 * @param {string} code - Code to validate
 * @param {string} language - Language hint (javascript, typescript)
 * @returns {{valid: boolean, error?: string, location?: object}}
 */
function validateCodeSyntax(code, language = 'javascript') {
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
      allowReturnOutsideFunction: true // Allow snippets that are partial
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
      // Check if it's a partial snippet (common in AI output)
      // Allow certain patterns that are valid partial code
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
 * AI often outputs fragments that don't parse as complete programs
 */
function isValidPartialCode(code) {
  const validPartialPatterns = [
    // Object literals without assignment
    /^\s*\{[\s\S]*\}\s*$/,
    // Array literals
    /^\s*\[[\s\S]*\]\s*$/,
    // Method chains
    /^\s*\.\w+\(/,
    // Arrow function body
    /^\s*=>\s*\{?/,
    // Property definitions
    /^\s*\w+\s*:\s*/,
    // JSX fragments
    /^\s*<[\w.]+/
  ];

  return validPartialPatterns.some(pattern => pattern.test(code));
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
 * @param {Array<string>} options.knownTables - Known database tables (auto-loaded if not provided)
 * @param {boolean} options.autoLoadTables - Whether to auto-load tables from database (default: true)
 * @returns {Object} Validation result
 */
export async function validateSubAgentOutput(output, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const levels = options.levels || [HallucinationLevel.L1, HallucinationLevel.L2];
  const autoLoadTables = options.autoLoadTables !== false;

  // Auto-load known tables from database if not provided and DB validation requested
  let knownTables;
  if (options.knownTables && options.knownTables.length > 0) {
    knownTables = new Set(options.knownTables.map(t => t.toLowerCase()));
  } else if (autoLoadTables && levels.includes(HallucinationLevel.DB)) {
    const loadedTables = await loadKnownTables();
    knownTables = new Set(loadedTables);
  } else {
    knownTables = new Set();
  }

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
      unknown: [],
      tables_loaded: knownTables.size
    },
    code_snippets: {
      total: 0,
      valid: 0,
      invalid: [],
      skipped: 0
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

  // DB: Table Reference Check (auto-loads tables if DB level specified)
  if (levels.includes(HallucinationLevel.DB) || knownTables.size > 0) {
    const tableRefs = extractTableReferences(analysisContent);
    result.table_references.total = tableRefs.length;

    if (knownTables.size > 0) {
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
      // Unknown tables deduct points (but less than file errors)
      if (result.table_references.unknown.length > 0) {
        result.score -= result.table_references.unknown.length * 3;
      }
    } else {
      // No tables loaded - can't validate, note in result
      result.table_references.validation_skipped = true;
      result.table_references.reason = 'no_known_tables_loaded';
    }
  }

  // L3: Code Snippet Syntax Validation
  if (levels.includes(HallucinationLevel.L3)) {
    const snippets = extractCodeSnippets(analysisContent);
    result.code_snippets.total = snippets.length;

    for (const snippet of snippets) {
      const validation = validateCodeSyntax(snippet.code, snippet.language);

      if (validation.skipped) {
        result.code_snippets.skipped++;
      } else if (validation.valid) {
        result.code_snippets.valid++;
      } else {
        result.code_snippets.invalid.push({
          language: snippet.language,
          context: snippet.context,
          error: validation.error,
          location: validation.location,
          code_preview: snippet.code.substring(0, 100) + (snippet.code.length > 100 ? '...' : '')
        });
        result.warnings.push({
          level: 'L3',
          type: 'syntax_error',
          reference: `${snippet.language} snippet`,
          message: `Code syntax error: ${validation.error}`
        });
      }
    }

    // Syntax errors are warnings (deduct fewer points)
    if (result.code_snippets.invalid.length > 0) {
      result.score -= result.code_snippets.invalid.length * 2;
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

  if (result.table_references.total > 0) {
    parts.push(`Tables: ${result.table_references.valid}/${result.table_references.total} valid`);
  }

  if (result.code_snippets.total > 0) {
    parts.push(`Code: ${result.code_snippets.valid}/${result.code_snippets.total} valid`);
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
