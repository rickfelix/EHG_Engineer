/**
 * npm Install Mutex — Prevents concurrent npm install from corrupting node_modules.
 *
 * Usage:
 *   const { acquireLock, releaseLock } = require('./npm-install-lock');
 *   const lock = acquireLock();
 *   if (!lock.acquired) {
 *     console.log('Another session is installing:', lock.holder_pid);
 *     // wait or skip
 *   } else {
 *     // run npm install
 *     releaseLock();
 *   }
 */

const fs = require('fs');
const path = require('path');

const LOCK_PATH = path.resolve(__dirname, '../node_modules/.npm-install.lock');
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minute max lock age

function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but no permission
  }
}

function acquireLock() {
  // Check for existing lock
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      const age = Date.now() - data.timestamp;

      // Stale lock — expired
      if (age > MAX_AGE_MS) {
        fs.unlinkSync(LOCK_PATH);
      }
      // Dead holder — remove
      else if (data.pid && !isProcessRunning(data.pid)) {
        fs.unlinkSync(LOCK_PATH);
      }
      // Active lock — cannot acquire
      else {
        return {
          acquired: false,
          holder_pid: data.pid,
          holder_session: data.session_id,
          age_seconds: Math.round(age / 1000)
        };
      }
    } catch {
      // Corrupt lock — remove
      try { fs.unlinkSync(LOCK_PATH); } catch {}
    }
  }

  // Ensure node_modules directory exists
  const nmDir = path.dirname(LOCK_PATH);
  if (!fs.existsSync(nmDir)) {
    fs.mkdirSync(nmDir, { recursive: true });
  }

  // Write lock file
  const lockData = {
    pid: process.pid,
    session_id: process.env.CLAUDE_SESSION_ID || 'unknown',
    timestamp: Date.now(),
    hostname: require('os').hostname()
  };

  try {
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    return { acquired: true };
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Race condition — another process created the lock between our check and write
      return { acquired: false, reason: 'race_condition' };
    }
    // Other error — try anyway
    return { acquired: true, warning: err.message };
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      // Only release if we own it
      if (data.pid === process.pid) {
        fs.unlinkSync(LOCK_PATH);
        return { released: true };
      }
      return { released: false, reason: 'not_owner', owner_pid: data.pid };
    }
    return { released: true, reason: 'no_lock' };
  } catch {
    return { released: false, reason: 'error' };
  }
}

module.exports = { acquireLock, releaseLock, LOCK_PATH };
