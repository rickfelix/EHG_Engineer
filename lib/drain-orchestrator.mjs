/**
 * Drain Orchestrator - SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
 *
 * Agent lifecycle state machine. Manages N slots, each running one SD
 * through the full LEAD→PLAN→EXEC→SHIP lifecycle via Claude Code Agent tool.
 *
 * State machine per slot:
 *   IDLE → CLAIMING → WORKTREE_SETUP → AGENT_SPAWNED → RUNNING
 *     → COMPLETED → CLEANUP → RELEASING → IDLE
 *     → FAILED    → CLEANUP → RELEASING → IDLE
 */

import { createSupabaseServiceClient } from './supabase-client.js';
import { createVirtualSession, claimVirtualSession, terminateVirtualSession, terminateAllVirtualSessions }
  from './virtual-session-factory.mjs';
import { DrainErrorHandler } from './drain-error-handler.mjs';
import { DrainProgress } from './drain-progress.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SLOT_STATES = ['IDLE', 'CLAIMING', 'WORKTREE_SETUP', 'AGENT_SPAWNED', 'RUNNING',
  'COMPLETED', 'FAILED', 'CLEANUP', 'RELEASING'];

const POLL_INTERVAL_MS = 10_000; // 10 seconds between checks
const AGENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min max per SD

/**
 * @typedef {Object} SlotState
 * @property {number} slot
 * @property {string} state - One of SLOT_STATES
 * @property {string|null} sdKey
 * @property {string|null} sessionId - Virtual session ID
 * @property {string|null} worktreePath
 * @property {import('child_process').ChildProcess|null} process
 * @property {number|null} startedAt
 */

export class DrainOrchestrator {
  /**
   * @param {Object} opts
   * @param {string} opts.parentSessionId - The real session running the drain
   * @param {number} opts.maxAgents - Max parallel slots (1-3)
   * @param {string|null} opts.trackFilter - Optional track filter (A, B, C)
   * @param {boolean} opts.dryRun - If true, don't actually spawn agents
   */
  constructor({ parentSessionId, maxAgents = 2, trackFilter = null, dryRun = false }) {
    this.parentSessionId = parentSessionId;
    this.maxAgents = Math.min(Math.max(maxAgents, 1), 3);
    this.trackFilter = trackFilter;
    this.dryRun = dryRun;

    /** @type {SlotState[]} */
    this.slots = Array.from({ length: this.maxAgents }, (_, i) => ({
      slot: i,
      state: 'IDLE',
      sdKey: null,
      sessionId: null,
      worktreePath: null,
      process: null,
      startedAt: null
    }));

    this.errorHandler = new DrainErrorHandler();
    this.progress = new DrainProgress();
    this.running = false;
    this.sdQueue = [];
    this.processedSDs = new Set();
    this.supabase = createSupabaseServiceClient();
  }

  /**
   * Load workable SDs from the queue.
   */
  async loadQueue() {
    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, sd_type, priority, current_phase, category, parent_sd_id, dependencies, metadata')
      .eq('is_active', true)
      .in('status', ['draft', 'in_progress', 'active'])
      .is('claiming_session_id', null)
      .order('sequence_rank', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Failed to load SD queue:', error.message);
      return [];
    }

    let queue = data || [];

    // Filter by track (mapped from category) if specified
    if (this.trackFilter) {
      const trackCategoryMap = { A: 'Infrastructure', B: 'Feature', C: 'Quality' };
      const targetCategory = trackCategoryMap[this.trackFilter];
      if (targetCategory) {
        queue = queue.filter(sd => sd.category === targetCategory);
      }
    }

    // GUARDRAIL 6: Dependency-ordering filter — exclude child SDs whose parent
    // has not completed PLAN phase. Prevents executing against partially-formed specs.
    const childSDs = queue.filter(sd => sd.parent_sd_id);
    if (childSDs.length > 0) {
      const parentIds = [...new Set(childSDs.map(sd => sd.parent_sd_id))];
      const { data: parents } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, current_phase, status')
        .in('id', parentIds);

      const completedParents = new Set(
        (parents || [])
          .filter(p => ['EXEC', 'EXEC_COMPLETE', 'COMPLETED'].includes(p.current_phase) || p.status === 'completed')
          .map(p => p.id)
      );

      queue = queue.filter(sd => {
        if (!sd.parent_sd_id) return true; // non-child SDs pass through
        if (completedParents.has(sd.parent_sd_id)) return true; // parent finished PLAN
        return false; // parent still in LEAD or PLAN — skip
      });
    }

    // GUARDRAIL 7: Migration/schema serialization — SDs with risk keywords
    // "migration" or "schema" must never run concurrently. If any slot is already
    // running a migration/schema SD, exclude all others. If none running, allow at most one.
    const SERIALIZED_KEYWORDS = /\b(migration|schema|migrate)\b/i;
    const isSerializedSD = (sd) => {
      const titleMatch = SERIALIZED_KEYWORDS.test(sd.title || '');
      const typeMatch = sd.sd_type === 'migration';
      const metaMatch = SERIALIZED_KEYWORDS.test(JSON.stringify(sd.metadata?.risk_keywords || ''));
      return titleMatch || typeMatch || metaMatch;
    };

    const runningSerializedSD = this.slots.some(s =>
      s.state === 'RUNNING' && s.sdKey && isSerializedSD({ title: s.sdKey }) // conservative: check active slots
    );
    if (runningSerializedSD) {
      queue = queue.filter(sd => !isSerializedSD(sd));
    } else {
      // Allow at most one serialized SD — it will be the first one picked
      let foundSerialized = false;
      queue = queue.filter(sd => {
        if (!isSerializedSD(sd)) return true;
        if (!foundSerialized) { foundSerialized = true; return true; }
        return false; // exclude additional serialized SDs
      });
    }

    // Exclude already-processed and known-failed SDs
    queue = queue.filter(sd =>
      !this.processedSDs.has(sd.sd_key) &&
      !this.errorHandler.shouldSkipSD(sd.sd_key)
    );

    this.sdQueue = queue;
    return queue;
  }

  /**
   * Get the next SD from the queue.
   */
  getNextSD() {
    while (this.sdQueue.length > 0) {
      const sd = this.sdQueue.shift();
      if (!this.processedSDs.has(sd.sd_key) && !this.errorHandler.shouldSkipSD(sd.sd_key)) {
        return sd;
      }
    }
    return null;
  }

  /**
   * Find an idle slot.
   */
  getIdleSlot() {
    return this.slots.find(s => s.state === 'IDLE');
  }

  /**
   * Transition a slot to a new state.
   */
  _transition(slot, newState) {
    const s = this.slots[slot];
    const oldState = s.state;
    s.state = newState;
    this.progress.record(slot, s.sdKey || '?', 'phase', `${oldState} → ${newState}`);
  }

  /**
   * Assign an SD to a slot: create virtual session, claim, setup worktree.
   */
  async assignToSlot(slotIndex, sd) {
    const slot = this.slots[slotIndex];
    slot.sdKey = sd.sd_key;
    slot.startedAt = Date.now();

    // Create virtual session
    this._transition(slotIndex, 'CLAIMING');
    const { sessionId, error: sessError } = await createVirtualSession({
      parentSessionId: this.parentSessionId,
      slot: slotIndex,
      sdKey: sd.sd_key
    });

    if (sessError) {
      console.error(`  [Slot ${slotIndex}] Failed to create virtual session:`, sessError);
      this._handleSlotFailure(slotIndex, `Virtual session creation failed: ${sessError}`);
      return false;
    }

    slot.sessionId = sessionId;
    this.progress.record(slotIndex, sd.sd_key, 'claim', `Virtual session: ${sessionId}`);

    // Claim the SD
    const { error: claimError } = await claimVirtualSession(sessionId, sd.sd_key);
    if (claimError) {
      console.error(`  [Slot ${slotIndex}] Failed to claim SD:`, claimError);
      this._handleSlotFailure(slotIndex, `Claim failed: ${claimError}`);
      return false;
    }

    // Update the SD's claiming_session_id
    await this.supabase.from('strategic_directives_v2')
      .update({ claiming_session_id: sessionId, is_working_on: true })
      .eq('sd_key', sd.sd_key);

    // Worktree setup
    this._transition(slotIndex, 'WORKTREE_SETUP');
    try {
      const wtResult = execSync(
        `node scripts/worktree-create.js ${sd.sd_key}`,
        { encoding: 'utf8', cwd: path.resolve(__dirname, '..'), timeout: 30000 }
      );
      // Parse worktree path from output
      const pathMatch = wtResult.match(/WORKTREE_PATH=(.+)/);
      slot.worktreePath = pathMatch ? pathMatch[1].trim() : null;
      this.progress.record(slotIndex, sd.sd_key, 'phase', `Worktree: ${slot.worktreePath || 'main-fallback'}`);
    } catch (e) {
      // Worktree creation is non-fatal; agent can work in main
      slot.worktreePath = null;
      this.progress.record(slotIndex, sd.sd_key, 'phase', 'Worktree creation failed, using main');
    }

    return true;
  }

  /**
   * Spawn an agent process for a slot.
   */
  async spawnAgent(slotIndex) {
    const slot = this.slots[slotIndex];
    this._transition(slotIndex, 'AGENT_SPAWNED');

    if (this.dryRun) {
      this.progress.record(slotIndex, slot.sdKey, 'complete', 'DRY RUN - would process SD');
      this._transition(slotIndex, 'COMPLETED');
      this.processedSDs.add(slot.sdKey);
      await this._cleanupSlot(slotIndex);
      return;
    }

    // Spawn claude CLI as a subprocess to process the SD
    const agentCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    const cwd = slot.worktreePath || path.resolve(__dirname, '..');

    const child = spawn(agentCmd, [
      '--print',
      '--dangerously-skip-permissions',
      '-p', `You are a LEO Protocol agent. Process SD ${slot.sdKey} through the full LEAD→PLAN→EXEC→SHIP lifecycle. Run: /leo start ${slot.sdKey}. Follow all protocol steps autonomously. When complete, the SD should have a merged PR.`
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: this._buildAgentEnv(slotIndex)
    });

    slot.process = child;
    this._transition(slotIndex, 'RUNNING');
    this.progress.record(slotIndex, slot.sdKey, 'phase', `Agent PID ${child.pid} running`);

    // Collect output
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    // Handle completion
    child.on('close', async (code) => {
      slot.process = null;

      if (code === 0) {
        this._transition(slotIndex, 'COMPLETED');
        this.progress.record(slotIndex, slot.sdKey, 'complete', 'Agent finished successfully');
        this.processedSDs.add(slot.sdKey);
      } else {
        this._transition(slotIndex, 'FAILED');
        const reason = `Agent exited with code ${code}`;
        this.progress.record(slotIndex, slot.sdKey, 'error', reason);
        this.errorHandler.recordFailure(slot.sdKey, reason);
      }

      await this._cleanupSlot(slotIndex);
    });

    // Timeout guard
    setTimeout(() => {
      if (slot.process && slot.state === 'RUNNING') {
        console.log(`  [Slot ${slotIndex}] Agent timeout (${AGENT_TIMEOUT_MS / 60000}min), killing...`);
        slot.process.kill('SIGTERM');
      }
    }, AGENT_TIMEOUT_MS);
  }

  /**
   * GUARDRAIL 8: Build a sanitized environment for sub-agents.
   * Removes SUPABASE_SERVICE_ROLE_KEY — agents use SUPABASE_ANON_KEY instead.
   */
  _buildAgentEnv(slotIndex) {
    const env = { ...process.env };
    // Remove service role key — agents must not have superuser DB access
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    // Add drain-specific identifiers
    env.DRAIN_AGENT_SLOT = String(slotIndex);
    env.DRAIN_PARENT_SESSION = this.parentSessionId;
    env.DRAIN_AGENT = 'true';
    return env;
  }

  /**
   * GUARDRAIL 9: Kill all running sibling agents when circuit breaker trips.
   */
  _killAllRunningAgents(reason) {
    for (const slot of this.slots) {
      if (slot.process && slot.state === 'RUNNING') {
        console.log(`  [Slot ${slot.slot}] Killing agent (circuit breaker): ${reason}`);
        slot.process.kill('SIGTERM');
        this._transition(slot.slot, 'FAILED');
        this.progress.record(slot.slot, slot.sdKey, 'error', `Killed by circuit breaker: ${reason}`);
      }
    }
  }

  /**
   * Clean up a slot after completion/failure.
   */
  async _cleanupSlot(slotIndex) {
    const slot = this.slots[slotIndex];
    this._transition(slotIndex, 'CLEANUP');

    // Release the SD claim
    if (slot.sdKey) {
      await this.supabase.from('strategic_directives_v2')
        .update({ claiming_session_id: null, is_working_on: false })
        .eq('sd_key', slot.sdKey);
    }

    // Terminate virtual session
    this._transition(slotIndex, 'RELEASING');
    if (slot.sessionId) {
      await terminateVirtualSession(slot.sessionId,
        slot.state === 'FAILED' ? 'drain_agent_failed' : 'drain_agent_complete');
    }

    // Reset slot
    slot.sdKey = null;
    slot.sessionId = null;
    slot.worktreePath = null;
    slot.process = null;
    slot.startedAt = null;
    slot.state = 'IDLE';
  }

  /**
   * Handle slot failure.
   */
  _handleSlotFailure(slotIndex, reason) {
    const slot = this.slots[slotIndex];
    this.progress.record(slotIndex, slot.sdKey, 'error', reason);
    const result = this.errorHandler.recordFailure(slot.sdKey, reason);

    if (result.tripped) {
      console.log(`\n🔴 CIRCUIT BREAKER TRIPPED: ${result.reason}`);
      // GUARDRAIL 9: Immediately kill all running sibling agents
      this._killAllRunningAgents(result.reason);
    }

    // Cleanup will happen asynchronously
    this._cleanupSlot(slotIndex);
  }

  /**
   * Main drain loop.
   */
  async run() {
    this.running = true;
    console.log(`\n🚀 Drain starting: ${this.maxAgents} agent(s), track=${this.trackFilter || 'all'}, dryRun=${this.dryRun}`);

    await this.loadQueue();
    console.log(`📋 Queue: ${this.sdQueue.length} workable SDs\n`);

    if (this.sdQueue.length === 0) {
      console.log('✅ Queue is empty. Nothing to drain.');
      return this.progress.getSummary();
    }

    if (this.dryRun) {
      console.log('🔍 DRY RUN — would process these SDs:');
      for (const sd of this.sdQueue.slice(0, this.maxAgents * 3)) {
        console.log(`  - ${sd.sd_key}: ${sd.title} (${sd.sd_type}, ${sd.priority})`);
      }
      return this.progress.getSummary();
    }

    // Main loop
    while (this.running) {
      // Check circuit breaker
      if (this.errorHandler.isTripped()) {
        console.log(`\n🔴 Circuit breaker tripped: ${this.errorHandler.getTripReason()}`);
        break;
      }

      // Fill idle slots
      const idleSlot = this.getIdleSlot();
      if (idleSlot) {
        // Refresh queue if running low
        if (this.sdQueue.length === 0) {
          await this.loadQueue();
        }

        const nextSD = this.getNextSD();
        if (nextSD) {
          const assigned = await this.assignToSlot(idleSlot.slot, nextSD);
          if (assigned) {
            await this.spawnAgent(idleSlot.slot);
          }
          continue; // Check for more idle slots
        }
      }

      // Check if all slots are idle and queue is empty
      const allIdle = this.slots.every(s => s.state === 'IDLE');
      if (allIdle && this.sdQueue.length === 0) {
        // Refresh queue one more time
        await this.loadQueue();
        if (this.sdQueue.length === 0) {
          console.log('\n✅ All SDs processed. Drain complete.');
          break;
        }
      }

      // Status update
      this.progress.printStatus();

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return this.progress.getSummary();
  }

  /**
   * Graceful shutdown — kill agents, release sessions, clean worktrees.
   */
  async shutdown() {
    console.log('\n⚠️  Drain shutdown initiated...');
    this.running = false;

    // Kill running agent processes
    for (const slot of this.slots) {
      if (slot.process) {
        console.log(`  Killing agent in slot ${slot.slot} (PID ${slot.process.pid})...`);
        slot.process.kill('SIGTERM');
      }
    }

    // Wait briefly for processes to exit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Force-kill any remaining
    for (const slot of this.slots) {
      if (slot.process) {
        slot.process.kill('SIGKILL');
      }
    }

    // Release all virtual sessions
    const { released } = await terminateAllVirtualSessions(this.parentSessionId, 'drain_shutdown');
    console.log(`  Released ${released} virtual session(s)`);

    // Release SD claims
    for (const slot of this.slots) {
      if (slot.sdKey) {
        await this.supabase.from('strategic_directives_v2')
          .update({ claiming_session_id: null, is_working_on: false })
          .eq('sd_key', slot.sdKey);
      }
    }

    console.log('  Shutdown complete.');
    return this.progress.getSummary();
  }
}
