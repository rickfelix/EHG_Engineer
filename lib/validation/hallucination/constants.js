/**
 * Hallucination Detection - Constants and Types
 * Part of LEO v4.4 Hallucination Detection Module
 */

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
export let knownTablesCache = null;
export let knownTablesCacheTime = null;
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function setKnownTablesCache(tables, time) {
  knownTablesCache = tables;
  knownTablesCacheTime = time;
}

export function clearKnownTablesCache() {
  knownTablesCache = null;
  knownTablesCacheTime = null;
}

/**
 * Regular expressions for extracting references from sub-agent output
 */
export const REFERENCE_PATTERNS = {
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
 * Common programming keywords (for filtering)
 */
const COMMON_WORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'async', 'await', 'return',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'import', 'export', 'from', 'default', 'true', 'false', 'null', 'undefined',
  'this', 'new', 'try', 'catch', 'throw', 'finally', 'typeof', 'instanceof',
  'string', 'number', 'boolean', 'object', 'array', 'Promise', 'Error',
  'console', 'log', 'error', 'warn', 'info', 'debug', 'test', 'describe', 'it'
]);

/**
 * SQL keywords (for filtering)
 */
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete', 'into', 'values',
  'set', 'join', 'left', 'right', 'inner', 'outer', 'on', 'and', 'or', 'not',
  'order', 'by', 'group', 'having', 'limit', 'offset', 'create', 'table',
  'drop', 'alter', 'index', 'primary', 'key', 'foreign', 'references',
  'null', 'default', 'constraint', 'unique', 'check'
]);

export function isCommonWord(word) {
  return COMMON_WORDS.has(word) || COMMON_WORDS.has(word.toLowerCase());
}

export function isSqlKeyword(word) {
  return SQL_KEYWORDS.has(word.toLowerCase());
}
