#!/usr/bin/env node

/**
 * Session Manager Sub-Agent
 *
 * Manages LEO Protocol orchestrator sessions for git operations
 * Handles session creation, validation, and refresh
 * Integrates with pre-commit hooks and feedback loop
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SessionManagerSubAgent {
  constructor() {
    this.sessionFile = '.leo-session-active';
    this.sessionIdFile = '.leo-session-id';
    this.maxSessionAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  }

  /**
   * Main activation entry point
   */
  async activate(context = {}) {
    console.log('🔐 Session Manager Sub-Agent Activating...');
    console.log('==========================================');

    const { action = 'validate', sdId = null, force: _force = false } = context;

    try {
      switch (action) {
        case 'create':
          return await this.createSession(sdId);

        case 'refresh':
          return await this.refreshSession();

        case 'validate':
          return await this.validateSession();

        case 'cleanup':
          return await this.cleanupSession();

        case 'auto-resolve':
          return await this.autoResolveSessionIssue();

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (_error) {
      console.error('❌ Session Manager error:', error.message);
      return {
        success: false,
        error: error.message,
        recommendation: this.getRecommendation(error.message)
      };
    }
  }

  /**
   * Create a new orchestrator session
   */
  async createSession(sdId) {
    console.log('📝 Creating new orchestrator session...');

    // If no SD ID provided, try to detect from context
    if (!sdId) {
      sdId = await this.detectCurrentSD();
    }

    // Create session files
    const timestamp = new Date().toISOString();
    await fs.writeFile(this.sessionFile, timestamp);
    await fs.writeFile(this.sessionIdFile, sdId);

    // Record in database
    try {
      await supabase
        .from('leo_session_tracking')
        .insert({
          session_id: `SESSION-${Date.now()}`,
          sd_id: sdId,
          created_at: timestamp,
          created_by: 'session-manager-subagent',
          status: 'active',
          metadata: {
            trigger: 'manual_creation',
            environment: process.env.NODE_ENV || 'development'
          }
        });
    } catch (dbError) {
      console.warn('⚠️  Could not record session in database:', dbError.message);
    }

    console.log(`✅ Session created for ${sdId}`);

    return {
      success: true,
      action: 'session_created',
      sdId,
      timestamp,
      message: `Orchestrator session created successfully for ${sdId}`
    };
  }

  /**
   * Refresh an existing session
   */
  async refreshSession() {
    console.log('🔄 Refreshing orchestrator session...');

    // Check if session exists
    const sessionExists = await this.checkSessionFiles();
    if (!sessionExists) {
      console.log('⚠️  No session to refresh, creating new one...');
      return await this.createSession(null);
    }

    // Read current SD ID
    let sdId = 'SD-TEMP-001';
    try {
      sdId = await fs.readFile(this.sessionIdFile, 'utf8');
    } catch {
      // Use default if can't read
    }

    // Update timestamp
    const timestamp = new Date().toISOString();
    await fs.writeFile(this.sessionFile, timestamp);

    console.log(`✅ Session refreshed for ${sdId}`);

    return {
      success: true,
      action: 'session_refreshed',
      sdId,
      timestamp,
      message: 'Orchestrator session refreshed successfully'
    };
  }

  /**
   * Validate current session
   */
  async validateSession() {
    console.log('🔍 Validating orchestrator session...');

    const validation = {
      exists: false,
      valid: false,
      age: null,
      sdId: null,
      issues: []
    };

    // Check if session files exist
    const sessionExists = await this.checkSessionFiles();
    if (!sessionExists) {
      validation.issues.push('No session files found');
      console.log('❌ No active session');
      return {
        success: false,
        validation,
        message: 'No active orchestrator session'
      };
    }

    validation.exists = true;

    // Check session age
    try {
      const sessionTime = await fs.readFile(this.sessionFile, 'utf8');
      const sessionDate = new Date(sessionTime);
      const age = Date.now() - sessionDate.getTime();
      validation.age = age;

      if (age > this.maxSessionAge) {
        validation.issues.push(`Session is stale (${Math.round(age / 60000)} minutes old)`);
      } else {
        validation.valid = true;
      }

      // Get SD ID
      validation.sdId = await fs.readFile(this.sessionIdFile, 'utf8');

    } catch (_error) {
      validation.issues.push(`Error reading session: ${error.message}`);
    }

    if (validation.valid) {
      console.log(`✅ Session valid for ${validation.sdId}`);
    } else {
      console.log(`❌ Session invalid: ${validation.issues.join(', ')}`);
    }

    return {
      success: validation.valid,
      validation,
      message: validation.valid ? 'Session is valid' : 'Session validation failed'
    };
  }

  /**
   * Auto-resolve session issues
   */
  async autoResolveSessionIssue() {
    console.log('🔧 Auto-resolving session issue...');

    // First, validate to understand the issue
    const validationResult = await this.validateSession();

    if (validationResult.success) {
      console.log('✅ Session is already valid');
      return {
        success: true,
        action: 'no_resolution_needed',
        message: 'Session is already valid'
      };
    }

    // Determine resolution based on issues
    const { validation } = validationResult;

    if (!validation.exists) {
      // No session exists - create one
      console.log('📝 Creating new session...');
      return await this.createSession(null);

    } else if (validation.issues.includes('Session is stale')) {
      // Session is stale - refresh it
      console.log('🔄 Refreshing stale session...');
      return await this.refreshSession();

    } else {
      // Unknown issue - try creating fresh
      console.log('🆕 Creating fresh session...');
      await this.cleanupSession();
      return await this.createSession(null);
    }
  }

  /**
   * Cleanup session files
   */
  async cleanupSession() {
    console.log('🧹 Cleaning up session files...');

    try {
      await fs.unlink(this.sessionFile).catch(() => {});
      await fs.unlink(this.sessionIdFile).catch(() => {});
      console.log('✅ Session files cleaned up');

      return {
        success: true,
        action: 'session_cleaned',
        message: 'Session files removed'
      };
    } catch (_error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to cleanup session'
      };
    }
  }

  /**
   * Detect current SD from git context
   */
  async detectCurrentSD() {
    console.log('🔍 Detecting current SD from context...');

    try {
      // Try branch name first
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      const branchMatch = branch.match(/SD-\d{4}-\d{3}/);
      if (branchMatch) {
        console.log(`  Found SD in branch: ${branchMatch[0]}`);
        return branchMatch[0];
      }

      // Try recent commits
      const commits = execSync('git log -10 --oneline', { encoding: 'utf8' });
      const commitMatch = commits.match(/SD-\d{4}-\d{3}/);
      if (commitMatch) {
        console.log(`  Found SD in commits: ${commitMatch[0]}`);
        return commitMatch[0];
      }

      // Check for working SDs in database
      const { data: activeSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (activeSDs && activeSDs.length > 0) {
        console.log(`  Found active SD in database: ${activeSDs[0].id}`);
        return activeSDs[0].id;
      }

    } catch (_error) {
      console.warn('  Could not detect SD:', error.message);
    }

    // Default fallback
    console.log('  Using temporary SD identifier');
    return 'SD-TEMP-001';
  }

  /**
   * Check if session files exist
   */
  async checkSessionFiles() {
    try {
      await fs.access(this.sessionFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get recommendation based on error
   */
  getRecommendation(errorMessage) {
    if (errorMessage.includes('No active session')) {
      return 'Run: npm run leo:execute SD-YYYY-XXX';
    }
    if (errorMessage.includes('stale')) {
      return 'Refresh session or start new orchestrator';
    }
    return 'Check error details and retry';
  }
}

// Export for module use
export default SessionManagerSubAgent;
export { SessionManagerSubAgent };

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const subAgent = new SessionManagerSubAgent();
  const action = process.argv[2] || 'validate';
  const sdId = process.argv[3] || null;

  subAgent.activate({ action, sdId })
    .then(result => {
      console.log('\n📊 Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}