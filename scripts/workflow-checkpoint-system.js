#!/usr/bin/env node

/**
 * Workflow Checkpoint System
 * Implements state persistence and recovery for multi-agent workflows
 * Part of LEO Protocol v4.2.0 - Enhanced Sub-Agent System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { AgentEventBus, EventTypes, Priority } from './agent-event-system.js';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * CheckpointManager - Manages workflow state persistence
 */
export class CheckpointManager {
  constructor(agentCode, workflowId = null) {
    this.agentCode = agentCode;
    this.workflowId = workflowId || `wf_${crypto.randomBytes(8).toString('hex')}`;
    this.eventBus = new AgentEventBus(agentCode);
    this.checkpoints = [];
    this.currentState = {};
    this.checkpointDir = path.join(process.cwd(), '.leo-checkpoints');
  }

  /**
   * Initialize checkpoint directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
      console.log(`✅ Checkpoint directory initialized: ${this.checkpointDir}`);

      // Load any existing checkpoints for this workflow
      await this.loadWorkflowCheckpoints();

    } catch (error) {
      console.error(`Failed to initialize checkpoint directory: ${error.message}`);
    }
  }

  /**
   * Create a checkpoint
   */
  async createCheckpoint(phase, state, metadata = {}) {
    const checkpointId = `chk_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const checkpoint = {
      id: checkpointId,
      workflow_id: this.workflowId,
      agent_code: this.agentCode,
      phase,
      state,
      metadata: {
        ...metadata,
        timestamp,
        sequence: this.checkpoints.length + 1
      },
      created_at: timestamp
    };

    try {
      // Save to database
      const { data, error } = await supabase
        .from('workflow_checkpoints')
        .insert(checkpoint)
        .select()
        .single();

      if (error) {
        // If database fails, save locally
        await this.saveLocalCheckpoint(checkpoint);
      }

      // Add to internal list
      this.checkpoints.push(checkpoint);
      this.currentState = state;

      // Publish checkpoint event
      await this.eventBus.publish(
        EventTypes.CHECKPOINT,
        `Checkpoint created: ${phase}`,
        {
          checkpointId,
          phase,
          workflowId: this.workflowId,
          metadata
        },
        {
          priority: Priority.LOW
        }
      );

      console.log(`✅ Checkpoint created: ${checkpointId} (${phase})`);
      return checkpointId;

    } catch (error) {
      console.error(`Failed to create checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Save checkpoint locally as backup
   */
  async saveLocalCheckpoint(checkpoint) {
    const filename = `${checkpoint.workflow_id}_${checkpoint.id}.json`;
    const filepath = path.join(this.checkpointDir, filename);

    try {
      await fs.writeFile(
        filepath,
        JSON.stringify(checkpoint, null, 2),
        'utf8'
      );
      console.log(`💾 Checkpoint saved locally: ${filename}`);
    } catch (error) {
      console.error(`Failed to save local checkpoint: ${error.message}`);
    }
  }

  /**
   * Load checkpoints for current workflow
   */
  async loadWorkflowCheckpoints() {
    try {
      // Try database first
      const { data: dbCheckpoints, error } = await supabase
        .from('workflow_checkpoints')
        .select('*')
        .eq('workflow_id', this.workflowId)
        .order('created_at', { ascending: true });

      if (dbCheckpoints && dbCheckpoints.length > 0) {
        this.checkpoints = dbCheckpoints;
        console.log(`📥 Loaded ${dbCheckpoints.length} checkpoints from database`);
        return;
      }

      // Fall back to local files
      const files = await fs.readdir(this.checkpointDir).catch(() => []);
      const workflowFiles = files.filter(f =>
        f.startsWith(this.workflowId) && f.endsWith('.json')
      );

      for (const file of workflowFiles) {
        const content = await fs.readFile(
          path.join(this.checkpointDir, file),
          'utf8'
        );
        this.checkpoints.push(JSON.parse(content));
      }

      if (this.checkpoints.length > 0) {
        console.log(`📥 Loaded ${this.checkpoints.length} checkpoints from local files`);
      }

    } catch (error) {
      console.error(`Failed to load checkpoints: ${error.message}`);
    }
  }

  /**
   * Restore from specific checkpoint
   */
  async restoreFromCheckpoint(checkpointId) {
    try {
      // Find checkpoint
      let checkpoint = this.checkpoints.find(c => c.id === checkpointId);

      if (!checkpoint) {
        // Try database
        const { data } = await supabase
          .from('workflow_checkpoints')
          .select('*')
          .eq('id', checkpointId)
          .single();

        checkpoint = data;
      }

      if (!checkpoint) {
        // Try local file
        const files = await fs.readdir(this.checkpointDir).catch(() => []);
        const checkpointFile = files.find(f => f.includes(checkpointId));

        if (checkpointFile) {
          const content = await fs.readFile(
            path.join(this.checkpointDir, checkpointFile),
            'utf8'
          );
          checkpoint = JSON.parse(content);
        }
      }

      if (!checkpoint) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }

      // Restore state
      this.currentState = checkpoint.state;

      // Publish recovery event
      await this.eventBus.publish(
        EventTypes.RECOVERY,
        `Restored from checkpoint: ${checkpoint.phase}`,
        {
          checkpointId,
          phase: checkpoint.phase,
          workflowId: checkpoint.workflow_id,
          restoredState: checkpoint.state
        },
        {
          priority: Priority.HIGH
        }
      );

      console.log(`✅ Restored from checkpoint: ${checkpointId}`);
      return checkpoint;

    } catch (error) {
      console.error(`Failed to restore checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Get latest checkpoint
   */
  getLatestCheckpoint() {
    if (this.checkpoints.length === 0) return null;
    return this.checkpoints[this.checkpoints.length - 1];
  }

  /**
   * Get checkpoint by phase
   */
  getCheckpointByPhase(phase) {
    // Get the most recent checkpoint for the given phase
    const phaseCheckpoints = this.checkpoints.filter(c => c.phase === phase);
    if (phaseCheckpoints.length === 0) return null;
    return phaseCheckpoints[phaseCheckpoints.length - 1];
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(keepCount = 5) {
    if (this.checkpoints.length <= keepCount) return;

    const toRemove = this.checkpoints.slice(0, -keepCount);

    for (const checkpoint of toRemove) {
      // Remove from database
      await supabase
        .from('workflow_checkpoints')
        .delete()
        .eq('id', checkpoint.id);

      // Remove local file
      const filename = `${checkpoint.workflow_id}_${checkpoint.id}.json`;
      const filepath = path.join(this.checkpointDir, filename);
      await fs.unlink(filepath).catch(() => {});
    }

    this.checkpoints = this.checkpoints.slice(-keepCount);
    console.log(`🧹 Cleaned up ${toRemove.length} old checkpoints`);
  }

  /**
   * Export workflow state for sharing
   */
  async exportWorkflow() {
    const exportData = {
      workflow_id: this.workflowId,
      agent_code: this.agentCode,
      current_state: this.currentState,
      checkpoints: this.checkpoints,
      exported_at: new Date().toISOString()
    };

    const filename = `workflow_export_${this.workflowId}_${Date.now()}.json`;
    const filepath = path.join(this.checkpointDir, filename);

    await fs.writeFile(
      filepath,
      JSON.stringify(exportData, null, 2),
      'utf8'
    );

    console.log(`📤 Workflow exported to: ${filename}`);
    return filepath;
  }

  /**
   * Import workflow state
   */
  async importWorkflow(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const importData = JSON.parse(content);

      this.workflowId = importData.workflow_id;
      this.currentState = importData.current_state;
      this.checkpoints = importData.checkpoints || [];

      console.log(`📥 Workflow imported: ${this.workflowId}`);
      return true;

    } catch (error) {
      console.error(`Failed to import workflow: ${error.message}`);
      return false;
    }
  }
}

/**
 * WorkflowOrchestrator - Manages complete workflow with checkpointing
 */
export class WorkflowOrchestrator {
  constructor(workflowId = null) {
    this.workflowId = workflowId || `wf_${crypto.randomBytes(8).toString('hex')}`;
    this.managers = new Map();
    this.phases = [];
    this.currentPhase = null;
    this.state = 'INITIALIZED';
  }

  /**
   * Register agent with checkpoint manager
   */
  async registerAgent(agentCode) {
    const manager = new CheckpointManager(agentCode, this.workflowId);
    await manager.initialize();
    this.managers.set(agentCode, manager);
    return manager;
  }

  /**
   * Define workflow phases
   */
  definePhases(phases) {
    this.phases = phases;
    this.currentPhase = phases[0] || null;
  }

  /**
   * Execute phase with checkpointing
   */
  async executePhase(phase, executor, state = {}) {
    console.log(`\n🚀 Executing phase: ${phase}`);
    this.currentPhase = phase;
    this.state = 'EXECUTING';

    // Get checkpoint manager for current agent
    const manager = this.managers.get(executor.agentCode) ||
                   await this.registerAgent(executor.agentCode);

    // Create checkpoint before execution
    const beforeCheckpoint = await manager.createCheckpoint(
      `${phase}_START`,
      { ...state, phase_status: 'starting' },
      { phase }
    );

    try {
      // Execute the phase
      const result = await executor.execute(state);

      // Create checkpoint after successful execution
      const afterCheckpoint = await manager.createCheckpoint(
        `${phase}_COMPLETE`,
        { ...state, ...result, phase_status: 'completed' },
        { phase, success: true }
      );

      this.state = 'PHASE_COMPLETE';
      return { success: true, result, checkpointId: afterCheckpoint };

    } catch (error) {
      console.error(`❌ Phase execution failed: ${error.message}`);

      // Create error checkpoint
      await manager.createCheckpoint(
        `${phase}_ERROR`,
        { ...state, error: error.message, phase_status: 'failed' },
        { phase, error: true }
      );

      this.state = 'PHASE_FAILED';

      // Attempt recovery
      const recovered = await this.attemptRecovery(phase, manager, beforeCheckpoint);
      if (recovered) {
        return { success: false, recovered: true, checkpointId: beforeCheckpoint };
      }

      return { success: false, error: error.message, checkpointId: beforeCheckpoint };
    }
  }

  /**
   * Attempt to recover from failure
   */
  async attemptRecovery(phase, manager, checkpointId) {
    console.log(`🔄 Attempting recovery for phase: ${phase}`);

    try {
      // Restore from checkpoint
      const checkpoint = await manager.restoreFromCheckpoint(checkpointId);
      if (!checkpoint) return false;

      // Check if we can retry
      const retryCount = checkpoint.metadata.retryCount || 0;
      if (retryCount >= 3) {
        console.log(`❌ Max retries reached for phase: ${phase}`);
        return false;
      }

      console.log(`✅ Recovery successful, ready to retry (attempt ${retryCount + 1}/3)`);
      return true;

    } catch (error) {
      console.error(`Recovery failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus() {
    const status = {
      workflow_id: this.workflowId,
      state: this.state,
      current_phase: this.currentPhase,
      phases_completed: [],
      checkpoints: []
    };

    for (const [agentCode, manager] of this.managers) {
      const latest = manager.getLatestCheckpoint();
      if (latest) {
        status.checkpoints.push({
          agent: agentCode,
          checkpoint: latest.id,
          phase: latest.phase,
          timestamp: latest.created_at
        });

        if (latest.phase.endsWith('_COMPLETE')) {
          status.phases_completed.push(latest.phase.replace('_COMPLETE', ''));
        }
      }
    }

    return status;
  }

  /**
   * Resume workflow from last checkpoint
   */
  async resumeWorkflow() {
    console.log(`🔄 Resuming workflow: ${this.workflowId}`);

    // Find the latest checkpoint across all agents
    let latestCheckpoint = null;
    let latestManager = null;

    for (const [agentCode, manager] of this.managers) {
      const checkpoint = manager.getLatestCheckpoint();
      if (checkpoint && (!latestCheckpoint ||
          new Date(checkpoint.created_at) > new Date(latestCheckpoint.created_at))) {
        latestCheckpoint = checkpoint;
        latestManager = manager;
      }
    }

    if (!latestCheckpoint) {
      console.log(`No checkpoints found for workflow: ${this.workflowId}`);
      return null;
    }

    // Restore from latest checkpoint
    await latestManager.restoreFromCheckpoint(latestCheckpoint.id);

    // Determine next phase
    const completedPhase = latestCheckpoint.phase.replace('_COMPLETE', '').replace('_START', '');
    const phaseIndex = this.phases.indexOf(completedPhase);

    if (phaseIndex >= 0 && phaseIndex < this.phases.length - 1) {
      this.currentPhase = this.phases[phaseIndex + 1];
      console.log(`✅ Resumed at phase: ${this.currentPhase}`);
    } else {
      console.log(`✅ Workflow completed or phase not found`);
    }

    return latestCheckpoint;
  }
}

// Create database table for checkpoints if it doesn't exist
async function createCheckpointTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      agent_code TEXT NOT NULL,
      phase TEXT NOT NULL,
      state JSONB NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),

      INDEX idx_workflow_checkpoints_workflow (workflow_id),
      INDEX idx_workflow_checkpoints_agent (agent_code),
      INDEX idx_workflow_checkpoints_phase (phase),
      INDEX idx_workflow_checkpoints_created (created_at DESC)
    );
  `;

  // Note: This would need to be run via migration script
  console.log('Checkpoint table SQL generated (run via migration)');
}

// Demonstration
async function demonstrateCheckpointing() {
  console.log('\n🎯 WORKFLOW CHECKPOINT SYSTEM DEMONSTRATION');
  console.log('=' .repeat(50));

  // Create orchestrator
  const orchestrator = new WorkflowOrchestrator();

  // Define workflow phases
  orchestrator.definePhases([
    'VALIDATION',
    'PLANNING',
    'IMPLEMENTATION',
    'TESTING',
    'DEPLOYMENT'
  ]);

  // Simulate phase execution with checkpoints
  const validationExecutor = {
    agentCode: 'VALIDATION',
    execute: async (state) => {
      console.log('  Validating codebase...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate some work
      return {
        validated: true,
        findings: ['No conflicts found'],
        timestamp: new Date().toISOString()
      };
    }
  };

  // Execute validation phase
  const result = await orchestrator.executePhase(
    'VALIDATION',
    validationExecutor,
    { sdId: 'test-sd', prdId: 'test-prd' }
  );

  console.log(`\nPhase result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (result.checkpointId) {
    console.log(`Checkpoint: ${result.checkpointId}`);
  }

  // Get workflow status
  const status = await orchestrator.getWorkflowStatus();
  console.log('\n📊 Workflow Status:');
  console.log(JSON.stringify(status, null, 2));

  // Simulate resuming workflow
  console.log('\n🔄 Simulating workflow resume...');
  const resumed = await orchestrator.resumeWorkflow();
  if (resumed) {
    console.log(`Resumed from checkpoint: ${resumed.id}`);
    console.log(`Next phase: ${orchestrator.currentPhase}`);
  }

  console.log('\n✅ Checkpoint system demonstration complete');
}

// Export for use in other modules
export default {
  CheckpointManager,
  WorkflowOrchestrator
};

// Run demonstration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCheckpointing().catch(error => {
    console.error('❌ Demonstration failed:', error);
    process.exit(1);
  });
}