#!/usr/bin/env node

/**
 * PreCompact Unified Hook
 * SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001
 *
 * Called by PreCompact PowerShell hook to save comprehensive state.
 * Uses UnifiedStateManager for consistent state format.
 *
 * SD-LEO-INFRA-COMPACTION-CLAIM-001: Enhanced to persist session_id
 * alongside SD claim info, enabling post-compaction re-claim.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import UnifiedStateManager from '../../lib/context/unified-state-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Find current session ID from local session files (by PID)
 */
function findCurrentSessionId() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid) return data.session_id;
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Extend heartbeat TTL to prevent claim staleness during compaction.
 * PAT-CLMCOMPACT-01: Compaction can take 30-60s; without extending,
 * the claim may go stale and be released by another session.
 */
async function extendHeartbeat(sessionId) {
  if (!sessionId) return;
  try {
    // Load env if not already set (parent process usually provides these)
    if (!process.env.SUPABASE_URL) {
      const envPath = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '../../.env');
      const dotenv = await import('dotenv');
      dotenv.config({ path: envPath });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createSupabaseServiceClient();
    // stampBranch keeps current_branch fresh on pre-compact heartbeat extension
    // — see lib/session-writer.cjs and SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const { stampBranch } = req('../../lib/session-writer.cjs');
    // Include 'released' so sessions that were swept while between SDs can recover
    const { error } = await supabase
      .from('claude_sessions')
      .update(stampBranch({ heartbeat_at: new Date().toISOString(), status: 'active' }))
      .eq('session_id', sessionId)
      .in('status', ['active', 'idle', 'released']);
    if (error) {
      console.log(`[PRECOMPACT] Heartbeat extension failed: ${error.message}`);
    } else {
      console.log(`[PRECOMPACT] Heartbeat extended for session ${sessionId.substring(0, 24)}...`);
    }
  } catch (err) {
    console.log(`[PRECOMPACT] Heartbeat extension error: ${err.message}`);
  }
}

async function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const manager = new UnifiedStateManager(projectDir);

  try {
    // PAT-CLMCOMPACT-01: Extend heartbeat BEFORE saving state
    const sessionId = findCurrentSessionId();
    if (sessionId) {
      await extendHeartbeat(sessionId);
    }

    // Save comprehensive state (getSDState now queries database)
    const state = await manager.saveState('precompact', {
      highlights: ['Pre-compaction state captured'],
      actions: ['Restore context after session start']
    });

    // SD-LEO-INFRA-COMPACTION-CLAIM-001: Persist session_id for re-claim
    if (state.sd?.id && sessionId) {
      state.sd.previousSessionId = sessionId;
      state.sd.claimPreservedAt = new Date().toISOString();
      manager.saveStateSync(state);
    }

    // Output formatted state for Claude to see
    console.log('[PRECOMPACT] Comprehensive state saved to .claude/unified-session-state.json');
    console.log('[PRECOMPACT] Trigger: Auto-compaction imminent');
    console.log(`[PRECOMPACT] Branch: ${state.git?.branch || 'unknown'}`);
    if (state.sd?.id) {
      console.log(`[PRECOMPACT] SD: ${state.sd.id} (claim preserved for re-claim)`);
    }
    console.log('[WARNING] COMPACTION ABOUT TO OCCUR - Full state preserved');

  } catch (error) {
    console.error(`[PRECOMPACT] Error saving state: ${error.message}`);
    // Exit 0 to not block compaction
    process.exit(0);
  }
}

main();
