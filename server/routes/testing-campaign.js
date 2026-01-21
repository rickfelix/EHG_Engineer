/**
 * Testing Campaign API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { PROJECT_ROOT } from '../config.js';

const router = Router();

let activeCampaignProcess = null;

// Get campaign status from heartbeat file
router.get('/status', (req, res) => {
  try {
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    if (fs.existsSync(heartbeatPath)) {
      const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
      res.json({
        running: heartbeat.status === 'running',
        status: heartbeat.status,
        targetApplication: heartbeat.target_application || 'EHG',
        progress: heartbeat.progress,
        percent: heartbeat.percent,
        currentSD: heartbeat.current_sd,
        lastUpdate: heartbeat.iso_time,
        pid: heartbeat.pid
      });
    } else {
      res.json({
        running: false,
        status: 'not_started',
        targetApplication: null,
        progress: '0/0',
        percent: 0,
        currentSD: null,
        lastUpdate: null,
        pid: null
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get health report
router.get('/health', (req, res) => {
  try {
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    const checkpointPath = '/tmp/campaign-checkpoint.json';
    const statusPath = '/tmp/campaign-status.json';
    const alertsPath = '/tmp/campaign-alerts.log';

    const heartbeat = fs.existsSync(heartbeatPath)
      ? JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'))
      : null;

    const checkpoint = fs.existsSync(checkpointPath)
      ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
      : null;

    const status = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath, 'utf8'))
      : null;

    const alerts = fs.existsSync(alertsPath)
      ? fs.readFileSync(alertsPath, 'utf8').trim().split('\n').slice(-10)
      : [];

    // Check if process is alive
    let processAlive = false;
    if (heartbeat?.pid) {
      try {
        process.kill(heartbeat.pid, 0);
        processAlive = true;
      } catch (_e) {
        processAlive = false;
      }
    }

    res.json({
      heartbeat,
      checkpoint,
      status,
      alerts,
      processAlive,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SD counts by application
router.get('/apps', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from('v_untested_sds')
      .select('target_application, tested, status');

    if (error) throw error;

    // Group by application
    const apps = {
      EHG: { total: 0, tested: 0, untested: 0, completed: 0 },
      EHG_Engineer: { total: 0, tested: 0, untested: 0, completed: 0 }
    };

    data.forEach(sd => {
      const app = sd.target_application || 'EHG';
      if (apps[app]) {
        apps[app].total++;
        if (sd.status === 'completed') apps[app].completed++;
        if (sd.tested) {
          apps[app].tested++;
        } else if (sd.status === 'completed') {
          apps[app].untested++;
        }
      }
    });

    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start campaign
router.post('/start', (req, res) => {
  try {
    const targetApp = req.body.targetApplication || 'EHG';
    const smokeOnly = req.body.smokeOnly === true;

    if (!['EHG', 'EHG_Engineer'].includes(targetApp)) {
      return res.status(400).json({ error: 'Invalid target application' });
    }

    if (activeCampaignProcess) {
      return res.status(400).json({ error: 'Campaign already running' });
    }

    const modeLabel = smokeOnly ? 'FAST MODE (smoke-only)' : 'Full Testing';
    console.log(`🚀 Starting testing campaign for ${targetApp} - ${modeLabel}...`);

    // Launch campaign process with optional smoke-only flag
    const args = [path.join(PROJECT_ROOT, 'scripts/start-testing-campaign.cjs'), targetApp];
    if (smokeOnly) {
      args.push('--smoke-only');
    }

    activeCampaignProcess = spawn(
      'node',
      args,
      {
        detached: true,
        stdio: 'ignore'
      }
    );

    activeCampaignProcess.unref();

    // Give it a moment to start
    setTimeout(() => {
      const heartbeatPath = '/tmp/campaign-heartbeat.txt';
      if (fs.existsSync(heartbeatPath)) {
        const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
        res.json({
          started: true,
          pid: heartbeat.pid,
          targetApplication: targetApp
        });
      } else {
        res.json({
          started: true,
          pid: activeCampaignProcess.pid,
          targetApplication: targetApp
        });
      }
    }, 1000);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop campaign
router.post('/stop', (req, res) => {
  try {
    const heartbeatPath = '/tmp/campaign-heartbeat.txt';
    if (!fs.existsSync(heartbeatPath)) {
      return res.status(404).json({ error: 'No active campaign found' });
    }

    const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
    const pid = heartbeat.pid;

    if (pid) {
      console.log(`🛑 Stopping campaign (PID: ${pid})...`);

      try {
        process.kill(pid, 'SIGTERM');
      } catch (_killError) {
        console.log(`⚠️ Process ${pid} not found (already stopped)`);
      }

      // Clean up campaign files regardless
      try {
        if (fs.existsSync(heartbeatPath)) fs.unlinkSync(heartbeatPath);
        if (fs.existsSync('/tmp/campaign-checkpoint.json')) fs.unlinkSync('/tmp/campaign-checkpoint.json');
        console.log('🧹 Cleaned up campaign files');
      } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError.message);
      }

      activeCampaignProcess = null;
      res.json({ stopped: true, pid, cleaned: true });
    } else {
      res.status(404).json({ error: 'No PID found' });
    }
  } catch (error) {
    // Even if we error, try to clean up
    try {
      const heartbeatPath = '/tmp/campaign-heartbeat.txt';
      if (fs.existsSync(heartbeatPath)) fs.unlinkSync(heartbeatPath);
      if (fs.existsSync('/tmp/campaign-checkpoint.json')) fs.unlinkSync('/tmp/campaign-checkpoint.json');
    } catch (_e) {}

    res.status(500).json({ error: error.message });
  }
});

// Get logs
router.get('/logs/:type', (req, res) => {
  try {
    const logType = req.params.type;
    const limit = parseInt(req.query.limit) || 100;

    let logPath;
    switch (logType) {
      case 'progress':
        logPath = '/tmp/batch-test-progress.log';
        break;
      case 'errors':
        logPath = '/tmp/batch-test-errors.log';
        break;
      case 'alerts':
        logPath = '/tmp/campaign-alerts.log';
        break;
      default:
        return res.status(400).json({ error: 'Invalid log type' });
    }

    if (!fs.existsSync(logPath)) {
      return res.json({ lines: [] });
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').slice(-limit);

    res.json({ lines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
