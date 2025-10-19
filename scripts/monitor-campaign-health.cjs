#!/usr/bin/env node
/**
 * Campaign Health Monitor
 * Monitors the autonomous testing campaign for health issues
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = '/tmp';
const HEARTBEAT_FILE = path.join(LOG_DIR, 'campaign-heartbeat.txt');
const CHECKPOINT_FILE = path.join(LOG_DIR, 'campaign-checkpoint.json');
const STATUS_FILE = path.join(LOG_DIR, 'campaign-status.json');
const ALERT_LOG = path.join(LOG_DIR, 'campaign-alerts.log');

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function readJSONFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function checkHeartbeat() {
  const heartbeat = readJSONFile(HEARTBEAT_FILE);

  if (!heartbeat) {
    return {
      status: 'UNKNOWN',
      message: 'No heartbeat file found - campaign not started or crashed',
      severity: 'warning'
    };
  }

  const age = Date.now() - heartbeat.timestamp;
  const ageMinutes = Math.round(age / 1000 / 60);

  if (heartbeat.status === 'complete') {
    return {
      status: 'COMPLETE',
      message: `Campaign completed at ${heartbeat.iso_time}`,
      severity: 'info',
      heartbeat
    };
  }

  if (heartbeat.status === 'crashed') {
    return {
      status: 'CRASHED',
      message: `Campaign crashed (heartbeat age: ${ageMinutes}m)`,
      severity: 'critical',
      heartbeat
    };
  }

  if (heartbeat.status === 'terminated' || heartbeat.status === 'interrupted') {
    return {
      status: 'TERMINATED',
      message: `Campaign ${heartbeat.status} at ${heartbeat.iso_time}`,
      severity: 'warning',
      heartbeat
    };
  }

  if (age > STALE_THRESHOLD_MS) {
    return {
      status: 'STALE',
      message: `Heartbeat is stale (${ageMinutes}m old) - possible hang or crash`,
      severity: 'critical',
      heartbeat
    };
  }

  return {
    status: 'HEALTHY',
    message: `Campaign running (${heartbeat.progress}, ${heartbeat.percent}% complete)`,
    severity: 'info',
    heartbeat
  };
}

function checkProcess(pid) {
  if (!pid) return { alive: false, message: 'No PID available' };

  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return { alive: true, message: `Process ${pid} is alive` };
  } catch (err) {
    if (err.code === 'ESRCH') {
      return { alive: false, message: `Process ${pid} not found` };
    }
    if (err.code === 'EPERM') {
      return { alive: true, message: `Process ${pid} exists (no permission to signal)` };
    }
    return { alive: false, message: `Unknown error checking PID ${pid}` };
  }
}

function getRecentAlerts(limit = 10) {
  try {
    if (!fs.existsSync(ALERT_LOG)) {
      return [];
    }
    const content = fs.readFileSync(ALERT_LOG, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    return lines.slice(-limit);
  } catch (err) {
    return [];
  }
}

function displayHealthReport() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏥 CAMPAIGN HEALTH MONITOR');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check heartbeat
  const heartbeatCheck = checkHeartbeat();
  const statusIcon = {
    'HEALTHY': '✅',
    'COMPLETE': '🎉',
    'STALE': '⚠️',
    'CRASHED': '💥',
    'TERMINATED': '🛑',
    'UNKNOWN': '❓'
  }[heartbeatCheck.status] || '❓';

  console.log(`${statusIcon} Status: ${heartbeatCheck.status}`);
  console.log(`   ${heartbeatCheck.message}\n`);

  // Check process if PID available
  if (heartbeatCheck.heartbeat?.pid) {
    const processCheck = checkProcess(heartbeatCheck.heartbeat.pid);
    const procIcon = processCheck.alive ? '✅' : '❌';
    console.log(`${procIcon} Process Check: ${processCheck.message}\n`);
  }

  // Display heartbeat details
  if (heartbeatCheck.heartbeat) {
    const hb = heartbeatCheck.heartbeat;
    console.log('📊 Progress Details:');
    console.log(`   Current SD: ${hb.current_sd || 'N/A'}`);
    console.log(`   Progress: ${hb.progress || 'N/A'} (${hb.percent || 0}%)`);
    console.log(`   Last Update: ${hb.iso_time}`);
    console.log(`   Age: ${Math.round((Date.now() - hb.timestamp) / 1000 / 60)}m\n`);
  }

  // Check status file
  const status = readJSONFile(STATUS_FILE);
  if (status) {
    console.log('📋 Campaign Status:');
    console.log(`   Status: ${status.status}`);
    console.log(`   Message: ${status.message}`);
    console.log(`   Updated: ${status.iso_time}\n`);
  }

  // Check checkpoint
  const checkpoint = readJSONFile(CHECKPOINT_FILE);
  if (checkpoint) {
    console.log('💾 Last Checkpoint:');
    console.log(`   Tested: ${checkpoint.tested}/${checkpoint.total}`);
    console.log(`   ✅ Passed: ${checkpoint.passed}`);
    console.log(`   ❌ Failed: ${checkpoint.failed}`);
    console.log(`   ⚠️  Errors: ${checkpoint.errors}`);
    console.log(`   Last SD: ${checkpoint.last_sd}`);
    console.log(`   Time: ${checkpoint.iso_time}\n`);
  }

  // Recent alerts
  const alerts = getRecentAlerts(5);
  if (alerts.length > 0) {
    console.log('🚨 Recent Alerts (last 5):');
    alerts.forEach(alert => console.log(`   ${alert}`));
    console.log();
  }

  // Recommendations
  console.log('💡 Recommendations:');
  if (heartbeatCheck.status === 'STALE') {
    console.log('   ⚠️  Campaign appears stalled - check logs and consider restart');
  } else if (heartbeatCheck.status === 'CRASHED') {
    console.log('   💥 Campaign crashed - check error logs and restart');
  } else if (heartbeatCheck.status === 'HEALTHY') {
    console.log('   ✅ Campaign is running normally');
  } else if (heartbeatCheck.status === 'COMPLETE') {
    console.log('   🎉 Campaign completed successfully');
  } else if (heartbeatCheck.status === 'UNKNOWN') {
    console.log('   ❓ No campaign running - start with batch-test-completed-sds-real.cjs');
  }

  console.log('\n📁 Monitor Files:');
  console.log(`   Heartbeat: ${HEARTBEAT_FILE}`);
  console.log(`   Checkpoint: ${CHECKPOINT_FILE}`);
  console.log(`   Status: ${STATUS_FILE}`);
  console.log(`   Alerts: ${ALERT_LOG}\n`);
}

// Run monitor
displayHealthReport();
