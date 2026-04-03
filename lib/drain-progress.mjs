/**
 * Drain Progress Aggregator - SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
 *
 * Collects structured events per agent slot and produces rollup summaries.
 * Events are stored in memory and optionally written to claude_sessions.metadata.
 */

import { createSupabaseServiceClient } from './supabase-client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * @typedef {Object} DrainEvent
 * @property {number} slot - Agent slot index
 * @property {string} sdKey - SD being processed
 * @property {string} type - Event type: claim, phase, handoff, pr, error, complete
 * @property {string} message - Human-readable description
 * @property {number} ts - Timestamp
 */

export class DrainProgress {
  constructor() {
    /** @type {Map<number, DrainEvent[]>} slot → events */
    this.slotEvents = new Map();
    /** @type {Map<number, {sdKey: string, phase: string, startedAt: number}>} */
    this.slotStatus = new Map();
    this.sdsCompleted = 0;
    this.sdsFailed = 0;
    this.startedAt = Date.now();
  }

  /**
   * Record an event for a slot.
   */
  record(slot, sdKey, type, message) {
    const event = { slot, sdKey, type, message, ts: Date.now() };

    if (!this.slotEvents.has(slot)) {
      this.slotEvents.set(slot, []);
    }
    this.slotEvents.get(slot).push(event);

    // Update slot status
    if (type === 'claim') {
      this.slotStatus.set(slot, { sdKey, phase: 'CLAIMING', startedAt: Date.now() });
    } else if (type === 'phase') {
      const status = this.slotStatus.get(slot);
      if (status) status.phase = message;
    } else if (type === 'complete') {
      this.sdsCompleted++;
      this.slotStatus.delete(slot);
    } else if (type === 'error') {
      this.sdsFailed++;
    }

    // Log to console for visibility
    const slotLabel = `[Slot ${slot}]`;
    const typeLabel = type.toUpperCase().padEnd(8);
    console.log(`  ${slotLabel} ${typeLabel} ${sdKey}: ${message}`);
  }

  /**
   * Get current status of all slots.
   */
  getSlotStatuses() {
    const statuses = [];
    for (const [slot, status] of this.slotStatus) {
      statuses.push({ slot, ...status });
    }
    return statuses;
  }

  /**
   * Get final summary.
   */
  getSummary() {
    const elapsed = Math.round((Date.now() - this.startedAt) / 1000);
    const allEvents = [];
    for (const events of this.slotEvents.values()) {
      allEvents.push(...events);
    }

    return {
      elapsed_seconds: elapsed,
      sds_completed: this.sdsCompleted,
      sds_failed: this.sdsFailed,
      total_events: allEvents.length,
      slots_used: this.slotEvents.size,
      events_by_type: allEvents.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
      completed_sds: allEvents
        .filter(e => e.type === 'complete')
        .map(e => e.sdKey),
      failed_sds: allEvents
        .filter(e => e.type === 'error')
        .map(e => e.sdKey)
    };
  }

  /**
   * Persist current progress to parent session metadata.
   */
  async persistToSession(parentSessionId) {
    const supabase = createSupabaseServiceClient();
    const summary = this.getSummary();

    const { error } = await supabase.from('claude_sessions').update({
      metadata: {
        drain_progress: summary,
        drain_active_slots: this.getSlotStatuses()
      }
    }).eq('session_id', parentSessionId);

    return { error: error?.message };
  }

  /**
   * Print a formatted status line.
   */
  printStatus() {
    const elapsed = Math.round((Date.now() - this.startedAt) / 1000);
    const statuses = this.getSlotStatuses();
    const active = statuses.map(s => `S${s.slot}:${s.sdKey}(${s.phase})`).join(' | ');
    console.log(`\n📊 Drain: ${this.sdsCompleted} done, ${this.sdsFailed} failed | ${elapsed}s | ${active || 'idle'}`);
  }
}
