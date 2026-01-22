#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Session Cleanup
 *
 * Runs on first prompt of a new session to clean up stale state from previous sessions.
 * Prevents "background task completed" notifications for tasks that are no longer relevant.
 *
 * What it cleans up:
 * 1. Stale checkpoint counter files (>6 hours old)
 * 2. Old session state files
 * 3. Claude temp task output files (if accessible)
 *
 * Exit codes:
 *   0 - Always (advisory mode - doesn't block)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_ID = process.env.CLAUDE_SESSION_ID || 'default';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours - files older than this are stale

// Locations to clean
const CHECKPOINT_DIR = path.join(os.tmpdir(), 'leo-checkpoints');
const SESSION_STATE_FILE = path.join(os.homedir(), '.claude-session-state.json');
const SESSION_MARKER_FILE = path.join(os.tmpdir(), 'leo-checkpoints', `marker-${SESSION_ID}.txt`);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isStale(filePath, maxAgeMs = MAX_AGE_MS) {
  try {
    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs > maxAgeMs;
  } catch {
    return true; // If we can't stat it, treat as stale
  }
}

function cleanupStaleCheckpoints() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    return { cleaned: 0 };
  }

  let cleaned = 0;
  try {
    const files = fs.readdirSync(CHECKPOINT_DIR);
    for (const file of files) {
      // Skip our current session marker
      if (file === `marker-${SESSION_ID}.txt`) continue;

      const filePath = path.join(CHECKPOINT_DIR, file);

      // Clean up stale session files (not our current session)
      if (file.startsWith('session-') && file !== `session-${SESSION_ID}.json`) {
        if (isStale(filePath)) {
          try {
            fs.unlinkSync(filePath);
            cleaned++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      // Clean up old markers
      if (file.startsWith('marker-') && file !== `marker-${SESSION_ID}.txt`) {
        if (isStale(filePath)) {
          try {
            fs.unlinkSync(filePath);
            cleaned++;
          } catch {
            // Ignore deletion errors
          }
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return { cleaned };
}

function cleanupSessionState() {
  if (!fs.existsSync(SESSION_STATE_FILE)) {
    return { cleaned: false };
  }

  // If session state is stale, remove it
  if (isStale(SESSION_STATE_FILE)) {
    try {
      fs.unlinkSync(SESSION_STATE_FILE);
      return { cleaned: true };
    } catch {
      return { cleaned: false };
    }
  }

  return { cleaned: false };
}

function cleanupClaudeTempTasks() {
  // Claude stores task outputs in %LOCALAPPDATA%\Temp\claude\<project-path>\tasks\
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const claudeTempBase = path.join(localAppData, 'Temp', 'claude');

  if (!fs.existsSync(claudeTempBase)) {
    return { cleaned: 0 };
  }

  let cleaned = 0;
  try {
    // Walk through claude temp directories looking for tasks folders
    const projectDirs = fs.readdirSync(claudeTempBase);
    for (const projectDir of projectDirs) {
      const tasksDir = path.join(claudeTempBase, projectDir, 'tasks');
      if (!fs.existsSync(tasksDir)) continue;

      try {
        const taskFiles = fs.readdirSync(tasksDir);
        for (const taskFile of taskFiles) {
          const taskPath = path.join(tasksDir, taskFile);
          // Clean up task output files older than 6 hours
          if (isStale(taskPath)) {
            try {
              fs.unlinkSync(taskPath);
              cleaned++;
            } catch {
              // Ignore deletion errors
            }
          }
        }
      } catch {
        // Directory read failed
      }
    }
  } catch {
    // Base directory read failed
  }

  return { cleaned };
}

function isNewSession() {
  // Check if our session marker exists
  if (!fs.existsSync(SESSION_MARKER_FILE)) {
    return true;
  }

  // If marker is stale, treat as new session
  return isStale(SESSION_MARKER_FILE);
}

function createSessionMarker() {
  // Ensure directory exists
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }

  // Create marker with timestamp
  const marker = {
    sessionId: SESSION_ID,
    startTime: new Date().toISOString(),
    pid: process.pid
  };

  fs.writeFileSync(SESSION_MARKER_FILE, JSON.stringify(marker, null, 2));
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  try {
    // Only run cleanup on new sessions
    if (!isNewSession()) {
      process.exit(0);
    }

    // This is a new session - clean up stale state
    const checkpointResult = cleanupStaleCheckpoints();
    const sessionResult = cleanupSessionState();
    const taskResult = cleanupClaudeTempTasks();

    const totalCleaned = checkpointResult.cleaned +
      (sessionResult.cleaned ? 1 : 0) +
      taskResult.cleaned;

    if (totalCleaned > 0) {
      console.log(`[session-cleanup] Cleaned up ${totalCleaned} stale file(s) from previous sessions`);
    }

    // Create marker for this session
    createSessionMarker();

    process.exit(0);
  } catch (err) {
    // Don't block on errors
    console.error(`[session-cleanup] Error: ${err.message}`);
    process.exit(0);
  }
}

main();
