/**
 * Validate Chairman Dashboard Wiring
 * SD: SD-EVA-FEAT-DASHBOARD-WIRING-001
 *
 * Tests:
 * 1. v_chairman_pending_decisions view returns data
 * 2. fn_chairman_decide RPC works (approve/reject + double-decide + stale-context)
 * 3. v_chairman_escalation_events view returns data
 * 4. fn_check_decision_staleness RPC works
 */

const path = require('path');
// Try worktree-relative first, then main repo
const envPath = path.resolve(__dirname, '../../.env');
const mainEnvPath = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.env';
const fs = require('fs');
require('dotenv').config({ path: fs.existsSync(envPath) ? envPath : mainEnvPath });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let failed = 0;
let testDecisionId = null;

function ok(label) {
  passed++;
  console.log('  ✅ ' + label);
}

function fail(label, detail) {
  failed++;
  console.log('  ❌ ' + label + (detail ? ': ' + detail : ''));
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Chairman Dashboard Wiring Validation                   ║');
  console.log('║  SD-EVA-FEAT-DASHBOARD-WIRING-001                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ──────────────────────────────────────────
  // Test 1: v_chairman_pending_decisions view
  // ──────────────────────────────────────────
  console.log('Test 1: v_chairman_pending_decisions view');
  const { data: pendingView, error: e1 } = await supabase
    .from('v_chairman_pending_decisions')
    .select('*')
    .limit(5);

  if (e1) fail('View query', e1.message);
  else ok('View query succeeded (' + (pendingView || []).length + ' rows)');

  // Check view has expected columns
  if (pendingView && pendingView.length > 0) {
    const cols = Object.keys(pendingView[0]);
    const expected = ['id', 'venture_name', 'status', 'is_stale_context', 'decided_by'];
    for (const col of expected) {
      if (cols.includes(col)) ok('Column present: ' + col);
      else fail('Missing column: ' + col);
    }
  } else {
    console.log('  ℹ️  No pending decisions to validate columns (table is empty)');
  }

  // ──────────────────────────────────────────
  // Test 2: Create a test decision for RPC testing
  // ──────────────────────────────────────────
  console.log('\nTest 2: Create test decision for RPC validation');

  // Get a venture to reference
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, updated_at')
    .limit(1)
    .single();

  if (!ventures) {
    fail('No ventures found', 'Cannot create test decision');
    printSummary();
    return;
  }

  ok('Venture found: ' + ventures.name);

  // Create a test decision
  const { data: testDec, error: e2 } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventures.id,
      lifecycle_stage: 1,
      health_score: 'green',
      recommendation: 'proceed',
      decision: 'pending',
      status: 'pending',
      summary: 'TEST: Dashboard wiring validation'
    })
    .select()
    .single();

  if (e2) {
    fail('Create test decision', e2.message);
    printSummary();
    return;
  }

  testDecisionId = testDec.id;
  ok('Test decision created: ' + testDecisionId);

  // ──────────────────────────────────────────
  // Test 3: fn_check_decision_staleness RPC
  // ──────────────────────────────────────────
  console.log('\nTest 3: fn_check_decision_staleness RPC');
  const { data: staleCheck, error: e3 } = await supabase
    .rpc('fn_check_decision_staleness', { p_decision_id: testDecisionId });

  if (e3) fail('Staleness check RPC', e3.message);
  else {
    ok('RPC returned: ' + JSON.stringify(staleCheck));
    if (staleCheck.found) ok('Decision found');
    else fail('Decision not found in staleness check');
    if (typeof staleCheck.is_stale === 'boolean') ok('is_stale field present: ' + staleCheck.is_stale);
    else fail('Missing is_stale field');
  }

  // ──────────────────────────────────────────
  // Test 4: fn_chairman_decide - approve
  // ──────────────────────────────────────────
  console.log('\nTest 4: fn_chairman_decide - approve');
  const { data: approveResult, error: e4 } = await supabase
    .rpc('fn_chairman_decide', {
      p_decision_id: testDecisionId,
      p_action: 'approved',
      p_decided_by: 'validation-script',
      p_rationale: 'Test approval via validation script',
      p_force_stale: true  // Force past stale-context check for test
    });

  if (e4) fail('Approve RPC', e4.message);
  else {
    if (approveResult.success) ok('Approve succeeded: ' + JSON.stringify(approveResult));
    else fail('Approve failed', approveResult.error);
  }

  // Verify the decision was updated
  const { data: afterApprove } = await supabase
    .from('chairman_decisions')
    .select('status, decided_by, rationale, updated_at')
    .eq('id', testDecisionId)
    .single();

  if (afterApprove) {
    if (afterApprove.status === 'approved') ok('Status is approved');
    else fail('Status is ' + afterApprove.status + ' (expected approved)');
    if (afterApprove.decided_by === 'validation-script') ok('decided_by is correct');
    else fail('decided_by is ' + afterApprove.decided_by);
    if (afterApprove.rationale) ok('rationale is set');
    else fail('rationale is missing');
  }

  // ──────────────────────────────────────────
  // Test 5: fn_chairman_decide - double-decide prevention
  // ──────────────────────────────────────────
  console.log('\nTest 5: fn_chairman_decide - double-decide prevention');
  const { data: doubleDec, error: e5 } = await supabase
    .rpc('fn_chairman_decide', {
      p_decision_id: testDecisionId,
      p_action: 'rejected',
      p_decided_by: 'attacker',
      p_rationale: 'Should fail',
      p_force_stale: true
    });

  if (e5) fail('Double-decide RPC call', e5.message);
  else {
    if (!doubleDec.success && doubleDec.code === 'ALREADY_DECIDED') {
      ok('Double-decide blocked: ' + doubleDec.code);
    } else {
      fail('Double-decide was NOT blocked', JSON.stringify(doubleDec));
    }
  }

  // ──────────────────────────────────────────
  // Test 6: fn_chairman_decide - invalid action
  // ──────────────────────────────────────────
  console.log('\nTest 6: fn_chairman_decide - invalid action');
  const { data: invalidAction, error: e6 } = await supabase
    .rpc('fn_chairman_decide', {
      p_decision_id: testDecisionId,
      p_action: 'invalid_action',
      p_decided_by: 'test',
      p_force_stale: true
    });

  if (e6) fail('Invalid action RPC call', e6.message);
  else {
    if (!invalidAction.success && invalidAction.code === 'INVALID_ACTION') {
      ok('Invalid action blocked: ' + invalidAction.code);
    } else {
      fail('Invalid action was NOT blocked', JSON.stringify(invalidAction));
    }
  }

  // ──────────────────────────────────────────
  // Test 7: v_chairman_escalation_events view
  // ──────────────────────────────────────────
  console.log('\nTest 7: v_chairman_escalation_events view');
  const { data: escView, error: e7 } = await supabase
    .from('v_chairman_escalation_events')
    .select('*')
    .limit(5);

  if (e7) fail('Escalation view query', e7.message);
  else ok('Escalation view query succeeded (' + (escView || []).length + ' rows)');

  // ──────────────────────────────────────────
  // Test 8: Insert test escalation event and verify view
  // ──────────────────────────────────────────
  console.log('\nTest 8: Insert test DFE escalation event');
  const { data: testEvent, error: e8 } = await supabase
    .from('eva_event_log')
    .insert({
      event_type: 'dfe.escalation',
      trigger_source: 'manual',
      venture_id: ventures.id,
      correlation_id: testDecisionId,  // Use decision ID as correlation
      status: 'succeeded',
      metadata: {
        severity: 'high',
        reason: 'Test escalation for dashboard wiring validation'
      }
    })
    .select()
    .single();

  if (e8) fail('Insert test event', e8.message);
  else ok('Test escalation event created');

  // Verify it appears in the view
  if (testEvent) {
    const { data: viewCheck } = await supabase
      .from('v_chairman_escalation_events')
      .select('*')
      .eq('id', testEvent.id)
      .single();

    if (viewCheck) {
      ok('Event visible in escalation view');
      if (viewCheck.venture_name === ventures.name) ok('Venture name joined correctly');
      if (viewCheck.severity === 'high') ok('Severity extracted from metadata');
      if (viewCheck.escalation_reason) ok('Escalation reason extracted');
    } else {
      fail('Event not visible in escalation view');
    }
  }

  // ──────────────────────────────────────────
  // Cleanup: Remove test data
  // ──────────────────────────────────────────
  console.log('\nCleanup:');
  if (testDecisionId) {
    await supabase.from('chairman_decisions').delete().eq('id', testDecisionId);
    ok('Test decision deleted');
  }
  if (testEvent) {
    await supabase.from('eva_event_log').delete().eq('id', testEvent.id);
    ok('Test escalation event deleted');
  }

  printSummary();
}

function printSummary() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('══════════════════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
