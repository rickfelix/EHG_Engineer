/**
 * LEO v4.4 Hallucination Detection Module
 *
 * Validates sub-agent output for hallucinations by checking:
 * - L1: File existence (referenced files must exist)
 * - L2: Symbol existence (referenced functions/classes must exist in files)
 * - L3: Code syntax validation (code snippets must parse without errors)
 * - DB: Database table validation (tables must exist in schema)
 *
 * REFACTORED: Modularized from 893 LOC to ~180 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: constants, extractors, file-checks, code-validation, table-loader
 *
 * @module hallucination-check
 */

import {
  HallucinationLevel,
  clearKnownTablesCache,
  loadKnownTables,
  extractFileReferences,
  extractSymbolReferences,
  extractTableReferences,
  extractCodeSnippets,
  prepareOutputForAnalysis,
  checkFileExists,
  checkSymbolExistsInFile,
  resolveModulePath,
  validateCodeSyntax
} from './hallucination/index.js';

// Re-export for backwards compatibility
export { HallucinationLevel, loadKnownTables, clearKnownTablesCache };

/**
 * Validate sub-agent output for hallucinations
 */
export async function validateSubAgentOutput(output, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const levels = options.levels || [HallucinationLevel.L1, HallucinationLevel.L2];
  const autoLoadTables = options.autoLoadTables !== false;
  const branchContext = options.branchContext || null;

  // Auto-load known tables if needed
  let knownTables;
  if (options.knownTables && options.knownTables.length > 0) {
    knownTables = new Set(options.knownTables.map(t => t.toLowerCase()));
  } else if (autoLoadTables && levels.includes(HallucinationLevel.DB)) {
    const loadedTables = await loadKnownTables();
    knownTables = new Set(loadedTables);
  } else {
    knownTables = new Set();
  }

  const result = createResultObject(levels, knownTables.size);
  const analysisContent = prepareOutputForAnalysis(output);

  // L1: File Existence Check
  if (levels.includes(HallucinationLevel.L1)) {
    validateFileReferences(result, analysisContent, baseDir, branchContext);
  }

  // L2: Symbol Existence Check
  if (levels.includes(HallucinationLevel.L2)) {
    validateSymbolReferences(result, analysisContent, baseDir, branchContext);
  }

  // DB: Table Reference Check
  if (levels.includes(HallucinationLevel.DB) || knownTables.size > 0) {
    validateTableReferences(result, analysisContent, knownTables);
  }

  // L3: Code Snippet Syntax Validation
  if (levels.includes(HallucinationLevel.L3)) {
    validateCodeSnippets(result, analysisContent);
  }

  result.score = Math.max(0, result.score);
  result.summary = generateSummary(result);

  return result;
}

function createResultObject(levels, tablesCount) {
  return {
    passed: true,
    score: 100,
    levels_checked: levels,
    issues: [],
    warnings: [],
    file_references: { total: 0, valid: 0, invalid: [] },
    symbol_references: { total: 0, valid: 0, invalid: [] },
    table_references: { total: 0, valid: 0, unknown: [], tables_loaded: tablesCount },
    code_snippets: { total: 0, valid: 0, invalid: [], skipped: 0 }
  };
}

function validateFileReferences(result, content, baseDir, branchContext) {
  const fileRefs = extractFileReferences(content);
  result.file_references.total = fileRefs.length;

  if (branchContext) {
    result.file_references.branch_context = {
      branch: branchContext.branch,
      repoPath: branchContext.repoPath
    };
  }

  for (const filePath of fileRefs) {
    if (checkFileExists(filePath, baseDir, branchContext)) {
      result.file_references.valid++;
    } else {
      result.file_references.invalid.push({
        path: filePath,
        level: 'L1',
        issue: branchContext ? 'File does not exist (checked branch and filesystem)' : 'File does not exist'
      });
      result.issues.push({
        level: 'L1',
        type: 'file_not_found',
        reference: filePath,
        message: `Referenced file does not exist: ${filePath}`
      });
    }
  }

  if (result.file_references.invalid.length > 0) {
    result.passed = false;
    result.score -= result.file_references.invalid.length * 10;
  }
}

function validateSymbolReferences(result, content, baseDir, branchContext) {
  const symbolRefs = extractSymbolReferences(content);
  result.symbol_references.total = symbolRefs.size;

  for (const [symbol, context] of symbolRefs) {
    if (context.module) {
      const modulePath = resolveModulePath(context.module, baseDir);
      if (modulePath) {
        const check = checkSymbolExistsInFile(modulePath, symbol, baseDir, branchContext);
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

  if (result.symbol_references.invalid.length > 0) {
    result.score -= result.symbol_references.invalid.length * 5;
  }
}

function validateTableReferences(result, content, knownTables) {
  const tableRefs = extractTableReferences(content);
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
    if (result.table_references.unknown.length > 0) {
      result.score -= result.table_references.unknown.length * 3;
    }
  } else {
    result.table_references.validation_skipped = true;
    result.table_references.reason = 'no_known_tables_loaded';
  }
}

function validateCodeSnippets(result, content) {
  const snippets = extractCodeSnippets(content);
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

  if (result.code_snippets.invalid.length > 0) {
    result.score -= result.code_snippets.invalid.length * 2;
  }
}

function generateSummary(result) {
  const parts = [];

  parts.push(result.passed ? `PASS (Score: ${result.score}/100)` : `FAIL (Score: ${result.score}/100)`);

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
