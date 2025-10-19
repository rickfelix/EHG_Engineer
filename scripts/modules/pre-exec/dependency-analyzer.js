/**
 * DependencyAnalyzer Module
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Analyze import/export relationships and detect circular dependencies
 * using AST parsing with @babel/parser.
 *
 * Dependencies: @babel/parser, @babel/traverse
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import fs from 'fs/promises';
import path from 'path';

/**
 * DependencyAnalyzer class - Analyzes code dependencies
 */
export class DependencyAnalyzer {
  constructor() {
    this.dependencyGraph = new Map();  // file -> Set of dependencies
    this.exports = new Map();  // file -> Set of exported symbols
    this.circularRisks = [];
  }

  /**
   * Analyze dependencies in discovered files
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(filePaths) {
    try {
      // Reset state
      this.dependencyGraph.clear();
      this.exports.clear();
      this.circularRisks = [];

      // Analyze each file
      for (const filePath of filePaths) {
        await this.analyzeFile(filePath);
      }

      // Detect circular dependencies
      this.detectCircularDependencies();

      // Categorize dependencies
      const allDependencies = this.getAllDependencies();
      const { thirdParty, internal } = this.categorizeDependencies(allDependencies);

      return {
        imports: Array.from(allDependencies),
        exports: this.getExportsSummary(),
        circular_risks: this.circularRisks,
        dependency_graph: this.serializeDependencyGraph(),
        third_party: thirdParty,
        internal: internal
      };

    } catch (error) {
      console.error('DependencyAnalyzer error:', error.message);
      throw error;
    }
  }

  /**
   * Analyze a single file for dependencies
   * @param {string} filePath - File to analyze
   */
  async analyzeFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ast = this.parseFile(content, filePath);

      if (!ast) return;

      const dependencies = new Set();
      const exports = new Set();

      // Traverse AST to find imports and exports
      traverse(ast, {
        // ES6 imports: import { foo } from 'bar'
        ImportDeclaration: (nodePath) => {
          const source = nodePath.node.source.value;
          dependencies.add(source);
        },

        // CommonJS require: const foo = require('bar')
        CallExpression: (nodePath) => {
          if (nodePath.node.callee.name === 'require' &&
              nodePath.node.arguments.length > 0) {
            const arg = nodePath.node.arguments[0];
            if (arg.type === 'StringLiteral') {
              dependencies.add(arg.value);
            }
          }
        },

        // ES6 named exports: export const foo = ...
        ExportNamedDeclaration: (nodePath) => {
          if (nodePath.node.declaration) {
            if (nodePath.node.declaration.declarations) {
              nodePath.node.declaration.declarations.forEach(decl => {
                if (decl.id && decl.id.name) {
                  exports.add(decl.id.name);
                }
              });
            } else if (nodePath.node.declaration.id) {
              exports.add(nodePath.node.declaration.id.name);
            }
          }
        },

        // ES6 default export: export default foo
        ExportDefaultDeclaration: (nodePath) => {
          exports.add('default');
        },

        // ES6 export all: export * from 'foo'
        ExportAllDeclaration: (nodePath) => {
          exports.add('*');
          if (nodePath.node.source) {
            dependencies.add(nodePath.node.source.value);
          }
        }
      });

      this.dependencyGraph.set(filePath, dependencies);
      this.exports.set(filePath, exports);

    } catch (error) {
      console.warn(`Failed to analyze ${filePath}:`, error.message);
      // Don't throw - gracefully handle parse errors
    }
  }

  /**
   * Parse file content to AST
   * @param {string} content - File content
   * @param {string} filePath - File path (for determining parser options)
   * @returns {Object|null} AST or null if parse fails
   */
  parseFile(content, filePath) {
    try {
      const isTypeScript = /\.tsx?$/.test(filePath);

      return parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          isTypeScript && 'typescript',
          'classProperties',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator'
        ].filter(Boolean)
      });
    } catch (error) {
      console.warn(`Parse error in ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (file, path = []) => {
      if (recursionStack.has(file)) {
        // Found cycle
        const cycleStart = path.indexOf(file);
        const cycle = [...path.slice(cycleStart), file];
        this.circularRisks.push({
          cycle: cycle,
          length: cycle.length
        });
        return;
      }

      if (visited.has(file)) {
        return;
      }

      visited.add(file);
      recursionStack.add(file);

      const deps = this.dependencyGraph.get(file) || new Set();
      for (const dep of deps) {
        // Only check internal dependencies (not node_modules)
        if (!dep.startsWith('.') && !dep.startsWith('/')) {
          continue;
        }

        dfs(dep, [...path, file]);
      }

      recursionStack.delete(file);
    };

    for (const file of this.dependencyGraph.keys()) {
      if (!visited.has(file)) {
        dfs(file);
      }
    }
  }

  /**
   * Get all unique dependencies
   * @returns {Set<string>} All dependencies
   */
  getAllDependencies() {
    const all = new Set();
    for (const deps of this.dependencyGraph.values()) {
      for (const dep of deps) {
        all.add(dep);
      }
    }
    return all;
  }

  /**
   * Categorize dependencies as third-party or internal
   * @param {Set<string>} dependencies - All dependencies
   * @returns {Object} { thirdParty: string[], internal: string[] }
   */
  categorizeDependencies(dependencies) {
    const thirdParty = [];
    const internal = [];

    for (const dep of dependencies) {
      // Internal: starts with . or / (relative/absolute path)
      // Third-party: everything else (node_modules)
      if (dep.startsWith('.') || dep.startsWith('/')) {
        internal.push(dep);
      } else {
        thirdParty.push(dep);
      }
    }

    return { thirdParty, internal };
  }

  /**
   * Get exports summary
   * @returns {Object} Exports by file
   */
  getExportsSummary() {
    const summary = {};
    for (const [file, exports] of this.exports.entries()) {
      summary[file] = Array.from(exports);
    }
    return summary;
  }

  /**
   * Serialize dependency graph for storage
   * @returns {Object} Serialized graph
   */
  serializeDependencyGraph() {
    const graph = {};
    for (const [file, deps] of this.dependencyGraph.entries()) {
      graph[file] = Array.from(deps);
    }
    return graph;
  }
}

/**
 * Create a DependencyAnalyzer instance
 * @returns {DependencyAnalyzer}
 */
export function createDependencyAnalyzer() {
  return new DependencyAnalyzer();
}

export default DependencyAnalyzer;
