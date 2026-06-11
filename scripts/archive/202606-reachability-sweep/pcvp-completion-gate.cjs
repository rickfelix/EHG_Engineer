#!/usr/bin/env node
/**
 * PCVP Completion Gate Script
 * SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A
 *
 * Validates that an SD has proper completion evidence before allowing
 * transition to COMPLETED status:
 * 1. At least one accepted handoff record in sd_phase_handoffs
 * 2. PR merge evidence in shipping_decisions for code-producing SDs
 *
 * Usage:
 *   node scripts/pcvp-completion-gate.cjs <SD-KEY-OR-UUID>
 *   node scripts/pcvp-completion-gate.cjs SD-FEATURE-001
 *   node scripts/pcvp-completion-gate.cjs --check-all   # Batch check all in-progress SDs
 *
 * Exit codes:
 *   0 = PASS (all checks satisfied)
 *   1 = FAIL (missing evidence)
 *   2 = ERROR (script failure)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SD types that produce code and require PR merge evidence
const CODE_PRODUCING_TYPES = ['feature', 'infrastructure', 'fix', 'refactor', 'security', 'enhancement', 'performance'];
// SD types that do NOT require PR merge evidence
const NON_CODE_TYPES = ['orchestrator', 'documentation', 'database'];

async function resolveSDId(sdKeyOrUuid) {
  // Try by sd_key first
  let { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status, current_phase')
    .eq('sd_key', sdKeyOrUuid)
    .single();

  if (!data) {
    // Try by UUID
    ({ data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, sd_type, status, current_phase')
      .eq('id', sdKeyOrUuid)
      .single());
  }

  if (error || !data) {
    return null;
  }
  return data;
}

async function checkHandoffEvidence(sdId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, status, created_at, created_by')
    .eq('sd_id', sdId)
    .eq('status', 'accepted');

  if (error) {
    return { pass: false, error: error.message, count: 0, handoffs: [] };
  }

  return {
    pass: data.length > 0,
    count: data.length,
    handoffs: data.map(h => ({
      type: h.handoff_type,
      created: h.created_at,
      by: h.created_by
    }))
  };
}

async function checkPRMergeEvidence(sdId, sdKey) {
  const { data, error } = await supabase
    .from('shipping_decisions')
    .select('id, decision_type, decision, executed_at, execution_result')
    .or(`sd_id.eq.${sdId},sd_id.eq.${sdKey}`)
    .in('decision_type', ['PR_MERGE', 'PR_CREATION']);

  if (error) {
    return { pass: false, error: error.message, count: 0, decisions: [] };
  }

  const mergeDecisions = data.filter(d => d.decision_type === 'PR_MERGE');
  return {
    pass: mergeDecisions.length > 0,
    count: mergeDecisions.length,
    total_decisions: data.length,
    decisions: data.map(d => ({
      type: d.decision_type,
      decision: d.decision,
      executed: d.executed_at
    }))
  };
}

async function verifySD(sdKeyOrUuid) {
  const sd = await resolveSDId(sdKeyOrUuid);
  if (!sd) {
    console.error(`SD not found: ${sdKeyOrUuid}`);
    process.exit(2);
  }

  console.log(`\nPCVP Completion Gate`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  SD: ${sd.sd_key}`);
  console.log(`  Title: ${sd.title}`);
  console.log(`  Type: ${sd.sd_type}`);
  console.log(`  Status: ${sd.status} | Phase: ${sd.current_phase}`);
  console.log();

  const results = { pass: true, checks: [] };

  // Check 1: Handoff evidence
  const handoffResult = await checkHandoffEvidence(sd.id);
  results.checks.push({
    name: 'Handoff Evidence',
    pass: handoffResult.pass,
    detail: handoffResult.pass
      ? `${handoffResult.count} accepted handoff(s) found`
      : 'No accepted handoff records found'
  });

  if (!handoffResult.pass) {
    results.pass = false;
  }

  console.log(`  ${handoffResult.pass ? '✅' : '❌'} Handoff Evidence: ${handoffResult.pass ? handoffResult.count + ' accepted' : 'MISSING'}`);
  if (handoffResult.handoffs.length > 0) {
    handoffResult.handoffs.forEach(h => {
      console.log(`     - ${h.type} (${h.by}, ${new Date(h.created).toLocaleDateString()})`);
    });
  }

  // Check 2: PR merge evidence (only for code-producing SD types)
  const requiresPR = CODE_PRODUCING_TYPES.includes(sd.sd_type);
  if (requiresPR) {
    const prResult = await checkPRMergeEvidence(sd.id, sd.sd_key);
    results.checks.push({
      name: 'PR Merge Evidence',
      pass: prResult.pass,
      detail: prResult.pass
        ? `${prResult.count} PR merge decision(s) found`
        : 'No PR merge evidence in shipping_decisions'
    });

    if (!prResult.pass) {
      // Warn but don't hard-fail for infrastructure/fix types
      if (['infrastructure', 'fix'].includes(sd.sd_type)) {
        console.log(`  ⚠️  PR Merge Evidence: WARNING - no merge evidence (non-blocking for ${sd.sd_type})`);
        results.checks[results.checks.length - 1].severity = 'warning';
      } else {
        results.pass = false;
        console.log(`  ❌ PR Merge Evidence: MISSING (required for ${sd.sd_type})`);
      }
    } else {
      console.log(`  ✅ PR Merge Evidence: ${prResult.count} merge(s) found`);
    }
  } else {
    console.log(`  ℹ️  PR Merge Evidence: Skipped (sd_type=${sd.sd_type} is not code-producing)`);
    results.checks.push({
      name: 'PR Merge Evidence',
      pass: true,
      detail: `Skipped for sd_type=${sd.sd_type}`
    });
  }

  // Summary
  console.log();
  if (results.pass) {
    console.log(`  ✅ PCVP GATE: PASS`);
    console.log(`     SD ${sd.sd_key} has sufficient completion evidence.`);
  } else {
    console.log(`  ❌ PCVP GATE: FAIL`);
    console.log(`     SD ${sd.sd_key} is missing required completion evidence.`);
    results.checks.filter(c => !c.pass && c.severity !== 'warning').forEach(c => {
      console.log(`     - ${c.name}: ${c.detail}`);
    });
  }
  console.log(`${'='.repeat(50)}`);

  // Machine-readable output
  console.log(`\nPCVP_RESULT=${results.pass ? 'PASS' : 'FAIL'} SD=${sd.sd_key} CHECKS=${results.checks.length}`);

  return results.pass;
}

async function checkAll() {
  console.log(`\nPCVP Batch Completion Gate`);
  console.log(`${'='.repeat(50)}`);

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status')
    .eq('status', 'completed')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching SDs:', error.message);
    process.exit(2);
  }

  let passCount = 0;
  let failCount = 0;

  for (const sd of sds) {
    const handoff = await checkHandoffEvidence(sd.id);
    const status = handoff.pass ? '✅' : '❌';
    if (handoff.pass) passCount++;
    else failCount++;
    console.log(`  ${status} ${sd.sd_key} (${sd.sd_type}) - ${handoff.count} handoff(s)`);
  }

  console.log();
  console.log(`  Results: ${passCount} pass, ${failCount} fail out of ${sds.length} checked`);
  console.log(`  Integrity rate: ${sds.length > 0 ? Math.round(100 * passCount / sds.length) : 0}%`);
  console.log(`${'='.repeat(50)}`);

  process.exit(failCount > 0 ? 1 : 0);
}

// Main
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/pcvp-completion-gate.cjs <SD-KEY-OR-UUID>');
  console.error('       node scripts/pcvp-completion-gate.cjs --check-all');
  process.exit(2);
}

if (arg === '--check-all') {
  checkAll();
} else {
  verifySD(arg).then(pass => {
    process.exit(pass ? 0 : 1);
  });
}
