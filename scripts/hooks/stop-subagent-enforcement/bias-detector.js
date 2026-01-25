/**
 * Type-Aware Bias Detection
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-J
 *
 * Detects common AI workflow biases based on SD type and current state:
 * 1. COMPLETION_BIAS: Code shipped to main but SD not marked complete in database
 * 2. EFFICIENCY_BIAS: Jumped to EXEC phase without proper handoffs
 * 3. AUTONOMY_BIAS: Code exists without PRD for code-requiring SD types
 *
 * @module stop-subagent-enforcement/bias-detector
 */

import { execSync } from 'child_process';

/**
 * Detect common AI workflow biases
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 * @param {Object} requirements - Validation requirements from getValidationRequirements()
 */
export async function detectBiasesForType(supabase, sd, sdKey, requirements) {
  const biases = [];
  const sdType = sd.sd_type || 'feature';

  // 1. COMPLETION_BIAS: Code on main but SD not complete
  try {
    const { data: prRecords } = await supabase
      .from('sd_scope_deliverables')
      .select('deliverable_name, completion_status, metadata')
      .eq('sd_id', sd.id)
      .ilike('deliverable_name', '%PR%');

    const hasMergedPR = prRecords?.some(pr =>
      pr.completion_status === 'completed' ||
      pr.metadata?.merged === true
    );

    if (hasMergedPR && sd.status !== 'completed' && sd.current_phase !== 'COMPLETED') {
      biases.push({
        type: 'COMPLETION_BIAS',
        severity: 'high',
        message: 'Code merged to main but SD not marked complete in database',
        details: {
          sd_status: sd.status,
          current_phase: sd.current_phase,
          has_merged_pr: true
        },
        root_cause: 'Claude may confuse "code shipped" with "SD complete"',
        remediation: 'Execute LEAD-FINAL-APPROVAL handoff or mark SD complete',
        command: `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sdKey}`
      });
    }
  } catch {
    // Ignore errors in PR check
  }

  // 2. EFFICIENCY_BIAS: In EXEC phase without proper handoffs
  if (sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION') {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sd.id)
      .eq('status', 'accepted');

    const acceptedHandoffs = (handoffs || []).map(h => h.handoff_type);
    const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
    const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');

    if (!hasLeadToPlan || !hasPlanToExec) {
      const missingHandoffs = [];
      if (!hasLeadToPlan) missingHandoffs.push('LEAD-TO-PLAN');
      if (!hasPlanToExec) missingHandoffs.push('PLAN-TO-EXEC');

      biases.push({
        type: 'EFFICIENCY_BIAS',
        severity: 'medium',
        message: `In EXEC phase without required handoffs: ${missingHandoffs.join(', ')}`,
        details: {
          current_phase: sd.current_phase,
          accepted_handoffs: acceptedHandoffs,
          missing_handoffs: missingHandoffs
        },
        root_cause: 'Claude may skip planning to start coding faster',
        remediation: 'Execute missing handoffs before continuing',
        command: `node scripts/handoff.js execute ${missingHandoffs[0]} ${sdKey}`
      });
    }
  }

  // 3. AUTONOMY_BIAS: Code exists without PRD for code-requiring SD types
  if (!requirements.skipCodeValidation) {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('sd_id', sd.id)
      .single();

    const hasPRD = prd !== null;

    let hasCodeChanges = false;
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      const codeFiles = diffOutput.split('\n').filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      hasCodeChanges = codeFiles.length > 0;
    } catch {
      // Ignore diff errors
    }

    if (hasCodeChanges && !hasPRD) {
      biases.push({
        type: 'AUTONOMY_BIAS',
        severity: 'high',
        message: `Code changes exist without PRD for ${sdType} SD (requires PRD)`,
        details: {
          sd_type: sdType,
          has_prd: false,
          has_code_changes: true,
          requires_prd: !requirements.skipCodeValidation
        },
        root_cause: 'Claude may start coding without defining requirements first',
        remediation: 'Create PRD before continuing with implementation',
        command: `node scripts/add-prd-to-database.js ${sdKey}`
      });
    }
  }

  // Output detected biases
  if (biases.length > 0) {
    console.error(`\n🧠 AI Bias Detection for ${sdKey} (${sdType})`);
    console.error(`   Current Phase: ${sd.current_phase}`);
    console.error(`   Status: ${sd.status}`);
    console.error('');

    biases.forEach((bias, idx) => {
      const severityIcon = bias.severity === 'high' ? '🔴' : bias.severity === 'medium' ? '🟡' : '🟢';
      console.error(`   ${idx + 1}. ${severityIcon} ${bias.type}`);
      console.error(`      Message: ${bias.message}`);
      console.error(`      Root Cause: ${bias.root_cause}`);
      console.error(`      Action: ${bias.remediation}`);
      if (bias.command) {
        console.error(`      Command: ${bias.command}`);
      }
      console.error('');
    });

    // High severity biases should block
    const highSeverityBiases = biases.filter(b => b.severity === 'high');
    if (highSeverityBiases.length > 0) {
      const output = {
        decision: 'block',
        reason: `Detected ${highSeverityBiases.length} high-severity AI biases for ${sdKey}`,
        details: {
          sd_key: sdKey,
          sd_type: sdType,
          current_phase: sd.current_phase,
          biases: biases
        },
        remediation: {
          priority_actions: highSeverityBiases.map(b => b.remediation),
          commands: highSeverityBiases.map(b => b.command).filter(Boolean)
        }
      };

      console.log(JSON.stringify(output));
      process.exit(2);
    }

    // Medium severity biases warn but don't block
    console.error('   (Medium severity biases are warnings - not blocking)');
  }
}
