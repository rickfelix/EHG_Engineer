#!/usr/bin/env node
/**
 * LEO Protocol v4.2.0 Git Commit Validation Script
 * Validates commit messages against LEO Protocol guidelines
 * Usage: node scripts/validate-commit-message.js <commit-msg-file>
 * Or as git hook: .git/hooks/commit-msg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CommitValidator {
  constructor() {
    // Conventional commit types allowed
    this.validTypes = [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'test',
      'chore',
      'perf',
      'ci',
      'revert'
    ];

    // Pattern for commit format: type(SD-YYYY-XXX): subject
    this.commitPattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|revert)\((SD-\d{4}-\d{3})\): (.{1,72})$/;

    // Pattern for branch names
    this.branchPattern = /^(feature|fix|chore|docs|test|refactor)\/SD-\d{4}-\d{3}-.+$/;

    // Forbidden starts for imperative mood
    this.forbiddenStarts = [
      'added', 'adds', 'adding',
      'fixed', 'fixes', 'fixing',
      'changed', 'changes', 'changing',
      'removed', 'removes', 'removing',
      'updated', 'updates', 'updating'
    ];
  }

  /**
   * Validate commit message format
   */
  validateFormat(message) {
    const errors = [];
    const lines = message.split('\n');
    const firstLine = lines[0];

    // Check overall format
    if (!this.commitPattern.test(firstLine)) {
      errors.push({
        level: 'error',
        message: 'Commit message must follow format: <type>(SD-YYYY-XXX): <subject>',
        example: 'feat(SD-2025-001): Add OAuth2 authentication flow'
      });

      // Try to provide specific guidance
      if (!firstLine.includes('(')) {
        errors.push({
          level: 'error',
          message: 'Missing scope with SD-ID in parentheses'
        });
      }

      if (!firstLine.includes('SD-')) {
        errors.push({
          level: 'error',
          message: 'Missing Strategic Directive ID (SD-YYYY-XXX)'
        });
      }

      if (!firstLine.includes(':')) {
        errors.push({
          level: 'error',
          message: 'Missing colon after scope'
        });
      }
    }

    // Extract components if possible
    const matches = firstLine.match(this.commitPattern);
    if (matches) {
      const [, type, _sdId, subject] = matches;

      // Validate type
      if (!this.validTypes.includes(type)) {
        errors.push({
          level: 'error',
          message: `Invalid commit type: ${type}`,
          allowed: this.validTypes.join(', ')
        });
      }

      // Validate subject
      if (subject) {
        // Check imperative mood
        const subjectLower = subject.toLowerCase();
        const firstWord = subjectLower.split(' ')[0];

        for (const forbidden of this.forbiddenStarts) {
          if (firstWord === forbidden) {
            errors.push({
              level: 'error',
              message: `Use imperative mood: "${this.toImperative(forbidden)}" not "${forbidden}"`,
              found: firstWord
            });
          }
        }

        // Check for period at end
        if (subject.endsWith('.')) {
          errors.push({
            level: 'warning',
            message: 'Subject should not end with a period'
          });
        }

        // Check length
        if (subject.length < 10) {
          errors.push({
            level: 'warning',
            message: 'Subject is too short (min 10 characters)'
          });
        }
      }
    }

    // Check line length
    if (firstLine.length > 100) {
      errors.push({
        level: 'error',
        message: `First line too long (${firstLine.length} > 100 characters)`
      });
    }

    // Check body formatting if present
    if (lines.length > 1) {
      // Should have blank line after subject
      if (lines[1] !== '') {
        errors.push({
          level: 'warning',
          message: 'Missing blank line between subject and body'
        });
      }

      // Check body line lengths
      for (let i = 2; i < lines.length; i++) {
        if (lines[i].length > 72 && !lines[i].startsWith('Co-Authored-By:') && !lines[i].includes('http')) {
          errors.push({
            level: 'warning',
            message: `Body line ${i + 1} exceeds 72 characters (${lines[i].length})`
          });
        }
      }
    }

    return errors;
  }

  /**
   * Convert past tense to imperative
   */
  toImperative(word) {
    const conversions = {
      'added': 'Add',
      'adds': 'Add',
      'adding': 'Add',
      'fixed': 'Fix',
      'fixes': 'Fix',
      'fixing': 'Fix',
      'changed': 'Change',
      'changes': 'Change',
      'changing': 'Change',
      'removed': 'Remove',
      'removes': 'Remove',
      'removing': 'Remove',
      'updated': 'Update',
      'updates': 'Update',
      'updating': 'Update'
    };

    return conversions[word.toLowerCase()] || word;
  }

  /**
   * Validate from file (git hook usage)
   */
  async validateFile(filepath) {
    try {
      const message = fs.readFileSync(filepath, 'utf8').trim();

      // Skip merge commits
      if (message.startsWith('Merge')) {
        console.log(chalk.gray('↩ Skipping merge commit validation'));
        return { valid: true, errors: [] };
      }

      // Skip revert commits
      if (message.startsWith('Revert')) {
        console.log(chalk.gray('↩ Skipping revert commit validation'));
        return { valid: true, errors: [] };
      }

      const errors = this.validateFormat(message);
      const hasErrors = errors.some(e => e.level === 'error');

      return {
        valid: !hasErrors,
        errors,
        message
      };
    } catch (error) {
      console.error(chalk.red('Failed to read commit message file:'), error.message);
      return {
        valid: false,
        errors: [{ level: 'error', message: error.message }]
      };
    }
  }

  /**
   * Validate string directly
   */
  validateString(message) {
    const errors = this.validateFormat(message);
    const hasErrors = errors.some(e => e.level === 'error');

    return {
      valid: !hasErrors,
      errors,
      message
    };
  }

  /**
   * Print validation results
   */
  printResults(result) {
    console.log('\n' + chalk.blue.bold('LEO Protocol v4.2.0 - Commit Message Validation'));
    console.log(chalk.gray('─'.repeat(60)));

    if (result.valid) {
      console.log(chalk.green.bold('✅ Commit message is valid!'));

      // Show warnings if any
      const warnings = result.errors.filter(e => e.level === 'warning');
      if (warnings.length > 0) {
        console.log('\n' + chalk.yellow('⚠ Warnings:'));
        warnings.forEach(w => {
          console.log(chalk.yellow(`  - ${w.message}`));
        });
      }
    } else {
      console.log(chalk.red.bold('❌ Commit message validation failed!'));
      console.log('\n' + chalk.red('Errors:'));

      result.errors.filter(e => e.level === 'error').forEach(e => {
        console.log(chalk.red(`  ✗ ${e.message}`));
        if (e.example) {
          console.log(chalk.gray(`    Example: ${e.example}`));
        }
        if (e.allowed) {
          console.log(chalk.gray(`    Allowed: ${e.allowed}`));
        }
      });

      const warnings = result.errors.filter(e => e.level === 'warning');
      if (warnings.length > 0) {
        console.log('\n' + chalk.yellow('Warnings:'));
        warnings.forEach(w => {
          console.log(chalk.yellow(`  ⚠ ${w.message}`));
        });
      }

      console.log('\n' + chalk.cyan('📖 For full guidelines, see:'));
      console.log(chalk.cyan('   docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md'));

      console.log('\n' + chalk.white.bold('Valid format:'));
      console.log(chalk.white('   <type>(SD-YYYY-XXX): <subject>'));
      console.log(chalk.gray('   Types: feat|fix|docs|style|refactor|test|chore|perf|ci|revert'));
      console.log(chalk.gray('   Example: feat(SD-2025-001): Add OAuth2 authentication'));
    }

    console.log(chalk.gray('─'.repeat(60)) + '\n');

    return result.valid;
  }
}

// Main execution
async function main() {
  const validator = new CommitValidator();

  // Check if running as git hook or standalone
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.cyan('Usage: node scripts/validate-commit-message.js <commit-msg-file>'));
    console.log(chalk.cyan('Or install as git hook: .git/hooks/commit-msg'));
    process.exit(1);
  }

  const filepath = args[0];
  const result = await validator.validateFile(filepath);
  const isValid = validator.printResults(result);

  // Exit with appropriate code for git hook
  process.exit(isValid ? 0 : 1);
}

// Export for testing/programmatic use
export { CommitValidator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Unexpected error:'), error);
    process.exit(1);
  });
}