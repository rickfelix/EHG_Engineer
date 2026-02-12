/**
 * OIV Verifier - Operational Integration Verification Engine
 * SD-LEO-INFRA-OIV-001: Validates code artifacts are operationally integrated
 *
 * 5-Level Checkpoint Verification:
 * L1_FILE_EXISTS      - File exists on filesystem
 * L2_IMPORT_RESOLVES  - Import chain from trigger to target works
 * L3_EXPORT_EXISTS    - Expected function is exported (AST analysis)
 * L4_FUNCTION_CALLABLE - Function can be called (runtime dry-run)
 * L5_ARGS_COMPATIBLE  - Function signature matches caller expectations
 */

import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

// Checkpoint level scores (cumulative)
const CHECKPOINT_SCORES = {
  L1_FILE_EXISTS: 20,
  L2_IMPORT_RESOLVES: 40,
  L3_EXPORT_EXISTS: 60,
  L4_FUNCTION_CALLABLE: 80,
  L5_ARGS_COMPATIBLE: 100
};

// Checkpoint level order
const CHECKPOINT_ORDER = [
  'L1_FILE_EXISTS',
  'L2_IMPORT_RESOLVES',
  'L3_EXPORT_EXISTS',
  'L4_FUNCTION_CALLABLE',
  'L5_ARGS_COMPATIBLE'
];

export class OIVVerifier {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.astCache = new Map();
    this.verbose = options.verbose || false;
  }

  /**
   * Verify a single contract through all applicable checkpoints
   * @param {Object} contract - Integration contract from database
   * @param {string} maxLevel - Maximum checkpoint level to verify (default: contract.checkpoint_level)
   * @returns {Object} Verification result with per-checkpoint breakdown
   */
  async verify(contract, maxLevel = null) {
    const targetLevel = maxLevel || contract.checkpoint_level || 'L3_EXPORT_EXISTS';
    const targetIndex = CHECKPOINT_ORDER.indexOf(targetLevel);

    const result = {
      contract_key: contract.contract_key,
      started_at: new Date().toISOString(),
      checkpoints: {},
      final_status: 'PASS',
      final_checkpoint: null,
      failure_checkpoint: null,
      score: 0,
      error_message: null,
      remediation_hint: null
    };

    try {
      // L1: File Exists
      if (targetIndex >= 0) {
        result.checkpoints.l1 = await this._verifyL1(contract);
        if (result.checkpoints.l1.status !== 'PASS') {
          result.final_status = 'FAIL';
          result.failure_checkpoint = 'L1_FILE_EXISTS';
          result.error_message = result.checkpoints.l1.error;
          result.remediation_hint = result.checkpoints.l1.remediation;
          result.score = 0;
          return this._finalizeResult(result);
        }
        result.score = CHECKPOINT_SCORES.L1_FILE_EXISTS;
        result.final_checkpoint = 'L1_FILE_EXISTS';
      }

      // L2: Import Resolves
      if (targetIndex >= 1) {
        result.checkpoints.l2 = await this._verifyL2(contract);
        if (result.checkpoints.l2.status !== 'PASS') {
          result.final_status = 'FAIL';
          result.failure_checkpoint = 'L2_IMPORT_RESOLVES';
          result.error_message = result.checkpoints.l2.error;
          result.remediation_hint = result.checkpoints.l2.remediation;
          return this._finalizeResult(result);
        }
        result.score = CHECKPOINT_SCORES.L2_IMPORT_RESOLVES;
        result.final_checkpoint = 'L2_IMPORT_RESOLVES';
      }

      // L3: Export Exists
      if (targetIndex >= 2) {
        result.checkpoints.l3 = await this._verifyL3(contract);
        if (result.checkpoints.l3.status !== 'PASS') {
          result.final_status = 'FAIL';
          result.failure_checkpoint = 'L3_EXPORT_EXISTS';
          result.error_message = result.checkpoints.l3.error;
          result.remediation_hint = result.checkpoints.l3.remediation;
          return this._finalizeResult(result);
        }
        result.score = CHECKPOINT_SCORES.L3_EXPORT_EXISTS;
        result.final_checkpoint = 'L3_EXPORT_EXISTS';
      }

      // L4: Function Callable (runtime - optional)
      if (targetIndex >= 3) {
        result.checkpoints.l4 = await this._verifyL4(contract);
        if (result.checkpoints.l4.status !== 'PASS') {
          result.final_status = 'FAIL';
          result.failure_checkpoint = 'L4_FUNCTION_CALLABLE';
          result.error_message = result.checkpoints.l4.error;
          result.remediation_hint = result.checkpoints.l4.remediation;
          return this._finalizeResult(result);
        }
        result.score = CHECKPOINT_SCORES.L4_FUNCTION_CALLABLE;
        result.final_checkpoint = 'L4_FUNCTION_CALLABLE';
      }

      // L5: Args Compatible (runtime - optional)
      if (targetIndex >= 4) {
        result.checkpoints.l5 = await this._verifyL5(contract);
        if (result.checkpoints.l5.status !== 'PASS') {
          result.final_status = 'FAIL';
          result.failure_checkpoint = 'L5_ARGS_COMPATIBLE';
          result.error_message = result.checkpoints.l5.error;
          result.remediation_hint = result.checkpoints.l5.remediation;
          return this._finalizeResult(result);
        }
        result.score = CHECKPOINT_SCORES.L5_ARGS_COMPATIBLE;
        result.final_checkpoint = 'L5_ARGS_COMPATIBLE';
      }

      return this._finalizeResult(result);

    } catch (error) {
      result.final_status = 'ERROR';
      result.error_message = error.message;
      result.remediation_hint = 'Check contract configuration and file paths';
      return this._finalizeResult(result);
    }
  }

  /**
   * L1: Verify file exists on filesystem
   */
  async _verifyL1(contract) {
    const filePath = this._resolvePath(contract.entry_point_file);

    if (this.verbose) {
      console.log(`   L1: Checking file exists: ${filePath}`);
    }

    if (!fs.existsSync(filePath)) {
      // Try with .js extension if not present
      const withJs = filePath.endsWith('.js') ? filePath : `${filePath}.js`;
      if (!fs.existsSync(withJs)) {
        return {
          status: 'FAIL',
          error: `File not found: ${contract.entry_point_file}`,
          remediation: `Create file at: ${filePath}`,
          details: {
            expected: filePath,
            checkedPaths: [filePath, withJs]
          }
        };
      }
    }

    return {
      status: 'PASS',
      details: { path: filePath }
    };
  }

  /**
   * L2: Verify import chain resolves
   */
  async _verifyL2(contract) {
    const importChain = contract.import_chain || [];

    if (this.verbose) {
      console.log(`   L2: Checking import chain (${importChain.length} steps)`);
    }

    if (importChain.length === 0) {
      // No import chain defined - just verify the entry point file is importable
      const filePath = this._resolvePath(contract.entry_point_file);
      try {
        // Try to resolve the module (without actually importing)
        const resolved = this._tryResolveModule(filePath);
        if (resolved) {
          return {
            status: 'PASS',
            details: { resolved_path: resolved }
          };
        }
      } catch (error) {
        return {
          status: 'FAIL',
          error: `Cannot resolve module: ${contract.entry_point_file}`,
          remediation: 'Ensure module is importable and has no syntax errors',
          details: { error: error.message }
        };
      }
      return { status: 'PASS', details: { no_chain: true } };
    }

    // Verify each step in the import chain
    const chainResults = [];
    for (const step of importChain) {
      const fromFile = this._resolvePath(step.from);

      if (!fs.existsSync(fromFile)) {
        return {
          status: 'FAIL',
          error: `Import chain broken: ${step.from} does not exist`,
          remediation: `Create file at: ${fromFile}`,
          details: { broken_step: step, checked_path: fromFile }
        };
      }

      // If step has importPath, verify it's actually imported
      if (step.importPath) {
        const ast = await this._parseFile(fromFile);
        const hasImport = this._findImport(ast, step.importPath);

        if (!hasImport) {
          return {
            status: 'FAIL',
            error: `Import chain broken: ${step.from} does not import ${step.importPath}`,
            remediation: `Add import statement in ${step.from} for ${step.importPath}`,
            details: { missing_import: step.importPath, in_file: step.from }
          };
        }
      }

      chainResults.push({ step, verified: true });
    }

    return {
      status: 'PASS',
      details: { chain_verified: chainResults }
    };
  }

  /**
   * L3: Verify expected function is exported (AST analysis)
   */
  async _verifyL3(contract) {
    const filePath = this._resolvePath(contract.entry_point_file);
    const functionName = contract.entry_point_function;
    const exportType = contract.export_type || 'named';

    if (this.verbose) {
      console.log(`   L3: Checking export '${functionName}' (${exportType}) in ${filePath}`);
    }

    try {
      const ast = await this._parseFile(filePath);
      const exports = this._findExports(ast);

      if (this.verbose) {
        console.log(`   L3: Found exports: ${JSON.stringify(exports)}`);
      }

      // Check based on export type
      if (exportType === 'default') {
        if (!exports.hasDefault) {
          return {
            status: 'FAIL',
            error: `No default export in ${contract.entry_point_file}`,
            remediation: `Add 'export default ${functionName}' to ${contract.entry_point_file}`,
            details: { found_exports: exports.named }
          };
        }
      } else if (exportType === 'cjs') {
        // For CJS, check module.exports
        if (!exports.cjs.includes(functionName) && !exports.cjs.includes('*')) {
          return {
            status: 'FAIL',
            error: `Function '${functionName}' not exported via module.exports in ${contract.entry_point_file}`,
            remediation: `Add 'module.exports.${functionName} = ${functionName}' to ${contract.entry_point_file}`,
            details: { found_cjs_exports: exports.cjs }
          };
        }
      } else {
        // Named export
        if (!exports.named.includes(functionName)) {
          return {
            status: 'FAIL',
            error: `Function '${functionName}' not found in named exports of ${contract.entry_point_file}`,
            remediation: `Add 'export { ${functionName} }' or 'export function ${functionName}()' to ${contract.entry_point_file}`,
            details: {
              expected: functionName,
              found_exports: exports.named,
              has_default: exports.hasDefault
            }
          };
        }
      }

      return {
        status: 'PASS',
        details: {
          function: functionName,
          export_type: exportType,
          all_exports: exports
        }
      };

    } catch (error) {
      return {
        status: 'FAIL',
        error: `AST parse error for ${contract.entry_point_file}: ${error.message}`,
        remediation: `Fix syntax errors in ${contract.entry_point_file}`,
        details: { parse_error: error.message }
      };
    }
  }

  /**
   * L4: Verify function is callable (runtime verification)
   * NOTE: This performs actual module import - use with caution
   */
  async _verifyL4(contract) {
    if (contract.verification_mode === 'static') {
      return {
        status: 'SKIP',
        details: { reason: 'Contract configured for static verification only' }
      };
    }

    const filePath = this._resolvePath(contract.entry_point_file);
    const functionName = contract.entry_point_function;

    if (this.verbose) {
      console.log(`   L4: Runtime verification of '${functionName}' in ${filePath}`);
    }

    try {
      // Dynamic import - be careful with side effects
      const moduleUrl = `file://${filePath.replace(/\\/g, '/')}`;
      const module = await import(moduleUrl);

      let fn;
      if (contract.export_type === 'default') {
        fn = module.default;
      } else {
        fn = module[functionName];
      }

      if (typeof fn !== 'function') {
        return {
          status: 'FAIL',
          error: `'${functionName}' is not a function (got ${typeof fn})`,
          remediation: `Ensure ${functionName} is exported as a function`,
          details: { typeof_result: typeof fn }
        };
      }

      return {
        status: 'PASS',
        details: {
          function_type: fn.constructor.name,
          param_count: fn.length
        }
      };

    } catch (error) {
      return {
        status: 'FAIL',
        error: `Runtime import failed: ${error.message}`,
        remediation: `Fix runtime errors in ${contract.entry_point_file}`,
        details: { import_error: error.message }
      };
    }
  }

  /**
   * L5: Verify function signature matches expected params
   */
  async _verifyL5(contract) {
    if (contract.verification_mode === 'static') {
      return {
        status: 'SKIP',
        details: { reason: 'Contract configured for static verification only' }
      };
    }

    const expectedParams = contract.expected_params || [];
    if (expectedParams.length === 0) {
      return {
        status: 'SKIP',
        details: { reason: 'No expected params defined in contract' }
      };
    }

    // This would require AST analysis of function params or runtime inspection
    // For now, we use a simplified check based on function.length
    const filePath = this._resolvePath(contract.entry_point_file);
    const functionName = contract.entry_point_function;

    try {
      const moduleUrl = `file://${filePath.replace(/\\/g, '/')}`;
      const module = await import(moduleUrl);

      let fn = contract.export_type === 'default' ? module.default : module[functionName];

      if (typeof fn !== 'function') {
        return {
          status: 'FAIL',
          error: 'Cannot verify args - not a function',
          remediation: `Ensure ${functionName} is a function`
        };
      }

      const requiredParams = expectedParams.filter(p => p.required !== false);
      if (fn.length < requiredParams.length) {
        return {
          status: 'FAIL',
          error: `Function has ${fn.length} params but ${requiredParams.length} required`,
          remediation: `Update ${functionName} to accept required parameters: ${requiredParams.map(p => p.name).join(', ')}`,
          details: {
            function_param_count: fn.length,
            required_params: requiredParams.map(p => p.name)
          }
        };
      }

      return {
        status: 'PASS',
        details: {
          function_param_count: fn.length,
          expected_required: requiredParams.length,
          expected_total: expectedParams.length
        }
      };

    } catch (error) {
      return {
        status: 'FAIL',
        error: `L5 verification error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Parse a file and cache the AST
   */
  async _parseFile(filePath) {
    if (this.astCache.has(filePath)) {
      return this.astCache.get(filePath);
    }

    const code = fs.readFileSync(filePath, 'utf-8');

    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
    });

    this.astCache.set(filePath, ast);
    return ast;
  }

  /**
   * Find all exports in an AST
   */
  _findExports(ast) {
    const result = {
      named: [],
      hasDefault: false,
      cjs: []
    };

    // Handle both default export from @babel/traverse and named export
    const traverseFn = traverse.default || traverse;

    traverseFn(ast, {
      ExportNamedDeclaration(path) {
        // export function foo() {}
        // export const foo = ...
        if (path.node.declaration) {
          if (path.node.declaration.id) {
            result.named.push(path.node.declaration.id.name);
          } else if (path.node.declaration.declarations) {
            path.node.declaration.declarations.forEach(decl => {
              if (decl.id && decl.id.name) {
                result.named.push(decl.id.name);
              }
            });
          }
        }
        // export { foo, bar }
        if (path.node.specifiers) {
          path.node.specifiers.forEach(spec => {
            if (spec.exported && spec.exported.name) {
              result.named.push(spec.exported.name);
            }
          });
        }
      },
      ExportDefaultDeclaration(path) {
        result.hasDefault = true;
        // Try to get the name if it's a named function/class
        if (path.node.declaration && path.node.declaration.id) {
          result.named.push(path.node.declaration.id.name);
        }
      },
      AssignmentExpression(path) {
        // module.exports = ... or module.exports.foo = ...
        if (
          path.node.left.type === 'MemberExpression' &&
          path.node.left.object &&
          path.node.left.object.name === 'module' &&
          path.node.left.property &&
          path.node.left.property.name === 'exports'
        ) {
          if (path.node.left.property && path.node.left.property.name) {
            result.cjs.push(path.node.left.property.name);
          } else {
            result.cjs.push('*'); // Entire module.exports
          }
        }
        // exports.foo = ...
        if (
          path.node.left.type === 'MemberExpression' &&
          path.node.left.object &&
          path.node.left.object.name === 'exports'
        ) {
          if (path.node.left.property && path.node.left.property.name) {
            result.cjs.push(path.node.left.property.name);
          }
        }
      }
    });

    return result;
  }

  /**
   * Find if a specific import exists in an AST
   */
  _findImport(ast, importPath) {
    let found = false;

    const traverseFn = traverse.default || traverse;

    traverseFn(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === importPath ||
            path.node.source.value.includes(importPath)) {
          found = true;
        }
      },
      CallExpression(path) {
        // require() calls
        if (path.node.callee.name === 'require' &&
            path.node.arguments[0] &&
            path.node.arguments[0].value) {
          if (path.node.arguments[0].value === importPath ||
              path.node.arguments[0].value.includes(importPath)) {
            found = true;
          }
        }
      }
    });

    return found;
  }

  /**
   * Try to resolve a module path
   */
  _tryResolveModule(filePath) {
    try {
      // For Node.js resolution
      const resolved = require.resolve(filePath, { paths: [this.basePath] });
      return resolved;
    } catch (_e) {
      // Try as-is
      if (fs.existsSync(filePath)) {
        return filePath;
      }
      return null;
    }
  }

  /**
   * Resolve a relative path to absolute
   */
  _resolvePath(relativePath) {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(this.basePath, relativePath);
  }

  /**
   * Finalize result with timing
   */
  _finalizeResult(result) {
    result.completed_at = new Date().toISOString();
    result.duration_ms = new Date(result.completed_at) - new Date(result.started_at);
    return result;
  }

  /**
   * Clear AST cache
   */
  clearCache() {
    this.astCache.clear();
  }
}

export default OIVVerifier;
