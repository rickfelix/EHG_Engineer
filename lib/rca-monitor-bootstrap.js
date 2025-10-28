/**
 * RCA Monitor Bootstrap
 * SD-RCA-001
 *
 * Initializes all RCA runtime monitoring on application startup.
 * Monitors: Sub-agent failures, test failures, quality gates, handoff rejections
 *
 * @module lib/rca-monitor-bootstrap
 */

import { initializeRCAMonitoring, cleanupRCAMonitoring } from './rca-runtime-triggers.js';

let monitorSubscriptions = [];
let isInitialized = false;

/**
 * Bootstrap RCA monitoring system
 * Call this function once during application startup
 *
 * @returns {Promise<boolean>} True if initialized successfully
 */
export async function bootstrapRCAMonitoring() {
  if (isInitialized) {
    console.log('⚠️  RCA monitoring already initialized');
    return true;
  }

  try {
    console.log('\n🔍 Initializing Root Cause Agent (RCA) monitoring...');
    console.log('   Starting 4-tier auto-trigger system:');
    console.log('   - T1 (Critical): Sub-agent BLOCKED verdicts, Quality score < 70, 2+ consecutive CI failures');
    console.log('   - T2 (High): Sub-agent FAIL verdicts, Test regressions < 24h, Handoff rejections × 2+');
    console.log('   - T3 (Medium): Quality score drops ≥ 15 points');
    console.log('   - T4 (Manual): CLI triggers only');

    monitorSubscriptions = await initializeRCAMonitoring();

    isInitialized = true;
    console.log('✅ RCA monitoring initialized successfully\n');
    console.log('📊 Active monitors:');
    console.log('   - Sub-agent execution failures (sub_agent_execution_results)');
    console.log('   - Test failures & regressions (test_failures)');
    console.log('   - Quality gate violations (retrospectives)');
    console.log('   - Handoff rejections (sd_phase_handoffs)');
    console.log('');

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize RCA monitoring:', error.message);
    console.error('   RCA auto-triggers will NOT function');
    console.error('   Manual triggers via CLI still available: npm run rca:trigger');
    return false;
  }
}

/**
 * Shutdown RCA monitoring gracefully
 * Call this during application shutdown
 */
export async function shutdownRCAMonitoring() {
  if (!isInitialized) {
    return;
  }

  console.log('\n🛑 Shutting down RCA monitoring...');

  try {
    await cleanupRCAMonitoring(monitorSubscriptions);
    monitorSubscriptions = [];
    isInitialized = false;
    console.log('✅ RCA monitoring stopped');
  } catch (error) {
    console.error('❌ Error during RCA monitoring shutdown:', error.message);
  }
}

/**
 * Get RCA monitoring status
 * @returns {{initialized: boolean, activeSubscriptions: number}}
 */
export function getRCAMonitoringStatus() {
  return {
    initialized: isInitialized,
    activeSubscriptions: monitorSubscriptions.length
  };
}

/**
 * Graceful shutdown handler
 * Registers cleanup on process termination
 */
export function registerRCAShutdownHandlers() {
  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM signal');
    await shutdownRCAMonitoring();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT signal');
    await shutdownRCAMonitoring();
    process.exit(0);
  });
}

// Export for testing
export { monitorSubscriptions };
