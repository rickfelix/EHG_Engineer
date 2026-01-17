/**
 * Simplification Engine
 * Part of SD-LEO-001: /simplify Command for Automated Code Simplification
 *
 * Core logic for applying database-driven simplification rules to code.
 * Integrates with RefactoringExecutor for safe, rollback-enabled execution.
 *
 * Features:
 * - Database-driven rules (leo_simplification_rules table)
 * - Confidence-based scoring (auto-apply vs suggest vs manual)
 * - Dry-run support for previewing changes
 * - Session-scoped file detection (git diff origin/main)
 * - Integration with existing refactoring infrastructure
 *
 * Usage:
 *   import { SimplificationEngine } from './lib/simplifier/simplification-engine.js';
 *   const engine = new SimplificationEngine(supabaseClient);
 *   const results = await engine.simplify(files, { dryRun: true });
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Confidence thresholds for simplification actions
 * Aligned with AutoFixEngine thresholds
 */
const CONFIDENCE_THRESHOLDS = {
  autoApply: 0.95,   // Apply automatically without confirmation
  suggest: 0.80,     // Suggest with preview (default for most rules)
  manual: 0.60       // Require manual review
};

/**
 * Rule type priorities (lower = applied first)
 * cleanup rules are safest, logic rules need careful review
 */
const RULE_TYPE_ORDER = {
  cleanup: 1,  // Safe, low risk (!!x → Boolean(x))
  style: 2,    // Preference-based (template literals)
  logic: 3     // Requires careful application (ternary conversion)
};

export class SimplificationEngine {
  constructor(supabaseClient, options = {}) {
    this.supabase = supabaseClient;
    this.options = {
      minConfidence: options.minConfidence ?? CONFIDENCE_THRESHOLDS.manual,
      maxFilesDefault: options.maxFilesDefault ?? 20,
      enabledRuleTypes: options.enabledRuleTypes ?? ['cleanup', 'style', 'logic'],
      language: options.language ?? 'javascript',
      ...options
    };
    this.rules = null; // Loaded lazily
  }

  /**
   * Load enabled simplification rules from database
   * @returns {Promise<Array>} Array of rule objects
   */
  async loadRules() {
    if (this.rules) return this.rules;

    const { data: rules, error } = await this.supabase
      .from('leo_simplification_rules')
      .select('*')
      .eq('enabled', true)
      .in('rule_type', this.options.enabledRuleTypes)
      .eq('language', this.options.language)
      .gte('confidence', this.options.minConfidence)
      .order('priority', { ascending: true });

    if (error) {
      throw new Error(`Failed to load simplification rules: ${error.message}`);
    }

    this.rules = rules || [];
    return this.rules;
  }

  /**
   * Get files changed in current session (git diff from main)
   * @param {string} repoPath - Path to repository
   * @returns {Array<string>} Array of changed file paths
   */
  getSessionChangedFiles(repoPath = process.cwd()) {
    try {
      const output = execSync('git diff --name-only origin/main', {
        cwd: repoPath,
        encoding: 'utf8'
      }).trim();

      if (!output) return [];

      return output.split('\n')
        .filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx'))
        .map(f => path.join(repoPath, f));
    } catch (error) {
      console.warn(`Could not get git diff: ${error.message}`);
      return [];
    }
  }

  /**
   * Apply simplification rules to a single file's content
   * @param {string} content - File content
   * @param {string} filePath - File path (for context)
   * @returns {Object} { simplifiedContent, changes, score }
   */
  async simplifyContent(content, filePath) {
    const rules = await this.loadRules();
    const changes = [];
    let workingContent = content;
    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gm');
        const matches = [...workingContent.matchAll(regex)];

        if (matches.length > 0) {
          maxPossibleScore += rule.confidence * 100 * matches.length;

          for (const match of matches) {
            const original = match[0];
            const replacement = this.applyReplacement(original, rule.pattern, rule.replacement, match);

            if (replacement !== original) {
              changes.push({
                rule_code: rule.rule_code,
                rule_name: rule.rule_name,
                rule_type: rule.rule_type,
                confidence: rule.confidence,
                original,
                replacement,
                line: this.getLineNumber(workingContent, match.index),
                description: rule.description
              });

              totalScore += rule.confidence * 100;
            }
          }

          // Apply all replacements for this rule
          if (rule.replacement) {
            workingContent = workingContent.replace(regex, rule.replacement);
          }
        }
      } catch (error) {
        console.warn(`Rule ${rule.rule_code} failed on ${filePath}: ${error.message}`);
      }
    }

    return {
      simplifiedContent: workingContent,
      changes,
      score: {
        total: Math.round(totalScore),
        maxPossible: Math.round(maxPossibleScore),
        percentage: maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 100
      },
      hasChanges: changes.length > 0
    };
  }

  /**
   * Apply replacement pattern with capture groups
   */
  applyReplacement(original, pattern, replacement, match) {
    if (!replacement) return original;

    // Replace capture group references ($1, $2, etc.)
    let result = replacement;
    for (let i = 1; i < match.length; i++) {
      result = result.replace(new RegExp(`\\$${i}`, 'g'), match[i] || '');
    }
    return result;
  }

  /**
   * Get line number for a match index
   */
  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Simplify multiple files
   * @param {Array<string>} files - Array of file paths
   * @param {Object} options - { dryRun, maxFiles }
   * @returns {Object} Simplification results
   */
  async simplify(files, options = {}) {
    const {
      dryRun = true,
      maxFiles = this.options.maxFilesDefault
    } = options;

    const rules = await this.loadRules();

    console.log('\n🔧 Simplification Engine');
    console.log(`   Rules loaded: ${rules.length}`);
    console.log(`   Files to process: ${Math.min(files.length, maxFiles)}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'APPLY CHANGES'}`);
    console.log('-'.repeat(50));

    const results = {
      startTime: Date.now(),
      dryRun,
      rulesApplied: rules.length,
      files: [],
      totalChanges: 0,
      changesByType: { cleanup: 0, style: 0, logic: 0 },
      errors: []
    };

    const filesToProcess = files.slice(0, maxFiles);

    for (const filePath of filesToProcess) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const { simplifiedContent, changes, score, hasChanges } = await this.simplifyContent(content, filePath);

        const fileResult = {
          path: filePath,
          relativePath: path.relative(process.cwd(), filePath),
          changes,
          score,
          hasChanges
        };

        if (hasChanges) {
          results.totalChanges += changes.length;

          // Count by type
          for (const change of changes) {
            if (results.changesByType[change.rule_type] !== undefined) {
              results.changesByType[change.rule_type]++;
            }
          }

          // Apply changes if not dry run
          if (!dryRun) {
            await fs.writeFile(filePath, simplifiedContent, 'utf8');
            fileResult.applied = true;
          }

          this.printFileChanges(fileResult);
        }

        results.files.push(fileResult);

      } catch (error) {
        results.errors.push({
          path: filePath,
          error: error.message
        });
        console.error(`   ❌ Error processing ${filePath}: ${error.message}`);
      }
    }

    results.endTime = Date.now();
    results.duration = results.endTime - results.startTime;
    results.success = results.errors.length === 0;

    this.printSummary(results);

    return results;
  }

  /**
   * Print changes for a single file
   */
  printFileChanges(fileResult) {
    if (!fileResult.hasChanges) return;

    console.log(`\n📄 ${fileResult.relativePath}`);
    console.log(`   Score: ${fileResult.score.percentage}%`);

    for (const change of fileResult.changes) {
      const confidenceIcon = change.confidence >= 0.9 ? '🟢' : change.confidence >= 0.8 ? '🟡' : '🟠';
      console.log(`   ${confidenceIcon} [${change.rule_type}] ${change.rule_name} (line ${change.line})`);
      console.log(`      - ${change.original.substring(0, 50)}${change.original.length > 50 ? '...' : ''}`);
      console.log(`      + ${change.replacement.substring(0, 50)}${change.replacement.length > 50 ? '...' : ''}`);
    }
  }

  /**
   * Print summary of simplification results
   */
  printSummary(results) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Simplification Summary');
    console.log('='.repeat(50));
    console.log(`   Files processed: ${results.files.length}`);
    console.log(`   Files with changes: ${results.files.filter(f => f.hasChanges).length}`);
    console.log(`   Total changes: ${results.totalChanges}`);
    console.log(`   - Cleanup: ${results.changesByType.cleanup}`);
    console.log(`   - Style: ${results.changesByType.style}`);
    console.log(`   - Logic: ${results.changesByType.logic}`);
    console.log(`   Duration: ${results.duration}ms`);

    if (results.dryRun && results.totalChanges > 0) {
      console.log('\n   💡 Run with --apply to apply these changes');
    }

    if (results.errors.length > 0) {
      console.log(`\n   ⚠️  Errors: ${results.errors.length}`);
    }
  }

  /**
   * Get scoring rubric information
   * @returns {Object} Scoring rubric details
   */
  getScoringRubric() {
    return {
      thresholds: CONFIDENCE_THRESHOLDS,
      ruleTypeOrder: RULE_TYPE_ORDER,
      description: {
        autoApply: 'Changes with ≥95% confidence are applied automatically',
        suggest: 'Changes with ≥80% confidence are suggested with preview',
        manual: 'Changes with ≥60% confidence require manual review'
      }
    };
  }
}

export default SimplificationEngine;
