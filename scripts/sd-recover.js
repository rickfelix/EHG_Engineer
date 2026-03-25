#!/usr/bin/env node
/**
 * sd:recover — Detect and fix broken handoff chains
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001
 *
 * Detects SDs where current_phase/status has advanced beyond what accepted
 * handoffs support, and offers repair options.
 *
 * Usage:
 *   npm run sd:recover <SD-ID>       # Recover a specific SD
 *   npm run sd:recover --scan        # Scan all SDs for broken chains
 *   npm run sd:recover --scan --fix  # Auto-fix all broken chains
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Phase progression order — each phase requires the listed accepted handoff
const PHASE_HANDOFF_MAP = {
  PLAN_PRD: { required_handoff: 'LEAD-TO-PLAN', from: 'LEAD', to: 'PLAN' },
  PLAN: { required_handoff: 'LEAD-TO-PLAN', from: 'LEAD', to: 'PLAN' },
  PLAN_VERIFICATION: { required_handoff: 'LEAD-TO-PLAN', from: 'LEAD', to: 'PLAN' },
  EXEC: { required_handoff: 'PLAN-TO-EXEC', from: 'PLAN', to: 'EXEC' },
  EXEC_ACTIVE: { required_handoff: 'PLAN-TO-EXEC', from: 'PLAN', to: 'EXEC' },
  EXEC_COMPLETE: { required_handoff: 'PLAN-TO-EXEC', from: 'PLAN', to: 'EXEC' },
};

/**
 * Check handoff chain integrity for a single SD
 * @param {string} sdKey - SD key
 * @returns {Object} { healthy, issues[], sd, handoffs }
 */
async function checkHandoffChain(sdKey) {
  // Resolve SD
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, current_phase, status, is_active')
    .or(`sd_key.eq.${sdKey},id.eq.${sdKey}`)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (sdErr || !sd) {
    return { healthy: true, issues: [], sd: null, handoffs: [], error: `SD not found: ${sdKey}` };
  }

  // Get accepted handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, status, validation_score, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const acceptedHandoffs = handoffs || [];
  const issues = [];

  // Check: does current phase have a matching accepted handoff?
  const phaseReq = PHASE_HANDOFF_MAP[sd.current_phase];
  if (phaseReq) {
    const hasRequiredHandoff = acceptedHandoffs.some(
      h => h.from_phase === phaseReq.from && h.to_phase === phaseReq.to
    );
    if (!hasRequiredHandoff) {
      issues.push({
        type: 'MISSING_HANDOFF',
        severity: 'critical',
        phase: sd.current_phase,
        required: `${phaseReq.from} → ${phaseReq.to}`,
        message: `SD is in ${sd.current_phase} but has no accepted ${phaseReq.required_handoff} handoff`
      });
    }
  }

  // Check: EXEC phase requires BOTH LEAD-TO-PLAN and PLAN-TO-EXEC
  if (['EXEC', 'EXEC_ACTIVE', 'EXEC_COMPLETE'].includes(sd.current_phase)) {
    const hasLeadToPlan = acceptedHandoffs.some(h => h.from_phase === 'LEAD' && h.to_phase === 'PLAN');
    if (!hasLeadToPlan) {
      issues.push({
        type: 'MISSING_PREREQUISITE',
        severity: 'critical',
        phase: sd.current_phase,
        required: 'LEAD → PLAN',
        message: `SD is in ${sd.current_phase} but missing prerequisite LEAD-TO-PLAN handoff`
      });
    }
  }

  // Check: status vs phase coherence
  if (sd.status === 'draft' && sd.current_phase !== 'LEAD') {
    issues.push({
      type: 'STATUS_PHASE_MISMATCH',
      severity: 'warning',
      message: `Status is 'draft' but phase is '${sd.current_phase}' — should be LEAD for draft`
    });
  }

  return {
    healthy: issues.length === 0,
    issues,
    sd,
    handoffs: acceptedHandoffs
  };
}

/**
 * Determine the correct phase based on accepted handoffs
 */
function determineCorrectPhase(handoffs) {
  if (!handoffs || handoffs.length === 0) return 'LEAD';

  const hasLeadToPlan = handoffs.some(h => h.from_phase === 'LEAD' && h.to_phase === 'PLAN');
  const hasPlanToExec = handoffs.some(h => h.from_phase === 'PLAN' && h.to_phase === 'EXEC');
  const hasExecToPlan = handoffs.some(h => h.from_phase === 'EXEC' && h.to_phase === 'PLAN');
  const hasPlanToLead = handoffs.some(h => h.from_phase === 'PLAN' && h.to_phase === 'LEAD');

  if (hasPlanToLead) return 'LEAD_FINAL_APPROVAL';
  if (hasExecToPlan) return 'PLAN_VERIFICATION';
  if (hasPlanToExec) return 'EXEC';
  if (hasLeadToPlan) return 'PLAN_PRD';
  return 'LEAD';
}

/**
 * Determine the correct status for a phase
 */
function statusForPhase(phase) {
  if (phase === 'LEAD' || phase === 'LEAD_APPROVAL') return 'draft';
  if (phase.startsWith('PLAN')) return 'planning';
  if (phase.startsWith('EXEC')) return 'active';
  if (phase === 'LEAD_FINAL_APPROVAL') return 'in_progress';
  return 'in_progress';
}

/**
 * Repair a broken SD by resetting to match its accepted handoff chain
 */
async function repairSD(sd, handoffs, { dryRun = false } = {}) {
  const correctPhase = determineCorrectPhase(handoffs);
  const correctStatus = statusForPhase(correctPhase);

  console.log(`\n   🔧 Repair plan for ${sd.sd_key}:`);
  console.log(`      Current:  phase=${sd.current_phase}, status=${sd.status}`);
  console.log(`      Correct:  phase=${correctPhase}, status=${correctStatus}`);
  console.log(`      Handoffs: ${handoffs.length} accepted`);

  if (dryRun) {
    console.log(`      [DRY RUN] Would reset phase=${correctPhase}, status=${correctStatus}`);
    return { repaired: false, dryRun: true };
  }

  // Reset SD state
  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: correctPhase,
      status: correctStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id);

  if (updateErr) {
    console.log(`      ❌ Repair failed: ${updateErr.message}`);
    return { repaired: false, error: updateErr.message };
  }

  // Log recovery to audit
  try {
    await supabase.from('audit_log').insert({
      action: 'SD_RECOVER',
      entity_type: 'strategic_directive',
      entity_id: sd.id,
      details: {
        sd_key: sd.sd_key,
        old_phase: sd.current_phase,
        old_status: sd.status,
        new_phase: correctPhase,
        new_status: correctStatus,
        accepted_handoffs: handoffs.length,
        recovery_reason: 'Broken handoff chain detected by sd:recover'
      },
      severity: 'warning',
      created_by: 'sd-recover'
    });
  } catch (e) {
    // Audit logging is best-effort
    console.debug(`      [audit] ${e.message}`);
  }

  console.log(`      ✅ Repaired: phase=${correctPhase}, status=${correctStatus}`);
  return { repaired: true, newPhase: correctPhase, newStatus: correctStatus };
}

/**
 * Scan all active non-completed SDs for broken handoff chains
 */
async function scanAll({ fix = false } = {}) {
  console.log('\n🔍 Scanning all active SDs for broken handoff chains...\n');

  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('is_active', true)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .neq('current_phase', 'LEAD')
    .neq('current_phase', 'COMPLETED');

  if (!sds || sds.length === 0) {
    console.log('   No SDs to check (all in LEAD or completed).');
    return;
  }

  console.log(`   Checking ${sds.length} SDs...\n`);

  let broken = 0;
  let repaired = 0;

  for (const { sd_key } of sds) {
    const result = await checkHandoffChain(sd_key);
    if (!result.healthy) {
      broken++;
      console.log(`   ❌ ${sd_key} — STUCK`);
      for (const issue of result.issues) {
        console.log(`      [${issue.severity}] ${issue.message}`);
      }
      if (fix) {
        const repair = await repairSD(result.sd, result.handoffs);
        if (repair.repaired) repaired++;
      }
    }
  }

  console.log(`\n📊 Scan complete: ${sds.length} checked, ${broken} broken${fix ? `, ${repaired} repaired` : ''}`);
  if (broken > 0 && !fix) {
    console.log(`   💡 Run with --fix to auto-repair: npm run sd:recover -- --scan --fix`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const scanMode = args.includes('--scan');
  const fixMode = args.includes('--fix');
  const sdId = args.find(a => !a.startsWith('--'));

  if (scanMode) {
    await scanAll({ fix: fixMode });
    return;
  }

  if (!sdId) {
    console.log('Usage:');
    console.log('  npm run sd:recover <SD-ID>       — Check and repair a specific SD');
    console.log('  npm run sd:recover -- --scan      — Scan all SDs for broken chains');
    console.log('  npm run sd:recover -- --scan --fix — Auto-fix all broken chains');
    process.exit(1);
  }

  console.log(`\n🔍 Checking handoff chain for ${sdId}...\n`);
  const result = await checkHandoffChain(sdId);

  if (result.error) {
    console.log(`   ❌ ${result.error}`);
    process.exit(1);
  }

  console.log(`   SD: ${result.sd.sd_key}`);
  console.log(`   Title: ${result.sd.title}`);
  console.log(`   Phase: ${result.sd.current_phase}`);
  console.log(`   Status: ${result.sd.status}`);
  console.log(`   Accepted handoffs: ${result.handoffs.length}`);
  for (const h of result.handoffs) {
    console.log(`      ✓ ${h.from_phase} → ${h.to_phase} (score: ${h.validation_score})`);
  }

  if (result.healthy) {
    console.log(`\n   ✅ Handoff chain is healthy — no repair needed.`);
    console.log('RECOVER_RESULT=HEALTHY');
  } else {
    console.log(`\n   ❌ BROKEN handoff chain detected:`);
    for (const issue of result.issues) {
      console.log(`      [${issue.severity}] ${issue.message}`);
    }

    if (fixMode) {
      await repairSD(result.sd, result.handoffs);
    } else {
      console.log(`\n   💡 Run with --fix to repair: npm run sd:recover -- ${sdId} --fix`);
    }
    console.log('RECOVER_RESULT=BROKEN');
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});

// Export for use by other modules (sd-next, sd-start)
export { checkHandoffChain, PHASE_HANDOFF_MAP };
