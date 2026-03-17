#!/usr/bin/env node

/**
 * LEO Stack Health Check Module
 * SD-LEO-PROTOCOL-SYSTEM-HEALTH-ORCH-001-A
 *
 * Provides checkHealth(), autoRecover(), and healthSummary() exports.
 * Uses Node net module to probe ports 3000 (Engineer) and 8080 (App),
 * reads PID files from .pids/ directory, returns structured health status.
 * Exit code 0 when healthy, 1 when unhealthy.
 */

import { createConnection } from 'net';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const SERVICES = {
  engineer: { port: 3000, pidFile: 'engineer.pid', label: 'EHG_Engineer' },
  app: { port: 8080, pidFile: 'app.pid', label: 'EHG App' },
};

const PROBE_TIMEOUT_MS = 2000;
const PIDS_DIR = join(PROJECT_ROOT, '.pids');

/**
 * Probe a TCP port to check if a service is listening.
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<boolean>}
 */
function probePort(port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Read a PID file and check whether the process is still running.
 * @param {string} pidFile - Filename within .pids/
 * @returns {{ pid: number|null, running: boolean, stale: boolean }}
 */
function checkPidFile(pidFile) {
  const filePath = join(PIDS_DIR, pidFile);
  if (!existsSync(filePath)) {
    return { pid: null, running: false, stale: false };
  }

  const raw = readFileSync(filePath, 'utf-8').trim();
  const pid = parseInt(raw, 10);
  if (isNaN(pid)) {
    return { pid: null, running: false, stale: true };
  }

  // Check if process is alive
  try {
    process.kill(pid, 0); // Signal 0 = existence check, no actual signal sent
    return { pid, running: true, stale: false };
  } catch {
    return { pid, running: false, stale: true };
  }
}

/**
 * Check health of all LEO stack services.
 * @returns {Promise<Record<string, { status: 'up'|'down', port: number, pid: number|null, stalePid: boolean }>>}
 */
export async function checkHealth() {
  const results = {};

  await Promise.all(
    Object.entries(SERVICES).map(async ([key, svc]) => {
      const portUp = await probePort(svc.port);
      const pidInfo = checkPidFile(svc.pidFile);

      results[key] = {
        status: portUp ? 'up' : 'down',
        port: svc.port,
        pid: pidInfo.pid,
        stalePid: pidInfo.stale,
      };
    })
  );

  return results;
}

/**
 * Attempt to restart services that are down.
 * Uses cross-platform-run.js to invoke leo-stack restart for individual services.
 * @returns {Promise<Record<string, { attempted: boolean, success: boolean, error?: string }>>}
 */
export async function autoRecover() {
  const health = await checkHealth();
  const results = {};

  for (const [key, svc] of Object.entries(SERVICES)) {
    if (health[key].status === 'up') {
      results[key] = { attempted: false, success: true };
      continue;
    }

    try {
      const startCmd = key === 'engineer' ? 'start-engineer' : 'start-app';
      execSync(
        `node "${join(PROJECT_ROOT, 'scripts', 'cross-platform-run.js')}" leo-stack ${startCmd}`,
        { cwd: PROJECT_ROOT, timeout: 30000, stdio: 'pipe' }
      );

      // Re-probe after restart attempt
      const isUp = await probePort(svc.port, 5000);
      results[key] = { attempted: true, success: isUp };
    } catch (err) {
      results[key] = { attempted: true, success: false, error: err.message };
    }
  }

  return results;
}

/**
 * Return a structured health summary with overall status.
 * @returns {Promise<{ overall: 'healthy'|'unhealthy', services: Record<string, object>, timestamp: string }>}
 */
export async function healthSummary() {
  const services = await checkHealth();
  const allUp = Object.values(services).every((s) => s.status === 'up');

  return {
    overall: allUp ? 'healthy' : 'unhealthy',
    services,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format health summary for console display.
 * @param {object} summary - Output of healthSummary()
 * @returns {string}
 */
function formatSummary(summary) {
  const icon = summary.overall === 'healthy' ? '✅' : '❌';
  const lines = [`${icon} LEO Stack: ${summary.overall.toUpperCase()}`];

  for (const [key, svc] of Object.entries(summary.services)) {
    const svcIcon = svc.status === 'up' ? '🟢' : '🔴';
    const pidInfo = svc.pid ? ` (PID: ${svc.pid})` : '';
    const staleWarn = svc.stalePid ? ' ⚠️ stale PID' : '';
    lines.push(`  ${svcIcon} ${SERVICES[key].label} :${svc.port} ${svc.status}${pidInfo}${staleWarn}`);
  }

  return lines.join('\n');
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}`;

if (isMain) {
  const cmd = process.argv[2] || 'summary';

  (async () => {
    if (cmd === 'recover') {
      const health = await checkHealth();
      const needsRecovery = Object.values(health).some((s) => s.status === 'down');

      if (!needsRecovery) {
        const summary = await healthSummary();
        console.log(formatSummary(summary));
        process.exit(0);
      }

      console.log('🔧 Attempting auto-recovery...');
      const results = await autoRecover();
      for (const [key, r] of Object.entries(results)) {
        if (r.attempted) {
          console.log(`  ${r.success ? '✅' : '❌'} ${SERVICES[key].label}: ${r.success ? 'recovered' : 'failed'}`);
        }
      }
    }

    const summary = await healthSummary();
    console.log(formatSummary(summary));
    process.exit(summary.overall === 'healthy' ? 0 : 1);
  })();
}
