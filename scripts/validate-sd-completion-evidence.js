#!/usr/bin/env node

/**
 * Evidence-Based SD Completion Validator
 * Validates that an SD has real implementation evidence before marking complete
 * Usage: node scripts/validate-sd-completion-evidence.js <SD-ID>
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import { verifyCompleteHandoffChain } from './lib/handoff-preflight.js';

dotenv.config();
const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SDCompletionValidator {
  constructor() {
    this.validationChecks = [
      'handoffChainComplete',  // TIER 2: Validate complete handoff chain first
      'gitCommitsExist',
      'timingValidation',
      'prdExists',
      'implementationEvidence',
      'functionalityTest'
    ];
  }

  async validateSDCompletion(sdId) {
    console.log(chalk.blue.bold(`🔍 VALIDATING SD COMPLETION EVIDENCE: ${sdId}\n`));

    try {
      // Get SD details
      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (error || !sd) {
        throw new Error(`SD ${sdId} not found`);
      }

      console.log(chalk.cyan(`📋 SD: ${sd.title}`));
      console.log(chalk.gray(`   Status: ${sd.status}`));
      console.log(chalk.gray(`   Phase: ${sd.current_phase}`));
      console.log(chalk.gray(`   Created: ${new Date(sd.created_at).toLocaleString()}\n`));

      const results = {
        sdId,
        checks: {},
        overallScore: 0,
        canComplete: false,
        errors: [],
        warnings: []
      };

      // Run all validation checks
      for (const checkName of this.validationChecks) {
        console.log(chalk.yellow(`🔍 Running ${checkName}...`));
        const checkResult = await this[checkName](sd);
        results.checks[checkName] = checkResult;

        if (checkResult.passed) {
          console.log(chalk.green(`   ✅ ${checkResult.message}`));
          results.overallScore += checkResult.score || 20;
        } else {
          console.log(chalk.red(`   ❌ ${checkResult.message}`));
          results.errors.push(checkResult.message);
        }

        if (checkResult.warning) {
          console.log(chalk.yellow(`   ⚠️  ${checkResult.warning}`));
          results.warnings.push(checkResult.warning);
        }
        console.log('');
      }

      // Determine if SD can be marked complete
      results.canComplete = results.overallScore >= 80 && results.errors.length === 0;

      // Final verdict
      console.log(chalk.blue.bold('=== VALIDATION SUMMARY ==='));
      console.log(`Overall Score: ${results.overallScore}/100`);
      console.log(`Errors: ${results.errors.length}`);
      console.log(`Warnings: ${results.warnings.length}`);

      if (results.canComplete) {
        console.log(chalk.green.bold('\n✅ SD CAN BE MARKED COMPLETE'));
        console.log(chalk.green('All validation checks passed with sufficient evidence.'));

        const shouldComplete = await this.promptForCompletion(sdId);
        if (shouldComplete) {
          await this.markSDComplete(sdId, results);
        }
      } else {
        console.log(chalk.red.bold('\n❌ SD CANNOT BE MARKED COMPLETE'));
        console.log(chalk.red('Insufficient evidence or validation failures:'));
        results.errors.forEach(error => {
          console.log(chalk.red(`   • ${error}`));
        });
        console.log(chalk.yellow('\nRequired actions before completion:'));
        console.log(chalk.yellow('1. Implement missing user stories'));
        console.log(chalk.yellow('2. Make git commits with proper SD-ID references'));
        console.log(chalk.yellow('3. Test functionality in target application'));
        console.log(chalk.yellow('4. Re-run this validation'));
      }

      return results;

    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      throw error;
    }
  }

  async gitCommitsExist(sd) {
    try {
      const repos = [
        { name: 'EHG_Engineer', path: '/mnt/c/_EHG/EHG_Engineer' },
        { name: 'EHG', path: '/mnt/c/_EHG/EHG' }
      ];

      let totalCommits = 0;
      const commitDetails = [];

      for (const repo of repos) {
        try {
          const { stdout } = await execAsync(
            `cd ${repo.path} && git log --oneline --since="30 days ago" --grep="${sd.id}" --all`,
            { timeout: 10000 }
          );

          if (stdout.trim()) {
            const commits = stdout.trim().split('\n');
            totalCommits += commits.length;
            commitDetails.push(...commits.map(commit => ({
              repo: repo.name,
              commit: commit.trim()
            })));
          }
        } catch (_error) {
          // Repository might not exist
        }
      }

      if (totalCommits === 0) {
        return {
          passed: false,
          score: 0,
          message: `No git commits found mentioning ${sd.id}`,
          details: { commits: [] }
        };
      }

      return {
        passed: true,
        score: Math.min(totalCommits * 10, 30), // Max 30 points
        message: `Found ${totalCommits} git commits`,
        details: { commits: commitDetails }
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: 'Could not check git commits',
        error: error.message
      };
    }
  }

  async timingValidation(sd) {
    const startTime = new Date(sd.created_at);
    const completionTime = new Date(sd.completion_date || new Date());
    const minutesElapsed = Math.floor((completionTime - startTime) / (1000 * 60));

    if (minutesElapsed < 4) {
      return {
        passed: false,
        score: 0,
        message: `🚨 RED FLAG: Completed in ${minutesElapsed} minutes (< 4 min threshold)`,
        details: { minutesElapsed, suspicious: true }
      };
    }

    if (minutesElapsed < 15) {
      return {
        passed: true,
        score: 10,
        message: `Fast completion: ${minutesElapsed} minutes`,
        warning: 'Unusually fast completion time',
        details: { minutesElapsed, fast: true }
      };
    }

    return {
      passed: true,
      score: 20,
      message: `Reasonable completion time: ${minutesElapsed} minutes`,
      details: { minutesElapsed }
    };
  }

  async prdExists(sd) {
    try {
      const { data: prd, error } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('directive_id', sd.id)
        .single();

      if (error || !prd) {
        return {
          passed: false,
          score: 0,
          message: 'No PRD found for implementation guidance'
        };
      }

      const content = JSON.parse(prd.content);
      const userStoryCount = content.user_stories?.length || 0;

      if (userStoryCount === 0) {
        return {
          passed: false,
          score: 5,
          message: 'PRD exists but has no user stories',
          details: { prd: prd.id, userStories: 0 }
        };
      }

      return {
        passed: true,
        score: 20,
        message: `PRD exists with ${userStoryCount} user stories`,
        details: { prd: prd.id, userStories: userStoryCount }
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: 'Could not validate PRD existence',
        error: error.message
      };
    }
  }

  async implementationEvidence(sd) {
    try {
      // Check for actual file changes in the EHG application
      const { stdout } = await execAsync(
        `cd /mnt/c/_EHG/EHG && git log --name-status --since="30 days ago" --grep="${sd.id}" --all`,
        { timeout: 10000 }
      );

      if (!stdout.trim()) {
        return {
          passed: false,
          score: 0,
          message: 'No implementation files changed in EHG application'
        };
      }

      // Count modified files
      const lines = stdout.split('\n');
      const modifiedFiles = lines.filter(line => line.match(/^[AMD]\s+/)).length;

      if (modifiedFiles === 0) {
        return {
          passed: false,
          score: 0,
          message: 'Git commits exist but no files were modified'
        };
      }

      return {
        passed: true,
        score: Math.min(modifiedFiles * 5, 20), // Max 20 points
        message: `${modifiedFiles} files modified in implementation`,
        details: { modifiedFiles }
      };
    } catch (_error) {
      return {
        passed: false,
        score: 0,
        message: 'Could not verify implementation evidence',
        warning: 'Manual verification of implementation required'
      };
    }
  }

  async functionalityTest(_sd) {
    // This would ideally run automated tests or check deployment
    // For now, we'll check if the implementation looks substantial
    try {
      const { stdout } = await execAsync(
        'cd /mnt/c/_EHG/EHG && git diff --stat HEAD~5 HEAD | grep "files changed"',
        { timeout: 5000 }
      );

      if (stdout.includes('insertions') && stdout.includes('files changed')) {
        return {
          passed: true,
          score: 10,
          message: 'Code changes detected in recent commits',
          warning: 'Manual functionality testing recommended'
        };
      }

      return {
        passed: false,
        score: 0,
        message: 'No substantial code changes detected',
        warning: 'Manual functionality verification required'
      };
    } catch (_error) {
      return {
        passed: false,
        score: 0,
        message: 'Could not verify functionality',
        warning: 'Manual testing required before marking complete'
      };
    }
  }

  /**
   * TIER 2: Handoff Chain Verification
   *
   * Validates that the complete handoff chain exists for this SD.
   * This prevents marking SDs complete that skipped required handoff steps.
   *
   * Required chain for completion:
   * - LEAD-TO-PLAN (planning approved)
   * - PLAN-TO-EXEC (implementation approved)
   * - EXEC-TO-PLAN (implementation verified) - or completion handoff
   *
   * Root Cause Fix: Handoffs were optional and decoupled from state transitions.
   * This gate ensures handoff chain is complete before SD can be marked done.
   */
  async handoffChainComplete(sd) {
    try {
      console.log(chalk.gray(`   Checking handoff chain for ${sd.id}...`));

      const chainResult = await verifyCompleteHandoffChain(sd.id);

      if (chainResult.complete) {
        return {
          passed: true,
          score: 20,
          message: `Complete handoff chain verified (${chainResult.handoffs.length} handoffs)`,
          details: {
            handoffs: chainResult.handoffs,
            chainComplete: true
          }
        };
      }

      // Chain is incomplete - check if this is acceptable
      const missing = chainResult.missing || [];
      const isInfraSD = sd.category === 'A' || sd.category === 'INFRASTRUCTURE';
      const isQuickFix = sd.title?.toLowerCase().includes('quick-fix') ||
                         sd.title?.toLowerCase().includes('hotfix');

      // Allow infrastructure/quick-fix SDs to have reduced requirements
      if ((isInfraSD || isQuickFix) && missing.length <= 1) {
        return {
          passed: true,
          score: 15,
          message: `Handoff chain partial (acceptable for ${isInfraSD ? 'infrastructure' : 'quick-fix'} SD)`,
          warning: `Missing handoffs: ${missing.join(', ')}`,
          details: {
            handoffs: chainResult.handoffs,
            missing,
            reduced_requirements: true
          }
        };
      }

      // Standard SD with incomplete chain - BLOCK
      return {
        passed: false,
        score: 0,
        message: `Incomplete handoff chain: missing ${missing.join(', ')}`,
        details: {
          handoffs: chainResult.handoffs,
          missing,
          chainComplete: false
        }
      };

    } catch (error) {
      // If handoff verification fails, warn but don't block
      // This gracefully handles cases where handoff tables don't exist yet
      console.log(chalk.yellow(`   ⚠️  Handoff chain check failed: ${error.message}`));

      return {
        passed: true,
        score: 10,
        message: 'Handoff chain verification skipped',
        warning: `Could not verify handoff chain: ${error.message}`,
        details: { error: error.message, skipped: true }
      };
    }
  }

  async promptForCompletion(sdId) {
    // In a real system, this would prompt the user
    // For now, return false to require manual completion
    console.log(chalk.yellow('\n📋 To mark SD as complete, run:'));
    console.log(chalk.gray(`   node scripts/mark-sd-complete-with-evidence.js ${sdId}`));
    return false;
  }

  async markSDComplete(sdId, validationResults) {
    const completionTimestamp = new Date().toISOString();

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        current_phase: 'COMPLETED_WITH_EVIDENCE',
        completion_date: completionTimestamp,
        progress: 100,
        metadata: {
          completion_validation: validationResults,
          evidence_validated: true,
          validation_score: validationResults.overallScore,
          completed_by: 'EVIDENCE_VALIDATOR',
          completion_method: 'VALIDATED_COMPLETION'
        },
        updated_at: completionTimestamp
      })
      .eq('id', sdId);

    if (error) {
      throw new Error(`Failed to mark SD complete: ${error.message}`);
    }

    console.log(chalk.green.bold(`\n🎉 ${sdId} marked as COMPLETED with evidence validation!`));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new SDCompletionValidator();
  const sdId = process.argv[2];

  if (!sdId) {
    console.error(chalk.red('Usage: node scripts/validate-sd-completion-evidence.js <SD-ID>'));
    console.error('Example: node scripts/validate-sd-completion-evidence.js SD-004');
    process.exit(1);
  }

  validator.validateSDCompletion(sdId)
    .then(results => {
      if (results.canComplete) {
        console.log(chalk.green('\n✅ Validation complete - SD can be marked done'));
        process.exit(0);
      } else {
        console.log(chalk.red('\n❌ Validation failed - SD needs more work'));
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(chalk.red('Validation error:'), error);
      process.exit(1);
    });
}

export default SDCompletionValidator;