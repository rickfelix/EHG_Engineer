#!/usr/bin/env node

/**
 * Retrospective System Monitor - Ensures Resilience and Always-Running Status
 * Monitors retrospective system health and auto-recovers from failures
 */

const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class RetrospectiveSystemMonitor {
  constructor() {
    this.healthCheckInterval = 60000; // 1 minute
    this.lastHealthCheck = null;
    this.isRunning = false;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  async start() {
    console.log('🔄 Starting Retrospective System Monitor');
    console.log('======================================');

    this.isRunning = true;

    // Initial health check
    await this.performHealthCheck();

    // Set up periodic monitoring
    this.healthTimer = setInterval(() => {
      this.performHealthCheck().catch(console.error);
    }, this.healthCheckInterval);

    // Set up graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    console.log('✅ Retrospective System Monitor is running');
    console.log(`⏰ Health checks every ${this.healthCheckInterval/1000}s`);
  }

  async performHealthCheck() {
    try {
      this.lastHealthCheck = new Date();

      // Check 1: Database connectivity
      const { data: testQuery } = await supabase
        .from('retrospectives')
        .select('count')
        .limit(1);

      if (!testQuery) {
        throw new Error('Database connection failed');
      }

      // Check 2: Recent retrospective activity (within last 24 hours)
      const { data: recentRetros } = await supabase
        .from('retrospectives')
        .select('id, created_at')
        .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
        .order('created_at', { ascending: false });

      // Check 3: Sub-agent activation tracking
      const { data: recentActivations } = await supabase
        .from('subagent_activations')
        .select('count')
        .gte('activated_at', new Date(Date.now() - 60*60*1000).toISOString());

      // Log health status
      const healthStatus = {
        timestamp: this.lastHealthCheck,
        database: 'healthy',
        recent_retrospectives: recentRetros?.length || 0,
        recent_activations: recentActivations?.length || 0,
        system_status: 'operational'
      };

      console.log(`🩺 Health Check: ${JSON.stringify(healthStatus)}`);

      // Reset retry counter on successful check
      this.retryCount = 0;

      return healthStatus;

    } catch (error) {
      console.error('❌ Health check failed:', error.message);

      this.retryCount++;
      if (this.retryCount >= this.maxRetries) {
        console.error('🚨 Maximum retries exceeded - attempting recovery');
        await this.attemptRecovery();
      }

      return {
        timestamp: this.lastHealthCheck,
        status: 'unhealthy',
        error: error.message,
        retry_count: this.retryCount
      };
    }
  }

  async attemptRecovery() {
    console.log('🔧 Attempting system recovery...');

    try {
      // Recovery 1: Execute retrospective maintenance
      const maintenanceScript = path.join(__dirname, 'retrospective-sub-agent.js');
      if (fs.existsSync(maintenanceScript)) {
        console.log('⚡ Running retrospective maintenance');
        const maintenance = spawn('node', [maintenanceScript], {
          stdio: 'inherit',
          cwd: __dirname
        });

        await new Promise((resolve, reject) => {
          maintenance.on('close', (code) => {
            if (code === 0) {
              console.log('✅ Retrospective maintenance completed');
              resolve();
            } else {
              reject(new Error(`Maintenance failed with code ${code}`));
            }
          });
        });
      }

      // Recovery 2: Reset retry counter
      this.retryCount = 0;

      console.log('✅ Recovery completed');

    } catch (recoveryError) {
      console.error('❌ Recovery failed:', recoveryError.message);
      console.log('🚨 Manual intervention may be required');
    }
  }

  shutdown() {
    console.log('\n🔄 Shutting down Retrospective System Monitor');

    this.isRunning = false;

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    console.log('✅ Monitor shutdown complete');
    process.exit(0);
  }
}

// Auto-start if run directly
if (require.main === module) {
  const monitor = new RetrospectiveSystemMonitor();
  monitor.start().catch(console.error);
}

module.exports = RetrospectiveSystemMonitor;