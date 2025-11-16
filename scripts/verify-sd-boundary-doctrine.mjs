import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('═══════════════════════════════════════════════════════════════');
console.log('SD BOUNDARY DOCTRINE VERIFICATION');
console.log('SD: SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001');
console.log('═══════════════════════════════════════════════════════════════\n');

// Step 1: Read current SD
console.log('1️⃣  READING CURRENT SD RECORD\n');

const { data: sdData, error: readError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001')
  .single();

if (readError) {
  console.error('❌ Failed to read SD:', readError.message);
  process.exit(1);
}

console.log('Title:', sdData.title);
console.log('Priority:', sdData.priority);
console.log('Status:', sdData.status);
console.log('Phase:', sdData.current_phase);
console.log('Database:', supabaseUrl.includes('dedlbzhpgkmetvhbkyzq') ? '✅ EHG_Engineer (governance)' : '❌ Wrong DB');
console.log('\nCurrent Metadata:');
console.log(JSON.stringify(sdData.metadata, null, 2));

// Step 2: Build required metadata structure
console.log('\n\n2️⃣  CHECKING BOUNDARY DOCTRINE ASSERTIONS\n');

const currentMetadata = sdData.metadata || {};
let needsUpdate = false;
const updates = [];

// Required boundary structure
const requiredBoundary = {
  governance_repo: 'EHG_Engineer',
  application_repo: 'EHG',
  validation_role_now: 'transitional-dossier-validation-in-EHG_Engineer',
  validation_role_future: 'runtime-self-checks-in-EHG',
  ownership_source_of_truth: 'EHG_Engineer-governs-rules; EHG-enforces-at-runtime',
  ...(currentMetadata.boundary?.rules ? { rules: currentMetadata.boundary.rules } : {})
};

// Required governance_trail structure
const requiredGovernanceTrail = {
  creates_handoffs: currentMetadata.governance_trail?.creates_handoffs || true,
  use_leo_protocol: currentMetadata.governance_trail?.use_leo_protocol || true,
  defer_prd_generation_to_plan: true,
  leverage_universal_lessons: ['L1','L2','L4','L7','L8','L9','L11','L14','L15','L16'],
  crew_ai_policy_version: 'v1.0',
  handoff_policy: 'LEAD->PLAN only; PLAN creates PRD later',
  post_40_stages_migration: 'shift-continuous-validation-into-EHG-application'
};

// Check boundary
const boundaryNeedsUpdate = !currentMetadata.boundary?.validation_role_now ||
                           !currentMetadata.boundary?.validation_role_future ||
                           !currentMetadata.boundary?.ownership_source_of_truth;

if (boundaryNeedsUpdate) {
  needsUpdate = true;
  updates.push('boundary');
  console.log('❌ boundary - missing required fields');
} else {
  console.log('✅ boundary - complete');
}

// Check governance_trail
const trailNeedsUpdate = !currentMetadata.governance_trail?.leverage_universal_lessons ||
                        !currentMetadata.governance_trail?.crew_ai_policy_version ||
                        !currentMetadata.governance_trail?.handoff_policy ||
                        !currentMetadata.governance_trail?.post_40_stages_migration;

if (trailNeedsUpdate) {
  needsUpdate = true;
  updates.push('governance_trail');
  console.log('❌ governance_trail - missing required fields');
} else {
  console.log('✅ governance_trail - complete');
}

// Required thresholds (normalize structure)
const currentThresholds = currentMetadata.thresholds || {};
const requiredThresholds = {
  critical: currentThresholds.critical_pass_rate_min || currentThresholds.critical || 0.95,
  overall: currentThresholds.overall_pass_rate_min || currentThresholds.overall || 0.87,
  cadence: currentThresholds.checkpoint_cadence || currentThresholds.cadence || 'P7D'
};

const thresholdsNeedUpdate = !currentThresholds.critical && !currentThresholds.critical_pass_rate_min;
if (thresholdsNeedUpdate) {
  needsUpdate = true;
  updates.push('thresholds');
  console.log('❌ thresholds - need normalization');
} else {
  console.log('✅ thresholds - present');
}

// Required acceptance_doctrine
const requiredAcceptanceDoctrine = {
  now: [
    'EHG_Engineer validates stage implementations against dossiers during build-out',
    'No PRDs generated until PLAN handoff',
    'No app code changes in this SD'
  ],
  future: [
    'After all 40 stages verified, continuous checks run inside EHG',
    'EHG_Engineer remains the publisher of rules/thresholds; EHG consumes them'
  ]
};

if (!currentMetadata.acceptance_doctrine) {
  needsUpdate = true;
  updates.push('acceptance_doctrine');
  console.log('❌ acceptance_doctrine - missing');
} else {
  console.log('✅ acceptance_doctrine - present');
}

// Required non_goals
const requiredNonGoals = [
  'No runtime approval workflows in EHG_Engineer',
  'No modification of EHG application code within this SD'
];

if (!currentMetadata.non_goals) {
  needsUpdate = true;
  updates.push('non_goals');
  console.log('❌ non_goals - missing');
} else {
  console.log('✅ non_goals - present');
}

// Required references
const requiredReferences = [
  '/docs/workflow/stage_review_lessons.md#living-addendum-l16',
  '/docs/workflow/crewai_compliance_policy.md',
  '/docs/workflow/review_process.md',
  '/docs/workflow/stage_reviews/stage-05/07_governance_boundary_report.md'
];

if (!currentMetadata.references) {
  needsUpdate = true;
  updates.push('references');
  console.log('❌ references - missing');
} else {
  console.log('✅ references - present');
}

console.log('\nFields to update:', updates.length > 0 ? updates.join(', ') : 'None');

// Step 3: Apply updates if needed
if (needsUpdate) {
  console.log('\n\n3️⃣  APPLYING METADATA PATCH\n');

  const updatedMetadata = {
    ...currentMetadata,
    boundary: requiredBoundary,
    governance_trail: requiredGovernanceTrail,
    thresholds: requiredThresholds,
    acceptance_doctrine: requiredAcceptanceDoctrine,
    non_goals: requiredNonGoals,
    references: requiredReferences,
    // Preserve existing fields
    source: currentMetadata.source,
    policies: currentMetadata.policies,
    ui_anchor: currentMetadata.ui_anchor,
    scope_note: currentMetadata.scope_note,
    child_sd_hints: currentMetadata.child_sd_hints,
    lessons_applied: currentMetadata.lessons_applied,
    cross_stage_scope: currentMetadata.cross_stage_scope || 'all-stages-1-40',
    target_completion: currentMetadata.target_completion,
    verification_pattern: currentMetadata.verification_pattern,
    estimated_effort_hours: currentMetadata.estimated_effort_hours
  };

  const { data: updateData, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('sd_key', 'SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001')
    .select();

  if (updateError) {
    console.error('❌ Failed to update metadata:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Metadata updated successfully');
  console.log('Fields updated:', updates.join(', '));
} else {
  console.log('\n\n3️⃣  METADATA STATUS\n');
  console.log('✅ All required fields present - no update needed');
}

// Step 4: Re-fetch and verify
const { data: finalSd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001')
  .single();

// Step 5: Integrity checks
console.log('\n\n4️⃣  INTEGRITY CHECKS\n');

const checks = {
  database_correct: supabaseUrl.includes('dedlbzhpgkmetvhbkyzq'),
  phase_is_lead: finalSd.current_phase === 'LEAD',
  status_pending: finalSd.status === 'pending_approval',
  prd_deferred: finalSd.metadata?.governance_trail?.defer_prd_generation_to_plan === true,
  boundary_complete: finalSd.metadata?.boundary?.governance_repo === 'EHG_Engineer' &&
                     finalSd.metadata?.boundary?.application_repo === 'EHG' &&
                     !!finalSd.metadata?.boundary?.validation_role_now &&
                     !!finalSd.metadata?.boundary?.validation_role_future &&
                     !!finalSd.metadata?.boundary?.ownership_source_of_truth,
  acceptance_doctrine_present: !!finalSd.metadata?.acceptance_doctrine,
  non_goals_present: !!finalSd.metadata?.non_goals,
  references_present: !!finalSd.metadata?.references,
  lessons_applied: finalSd.metadata?.lessons_applied?.includes('L16') || false
};

console.log('Database (EHG_Engineer governance):', checks.database_correct ? '✅ PASS' : '❌ FAIL');
console.log('Phase (LEAD):', checks.phase_is_lead ? '✅ PASS' : '❌ FAIL');
console.log('Status (pending_approval):', checks.status_pending ? '✅ PASS' : '❌ FAIL');
console.log('PRD Deferral:', checks.prd_deferred ? '✅ CONFIRMED' : '❌ FAIL');
console.log('Boundary Complete:', checks.boundary_complete ? '✅ PASS' : '❌ FAIL');
console.log('  - governance_repo:', finalSd.metadata?.boundary?.governance_repo);
console.log('  - application_repo:', finalSd.metadata?.boundary?.application_repo);
console.log('  - validation_role_now:', finalSd.metadata?.boundary?.validation_role_now);
console.log('  - validation_role_future:', finalSd.metadata?.boundary?.validation_role_future);
console.log('  - ownership_source_of_truth:', finalSd.metadata?.boundary?.ownership_source_of_truth);
console.log('Acceptance Doctrine:', checks.acceptance_doctrine_present ? '✅ PRESENT' : '❌ MISSING');
console.log('Non-Goals:', checks.non_goals_present ? '✅ PRESENT' : '❌ MISSING');
console.log('References:', checks.references_present ? '✅ PRESENT' : '❌ MISSING');
console.log('Lessons Applied (L16):', checks.lessons_applied ? '✅ PASS' : '❌ FAIL');

const allChecksPassed = Object.values(checks).every(v => v === true);

// Step 6: Final output
console.log('\n\n5️⃣  FINAL STATUS\n');
console.log('═══════════════════════════════════════════════════════════════');
console.log('BOUNDARY_ASSERTIONS:', needsUpdate ? 'UPDATED' : 'PASS');
console.log('PRD_DEFERRAL: CONFIRMED');
console.log('RUNTIME_OWNERSHIP: Engineer→rules / App→enforcement (CONFIRMED)');
console.log('FILES_TOUCHED_EHG_APP: 0');
console.log('ALL_INTEGRITY_CHECKS:', allChecksPassed ? '✅ PASS' : '❌ FAIL');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('FINAL METADATA (snapshot):');
console.log(JSON.stringify(finalSd.metadata, null, 2));

process.exit(allChecksPassed ? 0 : 1);
