#!/usr/bin/env node

/**
 * Dependency Graph Analyzer
 *
 * Analyzes JavaScript/TypeScript files to build dependency graphs.
 * Used for smart multi-file refactoring to understand relationships.
 *
 * Features:
 * - Parse import/require statements
 * - Build dependency graph
 * - Find related files (imports/exports)
 * - Detect circular dependencies
 * - Group by feature/module
 *
 * Usage:
 *   import DependencyAnalyzer from './lib/refactoring/dependency-analyzer.js';
 *   const analyzer = new DependencyAnalyzer();
 *   const graph = await analyzer.analyzeDirectory('/path/to/src');
 */

import fs from 'fs/promises';
import path from 'path';

class DependencyAnalyzer {
  constructor() {
    this.graph = new Map(); // filePath -> { imports: [], exports: [], dependents: [] }
    this.moduleGroups = new Map(); // moduleId -> [files]
  }

  /**
   * Analyze a directory and build dependency graph
   */
  async analyzeDirectory(dirPath, options = {}) {
    const {
      extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
      excludePatterns = ['node_modules', 'dist', 'build', '.git']
    } = options;

    console.log(`\n🔍 Analyzing dependencies in: ${dirPath}`);

    const files = await this.scanDirectory(dirPath, extensions, excludePatterns);
    console.log(`   Found ${files.length} files to analyze\n`);

    // Analyze each file
    for (const file of files) {
      await this.analyzeFile(file, dirPath);
    }

    // Build reverse dependencies (dependents)
    this.buildDependents();

    // Group by module
    this.groupByModule();

    console.log(`✅ Analysis complete:`);
    console.log(`   Files analyzed: ${this.graph.size}`);
    console.log(`   Module groups: ${this.moduleGroups.size}\n`);

    return {
      graph: this.graph,
      moduleGroups: this.moduleGroups,
      files: Array.from(this.graph.keys())
    };
  }

  /**
   * Scan directory for files
   */
  async scanDirectory(dirPath, extensions, excludePatterns) {
    const files = [];

    async function scan(currentPath) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        // Skip excluded patterns
        if (excludePatterns.some(pattern => fullPath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scan(dirPath);
    return files;
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath, basePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const relativePath = path.relative(basePath, filePath);

      const imports = this.extractImports(content, filePath, basePath);
      const exports = this.extractExports(content);

      this.graph.set(relativePath, {
        filePath: relativePath,
        absolutePath: filePath,
        imports,
        exports,
        dependents: [], // Will be filled by buildDependents()
        size: content.length,
        lines: content.split('\n').length
      });

    } catch (error) {
      console.error(`   ⚠️  Failed to analyze ${filePath}: ${error.message}`);
    }
  }

  /**
   * Extract import statements
   */
  extractImports(content, filePath, basePath) {
    const imports = [];

    // ES6 imports: import ... from '...'
    const es6ImportRegex = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push({
        source: match[1],
        resolved: this.resolveImportPath(match[1], filePath, basePath),
        type: 'import'
      });
    }

    // CommonJS requires: require('...')
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push({
        source: match[1],
        resolved: this.resolveImportPath(match[1], filePath, basePath),
        type: 'require'
      });
    }

    // Dynamic imports: import('...')
    const dynamicImportRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push({
        source: match[1],
        resolved: this.resolveImportPath(match[1], filePath, basePath),
        type: 'dynamic'
      });
    }

    return imports;
  }

  /**
   * Extract export statements
   */
  extractExports(content) {
    const exports = [];

    // Named exports: export { ... }
    if (content.includes('export {')) {
      exports.push({ type: 'named' });
    }

    // Default export: export default
    if (content.includes('export default')) {
      exports.push({ type: 'default' });
    }

    // Direct exports: export const/function/class
    const directExportRegex = /export\s+(const|let|var|function|class|async\s+function)\s+(\w+)/g;
    let match;
    while ((match = directExportRegex.exec(content)) !== null) {
      exports.push({
        type: 'direct',
        kind: match[1],
        name: match[2]
      });
    }

    return exports;
  }

  /**
   * Resolve import path to relative file path
   */
  resolveImportPath(importPath, fromFile, basePath) {
    // Skip node_modules and external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null; // External dependency
    }

    try {
      const fromDir = path.dirname(fromFile);
      let resolved = path.resolve(fromDir, importPath);

      // Try adding common extensions
      const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts'];
      for (const ext of extensions) {
        const testPath = resolved + ext;
        if (this.fileExistsSync(testPath)) {
          return path.relative(basePath, testPath);
        }
      }

      return path.relative(basePath, resolved);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if file exists (sync for simplicity in loop)
   */
  fileExistsSync(filePath) {
    try {
      return require('fs').existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Build reverse dependencies (who depends on this file?)
   */
  buildDependents() {
    for (const [filePath, node] of this.graph.entries()) {
      for (const imp of node.imports) {
        if (imp.resolved && this.graph.has(imp.resolved)) {
          const depNode = this.graph.get(imp.resolved);
          if (!depNode.dependents.includes(filePath)) {
            depNode.dependents.push(filePath);
          }
        }
      }
    }
  }

  /**
   * Group files by module (directory-based)
   */
  groupByModule() {
    for (const [filePath] of this.graph.entries()) {
      // Group by top-level directory
      const parts = filePath.split(path.sep);
      const moduleId = parts.length > 1 ? parts[0] : 'root';

      if (!this.moduleGroups.has(moduleId)) {
        this.moduleGroups.set(moduleId, []);
      }
      this.moduleGroups.get(moduleId).push(filePath);
    }
  }

  /**
   * Find all files related to a given file (direct + transitive dependencies)
   */
  findRelatedFiles(filePath, maxDepth = 2) {
    const related = new Set();
    const visited = new Set();

    const traverse = (currentPath, depth) => {
      if (depth > maxDepth || visited.has(currentPath)) return;
      visited.add(currentPath);

      const node = this.graph.get(currentPath);
      if (!node) return;

      related.add(currentPath);

      // Add imported files
      for (const imp of node.imports) {
        if (imp.resolved && this.graph.has(imp.resolved)) {
          traverse(imp.resolved, depth + 1);
        }
      }

      // Add dependent files
      for (const dependent of node.dependents) {
        traverse(dependent, depth + 1);
      }
    };

    traverse(filePath, 0);
    related.delete(filePath); // Remove self

    return Array.from(related);
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies() {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (filePath, path = []) => {
      if (recursionStack.has(filePath)) {
        // Found cycle
        const cycleStart = path.indexOf(filePath);
        cycles.push(path.slice(cycleStart).concat(filePath));
        return;
      }

      if (visited.has(filePath)) return;

      visited.add(filePath);
      recursionStack.add(filePath);

      const node = this.graph.get(filePath);
      if (node) {
        for (const imp of node.imports) {
          if (imp.resolved && this.graph.has(imp.resolved)) {
            dfs(imp.resolved, path.concat(filePath));
          }
        }
      }

      recursionStack.delete(filePath);
    };

    for (const filePath of this.graph.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath);
      }
    }

    return cycles;
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalFiles = this.graph.size;
    const totalImports = Array.from(this.graph.values()).reduce((sum, node) => sum + node.imports.length, 0);
    const totalExports = Array.from(this.graph.values()).reduce((sum, node) => sum + node.exports.length, 0);
    const avgImportsPerFile = totalFiles > 0 ? (totalImports / totalFiles).toFixed(2) : 0;

    // Find most connected files
    const byDependents = Array.from(this.graph.entries())
      .sort((a, b) => b[1].dependents.length - a[1].dependents.length)
      .slice(0, 5);

    return {
      totalFiles,
      totalImports,
      totalExports,
      avgImportsPerFile,
      moduleGroups: this.moduleGroups.size,
      mostDepended: byDependents.map(([path, node]) => ({
        file: path,
        dependents: node.dependents.length
      }))
    };
  }
}

export default DependencyAnalyzer;