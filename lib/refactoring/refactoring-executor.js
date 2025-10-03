#!/usr/bin/env node

/**
 * Refactoring Executor with Validation
 *
 * Executes multi-file refactorings with validation between steps.
 * Integrates with all phases for robust refactoring.
 *
 * Features:
 * - Step-by-step execution with validation
 * - Syntax checking after each file
 * - Import validation
 * - Rollback on failure
 * - Progress tracking
 *
 * Usage:
 *   import RefactoringExecutor from './lib/refactoring/refactoring-executor.js';
 *   const executor = new RefactoringExecutor();
 *   const result = await executor.execute(contextPackage, refactorFn);
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class RefactoringExecutor {
  constructor(options = {}) {
    this.validateSyntax = options.validateSyntax !== false;
    this.validateImports = options.validateImports !== false;
    this.enableRollback = options.enableRollback !== false;
    this.backupDir = options.backupDir || '.refactor-backup';
  }

  /**
   * Execute refactoring with validation
   */
  async execute(contextPackage, refactorFunction, options = {}) {
    const {
      stepByStep = true,
      validateAfterEachFile = true
    } = options;

    console.log(`\n🔧 Executing Refactoring`);
    console.log(`   Total files: ${contextPackage.files.length}`);
    console.log(`   Strategy: ${contextPackage.metadata.strategy}\n`);

    const results = {
      startTime: Date.now(),
      filesProcessed: 0,
      filesSucceeded: 0,
      filesFailed: 0,
      validationsPassed: 0,
      validationsFailed: 0,
      changes: [],
      errors: []
    };

    // Create backup
    if (this.enableRollback) {
      await this.createBackup(contextPackage);
    }

    try {
      // Execute refactoring plan step by step
      if (stepByStep && contextPackage.refactoringPlan) {
        await this.executeByPlan(contextPackage, refactorFunction, results, validateAfterEachFile);
      } else {
        await this.executeAllFiles(contextPackage, refactorFunction, results, validateAfterEachFile);
      }

      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;
      results.success = results.filesFailed === 0;

      this.printResults(results);

      return results;

    } catch (error) {
      console.error(`\n❌ Refactoring failed: ${error.message}`);

      if (this.enableRollback) {
        console.log(`\n🔄 Rolling back changes...`);
        await this.rollback(contextPackage);
        console.log(`✅ Rollback complete`);
      }

      throw error;
    }
  }

  /**
   * Execute refactoring by plan (module by module)
   */
  async executeByPlan(contextPackage, refactorFunction, results, validate) {
    const plan = contextPackage.refactoringPlan;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      console.log(`\n📋 Step ${i + 1}/${plan.steps.length}: ${step.phase} - ${step.description}`);

      if (step.phase === 'analyze') {
        // Analysis step - just review
        console.log(`   ℹ️  Review step - no changes made`);
        continue;
      }

      if (step.phase === 'refactor') {
        // Refactor files in this step
        for (const filePath of step.files) {
          await this.processFile(filePath, contextPackage, refactorFunction, results, validate);
        }

        // Validate after module
        if (validate) {
          console.log(`   🔍 Validating module...`);
          const moduleValidation = await this.validateModule(step.files, contextPackage.metadata.basePath);
          if (!moduleValidation.valid) {
            throw new Error(`Module validation failed: ${moduleValidation.error}`);
          }
          console.log(`   ✅ Module validation passed`);
        }
      }

      if (step.phase === 'validate') {
        // Final validation step
        console.log(`   🔍 Running final validation...`);
        const finalValidation = await this.validateAll(contextPackage);
        if (!finalValidation.valid) {
          throw new Error(`Final validation failed: ${finalValidation.error}`);
        }
        console.log(`   ✅ Final validation passed`);
      }
    }
  }

  /**
   * Execute all files at once
   */
  async executeAllFiles(contextPackage, refactorFunction, results, validate) {
    for (const file of contextPackage.files) {
      await this.processFile(file.path, contextPackage, refactorFunction, results, validate);
    }
  }

  /**
   * Process a single file
   */
  async processFile(filePath, contextPackage, refactorFunction, results, validate) {
    results.filesProcessed++;

    try {
      // Find file in package
      const fileData = contextPackage.files.find(f => f.path === filePath);
      if (!fileData) {
        throw new Error(`File not found in package: ${filePath}`);
      }

      console.log(`   🔄 Processing: ${filePath}`);

      // Apply refactoring function
      const originalContent = fileData.content;
      const refactoredContent = await refactorFunction(originalContent, fileData, contextPackage);

      // Check if content changed
      if (refactoredContent === originalContent) {
        console.log(`      ⏭️  No changes needed`);
        results.filesSucceeded++;
        return;
      }

      // Write changes
      const fullPath = path.join(contextPackage.metadata.basePath, filePath);
      await fs.writeFile(fullPath, refactoredContent, 'utf8');

      results.changes.push({
        file: filePath,
        sizeBefore: originalContent.length,
        sizeAfter: refactoredContent.length,
        linesBefore: originalContent.split('\n').length,
        linesAfter: refactoredContent.split('\n').length
      });

      // Validate if enabled
      if (validate) {
        const validation = await this.validateFile(fullPath);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.error}`);
        }
        results.validationsPassed++;
        console.log(`      ✅ Validated`);
      } else {
        console.log(`      ✅ Written`);
      }

      results.filesSucceeded++;

    } catch (error) {
      console.error(`      ❌ Failed: ${error.message}`);
      results.filesFailed++;
      results.errors.push({
        file: filePath,
        error: error.message
      });

      if (validate) {
        results.validationsFailed++;
      }

      // Stop on first error if rollback enabled
      if (this.enableRollback) {
        throw error;
      }
    }
  }

  /**
   * Validate a single file
   */
  async validateFile(filePath) {
    if (!this.validateSyntax) {
      return { valid: true };
    }

    try {
      const ext = path.extname(filePath);

      // JavaScript/TypeScript syntax check
      if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
        // Try to parse with Node.js
        const { error } = await execAsync(`node --check "${filePath}"`);
        if (error) {
          return { valid: false, error: error.message };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate module (group of files)
   */
  async validateModule(files, basePath) {
    // Check imports between files
    if (!this.validateImports) {
      return { valid: true };
    }

    try {
      // Read all files and check imports exist
      for (const file of files) {
        const fullPath = path.join(basePath, file);
        const content = await fs.readFile(fullPath, 'utf8');

        // Extract imports
        const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1];

          // Check if import starts with './' or '../' (relative import)
          if (importPath.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(fullPath), importPath);

            // Try common extensions
            const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts'];
            let found = false;
            for (const ext of extensions) {
              try {
                await fs.access(resolvedPath + ext);
                found = true;
                break;
              } catch {}
            }

            if (!found) {
              return {
                valid: false,
                error: `Import not found: ${importPath} in ${file}`
              };
            }
          }
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate all files
   */
  async validateAll(contextPackage) {
    console.log(`      Checking ${contextPackage.files.length} files...`);

    for (const file of contextPackage.files) {
      const fullPath = path.join(contextPackage.metadata.basePath, file.path);
      const validation = await this.validateFile(fullPath);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  }

  /**
   * Create backup before refactoring
   */
  async createBackup(contextPackage) {
    console.log(`💾 Creating backup...`);

    const backupPath = path.join(contextPackage.metadata.basePath, this.backupDir);
    await fs.mkdir(backupPath, { recursive: true });

    for (const file of contextPackage.files) {
      const sourcePath = file.absolutePath;
      const destPath = path.join(backupPath, file.path);

      // Create directory structure
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Copy file
      await fs.copyFile(sourcePath, destPath);
    }

    console.log(`   ✅ Backup created at: ${backupPath}\n`);
  }

  /**
   * Rollback changes from backup
   */
  async rollback(contextPackage) {
    const backupPath = path.join(contextPackage.metadata.basePath, this.backupDir);

    for (const file of contextPackage.files) {
      const backupFilePath = path.join(backupPath, file.path);
      const originalPath = file.absolutePath;

      try {
        await fs.copyFile(backupFilePath, originalPath);
      } catch (error) {
        console.error(`   ⚠️  Failed to restore ${file.path}: ${error.message}`);
      }
    }
  }

  /**
   * Print results summary
   */
  printResults(results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Refactoring Results\n`);
    console.log(`   Files processed: ${results.filesProcessed}`);
    console.log(`   ✅ Succeeded: ${results.filesSucceeded}`);
    console.log(`   ❌ Failed: ${results.filesFailed}`);

    if (this.validateSyntax || this.validateImports) {
      console.log(`\n   Validation:`);
      console.log(`   ✅ Passed: ${results.validationsPassed}`);
      console.log(`   ❌ Failed: ${results.validationsFailed}`);
    }

    console.log(`\n   Changes made: ${results.changes.length} files`);
    console.log(`   Duration: ${(results.duration / 1000).toFixed(2)}s`);

    if (results.success) {
      console.log(`\n✅ Refactoring completed successfully!`);
    } else {
      console.log(`\n⚠️  Refactoring completed with errors`);
      console.log(`\n   Errors:`);
      results.errors.forEach(err => {
        console.log(`      - ${err.file}: ${err.error}`);
      });
    }

    console.log('='.repeat(60) + '\n');
  }
}

export default RefactoringExecutor;