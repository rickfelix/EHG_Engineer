#!/usr/bin/env node

/**
 * Hook Sub-Agent Activator
 *
 * Centralizes sub-agent activation for git hook issues
 * Maps hook failures to appropriate sub-agents
 * Provides unified interface for resolution
 */

import { createClient } from '@supabase/supabase-js';
import SessionManagerSubAgent from './session-manager-subagent.js';
import { GitHubDeploymentSubAgent } from './github-deployment-subagent.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class HookSubAgentActivator {
  constructor() {
    this.activationLog = [];
    this.subAgentMap = {
      'no_orchestrator_session': {
        name: 'Session Manager',
        code: 'SESSION_MGR',
        handler: SessionManagerSubAgent,
        action: 'create'
      },
      'stale_session': {
        name: 'Session Manager',
        code: 'SESSION_MGR',
        handler: SessionManagerSubAgent,
        action: 'refresh'
      },
      'prd_files_detected': {
        name: 'Database Migration',
        code: 'DB_MIGRATION',
        handler: null, // Will use inline migration
        action: 'migrate_prd'
      },
      'handoff_files_detected': {
        name: 'Database Migration',
        code: 'DB_MIGRATION',
        handler: null, // Will use inline migration
        action: 'migrate_handoff'
      },
      'duplicate_services': {
        name: 'Code Analysis',
        code: 'CODE_ANALYSIS',
        handler: null, // Manual resolution needed
        action: 'analyze_duplicates'
      },
      'uncommitted_changes': {
        name: 'Git Operations',
        code: 'GIT_OPS',
        handler: null, // Will use inline git operations
        action: 'stash_changes'
      }
    };
  }

  /**
   * Activate appropriate sub-agent for the failure type
   */
  async activateForFailure(failureType, context = {}) {
    console.log(`\n🤖 Activating sub-agent for: ${failureType}`);

    const subAgentConfig = this.subAgentMap[failureType];

    if (!subAgentConfig) {
      console.log('⚠️  No sub-agent mapped for this failure type');
      return {
        success: false,
        message: 'No sub-agent available for this issue'
      };
    }

    console.log(`📋 Sub-Agent: ${subAgentConfig.name} (${subAgentConfig.code})`);

    // Record activation attempt
    await this.recordActivation(subAgentConfig.code, failureType, 'started');

    try {
      let result;

      if (subAgentConfig.handler) {
        // Use actual sub-agent class
        const subAgent = new subAgentConfig.handler();
        result = await subAgent.activate({
          action: subAgentConfig.action,
          ...context
        });

      } else {
        // Use inline resolution
        result = await this.handleInlineResolution(failureType, subAgentConfig.action, context);
      }

      // Record result
      await this.recordActivation(
        subAgentConfig.code,
        failureType,
        result.success ? 'completed' : 'failed',
        result
      );

      return result;

    } catch (error) {
      console.error(`❌ Sub-agent activation failed:`, error.message);

      await this.recordActivation(
        subAgentConfig.code,
        failureType,
        'error',
        { error: error.message }
      );

      return {
        success: false,
        error: error.message,
        subAgent: subAgentConfig.code
      };
    }
  }

  /**
   * Handle inline resolutions for sub-agents without dedicated classes
   */
  async handleInlineResolution(failureType, action, context) {
    switch (action) {
      case 'migrate_prd':
        return await this.migratePRDFiles();

      case 'migrate_handoff':
        return await this.migrateHandoffFiles();

      case 'stash_changes':
        return await this.stashUncommittedChanges();

      case 'analyze_duplicates':
        return await this.analyzeDuplicateServices();

      default:
        return {
          success: false,
          message: `No inline handler for action: ${action}`
        };
    }
  }

  /**
   * Migrate PRD files to database
   */
  async migratePRDFiles() {
    console.log('📦 Migrating PRD files to database...');

    try {
      // Check for PRD files
      const prdFiles = await fs.readdir('prds').catch(() => []);
      const mdFiles = prdFiles.filter(f => f.endsWith('.md'));

      if (mdFiles.length === 0) {
        return {
          success: true,
          message: 'No PRD files to migrate'
        };
      }

      // Run migration script
      execSync('node scripts/add-prd-to-database.js', { stdio: 'inherit' });

      // Remove PRD files
      for (const file of mdFiles) {
        await fs.unlink(path.join('prds', file));
        console.log(`  Removed: prds/${file}`);
      }

      return {
        success: true,
        action: 'prd_migrated',
        message: `Migrated ${mdFiles.length} PRD files to database`,
        filesProcessed: mdFiles
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'PRD migration failed'
      };
    }
  }

  /**
   * Migrate handoff files to database
   */
  async migrateHandoffFiles() {
    console.log('📦 Migrating handoff files to database...');

    try {
      const handoffDirs = ['handoffs', 'docs/handoffs'];
      const handoffFiles = [];

      // Find all handoff files
      for (const dir of handoffDirs) {
        try {
          const files = await fs.readdir(dir).catch(() => []);
          const mdFiles = files.filter(f => f.endsWith('.md') && f.includes('handoff'));
          for (const file of mdFiles) {
            handoffFiles.push(path.join(dir, file));
          }
        } catch {
          // Directory doesn't exist
        }
      }

      if (handoffFiles.length === 0) {
        return {
          success: true,
          message: 'No handoff files to migrate'
        };
      }

      // Read and parse each handoff file
      const migrations = [];
      for (const filePath of handoffFiles) {
        const content = await fs.readFile(filePath, 'utf8');

        // Extract metadata from filename and content
        const filename = path.basename(filePath);
        const fromAgentMatch = filename.match(/(LEAD|PLAN|EXEC)/g);
        const fromAgent = fromAgentMatch ? fromAgentMatch[0] : 'UNKNOWN';
        const toAgent = fromAgentMatch && fromAgentMatch[1] ? fromAgentMatch[1] : 'UNKNOWN';

        migrations.push({
          file: filePath,
          from_agent: fromAgent,
          to_agent: toAgent,
          content: content,
          migrated_at: new Date().toISOString()
        });
      }

      // Store in database
      try {
        for (const migration of migrations) {
          await supabase
            .from('sd_phase_handoffs')
            .insert({
              from_agent: migration.from_agent,
              to_agent: migration.to_agent,
              executive_summary: migration.content,
              status: 'completed',
              metadata: {
                original_file: migration.file,
                migrated_at: migration.migrated_at,
                migrated_by: 'hook-subagent-activator'
              }
            });
        }

        // Remove files after successful migration
        for (const filePath of handoffFiles) {
          await fs.unlink(filePath);
          console.log(`  Removed: ${filePath}`);
        }

        return {
          success: true,
          action: 'handoffs_migrated',
          message: `Migrated ${handoffFiles.length} handoff files to database`,
          filesProcessed: handoffFiles
        };

      } catch (dbError) {
        console.error('  Database migration failed:', dbError.message);
        return {
          success: false,
          error: dbError.message,
          message: 'Failed to store handoffs in database',
          recommendation: 'Ensure sd_phase_handoffs table exists'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Handoff migration failed'
      };
    }
  }

  /**
   * Stash uncommitted changes
   */
  async stashUncommittedChanges() {
    console.log('📦 Stashing uncommitted changes...');

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const stashMessage = `auto-stash-${timestamp}`;

      execSync(`git stash push -m "${stashMessage}" --include-untracked`);

      return {
        success: true,
        action: 'changes_stashed',
        message: 'Uncommitted changes stashed',
        stashName: stashMessage
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to stash changes'
      };
    }
  }

  /**
   * Analyze duplicate service files
   */
  async analyzeDuplicateServices() {
    console.log('🔍 Analyzing duplicate services...');

    const duplicates = [];
    const analysis = {
      duplicates: [],
      recommendations: [],
      autoFixable: []
    };

    try {
      // Check for duplicates between src/services and lib/dashboard-legacy
      const srcServices = await fs.readdir('src/services').catch(() => []);
      const libServices = await fs.readdir('lib/dashboard-legacy').catch(() => []);

      for (const file of libServices) {
        if (srcServices.includes(file) && !file.includes('.deprecated')) {
          duplicates.push(file);

          // Analyze each duplicate
          const srcPath = path.join('src/services', file);
          const libPath = path.join('lib/dashboard-legacy', file);

          try {
            const srcStats = await fs.stat(srcPath);
            const libStats = await fs.stat(libPath);

            // Determine which is newer
            const srcNewer = srcStats.mtime > libStats.mtime;

            analysis.duplicates.push({
              file,
              srcPath,
              libPath,
              srcModified: srcStats.mtime,
              libModified: libStats.mtime,
              recommendation: srcNewer ? 'keep_src' : 'keep_lib_but_verify'
            });

            // If lib version is significantly older, it's safe to auto-remove
            const daysDiff = Math.abs(srcStats.mtime - libStats.mtime) / (1000 * 60 * 60 * 24);
            if (srcNewer && daysDiff > 30) {
              analysis.autoFixable.push({
                file,
                action: 'deprecate_lib_version',
                reason: `lib version is ${Math.floor(daysDiff)} days older`
              });
            }
          } catch (statError) {
            console.warn(`  Could not analyze: ${file}`);
          }
        }
      }

      if (duplicates.length === 0) {
        return {
          success: true,
          message: 'No duplicate services found'
        };
      }

      // Auto-fix safe duplicates
      if (analysis.autoFixable.length > 0) {
        console.log(`  🤖 Auto-deprecating ${analysis.autoFixable.length} old duplicates...`);

        for (const fix of analysis.autoFixable) {
          const oldPath = path.join('lib/dashboard-legacy', fix.file);
          const deprecatedPath = oldPath + '.deprecated';

          try {
            await fs.rename(oldPath, deprecatedPath);
            console.log(`    Deprecated: ${fix.file} (${fix.reason})`);
          } catch (renameError) {
            console.warn(`    Could not deprecate: ${fix.file}`);
          }
        }

        // Check if all duplicates were fixed
        if (analysis.autoFixable.length === duplicates.length) {
          return {
            success: true,
            action: 'duplicates_auto_fixed',
            message: `Auto-deprecated ${analysis.autoFixable.length} duplicate files`,
            fixed: analysis.autoFixable
          };
        }
      }

      // Still have duplicates that need manual review
      const remaining = duplicates.length - analysis.autoFixable.length;
      return {
        success: false,
        action: 'duplicates_found',
        message: `${remaining} duplicates need manual review (${analysis.autoFixable.length} auto-fixed)`,
        analysis,
        recommendation: 'Review remaining duplicates and choose appropriate versions'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to analyze duplicates'
      };
    }
  }

  /**
   * Record sub-agent activation in database
   */
  async recordActivation(subAgentCode, trigger, status, result = null) {
    try {
      const activation = {
        sub_agent_code: subAgentCode,
        trigger,
        status,
        activated_at: new Date().toISOString(),
        session_id: `HOOK-${Date.now()}`,
        result: result ? JSON.stringify(result) : null,
        metadata: {
          source: 'hook-feedback-system',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      this.activationLog.push(activation);

      // Try to record in database
      await supabase
        .from('sub_agent_activations')
        .insert(activation);

      console.log(`  📝 Recorded: ${subAgentCode} - ${status}`);

    } catch (error) {
      // Database table might not exist yet
      console.warn('  ⚠️  Could not record activation:', error.message);
    }
  }

  /**
   * Get activation summary
   */
  getActivationSummary() {
    return {
      totalActivations: this.activationLog.length,
      successful: this.activationLog.filter(a => a.status === 'completed').length,
      failed: this.activationLog.filter(a => a.status === 'failed').length,
      errors: this.activationLog.filter(a => a.status === 'error').length,
      activations: this.activationLog
    };
  }

  /**
   * Check if a sub-agent can handle a specific failure
   */
  canHandle(failureType) {
    return this.subAgentMap.hasOwnProperty(failureType);
  }

  /**
   * Get all available sub-agents
   */
  getAvailableSubAgents() {
    return Object.entries(this.subAgentMap).map(([trigger, config]) => ({
      trigger,
      name: config.name,
      code: config.code,
      hasHandler: config.handler !== null
    }));
  }
}

// Export for module use
export default HookSubAgentActivator;
export { HookSubAgentActivator };

// CLI testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const activator = new HookSubAgentActivator();
  const failureType = process.argv[2];

  if (!failureType) {
    console.log('Hook Sub-Agent Activator');
    console.log('========================');
    console.log('\nUsage: node hook-subagent-activator.js <failure-type>');
    console.log('\nAvailable failure types:');
    activator.getAvailableSubAgents().forEach(agent => {
      console.log(`  - ${agent.trigger} → ${agent.name} (${agent.code})`);
    });
    process.exit(0);
  }

  activator.activateForFailure(failureType)
    .then(result => {
      console.log('\n📊 Result:', JSON.stringify(result, null, 2));
      console.log('\n📈 Summary:', activator.getActivationSummary());
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}