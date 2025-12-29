#!/usr/bin/env node

/**
 * Refactoring Context Packager
 *
 * Creates smart context packages for multi-file refactoring.
 * Leverages:
 * - Phase 1/2: File trees for path validation
 * - Phase 3: Overflow prevention for large refactors
 * - Phase 5: Dependency analysis for file relationships
 *
 * Usage:
 *   import ContextPackager from './lib/refactoring/context-packager.js';
 *   const packager = new ContextPackager();
 *   const package = await packager.createPackage(targetFiles, options);
 */

import DependencyAnalyzer from './dependency-analyzer.js';
import ContextMonitor from '../context/context-monitor.js';
import MemoryManager from '../context/memory-manager.js';
import fs from 'fs/promises';
import path from 'path';

class ContextPackager {
  constructor() {
    this.analyzer = new DependencyAnalyzer();
    this.contextMonitor = new ContextMonitor();
    this.memoryManager = new MemoryManager();
  }

  /**
   * Create refactoring context package
   */
  async createPackage(targetFiles, options = {}) {
    const {
      basePath = process.cwd(),
      includeRelated = true,
      maxRelatedDepth = 2,
      includeTests: _includeTests = false,
      enableOverflowPrevention = true
    } = options;

    console.log('\n📦 Creating Refactoring Context Package');
    console.log(`   Target files: ${targetFiles.length}`);
    console.log(`   Base path: ${basePath}\n`);

    // Step 1: Analyze dependencies
    console.log('🔍 Analyzing dependencies...');
    const analysis = await this.analyzer.analyzeDirectory(basePath);

    // Step 2: Find related files
    const relatedFiles = new Set(targetFiles);

    if (includeRelated) {
      console.log('🔗 Finding related files...');
      for (const targetFile of targetFiles) {
        const related = this.analyzer.findRelatedFiles(targetFile, maxRelatedDepth);
        related.forEach(f => relatedFiles.add(f));
      }
      console.log(`   Found ${relatedFiles.size - targetFiles.length} additional related files\n`);
    }

    // Step 3: Group files by module
    const grouped = this.groupFilesByModule(Array.from(relatedFiles), analysis.moduleGroups);

    // Step 4: Read file contents
    console.log('📄 Reading file contents...');
    const fileContents = await this.readFiles(Array.from(relatedFiles), basePath);

    // Step 5: Check context size and apply overflow prevention if needed
    let strategy = 'full';
    if (enableOverflowPrevention) {
      strategy = await this.applyOverflowPrevention(fileContents);
    }

    // Step 6: Build package
    const contextPackage = {
      metadata: {
        created: new Date().toISOString(),
        targetFiles,
        totalFiles: relatedFiles.size,
        basePath,
        strategy,
        moduleGroups: grouped.size
      },
      files: fileContents,
      grouped: Object.fromEntries(grouped),
      analysis: {
        graph: Object.fromEntries(analysis.graph),
        stats: this.analyzer.getStats(),
        circularDependencies: this.analyzer.detectCircularDependencies()
      },
      refactoringPlan: this.generateRefactoringPlan(Array.from(relatedFiles), grouped)
    };

    console.log('✅ Package created:');
    console.log(`   Total files: ${contextPackage.files.length}`);
    console.log(`   Module groups: ${contextPackage.metadata.moduleGroups}`);
    console.log(`   Strategy: ${strategy}\n`);

    return contextPackage;
  }

  /**
   * Group files by module
   */
  groupFilesByModule(files, moduleGroups) {
    const grouped = new Map();

    for (const [moduleId, moduleFiles] of moduleGroups.entries()) {
      const filesInModule = files.filter(f => moduleFiles.includes(f));
      if (filesInModule.length > 0) {
        grouped.set(moduleId, filesInModule);
      }
    }

    return grouped;
  }

  /**
   * Read file contents
   */
  async readFiles(files, basePath) {
    const contents = [];

    for (const file of files) {
      try {
        const fullPath = path.join(basePath, file);
        const content = await fs.readFile(fullPath, 'utf8');

        contents.push({
          path: file,
          absolutePath: fullPath,
          content,
          lines: content.split('\n').length,
          size: content.length,
          extension: path.extname(file)
        });
      } catch (error) {
        console.warn(`   ⚠️  Failed to read ${file}: ${error.message}`);
      }
    }

    return contents;
  }

  /**
   * Apply overflow prevention (Phase 3 integration)
   */
  async applyOverflowPrevention(fileContents) {
    // Estimate token count
    const totalChars = fileContents.reduce((sum, f) => sum + f.size, 0);
    const estimatedTokens = this.contextMonitor.estimateTokens(totalChars.toString());

    console.log('🔍 Context check:');
    console.log(`   Estimated tokens: ${estimatedTokens.toLocaleString()}`);

    // Check against thresholds
    if (estimatedTokens > 50000) {
      console.log('   ⚠️  Large refactoring detected - applying summarization\n');

      // Save full context to memory
      await this.memoryManager.updateSection(
        'Refactoring Context Package',
        JSON.stringify(fileContents, null, 2)
      );

      return 'memory-first';
    } else if (estimatedTokens > 30000) {
      console.log('   💡 Medium refactoring - selective approach recommended\n');
      return 'selective';
    } else {
      console.log('   ✅ Context healthy for full refactoring\n');
      return 'full';
    }
  }

  /**
   * Generate refactoring plan
   */
  generateRefactoringPlan(files, grouped) {
    const steps = [];

    // Step 1: Analyze phase
    steps.push({
      phase: 'analyze',
      description: 'Review dependency graph and identify impact scope',
      files: files.slice(0, 5), // Show first 5 as examples
      estimatedTime: '5 min'
    });

    // Step 2: Module-by-module refactoring
    for (const [moduleId, moduleFiles] of grouped.entries()) {
      steps.push({
        phase: 'refactor',
        module: moduleId,
        description: `Refactor ${moduleFiles.length} files in ${moduleId} module`,
        files: moduleFiles,
        estimatedTime: `${Math.ceil(moduleFiles.length * 2)} min`
      });
    }

    // Step 3: Validation phase
    steps.push({
      phase: 'validate',
      description: 'Run syntax checks, import validation, and tests',
      files: [],
      estimatedTime: '10 min'
    });

    return {
      steps,
      totalSteps: steps.length,
      estimatedTotalTime: steps.reduce((sum, step) => {
        const time = parseInt(step.estimatedTime) || 0;
        return sum + time;
      }, 0)
    };
  }

  /**
   * Export package to file (for documentation/review)
   */
  async exportPackage(contextPackage, outputPath) {
    const summary = {
      metadata: contextPackage.metadata,
      fileList: contextPackage.files.map(f => ({
        path: f.path,
        lines: f.lines,
        size: f.size
      })),
      analysis: {
        stats: contextPackage.analysis.stats,
        circularDependencies: contextPackage.analysis.circularDependencies
      },
      refactoringPlan: contextPackage.refactoringPlan
    };

    await fs.writeFile(
      outputPath,
      JSON.stringify(summary, null, 2),
      'utf8'
    );

    console.log(`📁 Package summary exported to: ${outputPath}`);
  }

  /**
   * Validate package before refactoring
   */
  validatePackage(contextPackage) {
    const issues = [];

    // Check for circular dependencies
    if (contextPackage.analysis.circularDependencies.length > 0) {
      issues.push({
        type: 'warning',
        message: `Found ${contextPackage.analysis.circularDependencies.length} circular dependencies`,
        details: contextPackage.analysis.circularDependencies.slice(0, 3)
      });
    }

    // Check for missing files
    const missingImports = [];
    for (const [filePath, node] of Object.entries(contextPackage.analysis.graph)) {
      for (const imp of node.imports) {
        if (imp.resolved && !contextPackage.analysis.graph[imp.resolved]) {
          missingImports.push({ file: filePath, missing: imp.source });
        }
      }
    }

    if (missingImports.length > 0) {
      issues.push({
        type: 'warning',
        message: `${missingImports.length} imports reference files outside the package`,
        details: missingImports.slice(0, 5)
      });
    }

    // Check context size
    const totalSize = contextPackage.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 500000) { // 500KB
      issues.push({
        type: 'caution',
        message: `Large package size (${(totalSize / 1024).toFixed(2)} KB) - consider breaking into smaller refactorings`
      });
    }

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues
    };
  }
}

export default ContextPackager;