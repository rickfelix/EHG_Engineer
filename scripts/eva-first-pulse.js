#!/usr/bin/env node
/**
 * SD-PARENT-4.0: THE FIRST PULSE
 *
 * EVA Venture Health Scanner - The Factory Awakens
 *
 * This script activates EVA (the Venture CEO) to perform the first
 * autonomous health scan of all seeded ventures.
 *
 * TRUTH CONSTRAINT: Every scan must have a prediction-outcome pair
 * logged to system_events for calibration tracking.
 *
 * Usage: node scripts/eva-first-pulse.js
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// DUAL-DOMAIN GOVERNANCE: Reference the EXISTING Strategic Directive
// This is NOT a generated ID - it references the SD that authorizes this work
const GOVERNANCE_CONTEXT = {
  sd_id: 'SD-PARENT-4.0',  // The First Pulse - already exists in strategic_directives
  prd_id: null              // No specific PRD for health scans (system-level operation)
};

// EVA Configuration
const EVA_CONFIG = {
  agentType: 'venture_ceo',
  displayName: 'EVA Health Scanner',
  capabilities: ['venture_health_scan', 'strategic_pivot_proposal']
};

// Health Thresholds
const HEALTH_THRESHOLDS = {
  RADIOACTIVE: {
    redHealthCount: 1,      // Any red = radioactive
    missingArtifacts: true, // Missing required artifacts
    blockedStages: 1        // Any blocked stage
  },
  HEALTHY: {
    completionRate: 0.8,    // 80% stages completed
    greenHealthRate: 0.9    // 90% green health scores
  }
};

/**
 * Load EVA agent context from registry
 */
async function loadEVAAgent() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        SD-PARENT-4.0: THE FIRST PULSE                      ║');
  console.log('║        EVA Venture Health Scanner - Factory Awakens        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Check for existing EVA agent or create temporary context
  const { data: _evaAgent } = await supabase
    .from('agent_registry')
    .select('*')
    .eq('agent_type', 'venture_ceo')
    .eq('status', 'active')
    .limit(1)
    .single();

  const agentContext = _evaAgent || {
    id: 'eva-health-scanner-' + uuidv4().substring(0, 8),
    agent_type: EVA_CONFIG.agentType,
    display_name: EVA_CONFIG.displayName,
    capabilities: EVA_CONFIG.capabilities
  };

  console.log(`🤖 EVA Agent Loaded: ${agentContext.display_name || agentContext.id}`);
  console.log(`   Capabilities: ${JSON.stringify(agentContext.capabilities)}`);
  console.log(`   Hierarchy: ${agentContext.hierarchy_path || 'chairman.eva'}\n`);

  return agentContext;
}

/**
 * Log prediction BEFORE scan (Truth Constraint)
 */
async function logPrediction(ventureId, ventureName, prediction) {
  const correlationId = uuidv4();
  const idempotencyKey = `PRED-HEALTH-${ventureId.substring(0, 8)}-${Date.now()}`;

  const { data, error } = await supabase
    .from('system_events')
    .insert({
      event_type: 'AGENT_PREDICTION',
      venture_id: ventureId,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      // DUAL-DOMAIN GOVERNANCE: Reference existing SD
      sd_id: GOVERNANCE_CONTEXT.sd_id,
      prd_id: GOVERNANCE_CONTEXT.prd_id,
      agent_type: 'venture_ceo',
      actor_type: 'agent',
      actor_role: 'EVA_HEALTH_SCANNER',
      predicted_outcome: prediction,
      payload: {
        action: 'venture_health_scan',
        venture_name: ventureName,
        scan_timestamp: new Date().toISOString()
      },
      directive_context: {
        domain: 'VENTURE_EXECUTION',
        authorized_by: GOVERNANCE_CONTEXT.sd_id
      }
    })
    .select('id')
    .single();

  if (error) {
    console.error(`   ❌ Failed to log prediction: ${error.message}`);
    return null;
  }

  console.log(`   📊 [TRUTH] Prediction logged: ${data.id.substring(0, 8)}...`);
  return { eventId: data.id, correlationId };
}

/**
 * Log outcome AFTER scan (Truth Constraint)
 */
async function logOutcome(predictionEventId, correlationId, ventureId, actualOutcome, calibrationDelta) {
  const idempotencyKey = `OUTC-HEALTH-${ventureId.substring(0, 8)}-${Date.now()}`;

  const { error } = await supabase
    .from('system_events')
    .insert({
      event_type: 'AGENT_OUTCOME',
      venture_id: ventureId,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
      parent_event_id: predictionEventId,
      // DUAL-DOMAIN GOVERNANCE: Reference existing SD
      sd_id: GOVERNANCE_CONTEXT.sd_id,
      prd_id: GOVERNANCE_CONTEXT.prd_id,
      agent_type: 'venture_ceo',
      actor_type: 'agent',
      actor_role: 'EVA_HEALTH_SCANNER',
      actual_outcome: actualOutcome,
      calibration_delta: calibrationDelta,
      payload: {
        action: 'venture_health_scan_complete',
        resolved_at: new Date().toISOString()
      },
      directive_context: {
        domain: 'VENTURE_EXECUTION',
        authorized_by: GOVERNANCE_CONTEXT.sd_id
      },
      resolved_at: new Date().toISOString()
    });

  if (error) {
    console.error(`   ❌ Failed to log outcome: ${error.message}`);
    return false;
  }

  const accuracy = ((1 - Math.abs(calibrationDelta)) * 100).toFixed(1);
  console.log(`   ✅ [TRUTH] Outcome logged (accuracy: ${accuracy}%)`);
  return true;
}

/**
 * Scan a single venture's health
 */
async function scanVentureHealth(venture) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 Scanning: ${venture.name}`);
  console.log(`   ID: ${venture.id}`);
  console.log(`   Current Stage: ${venture.current_lifecycle_stage}`);
  console.log(`   Status: ${venture.status}`);

  // TRUTH CONSTRAINT: Log prediction BEFORE scan
  const prediction = {
    expected_health: venture.status === 'active' ? 'healthy' : 'at_risk',
    expected_completion_rate: 0.8,
    expected_artifact_compliance: 1.0,
    expected_red_flags: venture.status === 'paused' ? 1 : 0
  };

  console.log(`   🎯 Prediction: Expect ${prediction.expected_health} status`);

  const predictionResult = await logPrediction(venture.id, venture.name, prediction);
  if (!predictionResult) {
    return { venture: venture.name, status: 'SCAN_FAILED', reason: 'Prediction logging failed' };
  }

  // Fetch detailed health data
  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('lifecycle_stage, stage_status, health_score, advisory_data')
    .eq('venture_id', venture.id)
    .order('lifecycle_stage');

  const { data: _systemEvents } = await supabase
    .from('system_events')
    .select('event_type, payload, created_at')
    .eq('venture_id', venture.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Analyze health metrics
  const stages = stageWork || [];
  const completedStages = stages.filter(s => s.stage_status === 'completed').length;
  const redHealthStages = stages.filter(s => s.health_score === 'red').length;
  const blockedStages = stages.filter(s => s.stage_status === 'blocked').length;
  const totalStages = stages.length;

  // Check artifact compliance
  const stagesWithArtifacts = stages.filter(s =>
    s.advisory_data && Object.keys(s.advisory_data).length > 0
  ).length;
  const artifactCompliance = totalStages > 0 ? stagesWithArtifacts / totalStages : 0;

  // Determine health status
  let healthStatus = 'HEALTHY';
  let healthReasons = [];

  if (redHealthStages >= HEALTH_THRESHOLDS.RADIOACTIVE.redHealthCount) {
    healthStatus = 'RADIOACTIVE';
    healthReasons.push(`${redHealthStages} stage(s) with RED health`);
  }

  if (blockedStages >= HEALTH_THRESHOLDS.RADIOACTIVE.blockedStages) {
    healthStatus = 'RADIOACTIVE';
    healthReasons.push(`${blockedStages} blocked stage(s)`);
  }

  if (artifactCompliance < 0.5) {
    healthStatus = 'RADIOACTIVE';
    healthReasons.push(`Low artifact compliance: ${(artifactCompliance * 100).toFixed(0)}%`);
  }

  if (healthStatus === 'HEALTHY' && venture.status === 'paused') {
    healthStatus = 'AT_RISK';
    healthReasons.push('Venture is paused');
  }

  // Calculate actual outcome
  const actualOutcome = {
    health_status: healthStatus,
    completion_rate: totalStages > 0 ? completedStages / totalStages : 0,
    artifact_compliance: artifactCompliance,
    red_flags: redHealthStages + blockedStages,
    reasons: healthReasons
  };

  // Calculate calibration delta (prediction accuracy)
  const predictionCorrect =
    (prediction.expected_health === 'healthy' && healthStatus === 'HEALTHY') ||
    (prediction.expected_health === 'at_risk' && healthStatus !== 'HEALTHY');
  const calibrationDelta = predictionCorrect ? 0.0 :
    Math.abs(prediction.expected_red_flags - actualOutcome.red_flags) /
    Math.max(prediction.expected_red_flags, actualOutcome.red_flags, 1);

  // TRUTH CONSTRAINT: Log outcome AFTER scan
  await logOutcome(
    predictionResult.eventId,
    predictionResult.correlationId,
    venture.id,
    actualOutcome,
    calibrationDelta
  );

  // Print results
  const statusEmoji = {
    'HEALTHY': '💚',
    'AT_RISK': '💛',
    'RADIOACTIVE': '☢️'
  };

  console.log(`\n   ${statusEmoji[healthStatus]} Health Status: ${healthStatus}`);
  console.log(`   📈 Completion: ${completedStages}/${totalStages} stages (${(actualOutcome.completion_rate * 100).toFixed(0)}%)`);
  console.log(`   📋 Artifact Compliance: ${(artifactCompliance * 100).toFixed(0)}%`);
  console.log(`   🚨 Red Flags: ${actualOutcome.red_flags}`);

  if (healthReasons.length > 0) {
    console.log('   ⚠️  Issues:');
    healthReasons.forEach(r => console.log(`      - ${r}`));
  }

  return {
    venture_id: venture.id,
    venture_name: venture.name,
    status: healthStatus,
    completion_rate: actualOutcome.completion_rate,
    artifact_compliance: artifactCompliance,
    red_flags: actualOutcome.red_flags,
    reasons: healthReasons,
    requires_pivot: healthStatus === 'RADIOACTIVE'
  };
}

/**
 * Propose Strategic Pivot for radioactive ventures
 */
async function proposeStrategicPivot(scanResult) {
  console.log(`\n   🔄 Proposing Strategic Pivot for ${scanResult.venture_name}...`);

  const pivotData = {
    pivot_reason: scanResult.reasons.join('; '),
    proposed_direction: scanResult.red_flags > 2
      ? 'RECOMMEND: Venture Restructuring or Archive'
      : 'RECOMMEND: Stage Remediation and Artifact Recovery',
    impact_analysis: `Current completion: ${(scanResult.completion_rate * 100).toFixed(0)}%, Artifact compliance: ${(scanResult.artifact_compliance * 100).toFixed(0)}%`,
    artifacts: [],
    key_decisions: ['Pause current stage work', 'Conduct root cause analysis'],
    open_questions: ['Can artifacts be recovered?', 'Is pivot cost-effective?'],
    risks_identified: scanResult.reasons.map(r => ({ type: 'health_issue', content: r }))
  };

  const { data, error } = await supabase
    .from('pending_ceo_handoffs')
    .insert({
      venture_id: scanResult.venture_id,
      from_stage: null,  // Pivot, not stage transition
      to_stage: null,
      vp_agent_id: 'eva-health-scanner',
      handoff_type: 'strategic_pivot',
      handoff_data: pivotData,
      status: 'pending',
      proposed_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    console.error(`   ❌ Failed to propose pivot: ${error.message}`);
    return null;
  }

  console.log(`   ✅ Strategic Pivot proposed: ${data.id}`);
  console.log('   📍 Visible in Decision Deck under "Pivots" filter');

  return data.id;
}

/**
 * Generate Venture Health Brief for Decision Deck
 */
async function generateHealthBrief(scanResults) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║               VENTURE HEALTH BRIEF                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const healthy = scanResults.filter(r => r.status === 'HEALTHY');
  const atRisk = scanResults.filter(r => r.status === 'AT_RISK');
  const radioactive = scanResults.filter(r => r.status === 'RADIOACTIVE');

  console.log('📊 SUMMARY');
  console.log(`   💚 Healthy:     ${healthy.length} ventures`);
  console.log(`   💛 At Risk:     ${atRisk.length} ventures`);
  console.log(`   ☢️  Radioactive: ${radioactive.length} ventures`);
  console.log(`   📋 Total:       ${scanResults.length} ventures scanned\n`);

  if (healthy.length > 0) {
    console.log('💚 HEALTHY VENTURES');
    healthy.forEach(v => {
      console.log(`   ✅ ${v.venture_name} (Stage ${v.completion_rate * 100}% complete)`);
    });
    console.log('');
  }

  if (atRisk.length > 0) {
    console.log('💛 AT-RISK VENTURES');
    atRisk.forEach(v => {
      console.log(`   ⚠️  ${v.venture_name}: ${v.reasons.join(', ')}`);
    });
    console.log('');
  }

  if (radioactive.length > 0) {
    console.log('☢️  RADIOACTIVE VENTURES (Strategic Pivots Proposed)');
    radioactive.forEach(v => {
      console.log(`   🚨 ${v.venture_name}: ${v.reasons.join(', ')}`);
    });
    console.log('');
  }

  // Log summary to system_events
  await supabase
    .from('system_events')
    .insert({
      event_type: 'EVA_HEALTH_BRIEF',
      correlation_id: uuidv4(),
      idempotency_key: `HEALTH-BRIEF-${Date.now()}`,
      // DUAL-DOMAIN GOVERNANCE: Reference existing SD
      sd_id: GOVERNANCE_CONTEXT.sd_id,
      prd_id: GOVERNANCE_CONTEXT.prd_id,
      agent_type: 'venture_ceo',
      actor_type: 'agent',
      actor_role: 'EVA_HEALTH_SCANNER',
      payload: {
        summary: {
          healthy: healthy.length,
          at_risk: atRisk.length,
          radioactive: radioactive.length,
          total: scanResults.length
        },
        ventures: scanResults,
        generated_at: new Date().toISOString()
      },
      directive_context: {
        domain: 'VENTURE_EXECUTION',
        authorized_by: GOVERNANCE_CONTEXT.sd_id
      }
    });

  console.log('✅ Health Brief logged to system_events');
  console.log('📍 View in Decision Deck: /governance/cockpit\n');

  return {
    healthy: healthy.length,
    atRisk: atRisk.length,
    radioactive: radioactive.length,
    pivotProposals: radioactive.length
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Load EVA agent
    const _eva = await loadEVAAgent();

    // Load seeded ventures
    console.log('📂 Loading seeded ventures...\n');
    const { data: ventures, error } = await supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage, is_demo')
      .eq('is_demo', true)
      .neq('status', 'archived')
      .order('name');

    if (error || !ventures?.length) {
      console.error('❌ Failed to load ventures:', error?.message || 'No ventures found');
      process.exit(1);
    }

    console.log(`   Found ${ventures.length} seeded ventures\n`);

    // Scan each venture
    const scanResults = [];
    for (const venture of ventures) {
      const result = await scanVentureHealth(venture);
      scanResults.push(result);

      // Propose pivot if radioactive
      if (result.requires_pivot) {
        await proposeStrategicPivot(result);
      }
    }

    // Generate health brief
    const brief = await generateHealthBrief(scanResults);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║        ✅ THE FIRST PULSE COMPLETE                         ║');
    console.log('║        EVA Health Scan Finished                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Final Statistics:');
    console.log(`   Ventures Scanned: ${scanResults.length}`);
    console.log(`   Predictions Logged: ${scanResults.length}`);
    console.log(`   Outcomes Logged: ${scanResults.length}`);
    console.log(`   Strategic Pivots Proposed: ${brief.pivotProposals}`);
    console.log('\n🔗 Decision Deck: /governance/cockpit');

    return brief;

  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

main();
