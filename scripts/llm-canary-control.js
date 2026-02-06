#!/usr/bin/env node
/**
 * LLM Canary Control CLI
 * Operational control interface for canary rollout management
 *
 * SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C
 *
 * Usage:
 *   node scripts/llm-canary-control.js status          # Show current status
 *   node scripts/llm-canary-control.js advance         # Advance to next stage
 *   node scripts/llm-canary-control.js set <stage>     # Set specific stage (0,5,25,50,100)
 *   node scripts/llm-canary-control.js pause           # Pause rollout
 *   node scripts/llm-canary-control.js resume          # Resume rollout
 *   node scripts/llm-canary-control.js rollback        # Emergency rollback to 0%
 *   node scripts/llm-canary-control.js quality         # Check quality gates
 *   node scripts/llm-canary-control.js history         # Show transition history
 *
 * @created 2026-02-06
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString();
}

function formatPercentage(value) {
  if (value == null) return 'N/A';
  return (value * 100).toFixed(2) + '%';
}

function getStatusEmoji(status) {
  switch (status) {
    case 'rolling': return '🚀';
    case 'paused': return '⏸️';
    case 'rolled_back': return '⏪';
    case 'complete': return '✅';
    default: return '❓';
  }
}

function getStageBar(stage) {
  const stages = [0, 5, 25, 50, 100];
  const index = stages.indexOf(stage);
  const filled = '█'.repeat(index + 1);
  const empty = '░'.repeat(stages.length - index - 1);
  return `[${filled}${empty}] ${stage}%`;
}

// =============================================================================
// COMMANDS
// =============================================================================

async function showStatus() {
  console.log('\n📊 LLM Canary Status\n');

  const { data: state, error } = await supabase.rpc('get_canary_state');

  if (error) {
    console.error('❌ Failed to get state:', error.message);
    return;
  }

  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log(`│  Stage: ${getStageBar(state.stage).padEnd(50)} │`);
  console.log(`│  Status: ${getStatusEmoji(state.status)} ${state.status.padEnd(46)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Target Model:   ${state.target_model.padEnd(40)} │`);
  console.log(`│  Fallback Model: ${state.fallback_model.padEnd(40)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Error Rate Threshold:    ${formatPercentage(state.error_rate_threshold).padEnd(35)} │`);
  console.log(`│  Latency Multiplier Max:  ${state.latency_multiplier_threshold}x${''.padEnd(34)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Baseline Latency (P95):  ${(state.baseline_latency_p95_ms || 'Not set').toString().padEnd(20)}ms${''.padEnd(11)} │`);
  console.log(`│  Current Latency (P95):   ${(state.current_latency_p95_ms || 'Not set').toString().padEnd(20)}ms${''.padEnd(11)} │`);
  console.log(`│  Current Error Rate:      ${(state.current_error_rate ? formatPercentage(state.current_error_rate) : 'Not set').padEnd(35)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Consecutive Failures:    ${state.consecutive_failures.toString().padEnd(35)} │`);
  console.log(`│  Failures Before Rollback:${state.failures_before_rollback.toString().padEnd(35)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Stage Changed:           ${formatDate(state.stage_changed_at).padEnd(35)} │`);
  console.log(`│  Last Quality Check:      ${formatDate(state.last_quality_check_at).padEnd(35)} │`);
  console.log(`│  Changed By:              ${(state.changed_by || 'system').padEnd(35)} │`);
  console.log('└──────────────────────────────────────────────────────────────┘');

  // Get recent metrics summary
  const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: metrics } = await supabase
    .from('llm_canary_metrics')
    .select('success, routed_to')
    .gte('created_at', windowStart);

  if (metrics && metrics.length > 0) {
    const localMetrics = metrics.filter(m => m.routed_to === 'local');
    const localSuccess = localMetrics.filter(m => m.success).length;
    const localTotal = localMetrics.length;
    const cloudMetrics = metrics.filter(m => m.routed_to === 'cloud');

    console.log('\n📈 Recent Metrics (last 5 minutes)');
    console.log(`   Local requests:  ${localTotal} (${localTotal > 0 ? ((localSuccess/localTotal)*100).toFixed(1) : 0}% success)`);
    console.log(`   Cloud requests:  ${cloudMetrics.length}`);
    console.log(`   Total requests:  ${metrics.length}`);
  } else {
    console.log('\n📈 No recent metrics (last 5 minutes)');
  }

  console.log('');
}

async function advanceStage() {
  console.log('\n🚀 Advancing Canary Stage...\n');

  const { data, error } = await supabase.rpc('advance_canary_stage', {
    p_triggered_by: 'cli',
    p_reason: 'manual_advance'
  });

  if (error) {
    console.error('❌ Failed to advance:', error.message);
    return;
  }

  const result = data?.[0];
  if (result?.success) {
    console.log(`✅ ${result.message}`);
    console.log(`   New stage: ${result.new_stage}%`);
  } else {
    console.log(`⚠️  ${result?.message || 'Could not advance'}`);
  }
}

async function setStage(stage) {
  const targetStage = parseInt(stage, 10);
  const validStages = [0, 5, 25, 50, 100];

  if (!validStages.includes(targetStage)) {
    console.error(`❌ Invalid stage: ${stage}. Must be one of: ${validStages.join(', ')}`);
    return;
  }

  console.log(`\n📍 Setting Canary Stage to ${targetStage}%...\n`);

  const { data, error } = await supabase.rpc('set_canary_stage', {
    p_stage: targetStage,
    p_triggered_by: 'cli'
  });

  if (error) {
    console.error('❌ Failed to set stage:', error.message);
    return;
  }

  const result = data?.[0];
  if (result?.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.log(`⚠️  ${result?.message || 'Could not set stage'}`);
  }
}

async function pauseRollout() {
  console.log('\n⏸️  Pausing Canary Rollout...\n');

  const { data, error } = await supabase.rpc('pause_canary', {
    p_triggered_by: 'cli'
  });

  if (error) {
    console.error('❌ Failed to pause:', error.message);
    return;
  }

  console.log(`✅ ${data || 'Canary paused'}`);
}

async function resumeRollout() {
  console.log('\n▶️  Resuming Canary Rollout...\n');

  const { data, error } = await supabase.rpc('resume_canary', {
    p_triggered_by: 'cli'
  });

  if (error) {
    console.error('❌ Failed to resume:', error.message);
    return;
  }

  console.log(`✅ ${data || 'Canary resumed'}`);
}

async function rollbackNow() {
  console.log('\n⏪ Emergency Rollback to 0%...\n');

  const { data, error } = await supabase.rpc('rollback_canary', {
    p_triggered_by: 'cli',
    p_reason: 'manual_emergency_rollback'
  });

  if (error) {
    console.error('❌ Failed to rollback:', error.message);
    return;
  }

  const result = data?.[0];
  if (result?.success) {
    console.log(`✅ ${result.message}`);
    console.log(`   Previous stage was: ${result.previous_stage}%`);
  } else {
    console.log(`⚠️  ${result?.message || 'Could not rollback'}`);
  }
}

async function checkQuality() {
  console.log('\n🔍 Checking Quality Gates...\n');

  // Get current state
  const { data: state } = await supabase.rpc('get_canary_state');

  // Get recent metrics
  const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: metrics, error } = await supabase
    .from('llm_canary_metrics')
    .select('*')
    .eq('routed_to', 'local')
    .gte('created_at', windowStart);

  if (error) {
    console.error('❌ Failed to fetch metrics:', error.message);
    return;
  }

  if (!metrics || metrics.length < 10) {
    console.log(`⚠️  Insufficient data: ${metrics?.length || 0} local requests in window`);
    console.log('   Need at least 10 requests for quality evaluation');
    return;
  }

  // Calculate metrics
  const totalRequests = metrics.length;
  const failures = metrics.filter(m => !m.success).length;
  const errorRate = failures / totalRequests;

  const latencies = metrics.filter(m => m.success).map(m => m.latency_ms).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const latencyP95 = latencies[p95Index] || 0;

  const latencyMultiplier = state.baseline_latency_p95_ms
    ? latencyP95 / state.baseline_latency_p95_ms
    : null;

  // Evaluate gates
  const errorGatePassed = errorRate <= state.error_rate_threshold;
  const latencyGatePassed = !latencyMultiplier || latencyMultiplier <= state.latency_multiplier_threshold;

  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Quality Gate Evaluation (last 5 minutes)                     │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Sample Size:       ${totalRequests.toString().padEnd(40)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│  ERROR RATE                                                   │');
  console.log(`│    Current:   ${formatPercentage(errorRate).padEnd(47)} │`);
  console.log(`│    Threshold: ${formatPercentage(state.error_rate_threshold).padEnd(47)} │`);
  console.log(`│    Status:    ${errorGatePassed ? '✅ PASS' : '❌ FAIL'.padEnd(47)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│  LATENCY (P95)                                                │');
  console.log(`│    Current:   ${latencyP95}ms${' '.repeat(44 - latencyP95.toString().length)} │`);
  console.log(`│    Baseline:  ${(state.baseline_latency_p95_ms || 'Not set').toString()}ms${' '.repeat(44 - (state.baseline_latency_p95_ms?.toString().length || 7))} │`);
  console.log(`│    Multiplier:${latencyMultiplier ? latencyMultiplier.toFixed(2) + 'x' : 'N/A'}${' '.repeat(46 - (latencyMultiplier?.toFixed(2).length + 1 || 3))} │`);
  console.log(`│    Max:       ${state.latency_multiplier_threshold}x${' '.repeat(46)} │`);
  console.log(`│    Status:    ${latencyGatePassed ? '✅ PASS' : '❌ FAIL'.padEnd(47)} │`);
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  OVERALL:     ${errorGatePassed && latencyGatePassed ? '✅ ALL GATES PASS - Safe to advance' : '❌ GATES FAILED - Do not advance'.padEnd(47)} │`);
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
}

async function showHistory() {
  console.log('\n📜 Canary Transition History\n');

  const { data: transitions, error } = await supabase
    .from('llm_canary_transitions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Failed to fetch history:', error.message);
    return;
  }

  if (!transitions || transitions.length === 0) {
    console.log('No transitions recorded yet.');
    return;
  }

  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│  Time                    │ From │ To   │ Reason                │ By       │');
  console.log('├────────────────────────────────────────────────────────────────────────────┤');

  for (const t of transitions) {
    const time = new Date(t.created_at).toLocaleString().padEnd(24);
    const from = (t.from_stage + '%').padEnd(5);
    const to = (t.to_stage + '%').padEnd(5);
    const reason = (t.reason || 'unknown').substring(0, 20).padEnd(21);
    const by = (t.triggered_by || 'system').substring(0, 8).padEnd(8);
    console.log(`│ ${time}│ ${from}│ ${to}│ ${reason}│ ${by} │`);
  }

  console.log('└────────────────────────────────────────────────────────────────────────────┘');
  console.log('');
}

function showHelp() {
  console.log(`
LLM Canary Control CLI

Usage: node scripts/llm-canary-control.js <command> [options]

Commands:
  status              Show current canary status and recent metrics
  advance             Advance to next stage (requires quality gates to pass)
  set <stage>         Set specific stage (0, 5, 25, 50, or 100)
  pause               Pause the rollout (keeps current stage)
  resume              Resume a paused rollout
  rollback            Emergency rollback to 0% (all cloud)
  quality             Check quality gates against current metrics
  history             Show recent transition history

Examples:
  node scripts/llm-canary-control.js status
  node scripts/llm-canary-control.js set 5          # Start at 5%
  node scripts/llm-canary-control.js advance        # Move to next stage
  node scripts/llm-canary-control.js rollback       # Emergency: back to cloud

Canary Stages:
  0%   - All traffic to cloud (Haiku)
  5%   - 5% local, 95% cloud
  25%  - 25% local, 75% cloud
  50%  - 50% local, 50% cloud
  100% - All traffic to local (qwen3-coder:30b)
`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'advance':
      await advanceStage();
      break;
    case 'set':
      await setStage(args[1]);
      break;
    case 'pause':
      await pauseRollout();
      break;
    case 'resume':
      await resumeRollout();
      break;
    case 'rollback':
      await rollbackNow();
      break;
    case 'quality':
      await checkQuality();
      break;
    case 'history':
      await showHistory();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      showHelp();
  }
}

main().catch(console.error);
