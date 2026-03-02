#!/usr/bin/env node

/**
 * EXEC Phase Checklist Enforcer
 * Mandatory pre-implementation verification system
 * Prevents coding without proper validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import _path from 'path';
import { isPortInUse } from '../lib/utils/process-utils.js';

const execAsync = promisify(exec);
dotenv.config();

class EXECChecklistEnforcer {
  constructor() {
    // Require service role key for governance/audit writes (evidence collection)
    // Anon key may fail silently under RLS on governance tables
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required for exec-checklist-enforcer');
      console.error('   Evidence writes to governance tables require service role permissions.');
      console.error('   Set SUPABASE_SERVICE_ROLE_KEY in your .env file.');
      process.exit(1);
    }

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    );

    // Mandatory checklist items
    this.checklist = {
      applicationVerified: {
        description: 'Correct application directory verified',
        validator: this.verifyApplication.bind(this),
        critical: true
      },
      gitRepositoryConfirmed: {
        description: 'Git repository is correct target',
        validator: this.verifyGitRepository.bind(this),
        critical: true
      },
      urlAccessible: {
        description: 'Target URL is accessible',
        validator: this.verifyURL.bind(this),
        critical: false
      },
      componentIdentified: {
        description: 'Target component file identified',
        validator: this.identifyComponent.bind(this),
        critical: true
      },
      screenshotTaken: {
        description: 'Before-state screenshot captured',
        validator: this.takeScreenshot.bind(this),
        critical: true
      },
      portVerified: {
        description: 'Application port number confirmed',
        validator: this.verifyPort.bind(this),
        critical: false
      },
      dependenciesChecked: {
        description: 'Required dependencies available',
        validator: this.checkDependencies.bind(this),
        critical: false
      }
    };

    this.results = {};
    this.evidence = {};
  }

  /**
   * Main enforcement entry point
   */
  async enforceChecklist(prdId, _options = {}) {
    console.log(chalk.blue.bold('\n🚨 EXEC PRE-IMPLEMENTATION CHECKLIST'));
    console.log(chalk.blue('━'.repeat(50)));

    try {
      // Load PRD details
      const prd = await this.loadPRD(prdId);

      console.log(chalk.cyan(`\nPRD: ${prd.title}`));
      console.log(chalk.gray(`SD: ${prd.directive_id}\n`));

      // Execute each checklist item
      for (const [key, item] of Object.entries(this.checklist)) {
        console.log(chalk.yellow(`\n📋 ${item.description}`));

        try {
          const result = await item.validator(prd);
          this.results[key] = result;

          if (result.passed) {
            console.log(chalk.green('  ✓ PASSED'));
            if (result.evidence) {
              console.log(chalk.gray(`    Evidence: ${result.evidence}`));
              this.evidence[key] = result.evidence;
            }
          } else {
            console.log(chalk.red(`  ✗ FAILED: ${result.reason}`));
            if (item.critical) {
              throw new Error(`Critical checklist item failed: ${item.description}`);
            }
          }
        } catch (error) {
          console.log(chalk.red(`  ✗ ERROR: ${error.message}`));
          if (item.critical) {
            throw error;
          }
        }
      }

      // Generate compliance score
      const score = this.calculateComplianceScore();
      console.log(chalk.cyan(`\n📊 Compliance Score: ${score}%`));

      // Store results in database
      await this.storeChecklistResults(prdId);

      if (score < 100) {
        const criticalFailed = Object.entries(this.checklist)
          .filter(([key, item]) => item.critical && !this.results[key]?.passed)
          .length;

        if (criticalFailed > 0) {
          throw new Error(`${criticalFailed} critical checklist items failed`);
        }

        // Ask for override if non-critical items failed
        const { override } = await inquirer.prompt([{
          type: 'confirm',
          name: 'override',
          message: 'Non-critical items failed. Continue anyway?',
          default: false
        }]);

        if (!override) {
          throw new Error('Checklist enforcement failed - execution blocked');
        }
      }

      console.log(chalk.green.bold('\n✅ CHECKLIST COMPLETE - SAFE TO PROCEED'));
      return {
        passed: true,
        score,
        evidence: this.evidence
      };

    } catch (error) {
      console.error(chalk.red.bold('\n❌ CHECKLIST FAILED:'), error.message);

      // Log failure
      await this.logChecklistFailure(prdId, error);

      return {
        passed: false,
        error: error.message,
        score: this.calculateComplianceScore()
      };
    }
  }

  /**
   * Verify correct application directory
   */
  async verifyApplication(_prd) {
    const { stdout: pwd } = await execAsync('pwd');
    const currentDir = pwd.trim();

    // Check if we're in the correct app directory
    const isEHGApp = currentDir.includes('/ehg') && !currentDir.includes('/EHG_Engineer');
    const isEHGEngineer = currentDir.includes('/EHG_Engineer');

    if (isEHGEngineer) {
      return {
        passed: false,
        reason: 'In EHG_Engineer - should be in EHG app for implementation'
      };
    }

    if (!isEHGApp) {
      // Prompt for confirmation
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Not in EHG app directory. Current: ${currentDir}. Continue?`,
        default: false
      }]);

      if (!confirmed) {
        return {
          passed: false,
          reason: 'Not in correct application directory'
        };
      }
    }

    return {
      passed: true,
      evidence: currentDir
    };
  }

  /**
   * Verify Git repository
   */
  async verifyGitRepository(_prd) {
    try {
      const { stdout } = await execAsync('git remote -v');

      // Check for correct repository
      const isCorrectRepo = stdout.includes('rickfelix/ehg.git') ||
                           stdout.includes('rickfelix/EHG_Engineer.git');

      if (!isCorrectRepo) {
        return {
          passed: false,
          reason: 'Not in correct Git repository'
        };
      }

      // Get current branch
      const { stdout: branch } = await execAsync('git branch --show-current');

      return {
        passed: true,
        evidence: `Repository verified, branch: ${branch.trim()}`
      };
    } catch (error) {
      return {
        passed: false,
        reason: `Git verification failed: ${error.message}`
      };
    }
  }

  /**
   * Verify URL accessibility
   */
  async verifyURL(prd) {
    // Extract URL from PRD if present
    const url = prd.metadata?.target_url || prd.url;

    if (!url) {
      return {
        passed: true,
        evidence: 'No URL specified in PRD'
      };
    }

    console.log(chalk.gray(`  Checking URL: ${url}`));

    // For now, prompt for manual verification
    const { accessible } = await inquirer.prompt([{
      type: 'confirm',
      name: 'accessible',
      message: `Is ${url} accessible?`,
      default: true
    }]);

    return {
      passed: accessible,
      reason: accessible ? '' : 'URL not accessible',
      evidence: url
    };
  }

  /**
   * Identify target component
   */
  async identifyComponent(prd) {
    // Try to extract component from PRD
    const componentPath = prd.metadata?.target_component;

    if (componentPath) {
      // Verify file exists
      try {
        await fs.access(componentPath);
        return {
          passed: true,
          evidence: componentPath
        };
      } catch {
        console.log(chalk.yellow(`  Component ${componentPath} not found`));
      }
    }

    // Prompt for component identification
    const { component } = await inquirer.prompt([{
      type: 'input',
      name: 'component',
      message: 'Enter target component path (or "none" if N/A):',
      default: 'none'
    }]);

    if (component === 'none') {
      return {
        passed: true,
        evidence: 'No specific component (documentation task)'
      };
    }

    // Verify component exists
    try {
      await fs.access(component);
      return {
        passed: true,
        evidence: component
      };
    } catch {
      return {
        passed: false,
        reason: `Component not found: ${component}`
      };
    }
  }

  /**
   * Take screenshot of current state
   */
  async takeScreenshot(prd) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `screenshots/exec-before-${prd.id}-${timestamp}.png`;

    // Create screenshots directory if it doesn't exist
    await fs.mkdir('screenshots', { recursive: true });

    // Prompt for screenshot
    console.log(chalk.cyan('  📸 Please take a screenshot of the current state'));
    console.log(chalk.gray(`  Save as: ${screenshotPath}`));

    const { taken } = await inquirer.prompt([{
      type: 'confirm',
      name: 'taken',
      message: 'Screenshot taken and saved?',
      default: false
    }]);

    if (!taken) {
      return {
        passed: false,
        reason: 'Screenshot not taken'
      };
    }

    // Store screenshot reference in database
    await this.supabase
      .from('exec_screenshots')
      .insert({
        prd_id: prd.id,
        type: 'before',
        path: screenshotPath,
        timestamp: new Date()
      });

    return {
      passed: true,
      evidence: screenshotPath
    };
  }

  /**
   * Verify application port
   */
  async verifyPort(prd) {
    const expectedPort = prd.metadata?.port || '3000';

    // Check if port is in use (cross-platform)
    try {
      const portActive = await isPortInUse(parseInt(expectedPort, 10));

      if (portActive) {
        return {
          passed: true,
          evidence: `Port ${expectedPort} is active`
        };
      }
    } catch {
      // Port not in use
      console.log(chalk.yellow(`  Port ${expectedPort} not active`));
    }

    // Ask if port is correct
    const { correct } = await inquirer.prompt([{
      type: 'confirm',
      name: 'correct',
      message: `Expected port ${expectedPort}. Is this correct?`,
      default: true
    }]);

    return {
      passed: correct,
      evidence: `Port ${expectedPort} confirmed`
    };
  }

  /**
   * Check required dependencies
   */
  async checkDependencies(prd) {
    const dependencies = prd.dependencies || [];

    if (dependencies.length === 0) {
      return {
        passed: true,
        evidence: 'No specific dependencies required'
      };
    }

    console.log(chalk.gray(`  Checking ${dependencies.length} dependencies...`));

    const missing = [];
    for (const dep of dependencies) {
      // Check if dependency is available
      // This is simplified - real implementation would check package.json, etc.
      const { exists } = await inquirer.prompt([{
        type: 'confirm',
        name: 'exists',
        message: `Is "${dep}" available?`,
        default: true
      }]);

      if (!exists) {
        missing.push(dep);
      }
    }

    if (missing.length > 0) {
      return {
        passed: false,
        reason: `Missing dependencies: ${missing.join(', ')}`
      };
    }

    return {
      passed: true,
      evidence: `All ${dependencies.length} dependencies verified`
    };
  }

  /**
   * Load PRD from database
   */
  async loadPRD(prdId) {
    const { data, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (error || !data) {
      throw new Error(`PRD ${prdId} not found`);
    }

    return data;
  }

  /**
   * Calculate compliance score
   */
  calculateComplianceScore() {
    const total = Object.keys(this.checklist).length;
    const passed = Object.values(this.results).filter(r => r?.passed).length;
    return Math.round((passed / total) * 100);
  }

  /**
   * Store checklist results in database
   */
  async storeChecklistResults(prdId) {
    const record = {
      prd_id: prdId,
      checklist_type: 'exec_pre_implementation',
      results: this.results,
      evidence: this.evidence,
      compliance_score: this.calculateComplianceScore(),
      executed_at: new Date()
    };

    await this.supabase
      .from('exec_checklist_results')
      .insert(record);
  }

  /**
   * Log checklist failure
   */
  async logChecklistFailure(prdId, error) {
    await this.supabase
      .from('leo_violations')
      .insert({
        prd_id: prdId,
        violation_type: 'exec_checklist_failure',
        details: error.message,
        checklist_results: this.results,
        timestamp: new Date()
      });
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const enforcer = new EXECChecklistEnforcer();

  const prdId = process.argv[2];
  if (!prdId) {
    console.error(chalk.red('Usage: node exec-checklist-enforcer.js <PRD-ID>'));
    process.exit(1);
  }

  enforcer.enforceChecklist(prdId)
    .then(result => {
      if (result.passed) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(() => process.exit(1));
}

export default EXECChecklistEnforcer;