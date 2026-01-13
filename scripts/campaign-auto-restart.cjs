#!/usr/bin/env node
/**
 * Campaign Auto-Restart Wrapper
 * Monitors campaign and auto-restarts on crashes with exponential backoff
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_DIR = '/tmp';
const HEARTBEAT_FILE = path.join(LOG_DIR, 'campaign-heartbeat.txt');
const STATUS_FILE = path.join(LOG_DIR, 'campaign-status.json');
const WRAPPER_LOG = path.join(LOG_DIR, 'campaign-wrapper.log');

const MAX_RESTARTS = 5;
const INITIAL_BACKOFF_MS = 5000; // 5 seconds
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

let restartCount = 0;
let currentBackoff = INITIAL_BACKOFF_MS;
let campaignProcess = null;

function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(WRAPPER_LOG, logEntry);
  console.log(message);
}

function readStatusFile() {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(STATUS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function startCampaign() {
  log('\n═══════════════════════════════════════════════════════════');
  log('🚀 Starting campaign (attempt ' + (restartCount + 1) + ')');
  log('═══════════════════════════════════════════════════════════');

  campaignProcess = spawn('node', ['scripts/batch-test-completed-sds-real.cjs'], {
    cwd: '.',
    stdio: 'inherit',
    detached: false
  });

  campaignProcess.on('exit', (code, signal) => {
    log(`\n📊 Campaign process exited: code=${code}, signal=${signal}`);

    const status = readStatusFile();

    // Normal completion
    if (status?.status === 'COMPLETE') {
      log('✅ Campaign completed successfully - no restart needed');
      process.exit(0);
      return;
    }

    // Intentional termination
    if (status?.status === 'TERMINATED' || status?.status === 'INTERRUPTED') {
      log('🛑 Campaign was terminated intentionally - no restart');
      process.exit(0);
      return;
    }

    // Crash or error
    if (code !== 0 || status?.status === 'CRASHED' || status?.status === 'FAILED') {
      restartCount++;

      if (restartCount >= MAX_RESTARTS) {
        log(`❌ Max restart limit reached (${MAX_RESTARTS}) - giving up`);
        log('💡 Manual intervention required - check logs');
        process.exit(1);
        return;
      }

      log(`⚠️  Campaign crashed or failed - restart ${restartCount}/${MAX_RESTARTS}`);
      log(`⏱️  Waiting ${currentBackoff / 1000}s before restart...`);

      setTimeout(() => {
        // Exponential backoff
        currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
        startCampaign();
      }, currentBackoff);
    } else {
      // Unexpected exit without clear status
      log('❓ Unexpected exit - checking status...');

      if (restartCount < MAX_RESTARTS) {
        restartCount++;
        log(`🔄 Attempting restart ${restartCount}/${MAX_RESTARTS} in 10s...`);
        setTimeout(() => startCampaign(), 10000);
      } else {
        log('❌ Max restarts reached - manual intervention required');
        process.exit(1);
      }
    }
  });

  campaignProcess.on('error', (err) => {
    log(`💥 Failed to start campaign: ${err.message}`);
    process.exit(1);
  });
}

// Handle wrapper termination signals
process.on('SIGTERM', () => {
  log('\n⚠️  Wrapper received SIGTERM - killing campaign and exiting');
  if (campaignProcess) {
    campaignProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  log('\n⚠️  Wrapper received SIGINT - killing campaign and exiting');
  if (campaignProcess) {
    campaignProcess.kill('SIGINT');
  }
  process.exit(0);
});

// Initialize wrapper log
fs.writeFileSync(WRAPPER_LOG, `Campaign Auto-Restart Wrapper Started: ${new Date().toISOString()}\n`);

log('🔧 Campaign Auto-Restart Wrapper');
log(`   Max Restarts: ${MAX_RESTARTS}`);
log(`   Initial Backoff: ${INITIAL_BACKOFF_MS / 1000}s`);
log(`   Max Backoff: ${MAX_BACKOFF_MS / 1000 / 60}m`);
log(`   Wrapper PID: ${process.pid}`);
log(`   Wrapper Log: ${WRAPPER_LOG}\n`);

// Start the campaign
startCampaign();
