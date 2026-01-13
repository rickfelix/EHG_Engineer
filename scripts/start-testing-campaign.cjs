#!/usr/bin/env node
/**
 * Testing Campaign Launcher with Application Filter
 *
 * Usage:
 *   node scripts/start-testing-campaign.cjs [EHG|EHG_Engineer]
 *
 * Defaults to EHG if no application specified
 */

const { spawn } = require('child_process');
const path = require('path');

// Get target application from argument or default to EHG
const targetApp = process.argv[2] || 'EHG';
const smokeOnly = process.argv.includes('--smoke-only');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const testLimit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// Validate application
if (!['EHG', 'EHG_Engineer'].includes(targetApp)) {
  console.error('❌ Invalid application!');
  console.error('');
  console.error('Usage: node scripts/start-testing-campaign.cjs [EHG|EHG_Engineer] [--smoke-only] [--limit=N]');
  console.error('');
  console.error('Applications:');
  console.error('  EHG           - Customer-facing business application (RECOMMENDED)');
  console.error('  EHG_Engineer  - Dashboard/management application');
  console.error('');
  console.error('Options:');
  console.error('  --smoke-only  - Fast mode: Only smoke tests (~60s per SD, 5x faster)');
  console.error('  --limit=N     - Limit testing to N Strategic Directives');
  console.error('');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('🚀 STARTING TESTING CAMPAIGN');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log(`📱 Target Application: ${targetApp}`);
console.log(`🔍 Filter: Only Strategic Directives with target_application='${targetApp}'`);
console.log(`📁 Test Location: ${targetApp === 'EHG' ? '../ehg' : '.'}`);
console.log('');
console.log('⚙️  Features:');
console.log('  • Auto-restart on crashes (max 5 attempts)');
console.log('  • Exponential backoff (5s → 5min)');
console.log('  • Heartbeat monitoring');
console.log('  • Progress checkpoints');
console.log('  • Alert logging');
console.log('');
console.log('📊 Monitoring:');
console.log('  • Health: node scripts/monitor-campaign-health.cjs');
console.log('  • Logs:   tail -f /tmp/batch-test-progress.log');
console.log('  • Alerts: tail -f /tmp/campaign-alerts.log');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Set environment variables for target application and speed mode
const env = {
  ...process.env,
  TARGET_APPLICATION: targetApp,
  SMOKE_ONLY: smokeOnly ? 'true' : 'false',
  TEST_LIMIT: testLimit ? testLimit.toString() : ''
};

// Launch campaign with auto-restart wrapper
const campaign = spawn('node', ['scripts/campaign-auto-restart.cjs'], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
  detached: false
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM - stopping campaign...');
  campaign.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT (Ctrl+C) - stopping campaign...');
  campaign.kill('SIGINT');
  process.exit(0);
});

campaign.on('exit', (code, signal) => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏁 CAMPAIGN ENDED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Exit code: ${code}, Signal: ${signal}`);
  console.log('');
  console.log('📊 Check results:');
  console.log('  • Progress: cat /tmp/batch-test-progress.log');
  console.log('  • Errors:   cat /tmp/batch-test-errors.log');
  console.log('  • Health:   node scripts/monitor-campaign-health.cjs');
  console.log('');
  process.exit(code || 0);
});
