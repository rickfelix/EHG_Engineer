#!/usr/bin/env node
/**
 * Hook: Cleanup Orphaned Background Tasks
 *
 * Runs at SessionStart to clean up stale task output files that would
 * otherwise interrupt the current session with late notifications.
 *
 * Part of SD-LEO-SELF-IMPROVE-001I: Automated Learning Capture for Non-SD Sessions
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Task directory path (Windows-specific format for this project)
const TASK_DIR = path.join(
  os.tmpdir(),
  'claude',
  'C--Users-rickf-Projects--EHG-EHG-Engineer',
  'tasks'
);

const ONE_HOUR = 60 * 60 * 1000;

function cleanupOrphanedTasks() {
  try {
    if (!fs.existsSync(TASK_DIR)) {
      // No task directory - nothing to clean
      return;
    }

    const files = fs.readdirSync(TASK_DIR);
    const outputFiles = files.filter(f => f.endsWith('.output'));

    if (outputFiles.length === 0) {
      return;
    }

    const now = Date.now();
    let cleaned = 0;

    for (const file of outputFiles) {
      const filePath = path.join(TASK_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        // Only delete stale tasks (>1 hour old)
        if (ageMs > ONE_HOUR) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (err) {
        // Skip files that can't be accessed
      }
    }

    if (cleaned > 0) {
      console.log(`SessionStart:orphan-cleanup: Cleaned ${cleaned} stale task(s)`);
    }
  } catch (err) {
    // Silent failure - don't block session start
  }
}

cleanupOrphanedTasks();
