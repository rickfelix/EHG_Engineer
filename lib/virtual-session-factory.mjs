/**
 * Virtual Session Factory - SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
 *
 * Creates and manages virtual claude_sessions rows for drain agents.
 * Virtual sessions are first-class citizens visible to coordinator,
 * stale sweep, and fleet dashboard.
 */

import { createSupabaseServiceClient } from './supabase-client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let _supabase;
function getSupabase() {
  if (!_supabase) _supabase = createSupabaseServiceClient();
  return _supabase;
}

/**
 * Generate a unique session ID for a virtual drain agent.
 * Format: drain_{parentShort}_{slot}_{random}
 */
function generateVirtualSessionId(parentSessionId, slot) {
  const parentShort = parentSessionId.slice(0, 8);
  const rand = crypto.randomBytes(4).toString('hex');
  return `drain_${parentShort}_s${slot}_${rand}`;
}

/**
 * Create a virtual session for a drain agent slot.
 *
 * @param {Object} opts
 * @param {string} opts.parentSessionId - Parent drainer session ID
 * @param {number} opts.slot - Agent slot index (0, 1, 2)
 * @param {string} [opts.sdKey] - SD being claimed (optional, set later)
 * @returns {Promise<{sessionId: string, error?: string}>}
 */
export async function createVirtualSession({ parentSessionId, slot, sdKey = null }) {
  const supabase = getSupabase();
  const sessionId = generateVirtualSessionId(parentSessionId, slot);
  const now = new Date().toISOString();

  const { error } = await supabase.from('claude_sessions').insert({
    session_id: sessionId,
    status: 'active',
    heartbeat_at: now,
    is_virtual: true,
    parent_session_id: parentSessionId,
    agent_slot: slot,
    last_progress_at: null,
    sd_id: sdKey,
    hostname: os.hostname(),
    pid: process.pid,
    metadata: {
      created_by: 'sd-drain',
      parent_session: parentSessionId,
      slot,
      auto_proceed: true
    }
  });

  if (error) {
    return { sessionId: null, error: error.message };
  }

  return { sessionId };
}

/**
 * Update a virtual session's claimed SD.
 */
export async function claimVirtualSession(sessionId, sdKey) {
  const supabase = getSupabase();
  const { error } = await supabase.from('claude_sessions').update({
    sd_id: sdKey,
    claimed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString()
  }).eq('session_id', sessionId);

  return { error: error?.message };
}

/**
 * Record progress on a virtual session.
 */
export async function recordProgress(sessionId, event) {
  const supabase = getSupabase();
  const { error } = await supabase.from('claude_sessions').update({
    last_progress_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString()
  }).eq('session_id', sessionId);

  return { error: error?.message };
}

/**
 * Release and terminate a virtual session.
 */
export async function terminateVirtualSession(sessionId, reason = 'drain_complete') {
  const supabase = getSupabase();
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released',
    sd_id: null,
    released_at: new Date().toISOString(),
    released_reason: reason,
    heartbeat_at: new Date().toISOString()
  }).eq('session_id', sessionId);

  return { error: error?.message };
}

/**
 * List all active virtual sessions for a parent drainer.
 */
export async function listVirtualSessions(parentSessionId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, agent_slot, sd_id, status, heartbeat_at, last_progress_at')
    .eq('parent_session_id', parentSessionId)
    .eq('is_virtual', true)
    .in('status', ['active', 'idle']);

  return { sessions: data || [], error: error?.message };
}

/**
 * Terminate ALL virtual sessions for a parent (graceful shutdown).
 */
export async function terminateAllVirtualSessions(parentSessionId, reason = 'drain_shutdown') {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('claude_sessions')
    .update({
      status: 'released',
      sd_id: null,
      released_at: new Date().toISOString(),
      released_reason: reason
    })
    .eq('parent_session_id', parentSessionId)
    .eq('is_virtual', true)
    .in('status', ['active', 'idle'])
    .select('session_id');

  return {
    released: data?.length || 0,
    error: error?.message
  };
}
