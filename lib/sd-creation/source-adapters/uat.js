/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: UAT source adapter — createFromUAT moved VERBATIM from
 * scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites return
 * {ok:false, error, exitCode} / the CLI maps them back to the historical exit codes.
 */
import { supabase } from '../context.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import { runTriageGate } from '../../../scripts/modules/triage-gate.js';
// createSDOrThrow preserves the pre-refactor call-site contract (`const sd = await createSD(...)`
// resolves to the inserted row; failures throw to the CLI's catch exactly as before).
import { resolveVenturePrefix, createSDOrThrow as createSD } from '../pipeline.js';
import { classifyPlanLinkage } from '../plan-linkage-classifier.js';

/**
 * Create SD from UAT finding
 */
export async function createFromUAT(testId) {
  console.log(`\n📋 Creating SD from UAT finding: ${testId}`);

  // Fetch UAT test result
  const { data: uatResult, error } = await supabase
    .from('uat_test_results')
    .select('*')
    .eq('id', testId)
    .single();

  if (error || !uatResult) {
    console.error('UAT result not found:', testId);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `UAT result not found: ${testId}`, exitCode: 1 };
  }

  // Determine type from UAT result
  const type = uatResult.status === 'failed' ? 'fix' : 'feature';

  // Triage Gate: soft recommendation for UAT-sourced items
  try {
    const triageResult = await runTriageGate({
      title: uatResult.test_name || uatResult.title || 'UAT Finding',
      description: uatResult.notes || uatResult.description || '',
      type,
      source: 'uat'
    }, supabase);
    if (triageResult.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick Fix (Tier ${triageResult.tier}, ~${triageResult.estimatedLoc} LOC). Consider QF workflow for smaller scope.`);
    }
  } catch { /* non-fatal */ }

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'UAT',
    type,
    title: uatResult.test_name || uatResult.title || 'UAT Finding',
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: uatResult.test_name || uatResult.title,
    description: uatResult.notes || uatResult.description || 'Created from UAT finding',
    type,
    rationale: `Created from UAT test result ${testId}`,
    metadata: {
      source: 'uat',
      source_id: testId,
      uat_status: uatResult.status,
      // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): tag-at-the-door linkage stamp
      plan_linkage: classifyPlanLinkage({ sdKey })
    }
  });

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: the UAT test-result id (string) or { testId }.
 */
export async function toDraft(input, _deps = {}) {
  const testId = (input && typeof input === 'object') ? (input.testId ?? input.id) : input;
  return createFromUAT(testId);
}
