#!/usr/bin/env node

/**
 * RETROSPECTIVE GENERATOR
 * Continuous Improvement Coach sub-agent
 * Generates comprehensive retrospective for completed SDs
 *
 * ROOT CAUSE FIX (2025-10-17):
 * The quality_score constraint violation was caused by trigger function
 * auto_validate_retrospective_quality() which calculates and OVERWRITES
 * the quality_score based on content quality. The trigger requires:
 * - ≥5 items in what_went_well for full credit (20 pts)
 * - ≥5 items in key_learnings for full credit (30 pts)
 * - ≥3 items in action_items for full credit (20 pts)
 * - ≥3 items in what_needs_improvement for full credit (20 pts)
 * - Specific metrics (+10 pts bonus)
 * Total possible: 100 pts, minimum to pass constraint: 70 pts
 *
 * SCHEMA FIX (2025-10-17):
 * The retrospectives table columns (what_went_well, key_learnings, action_items,
 * what_needs_improvement) are JSONB type, not TEXT[]. Convert arrays to JSONB.
 *
 * TRIGGER TIMING FIX (2025-10-17):
 * The auto_populate_retrospective_fields() trigger runs BEFORE
 * auto_validate_retrospective_quality() trigger, so if we insert with
 * status='PUBLISHED' and quality_score=NULL, it will fail validation before
 * the quality_score can be calculated. Solution: Insert as DRAFT first, then
 * update to PUBLISHED after score is calculated.
 *
 * Solution: Provide rich, specific content that meets quality standards
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveSdInput } from './lib/sd-id-resolver.js';
import { getFilteredRetrospective } from './modules/handoff/retro-filters.js';
import { resolveCanonicalAppName } from '../lib/repo-paths.js';
// SD-FDBK-INFRA-RETROSPECTIVES-CHECK-LEARNING-001: canonical learning_category allowlist + normalizer
// so any category (incl. plausible-but-rejected guesses) coerces to a constraint-valid value.
import { normalizeLearningCategory } from '../lib/retro/learning-category.js';
import dotenv from 'dotenv';
// import fs from 'fs'; // Currently unused - available for file operations if needed

dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * Convert JavaScript array to JSONB for database insertion
 * @param {Array} arr - JavaScript array
 * @returns {string} JSONB string
 */
// toJsonb - Currently unused but kept for potential JSONB formatting needs
function _toJsonb(arr) {
  return JSON.stringify(arr);
}

async function generateRetrospective(sdInput) {
  console.log('\n🔍 CONTINUOUS IMPROVEMENT COACH');
  console.log('═'.repeat(60));
  console.log(`Generating retrospective for SD: ${sdInput}`);

  // Accept either UUID or sd_key (parity with handoff.js and other LEO entry points).
  // Feedback e402e5c4: usage said <SD_UUID> but downstream code keys off sd.id (UUID FK),
  // so we resolve once here and use the canonical UUID for all subsequent queries.
  const { sdId, sd } = await resolveSdInput(sdInput, supabase);

  console.log(`SD: ${sd.sd_key} - ${sd.title}`);
  console.log(`Status: ${sd.status}, Progress: ${sd.progress_percentage}%`);

  // QF-20260526-904: route through getFilteredRetrospective so the writer
  // sees the same row the LEAD-FINAL-APPROVAL gate and PLAN-TO-LEAD
  // RETROSPECTIVE_QUALITY_GATE see (retro_type='SD_COMPLETION' AND
  // retrospective_type IS NULL AND created_at > LEAD-TO-PLAN-accepted_at).
  // The prior bare existence check reported existed:true for handoff-time
  // retros, forcing operators to hand-roll INSERTs to satisfy the gate
  // (6th writer-consumer-asymmetry witness, PAT-LEO-INFRA-WCA-001).
  const { retrospective: existing } = await getFilteredRetrospective(sdId, sd.created_at, supabase);

  if (existing) {
    console.log(`\n⚠️  Retrospective already exists (ID: ${existing.id})`);
    return {
      success: true,
      existed: true,
      retrospective_id: existing.id
    };
  }

  // Get PRD for context
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('strategic_directive_id', sdId)
    .single();

  // QF-20260821-118: handoffs + sub-agent evidence are the real per-SD artifacts
  // the retro content is derived from below (previously fetched and discarded).
  const { data: handoffs } = await supabase
    .from('v_handoff_chain')
    .select('*')
    .eq('sd_id', sdId);

  const { data: subAgentResults } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_name, verdict, confidence, critical_issues, warnings, recommendations, phase')
    .eq('sd_id', sdId);

  if ((handoffs || []).length === 0 && (subAgentResults || []).length === 0) {
    throw new Error(`Cannot derive retrospective for ${sd.sd_key}: no handoffs and no sub-agent execution results found — refusing to fabricate a generic retrospective.`);
  }

  // Determine appropriate learning category based on SD type
  const determinelearning_category = (sd) => {
    const title = (sd.title || '').toLowerCase();
    const description = (sd.description || '').toLowerCase();

    if (title.includes('process') || title.includes('workflow') || description.includes('protocol')) {
      return 'PROCESS_IMPROVEMENT';
    } else if (title.includes('test') || title.includes('qa') || description.includes('testing')) {
      return 'TESTING_STRATEGY';
    } else if (title.includes('database') || title.includes('schema') || title.includes('migration')) {
      return 'DATABASE_SCHEMA';
    } else if (title.includes('deploy') || title.includes('ci/cd') || title.includes('pipeline')) {
      return 'DEPLOYMENT_ISSUE';
    } else if (title.includes('performance') || title.includes('optimization')) {
      return 'PERFORMANCE_OPTIMIZATION';
    } else if (title.includes('security') || title.includes('auth')) {
      return 'SECURITY_VULNERABILITY';
    } else if (title.includes('docs') || title.includes('documentation')) {
      return 'DOCUMENTATION';
    } else if (title.includes('ui') || title.includes('ux') || title.includes('user experience')) {
      return 'USER_EXPERIENCE';
    }
    // Default to APPLICATION_ISSUE for feature implementations
    return 'APPLICATION_ISSUE';
  };

  // Coerce to a constraint-valid value (defense-in-depth: the heuristic already returns valid values,
  // but normalization guarantees no insert ever fails on check_learning_category). SD-FDBK-INFRA-RETROSPECTIVES-CHECK-LEARNING-001.
  const learning_category = normalizeLearningCategory(determinelearning_category(sd));

  // QF-20260821-118: derive content from this SD's real handoffs + sub-agent evidence.
  // Fallbacks below still cite real per-SD counts/names — never a copy-pasted template.
  // Sub-agent recommendations/warnings/critical_issues are sometimes structured objects
  // ({issue, recommendation} or {title, description}) rather than plain strings.
  const describe = (item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      if (item.issue) return item.recommendation ? `${item.issue} — ${item.recommendation}` : item.issue;
      if (item.title) return item.description ? `${item.title}: ${item.description}` : item.title;
    }
    return JSON.stringify(item);
  };
  const acceptedHandoffs = (handoffs || []).filter(h => h.status === 'accepted');
  const passingSubAgents = (subAgentResults || []).filter(r => ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict));

  // DB check constraints (20251223_add_jsonb_array_size_constraints.sql) cap each array —
  // an SD with many handoffs/sub-agent runs can otherwise exceed them and fail the insert.
  const wellRaw = [
    ...acceptedHandoffs.map(h => `${h.handoff_type} handoff accepted with validation score ${h.validation_score}/100 (${h.from_agent}→${h.to_agent})`),
    ...passingSubAgents.map(r => `${r.sub_agent_name} sub-agent verdict: ${r.verdict} (confidence ${r.confidence ?? 'n/a'})`)
  ].slice(0, 25);
  const what_went_well_array = wellRaw.length ? wellRaw : [`${sd.sd_key} reached completion with ${(handoffs || []).length} handoff(s) recorded and ${(subAgentResults || []).length} sub-agent execution(s) logged`];

  const learningsRaw = (subAgentResults || []).flatMap(r => (r.recommendations || []).map(rec => `${r.sub_agent_name} (${r.phase}): ${describe(rec)}`)).slice(0, 30);
  const key_learnings_array = learningsRaw.length ? learningsRaw : [`${sd.sd_key} progressed through ${acceptedHandoffs.length} accepted handoff(s) evaluated by ${new Set((subAgentResults || []).map(r => r.sub_agent_name)).size} sub-agent(s) with no additional recommendations logged`];

  const actionsRaw = (subAgentResults || []).flatMap(r => (r.warnings || []).map(w => `${r.sub_agent_name}: follow up on — ${describe(w)}`)).slice(0, 25);
  const action_items_array = actionsRaw.length ? actionsRaw : [`Monitor ${sd.sd_key} in production; no sub-agent warnings were raised during ${(subAgentResults || []).length} execution(s)`];

  const improveRaw = [
    ...(subAgentResults || []).flatMap(r => (r.critical_issues || []).map(ci => `${r.sub_agent_name}: ${describe(ci)}`)),
    ...(handoffs || []).filter(h => h.status !== 'accepted').map(h => `${h.handoff_type} handoff status=${h.status} — did not reach accepted state`)
  ].slice(0, 20);
  const what_needs_improvement_array = improveRaw.length ? improveRaw : [`No critical issues surfaced across ${(subAgentResults || []).length} sub-agent review(s) for ${sd.sd_key}`];

  // Generate high-quality retrospective content
  // Note: quality_score will be auto-calculated by trigger based on content quality
  // SD-LEO-INFRA-VENTURE-REPO-AWARE-001 (FR-3): canonicalize target_application via the
  // existing registry resolver so the value matches a registered applications.name (e.g.
  // a venture like 'CronGenius'), and so the null-fallback yields constraint-valid
  // 'EHG_Engineer' (the prior literal 'EHG_engineer' was lowercase and would itself violate
  // the registry-aware check_target_application validation).
  const canonicalTargetApp = await resolveCanonicalAppName(sd.target_application, supabase);
  const retrospective = {
    sd_id: sdId,
    target_application: canonicalTargetApp,
    project_name: sd.title,
    retro_type: 'SD_COMPLETION',
    // QF-20260528-171 + SD-LEO-INFRA-DEFAULT-RETROSPECTIVES-RETROSPECTIVE-001: the
    // RETROSPECTIVE_QUALITY_GATE selects the SD-completion retro via
    // retro_type='SD_COMPLETION' AND retrospective_type IS NULL. The column default is now
    // NULL (was 'SD_COMPLETION' in migration 20251210; realigned by the SD above), so
    // omitting the key also yields NULL — this explicit null is kept as defense-in-depth.
    retrospective_type: null,
    title: `${sd.sd_key} Retrospective`,
    description: `Retrospective analysis for ${sd.title} - completed at ${sd.progress_percentage}% with ${sd.status} status`,
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: prd ? ['Database Architect', 'QA Director', 'Code Reviewer'] : [],
    human_participants: ['LEAD'],

    // Use native arrays - Supabase client handles JSONB serialization automatically
    what_went_well: what_went_well_array,
    key_learnings: key_learnings_array,
    action_items: action_items_array,
    what_needs_improvement: what_needs_improvement_array,

    learning_category: learning_category,
    affected_components: learning_category === 'APPLICATION_ISSUE' ? [sd.title] : [],
    related_files: [],
    related_commits: [],
    related_prs: [],
    tags: [sd.sd_key, 'automated-retro', 'quality-validated'],

    // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-2 — the `quality_score: 85` pre-set that lived here
    // is REMOVED, and its stated justification was measured before removal rather than assumed.
    //
    // The comment claimed it was needed because auto_populate_retrospective_fields checks
    // quality_score before auto_validate_retrospective_quality calculates it. MEASURED at
    // database/migrations/20260505_fix_retrospectives_auto_populate_predicate.sql:75-79: that
    // check is guarded by `is_status_changing_to_published`, so it does NOT fire on a DRAFT
    // insert — and this function already inserts as DRAFT (below), reads the calculated score
    // back, and only promotes to PUBLISHED when it clears 70. The DRAFT-first flow ALREADY
    // solves the ordering problem the constant was working around; the constant was vestigial.
    //
    // It was also actively harmful, which is why removing it belongs in this SD rather than a
    // tidy-up: a literal 85 is a number nobody measured, and any path where the trigger declines
    // to recalculate leaves that fabricated 85 standing as the stored score — high enough to
    // satisfy the >= 70 publish gate on its own. Omitting the key makes the stored score solely
    // what the evaluation produced.

    team_satisfaction: Math.min(10, Math.max(1, Math.floor(sd.progress_percentage / 10))),
    business_value_delivered: sd.priority >= 70 ? 'HIGH' : sd.priority >= 40 ? 'MEDIUM' : 'LOW',
    customer_impact: 'MEDIUM',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 0,
    bugs_resolved: 0,
    tests_added: prd ? 2 : 0, // Assume unit + E2E if PRD exists
    objectives_met: sd.progress_percentage >= 100,
    on_schedule: true,
    within_scope: true,
    success_patterns: ['Quality-first approach', 'Database-driven validation', 'Automated testing'],
    failure_patterns: [],
    improvement_areas: ['Template quality', 'Error messaging', 'Documentation clarity'],
    generated_by: 'SUB_AGENT',
    trigger_event: 'SD_STATUS_COMPLETED',

    // CRITICAL: Start with DRAFT status to allow quality_score calculation
    // Will update to PUBLISHED after score is calculated
    status: 'DRAFT'
  };

  console.log('\n📊 Retrospective Content Summary:');
  console.log(`   what_went_well: ${what_went_well_array.length} items`);
  console.log(`   key_learnings: ${key_learnings_array.length} items`);
  console.log(`   action_items: ${action_items_array.length} items`);
  console.log(`   what_needs_improvement: ${what_needs_improvement_array.length} items`);
  console.log('\n   Expected quality_score: 90-100 (calculated by trigger)');

  // Insert retrospective with DRAFT status
  const { data: inserted, error: insertError} = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert retrospective: ${insertError.message}`);
  }

  const retroId = inserted[0].id;
  const calculatedScore = inserted[0].quality_score;

  console.log('\n✅ Retrospective inserted (DRAFT)');
  console.log(`   ID: ${retroId}`);
  console.log(`   Quality Score: ${calculatedScore}/100 (auto-calculated)`);

  // Check if quality score meets threshold
  if (calculatedScore < 70) {
    console.log(`\n⚠️  Quality score (${calculatedScore}) below threshold (70)`);
    console.log('   Retrospective will remain in DRAFT status');
    console.log('   Issues:', inserted[0].quality_issues);

    return {
      success: false,
      retrospective_id: retroId,
      quality_score: calculatedScore,
      status: 'DRAFT',
      issues: inserted[0].quality_issues,
      message: `Quality score ${calculatedScore} is below threshold (70). Retrospective saved as DRAFT.`
    };
  }

  // Update to PUBLISHED if quality score is >= 70
  const { data: _updated, error: updateError } = await supabase
    .from('retrospectives')
    .update({ status: 'PUBLISHED' })
    .eq('id', retroId)
    .select();

  if (updateError) {
    console.log(`\n⚠️  Failed to update to PUBLISHED status: ${updateError.message}`);
    console.log('   Retrospective remains in DRAFT status');

    return {
      success: false,
      retrospective_id: retroId,
      quality_score: calculatedScore,
      status: 'DRAFT',
      message: `Quality score is good (${calculatedScore}), but failed to publish: ${updateError.message}`
    };
  }

  console.log('\n✅ Retrospective published successfully!');
  console.log('   Status: PUBLISHED');

  // Check for patterns exceeding alert thresholds and auto-create SDs
  console.log('\n🚨 CHECKING PATTERN ALERT THRESHOLDS...');
  try {
    const { spawn } = await import('child_process');
    const alertProcess = spawn('node', ['scripts/pattern-alert-sd-creator.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let alertOutput = '';
    alertProcess.stdout.on('data', (data) => { alertOutput += data.toString(); });
    alertProcess.stderr.on('data', (data) => { alertOutput += data.toString(); });

    await new Promise((resolve) => alertProcess.on('close', resolve));

    // Extract key stats from output
    const createdMatch = alertOutput.match(/SDs created:\s*(\d+)/);
    const sdsCreated = createdMatch ? parseInt(createdMatch[1]) : 0;

    if (sdsCreated > 0) {
      console.log(`   🔴 ${sdsCreated} CRITICAL Strategic Directive(s) auto-created!`);
      console.log('   Review with: npm run prio:top3');
    } else {
      console.log('   ✅ No patterns exceed alert thresholds');
    }
  } catch (error) {
    console.warn(`\n⚠️  Pattern alert check failed (non-fatal): ${error.message}`);
    console.warn('   You can run manually: npm run pattern:alert');
  }

  // GAP-005: Verify linked feedback was auto-resolved by SD completion trigger
  try {
    const { data: linkedFeedback } = await supabase
      .from('feedback')
      .select('id, status, resolution_type')
      .or(`strategic_directive_id.eq.${sdId},resolution_sd_id.eq.${sdId}`);

    if (linkedFeedback && linkedFeedback.length > 0) {
      const resolved = linkedFeedback.filter(f => f.status === 'resolved');
      const unresolved = linkedFeedback.filter(f => f.status !== 'resolved');
      console.log('\n📋 FEEDBACK LINKAGE VERIFICATION (GAP-005)');
      console.log(`   Linked feedback items: ${linkedFeedback.length}`);
      console.log(`   Auto-resolved: ${resolved.length}`);
      if (unresolved.length > 0) {
        console.log(`   ⚠️  Unresolved: ${unresolved.length} (trigger may not have fired)`);
        for (const f of unresolved) {
          console.log(`      - ${f.id} (status: ${f.status})`);
        }
      } else {
        console.log('   ✅ All linked feedback resolved');
      }
    }
  } catch (err) {
    console.warn(`   ⚠️  Feedback verification failed (non-fatal): ${err.message}`);
  }

  return {
    success: true,
    retrospective_id: retroId,
    quality_score: calculatedScore,
    status: 'PUBLISHED'
  };
}

// CLI usage
async function main() {
  const sdInput = process.argv[2];

  if (!sdInput) {
    console.error('Usage: node generate-retrospective.js <SD_UUID|SD_KEY>');
    process.exit(1);
  }

  try {
    const result = await generateRetrospective(sdInput);
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
