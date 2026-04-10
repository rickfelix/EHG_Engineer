#!/usr/bin/env node

/**
 * LEO Create SD - Helper script for /leo create command
 *
 * Handles flag-based SD creation from various sources:
 * - --from-uat <test-id>: Create from UAT finding
 * - --from-learn <pattern-id>: Create from /learn pattern
 * - --from-feedback <id>: Create from /inbox feedback item
 * - --child <parent-key> <index>: Create child SD
 * - --vision-key <key>: Link to EVA vision document
 * - --arch-key <key>: Link to EVA architecture plan
 *
 * Part of SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 */

import { randomUUID } from 'crypto';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import {
  generateSDKey,
  generateChildKey,
  SD_SOURCES,
  SD_TYPES,
  normalizeVenturePrefix
} from './modules/sd-key-generator.js';
import { VentureContextManager } from '../lib/eva/venture-context-manager.js';
import { getCurrentVenture, getVentureConfig } from '../lib/venture-resolver.js';
import {
  checkGate,
  getArtifacts,
  getStatus as getPhase0Status
} from './modules/phase-0/leo-integration.js';
import { routeWorkItem } from '../lib/utils/work-item-router.js';
import { scanMetadataForMisplacedDependencies } from './modules/sd-next/dependency-resolver.js';
import {
  parsePlanFile,
  formatFilesAsScope,
  formatStepsAsCriteria
} from './modules/plan-parser.js';
import {
  findMostRecentPlan,
  archivePlanFile,
  readPlanFile,
  getDisplayPath
} from './modules/plan-archiver.js';
import { runTriageGate } from './modules/triage-gate.js';
import { evaluateVisionReadiness, formatRubricResult } from './modules/vision-readiness-rubric.js';
import { scoreSD } from './eva/vision-scorer.js';
import { trackWriteSource } from '../lib/eva/cli-write-gate.js';
import { validateSDFields } from './modules/validate-sd-fields.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const supabase = createSupabaseServiceClient();

// ============================================================================
// Venture Context Resolution (SD-LEO-INFRA-SD-NAMESPACING-001)
// ============================================================================

/**
 * Resolve venture prefix from CLI flag, env var, or active session.
 * Precedence: --venture CLI flag > VENTURE env var > session context
 *
 * @param {string|null} cliVenture - Venture name from --venture flag
 * @returns {Promise<string|null>} Normalized venture prefix or null
 */
// Quick-fix QF-20260312-516: Extract SD fields from registered vision/arch documents
async function enrichFromVisionArch(visionKey, archKey, sb) {
  if (!visionKey && !archKey) return null;
  const result = {};
  try {
    if (visionKey) {
      const { data: vision } = await sb
        .from('eva_vision_documents')
        .select('sections')
        .eq('vision_key', visionKey)
        .single();
      if (vision?.sections) {
        const s = vision.sections;
        if (s.executive_summary) result.description = s.executive_summary;
        if (s.problem_statement) result.rationale = s.problem_statement;
        if (s.success_criteria) {
          result.success_criteria = (Array.isArray(s.success_criteria)
            ? s.success_criteria
            : s.success_criteria.split(/\n/).filter(l => l.trim())
          ).map(c => typeof c === 'string' ? { criterion: c.replace(/^[-•*]\s*/, ''), target: 'See vision doc' } : c);
        }
      }
    }
    if (archKey) {
      const { data: arch } = await sb
        .from('eva_architecture_plans')
        .select('sections')
        .eq('plan_key', archKey)
        .single();
      if (arch?.sections) {
        const s = arch.sections;
        if (s.route_component_structure || s.route_and_component_structure) {
          const routes = s.route_component_structure || s.route_and_component_structure;
          result.key_changes = (Array.isArray(routes)
            ? routes
            : (typeof routes === 'string' ? routes.split(/\n/).filter(l => l.trim()) : [])
          ).map(c => typeof c === 'string' ? { file: '', change: c.replace(/^[-•*]\s*/, '') } : c);
        }
        if (s.implementation_phases) {
          result.scope = Array.isArray(s.implementation_phases)
            ? s.implementation_phases.map(p => p.title || p).join('; ')
            : String(s.implementation_phases);
        }
      }
    }
  } catch (err) {
    console.warn(`[enrichFromVisionArch] Non-fatal: ${err.message}`);
  }
  return Object.keys(result).length > 0 ? result : null;
}

async function resolveVenturePrefix(cliVenture = null) {
  // 1. CLI flag (highest priority)
  if (cliVenture) {
    const prefix = normalizeVenturePrefix(cliVenture);
    if (prefix) {
      console.log(`   🏢 Venture context: ${cliVenture} (from --venture flag)`);
      return prefix;
    }
  }

  // 2. Environment variable
  const envVenture = process.env.VENTURE;
  if (envVenture) {
    const prefix = normalizeVenturePrefix(envVenture);
    if (prefix) {
      console.log(`   🏢 Venture context: ${envVenture} (from VENTURE env var)`);
      return prefix;
    }
  }

  // 3. Active session context
  try {
    const vcm = new VentureContextManager({ supabaseClient: supabase });
    const venture = await vcm.getActiveVenture();
    if (venture) {
      const prefix = normalizeVenturePrefix(venture.name);
      if (prefix) {
        console.log(`   🏢 Venture context: ${venture.name} (from session)`);
        return prefix;
      }
    }
  } catch {
    // Non-fatal - proceed without venture prefix
  }

  return null;
}

// ============================================================================
// Source Handlers
// ============================================================================

/**
 * Create SD from UAT finding
 */
async function createFromUAT(testId) {
  console.log(`\n📋 Creating SD from UAT finding: ${testId}`);

  // Fetch UAT test result
  const { data: uatResult, error } = await supabase
    .from('uat_test_results')
    .select('*')
    .eq('id', testId)
    .single();

  if (error || !uatResult) {
    console.error('UAT result not found:', testId);
    process.exit(1);
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
  const venturePrefix = await resolveVenturePrefix();

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
      uat_status: uatResult.status
    }
  });

  return sd;
}

/**
 * Create SD from /learn pattern
 */
async function createFromLearn(patternId) {
  console.log(`\n📋 Creating SD from /learn pattern: ${patternId}`);

  // Fetch pattern from retrospectives or learning table
  const { data: pattern, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', patternId)
    .single();

  if (error || !pattern) {
    console.error('Pattern not found:', patternId);
    process.exit(1);
  }

  // Determine type
  const type = pattern.lesson_type === 'bug' ? 'fix' : 'enhancement';

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix();

  // Generate key
  const sdKey = await generateSDKey({
    source: 'LEARN',
    type,
    title: pattern.key_lesson || pattern.title || 'Learning Pattern',
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: pattern.key_lesson || pattern.title,
    description: pattern.actionable_improvements?.join('\n') || pattern.description || 'Created from learning pattern',
    type,
    rationale: `Created from retrospective pattern ${patternId}`,
    metadata: {
      source: 'learn',
      source_id: patternId,
      lesson_type: pattern.lesson_type
    }
  });

  return sd;
}

/**
 * Create SD from /inbox feedback item
 */
async function createFromFeedback(feedbackId) {
  console.log(`\n📋 Creating SD from feedback: ${feedbackId}`);

  // Fetch feedback item (support full or partial UUID)
  let feedback;
  // Try exact match first (full UUID)
  const { data: exactMatch } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .maybeSingle();

  if (exactMatch) {
    feedback = exactMatch;
  } else {
    // Partial UUID: validate format then use text cast via RPC
    if (!/^[0-9a-f-]+$/i.test(feedbackId)) {
      console.error('Invalid feedback ID format (must be UUID hex characters):', feedbackId);
      process.exit(1);
    }
    const { data: partialResult } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM feedback WHERE id::text LIKE '${feedbackId}%' LIMIT 1` });
    const partialId = partialResult?.[0]?.result?.[0]?.id;
    if (partialId) {
      const { data } = await supabase.from('feedback').select('*').eq('id', partialId).single();
      feedback = data;
    }
  }

  if (!feedback) {
    console.error('Feedback not found:', feedbackId);
    process.exit(1);
  }

  // GAP-008: Check if feedback already has a linked SD (duplicate guard)
  if (feedback.strategic_directive_id || feedback.resolution_sd_id) {
    const linkedId = feedback.strategic_directive_id || feedback.resolution_sd_id;
    console.log(`\n⚠️  Feedback already linked to SD: ${linkedId}`);
    console.log('   Skipping SD creation to prevent duplicates.\n');
    process.exit(0);
  }

  // Map feedback type to SD type
  const typeMap = { issue: 'fix', enhancement: 'enhancement', bug: 'bugfix' };
  const type = typeMap[feedback.type] || 'feature';

  // Triage Gate: soft recommendation for feedback-sourced items
  try {
    const triageResult = await runTriageGate({
      title: feedback.title,
      description: feedback.description || feedback.title,
      type,
      source: 'feedback'
    }, supabase);
    if (triageResult.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick Fix (Tier ${triageResult.tier}, ~${triageResult.estimatedLoc} LOC). Consider QF workflow for smaller scope.`);
    }
  } catch { /* non-fatal */ }

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix();

  // Generate key
  const sdKey = await generateSDKey({
    source: 'FEEDBACK',
    type,
    title: feedback.title,
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: feedback.title,
    description: feedback.description || feedback.title,
    type,
    priority: mapPriority(feedback.priority),
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}`,
    metadata: {
      source: 'feedback',
      source_id: feedback.id,
      feedback_type: feedback.type,
      feedback_priority: feedback.priority
    }
  });

  // GAP-001: Set strategic_directive_id FK on feedback (not just metadata)
  // GAP-009: Update feedback status to in_progress with proper linkage
  await supabase
    .from('feedback')
    .update({
      status: 'in_progress',
      strategic_directive_id: sd.id
    })
    .eq('id', feedback.id);

  return sd;
}

/**
 * Create child SD
 * @param {string} parentKey - Parent SD key or UUID
 * @param {number} index - Child index (A=0, B=1, etc.)
 * @param {Object} overrides - Optional overrides for child fields
 * @param {string} overrides.type - Child SD type (default: 'feature', never inherits 'orchestrator')
 * @param {string} overrides.title - Child title override
 */
async function createChild(parentKey, index = 0, overrides = {}) {
  console.log(`\n📋 Creating child SD for: ${parentKey}`);

  // Fetch parent SD
  const { data: parent, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`sd_key.eq.${parentKey},id.eq.${parentKey}`)
    .single();

  if (error || !parent) {
    console.error('Parent SD not found:', parentKey);
    process.exit(1);
  }

  // Count existing children to determine index
  const { data: existingChildren } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', parent.id);

  const childIndex = index || (existingChildren?.length || 0);

  // Generate child key
  const sdKey = generateChildKey(parent.sd_key || parentKey, childIndex);

  // Inherit strategic fields from parent (SD-LEO-FIX-METADATA-001)
  const inheritedFields = inheritStrategicFields(parent);

  // Resolve child type: explicit override > parent type (but NEVER inherit 'orchestrator')
  // Orchestrator is a coordination pattern, not a child work type.
  // Children are independent SDs with their own types (feature, infrastructure, etc.)
  let childType = overrides.type || parent.sd_type || 'feature';
  if (childType === 'orchestrator') {
    childType = 'feature';
    console.log('   ℹ️  Parent type \'orchestrator\' not inherited — child defaults to \'feature\'');
    console.log('      Use --type <type> to specify: infrastructure, feature, fix, etc.');
  }

  // Create child SD with inherited fields
  const childTitle = overrides.title || `Child of ${parent.title}`;
  const sd = await createSD({
    sdKey,
    title: childTitle,
    description: overrides.title
      ? `Child SD of ${parent.sd_key}: ${overrides.title}`
      : `Child SD of ${parent.sd_key}. Implement specific deliverable.`,
    type: childType,
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    // Pass inherited category to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
    category: inheritedFields.category || null,
    // Pass inherited fields to createSD (SD-LEO-FIX-METADATA-001)
    success_metrics: inheritedFields.success_metrics || null,
    strategic_objectives: inheritedFields.strategic_objectives || null,
    key_principles: inheritedFields.key_principles || null,
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex,
      inherited_from_parent: Object.keys(inheritedFields),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
    }
  });

  // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Assert parent claim before returning child
  // Verifies the creating session holds the parent SD claim
  try {
    const { claimGuard } = await import('../lib/claim-guard.mjs');
    const claimResult = await claimGuard(parent.sd_key, null, { autoFallback: true });
    if (!claimResult.success && !claimResult.fallback) {
      console.error(`[createChild] ⛔ Parent SD ${parent.sd_key} is claimed by another session — child creation blocked`);
      console.error(`   Owner: ${claimResult.owner?.session_id} (${claimResult.owner?.heartbeat_age_human})`);
      throw new Error(`Parent SD ${parent.sd_key} is claimed by another active session`);
    }
  } catch (e) {
    if (e.message?.includes('claimed by another')) throw e;
    // Fail-open: DB errors don't block child creation
    console.warn(`[createChild] ⚠️  Parent claim check failed (fail-open): ${e.message}`);
  }

  return sd;
}

/**
 * Create SD from Claude Code plan file
 *
 * When called without a path, auto-detects the most recent plan and shows
 * confirmation prompt. For automated/non-interactive use, pass explicit path.
 *
 * @param {string|null} planPath - Optional explicit path to plan file
 * @param {boolean} skipConfirmation - Skip confirmation for auto-detected plans (CLI flag: --yes)
 */
async function createFromPlan(planPath = null, skipConfirmation = false, overrides = {}) {
  console.log('\n📋 Creating SD from Claude Code plan file');

  // Step 1: Find plan file (auto-detect if no path provided)
  let targetPath = planPath;
  let originalPath = planPath;
  let wasAutoDetected = false;

  if (!targetPath) {
    console.log('   Auto-detecting most recent plan...');
    const recentPlan = await findMostRecentPlan();

    if (!recentPlan) {
      console.error('\n❌ No plan file found');
      console.error('   Expected location: ~/.claude/plans/');
      console.error('   Make sure you have an active plan in Claude Code plan mode.');
      process.exit(1);
    }

    targetPath = recentPlan.path;
    originalPath = recentPlan.path;
    wasAutoDetected = true;

    // Show what was found
    console.log(`\n   📄 Found plan: ${recentPlan.name}`);
    console.log(`   📍 Path: ${getDisplayPath(targetPath)}`);
    console.log(`   🕐 Modified: ${recentPlan.mtime.toLocaleString()}`);
  }

  // Step 2: Read and parse plan file
  const content = readPlanFile(targetPath);
  if (!content) {
    console.error(`\n❌ Failed to read plan file: ${targetPath}`);
    process.exit(1);
  }

  const parsed = parsePlanFile(content);

  // Apply overrides from --type and --title flags
  if (overrides.typeOverride) {
    console.log(`   Type override: ${overrides.typeOverride} (was: ${parsed.type})`);
    parsed.type = overrides.typeOverride;
  }
  if (overrides.titleOverride) {
    console.log(`   Title override: ${overrides.titleOverride} (was: ${parsed.title})`);
    parsed.title = overrides.titleOverride;
  }

  // Show parsed summary
  console.log('\n   ═══════════════════════════════════════════');
  console.log('   PLAN SUMMARY');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Title: ${parsed.title || '(untitled)'}`);
  console.log(`   Type${overrides.typeOverride ? '' : ' (inferred)'}: ${parsed.type}`);
  console.log(`   Goal: ${parsed.summary ? parsed.summary.substring(0, 80) + '...' : '(none found)'}`);
  console.log(`   Checklist items: ${parsed.steps.length}`);
  console.log(`   Files to modify: ${parsed.files.length}`);
  console.log(`   Key changes: ${parsed.keyChanges?.length || 0}`);
  console.log(`   Risks identified: ${parsed.risks?.length || 0}`);
  console.log('   ═══════════════════════════════════════════');

  // Step 3: Confirmation for auto-detected plans
  // NOTE: In CLI context, we output a message. Claude (the AI) should use
  // AskUserQuestion to confirm before running --from-plan without explicit path.
  if (wasAutoDetected && !skipConfirmation) {
    console.log('\n   ⚠️  AUTO-DETECTED PLAN');
    console.log('   This script found the most recent plan file automatically.');
    console.log('   If this is NOT the correct plan, re-run with explicit path:');
    console.log('   node scripts/leo-create-sd.js --from-plan <path-to-plan.md>');
    console.log('\n   To proceed without confirmation, add --yes flag:');
    console.log('   node scripts/leo-create-sd.js --from-plan --yes');
    console.log('\n   Proceeding with auto-detected plan...\n');
  }

  // Step 4: Validate we have enough content
  if (!parsed.title) {
    console.error('\n❌ Plan file must have a title (# Plan: Title or # Title)');
    console.error('   The parser looks for:');
    console.error('   - "# Plan: Your Title Here"');
    console.error('   - "# Your Title Here" (first H1 heading)');
    process.exit(1);
  }

  // Step 5: Generate SD key
  // Protocol files (CLAUDE_CORE.md, CLAUDE_LEAD.md) must be read before SD creation
  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix();

  const sdKey = await generateSDKey({
    source: 'LEO',
    type: parsed.type,
    title: parsed.title,
    venturePrefix
  });

  console.log(`   Generated SD Key: ${sdKey}`);

  // Step 6: Archive plan file
  const archiveResult = await archivePlanFile(targetPath, sdKey);
  if (!archiveResult.success) {
    console.warn(`   ⚠️  Could not archive plan: ${archiveResult.error}`);
  } else {
    console.log(`   Archived to: ${getDisplayPath(archiveResult.archivedPath)}`);
  }

  // Step 7: Build scope from files
  const scope = formatFilesAsScope(parsed.files) || parsed.summary || parsed.title;

  // Step 8: Build success criteria from steps
  const successCriteria = formatStepsAsCriteria(parsed.steps, 10);
  if (successCriteria.length === 0) {
    // Use default if no steps found
    successCriteria.push('All implementation items from plan are complete');
    successCriteria.push('Code passes lint and type checks');
    successCriteria.push('PR reviewed and approved');
  }

  // Step 9: Build key_changes from parsed data
  const keyChanges = (parsed.keyChanges || []).map(kc => ({
    change: kc.change,
    impact: kc.impact
  }));

  // Step 10: Build strategic_objectives from parsed data
  const strategicObjectives = (parsed.strategicObjectives || []).map(obj => ({
    objective: obj.objective,
    metric: obj.metric
  }));

  // Step 11: Build risks from parsed data
  const risks = (parsed.risks || []).map(r => ({
    risk: r.risk,
    severity: r.severity || 'medium',
    mitigation: r.mitigation || 'Address during implementation'
  }));

  // Step 12: Create SD with all extracted fields
  const sd = await createSD({
    sdKey,
    title: parsed.title,
    description: parsed.summary || parsed.title,
    type: parsed.type,
    rationale: 'Created from Claude Code plan file',
    success_criteria: successCriteria,
    strategic_objectives: strategicObjectives.length > 0 ? strategicObjectives : null,
    metadata: {
      source: 'plan',
      plan_content: parsed.fullContent,
      plan_file_path: archiveResult.archivedPath || null,
      original_plan_path: originalPath,
      files_to_modify: parsed.files,
      steps_count: parsed.steps.length,
      files_count: parsed.files.length,
      auto_detected: wasAutoDetected,
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
    }
  });

  // Step 13: Update additional fields that aren't in createSD signature
  const additionalUpdates = {};
  if (scope) additionalUpdates.scope = scope;
  if (keyChanges.length > 0) additionalUpdates.key_changes = keyChanges;
  if (risks.length > 0) additionalUpdates.risks = risks;

  if (Object.keys(additionalUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update(additionalUpdates)
      .eq('id', sd.id);

    if (updateError) {
      console.warn(`   ⚠️  Could not update additional fields: ${updateError.message}`);
    } else {
      console.log(`   ✅ Updated: scope, ${keyChanges.length > 0 ? 'key_changes, ' : ''}${risks.length > 0 ? 'risks' : ''}`);
    }
  }

  return sd;
}

// ============================================================================
// Vision Pre-Screen (SD-LEO-INFRA-VISION-SD-CONCEPTION-GATE-001)
// ============================================================================

/** Timeout for vision LLM call at SD conception (ms). */
export const VISION_PRESCREEN_TIMEOUT_MS = 15000;

/**
 * Score a newly-created SD against the EHG-2028 vision at conception time.
 *
 * Non-blocking: errors and timeouts emit a console warning and return null.
 * The score is persisted to eva_vision_scores so the LEAD-TO-PLAN gate can
 * read it without requiring a separate manual scoring run.
 *
 * @param {string} sdKey  - The sd_key of the just-created SD
 * @param {string} title  - SD title
 * @param {string} description - SD description
 * @param {Object} supabase   - Supabase client (passed to scoreSD to reuse connection)
 * @returns {Promise<Object|null>} scoreResult or null on failure
 */
export async function scoreSDAtConception(sdKey, title, description, supabase, { visionKey, archKey } = {}) {
  const ACTION_LABELS = {
    accept:         '✅ ACCEPT',
    minor_sd:       '🟡 MINOR GAP',
    gap_closure_sd: '🟠 GAP',
    escalate:       '🔴 ESCALATION',
  };

  try {
    const visionScope = `Title: ${title}\nDescription: ${description}`;
    const scorerOpts = { sdKey, scope: visionScope, dryRun: false, supabase };
    if (visionKey) scorerOpts.visionKey = visionKey;
    if (archKey) scorerOpts.archKey = archKey;
    let timeoutId;
    const scoreResult = await Promise.race([
      scoreSD(scorerOpts),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Vision scoring timeout (${VISION_PRESCREEN_TIMEOUT_MS / 1000}s)`)),
          VISION_PRESCREEN_TIMEOUT_MS
        );
        // Unref so this timer doesn't keep Node alive after main work completes
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    clearTimeout(timeoutId);

    const actionLabel = ACTION_LABELS[scoreResult.threshold_action]
      || scoreResult.threshold_action?.toUpperCase()
      || 'SCORED';
    console.log(`\n   🔍 Vision alignment: ${scoreResult.total_score}/100 — ${actionLabel}`);
    if (scoreResult.total_score < 50) {
      console.log('   ⚠️  Score below 50 (ESCALATION tier). Consider revising SD scope before LEAD phase.');
    }
    return scoreResult;
  } catch (err) {
    console.log(`\n   ⚠️  Vision pre-screen skipped: ${err.message}`);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Inherit strategic fields from parent SD
 * Part of SD-LEO-FIX-METADATA-001 fix
 *
 * @param {Object} parent - Parent SD data
 * @returns {Object} Inherited fields object
 */
function inheritStrategicFields(parent) {
  const inherited = {};

  // CRITICAL: Inherit category from parent to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // This prevents the sd_type/category mismatch that causes progress calculation issues
  if (parent.category) {
    inherited.category = parent.category;
  }

  // Inherit strategic_objectives if parent has them
  if (parent.strategic_objectives && Array.isArray(parent.strategic_objectives) && parent.strategic_objectives.length > 0) {
    inherited.strategic_objectives = parent.strategic_objectives;
  }

  // DO NOT inherit success_metrics from parent
  // Reason: Each child SD has unique deliverables and should have its own success metrics
  // Parent metrics like "all children complete" don't apply to individual children
  // Child success_metrics will be generated by buildDefaultSuccessMetrics() based on child's title/type

  // Inherit key_principles if parent has them
  if (parent.key_principles && Array.isArray(parent.key_principles) && parent.key_principles.length > 0) {
    inherited.key_principles = parent.key_principles;
  }

  return inherited;
}

/**
 * Map feedback priority to SD priority
 */
function mapPriority(feedbackPriority) {
  const map = {
    P0: 'critical',
    P1: 'high',
    P2: 'medium',
    P3: 'low'
  };
  return map[feedbackPriority] || 'medium';
}

/**
 * Map user-friendly type to valid database sd_type
 * Valid sd_types: bugfix, database, docs, documentation, feature, infrastructure,
 * orchestrator, qa, refactor, security, implementation, strategic_observation,
 * architectural_review, discovery_spike, ux_debt, product_decision
 */
// PAT-SDCREATE-001: Valid SD types that exist in all registration points
// Keep in sync with: sd-type-validation.js VALID_SD_TYPES, type-classifier.js SD_TYPE_PROFILES
const VALID_DB_SD_TYPES = [
  'feature', 'infrastructure', 'bugfix', 'database', 'security',
  'refactor', 'documentation', 'docs', 'orchestrator', 'performance',
  'enhancement', 'uat', 'library', 'fix', 'implementation', 'qa'
];

function mapToDbType(userType) {
  const map = {
    // User-friendly -> Database type
    fix: 'bugfix',
    bugfix: 'bugfix',
    feature: 'feature',
    feat: 'feature',
    infrastructure: 'infrastructure',
    infra: 'infrastructure',
    refactor: 'refactor',
    documentation: 'documentation',
    doc: 'documentation',
    docs: 'docs',
    database: 'database',
    db: 'database',
    security: 'security',
    orchestrator: 'orchestrator',
    orch: 'orchestrator',
    qa: 'qa',
    testing: 'qa',
    implementation: 'implementation',
    enhancement: 'feature'  // Map enhancement to feature
  };
  const mapped = map[userType?.toLowerCase()] || 'feature';

  // PAT-SDCREATE-001: Validate the mapped type exists in VALID_DB_SD_TYPES
  if (!VALID_DB_SD_TYPES.includes(mapped)) {
    console.warn(`⚠️  Mapped sd_type '${mapped}' not in VALID_DB_SD_TYPES list. Defaulting to 'feature'.`);
    return 'feature';
  }
  return mapped;
}

/**
 * Build default success_metrics based on SD type and title
 * Ensures validator requirements (3+ items with {metric, target}) are met
 */
function buildDefaultSuccessMetrics(type, _title) {
  const baseMetrics = [
    {
      metric: 'Implementation completeness',
      target: '100% of scope items implemented'
    },
    {
      metric: 'Test coverage',
      target: '≥80% code coverage for new code'
    },
    {
      metric: 'Zero regressions',
      target: '0 existing tests broken'
    }
  ];

  // Add type-specific metrics
  if (type === 'fix' || type === 'bugfix') {
    baseMetrics.push({
      metric: 'Issue recurrence',
      target: '0 recurrences after fix deployed'
    });
  } else if (type === 'feature' || type === 'feat') {
    baseMetrics.push({
      metric: 'User story completion',
      target: '100% acceptance criteria met'
    });
  }

  return baseMetrics;
}

/**
 * Build default strategic_objectives based on SD type and title
 * Ensures SD objectives validator requirement (≥2 objectives) is met
 * PAT-SDCREATE-001: Prevents LEAD-TO-PLAN gate failure for empty objectives
 */
function buildDefaultStrategicObjectives(type, title) {
  const baseObjectives = [
    `Implement ${title} as specified in the SD scope`,
    'Maintain backward compatibility with existing functionality'
  ];

  if (type === 'feature' || type === 'feat') {
    baseObjectives.push('Deliver user-facing value with clear acceptance criteria');
    baseObjectives.push('Ensure comprehensive test coverage for new functionality');
  } else if (type === 'fix' || type === 'bugfix') {
    baseObjectives.push('Address root cause to prevent recurrence');
  } else if (type === 'refactor') {
    baseObjectives.push('Improve code quality without changing external behavior');
  } else if (type === 'security') {
    baseObjectives.push('Eliminate identified security vulnerabilities');
  }

  return baseObjectives;
}

/**
 * Build default key_changes based on SD type and title
 * Provides initial scope outline for LEAD review
 * PAT-SDCREATE-001: Prevents empty key_changes field
 */
function buildDefaultKeyChanges(type, title) {
  const changes = [
    `Implement core changes for: ${title}`
  ];

  if (type === 'feature' || type === 'feat') {
    changes.push('Add UI components or API endpoints as required');
    changes.push('Add tests for new functionality');
    changes.push('Update documentation for new feature');
  } else if (type === 'fix' || type === 'bugfix') {
    changes.push('Fix identified defect and add regression test');
    changes.push('Update related documentation if needed');
  } else if (type === 'infrastructure') {
    changes.push('Update infrastructure components');
    changes.push('Verify deployment and operational readiness');
  } else if (type === 'refactor') {
    changes.push('Restructure code while preserving behavior');
    changes.push('Add or update tests to verify no regressions');
  }

  return changes;
}

/**
 * Build default smoke_test_steps for feature SDs
 * Required by SMOKE_TEST_SPECIFICATION gate for LEAD-TO-PLAN
 * PAT-SDCREATE-001: Prevents gate failure for feature SDs missing smoke tests
 *
 * Only generates for non-lightweight SD types (feature, bugfix, security, etc.)
 * Lightweight types (infrastructure, documentation, orchestrator) are exempt
 */
function buildDefaultSmokeTestSteps(type, title) {
  // Lightweight SD types are exempt from smoke tests per sd-type-applicability-policy.js
  const lightweightTypes = ['infrastructure', 'documentation', 'docs', 'orchestrator'];
  if (lightweightTypes.includes((type || '').toLowerCase())) {
    return [];
  }

  return [
    {
      step_number: 1,
      instruction: `Navigate to the relevant page/area for: ${title}`,
      expected_outcome: 'Page loads without errors'
    },
    {
      step_number: 2,
      instruction: 'Verify the primary functionality works as expected',
      expected_outcome: 'Core feature operates correctly with expected behavior'
    },
    {
      step_number: 3,
      instruction: 'Test an edge case or error scenario',
      expected_outcome: 'Appropriate error handling or graceful degradation'
    }
  ];
}

/**
 * Build default success_criteria based on SD type
 * Returns array of strings (qualitative acceptance criteria)
 */
function buildDefaultSuccessCriteria(type, _title) {
  const baseCriteria = [
    'All implementation items from scope are complete',
    'Code passes lint and type checks',
    'PR reviewed and approved'
  ];

  if (type === 'fix' || type === 'bugfix') {
    baseCriteria.push('Root cause addressed, not just symptoms');
  } else if (type === 'feature' || type === 'feat') {
    baseCriteria.push('Feature accessible to target users');
  }

  return baseCriteria;
}

/**
 * Create SD in database
 */
async function createSD(options) {
  const {
    sdKey,
    title,
    description,
    type,
    priority = 'medium',
    rationale,
    parentId = null,
    metadata = {},
    // Allow passing explicit category (for child SDs inheriting from parent)
    category: explicitCategory = null,
    // Allow passing explicit success fields (for sources like UAT, learn, or inherited from parent)
    success_metrics = null,
    success_criteria = null,
    strategic_objectives = null,
    key_principles = null,
    // PAT-SDCREATE-001: Allow passing key_changes and smoke_test_steps
    key_changes = null,
    smoke_test_steps = null,
    // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Allow explicit target_application
    target_application: explicitTargetApp = null,
  } = options;

  // QF-CLAIM-CONFLICT-UX-001 + SD-LEO-ENH-IMPLEMENT-TIERED-QUICK-001:
  // Detect Quick-Fix prefix and redirect via Unified Work-Item Router
  if (sdKey && sdKey.startsWith('QF-')) {
    // Use router to determine if this should be a QF or SD
    const routingDecision = await routeWorkItem({
      estimatedLoc: 0, // Unknown at SD creation time - use type/description signals
      type: type || 'bug',
      description: title,
      entryPoint: 'leo-create-sd',
    }, supabase);

    console.log('\n' + '═'.repeat(60));
    console.log('⚠️  QUICK-FIX PREFIX DETECTED');
    console.log('═'.repeat(60));
    console.log(`   SD Key: ${sdKey}`);
    console.log(`   Router Decision: ${routingDecision.tierLabel}`);
    console.log('');

    if (routingDecision.tier <= 2) {
      console.log('   This SD key has a QF- prefix and the router confirms Quick-Fix scope.');
      console.log('   Quick-Fixes should use the streamlined workflow:');
      console.log('');
      console.log('   node scripts/create-quick-fix.js --title "' + title + '" --type ' + (type || 'bug'));
      console.log('');
      console.log(`   Tier ${routingDecision.tier} benefits:`);
      console.log('   • No LEAD approval required');
      console.log('   • No PRD creation');
      if (routingDecision.tier === 1) {
        console.log('   • Auto-approve (skip compliance rubric)');
        console.log(`   • Ideal for changes ≤${routingDecision.tier1MaxLoc} LOC`);
      } else {
        console.log('   • Compliance rubric required (min score: 70)');
        console.log(`   • Ideal for changes ≤${routingDecision.tier2MaxLoc} LOC`);
      }
    } else {
      console.log('   This SD key has a QF- prefix but risk keywords detected:');
      console.log(`   Escalation: ${routingDecision.escalationReason}`);
      console.log('   Consider using a full SD workflow instead.');
    }

    console.log('');
    console.log('   Use a non-QF key prefix for full Strategic Directive workflow.');
    console.log('═'.repeat(60));
    process.exit(0);
  }

  // Map user-friendly type to valid database sd_type
  const dbType = mapToDbType(type);

  // PREVENTIVE CONTROL: Validate sd_type/category alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // sd_type controls validation profiles, category controls gate overrides - misalignment causes issues
  // Use explicit category if provided (e.g., inherited from parent), otherwise derive from type
  const categoryValue = explicitCategory || (type.charAt(0).toUpperCase() + type.slice(1));
  const normalizedCategory = categoryValue.toLowerCase();
  const normalizedDbType = dbType.toLowerCase();

  // Check for common misalignments that cause progress calculation issues
  if (normalizedDbType !== normalizedCategory) {
    // Some misalignments are acceptable (documentation vs docs, bugfix vs bug)
    const acceptableMappings = {
      'documentation': ['docs', 'documentation'],
      'bugfix': ['bug', 'bugfix'],
      'infrastructure': ['infrastructure', 'infra'],
      'feature': ['feature', 'enhancement']
    };

    const isAcceptable = acceptableMappings[normalizedDbType]?.includes(normalizedCategory) ||
                         acceptableMappings[normalizedCategory]?.includes(normalizedDbType);

    if (!isAcceptable && !explicitCategory) {
      // Only warn if category wasn't explicitly provided (inherited categories are intentional)
      console.log('\n⚠️  SD TYPE/CATEGORY ALIGNMENT WARNING');
      console.log(`   sd_type: '${dbType}' (controls validation profile)`);
      console.log(`   category: '${categoryValue}' (controls gate overrides)`);
      console.log('   These fields should generally align to avoid progress calculation issues.');
      console.log('   Consider using consistent values or update after creation.\n');
    }
  }

  // Build success fields - use provided values or generate defaults
  // IMPORTANT: Do NOT use JSON.stringify() - Supabase handles JSONB natively
  // FIX: Check for empty arrays, not just falsy values (empty arrays are truthy in JS)
  const finalSuccessMetrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
    ? success_metrics
    : buildDefaultSuccessMetrics(type, title);
  const finalSuccessCriteria = (Array.isArray(success_criteria) && success_criteria.length > 0)
    ? success_criteria
    : buildDefaultSuccessCriteria(type, title);

  // PAT-SDCREATE-001: Build required fields with defaults to prevent LEAD-TO-PLAN gate failures
  // Previously, child SDs were created with empty strategic_objectives/key_changes/smoke_test_steps
  // which caused repeated gate validation failures requiring manual database population
  const finalStrategicObjectives = (Array.isArray(strategic_objectives) && strategic_objectives.length > 0)
    ? strategic_objectives
    : buildDefaultStrategicObjectives(type, title);
  const finalKeyChanges = (Array.isArray(key_changes) && key_changes.length > 0)
    ? key_changes
    : buildDefaultKeyChanges(type, title);
  const finalSmokeTestSteps = (Array.isArray(smoke_test_steps) && smoke_test_steps.length > 0)
    ? smoke_test_steps
    : buildDefaultSmokeTestSteps(type, title);

  // ========================================================================
  // GOVERNANCE GUARDRAILS (SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007)
  // ========================================================================


  // Guardrail 1: Brainstorm Intent Validation
  // Warn when feature/enhancement SDs are created without a prior brainstorm session
  const brainstormTypes = ['feature', 'enhancement'];
  if (brainstormTypes.includes(dbType) && !parentId && !metadata?.source?.includes('brainstorm')) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSessions } = await supabase
        .from('brainstorm_sessions')
        .select('id, topic, created_sd_id, crystallization_score')
        .gte('created_at', thirtyDaysAgo)
        .is('created_sd_id', null) // Sessions not yet linked to an SD
        .order('created_at', { ascending: false })
        .limit(5);

      if (!recentSessions || recentSessions.length === 0) {
        console.log('\n' + '💡'.repeat(15));
        console.log('💡 BRAINSTORM INTENT CHECK (Guardrail V11)');
        console.log('💡'.repeat(15));
        console.log(`   Creating a "${type}" SD without a prior brainstorm session.`);
        console.log('   Brainstorming helps crystallize requirements and reduce scope creep.');
        console.log('');
        console.log('   To start a brainstorm: /brainstorm');
        console.log('   Proceeding with SD creation...');
        console.log('💡'.repeat(15));
      }
    } catch {
      // Non-fatal: brainstorm check should not block SD creation
    }
  }

  // Guardrail 3: Bulk SD Draft Limit
  // Warn when too many draft SDs already exist (prevents backlog sprawl)
  const DRAFT_LIMIT = 10;
  try {
    const { count: draftCount } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .eq('is_active', true);

    if (draftCount >= DRAFT_LIMIT) {
      console.log('\n' + '🚧'.repeat(15));
      console.log('🚧 DRAFT BACKLOG WARNING (Guardrail V06)');
      console.log('🚧'.repeat(15));
      console.log(`   ${draftCount} draft SDs already exist (limit: ${DRAFT_LIMIT}).`);
      console.log('   Consider completing existing drafts before creating new ones.');
      console.log('');
      console.log('   View queue: npm run sd:next');
      console.log('   Proceeding with SD creation...');
      console.log('🚧'.repeat(15));
    }
  } catch {
    // Non-fatal: draft count check should not block SD creation
  }

  // ========================================================================

  // Guardrail 4: Vision Delta Watch Points (SD-LEO-INFRA-HEAL-VISION-DELTA-002)
  // Surface architecture dimensions that historically have the largest gaps
  // between first-pass and corrected vision scores. Advisory only — does not block.
  try {
    const { getVisionWatchPoints } = await import('./vision-delta-aggregator.js');
    const watchPoints = await getVisionWatchPoints(supabase, 3);
    if (watchPoints.length > 0) {
      console.log('\n' + '🔭'.repeat(15));
      console.log('🔭 ARCHITECTURE WATCH POINTS (from vision delta analysis)');
      console.log('🔭'.repeat(15));
      console.log('   These dimensions commonly have large gaps on first-pass scoring.');
      console.log('   Consider addressing them in your SD description and objectives:\n');
      for (const wp of watchPoints) {
        const sev = wp.severity === 'high' ? '🔴' : '🟡';
        console.log(`   ${sev} ${wp.dimension} (${wp.key}): avg +${wp.mean_delta} gap across ${wp.sd_count} SDs`);
      }
      console.log('\n   These are advisory — not blocking SD creation.');
      console.log('🔭'.repeat(15));
    }
  } catch {
    // Non-fatal: watch points are advisory
  }

  // ========================================================================

  // Guardrail Registry Check (V11: governance_guardrail_enforcement)
  // Blocking guardrails can prevent SD creation. Advisory guardrails log warnings.
  try {
    const guardrailRegistry = await import('../lib/governance/guardrail-registry.js');
    const guardrailInput = {
      sd_type: dbType,
      scope: description,
      priority,
      visionScore: null, // Will be populated by scoreSDAtConception later
      strategic_objectives: finalStrategicObjectives,
      risks: [],
      metadata,
    };
    const guardrailResult = guardrailRegistry.check(guardrailInput);

    if (guardrailResult.warnings.length > 0) {
      console.log('\n   ⚠️  GUARDRAIL ADVISORY WARNINGS:');
      for (const w of guardrailResult.warnings) {
        console.log(`      [${w.guardrail}] ${w.message}`);
      }
    }

    if (!guardrailResult.passed) {
      console.log('\n' + '🛑'.repeat(30));
      console.log('🛑 GUARDRAIL VIOLATION — SD CREATION BLOCKED');
      console.log('🛑'.repeat(30));
      for (const v of guardrailResult.violations) {
        console.log(`   [${v.severity.toUpperCase()}] ${v.name}: ${v.message}`);
      }
      console.log('\n   Resolve the above violations before creating this SD.');
      console.log('   Guardrails are enforced at both CLI and database level — no bypass available.');
      console.log('🛑'.repeat(30));
      process.exit(1);
    }
  } catch (err) {
    // Graceful degradation: if guardrail module fails, log warning and proceed
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.log(`\n   ⚠️  Guardrail check error: ${err.message}. Proceeding with SD creation.`);
    }
  }

  // Cascade Validator Check (V09: strategic_governance_cascade)
  // Validates 6-layer governance hierarchy: Mission → Constitution → Vision → Strategy → OKR → SD
  try {
    const { validateCascade } = await import('./modules/governance/cascade-validator.js');
    const cascadeResult = await validateCascade({
      sd: {
        title,
        description,
        strategic_objectives: finalStrategicObjectives,
        key_changes: (typeof keyChanges !== 'undefined' ? keyChanges : []),
        vision_key: metadata?.vision_key || null,
        venture_id: metadata?.venture_id || null,
        metadata,
      },
      logger: console,
      dryRun: false,
    });

    if (cascadeResult.warnings.length > 0) {
      console.log('\n   ⚠️  CASCADE ADVISORY WARNINGS:');
      for (const w of cascadeResult.warnings) {
        console.log(`      [${w.layer || 'general'}] ${w.reason}`);
      }
    }

    if (!cascadeResult.passed) {
      console.log('\n' + '🛑'.repeat(30));
      console.log('🛑 CASCADE VIOLATION — SD CREATION BLOCKED');
      console.log('🛑'.repeat(30));
      for (const v of cascadeResult.violations) {
        console.log(`   [${v.enforcementLevel || 'blocking'}] ${v.layer || 'rule'}: ${v.reason || v.ruleText}`);
      }
      console.log(`\n   ${cascadeResult.rulesChecked} rules checked.`);
      console.log('   Resolve violations or request chairman override.');
      console.log('   Cascade rules are enforced at both CLI and database level — no bypass available.');
      console.log('🛑'.repeat(30));
      process.exit(1);
    }
  } catch (err) {
    // Graceful degradation: if cascade validator fails, log and proceed
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.log(`\n   ⚠️  Cascade validation error: ${err.message}. Proceeding with SD creation.`);
    }
  }

  // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve target_application from venture context
  // Precedence: explicit param > VENTURE env var > getCurrentVenture() > 'EHG_Engineer'
  const resolvedTargetApplication = explicitTargetApp
    || (process.env.VENTURE && (getVentureConfig(process.env.VENTURE)?.name || process.env.VENTURE))
    || null;

  const sdData = {
    id: randomUUID(),
    sd_key: sdKey,
    title,
    description,
    scope: description,  // Required field - defaults to description
    rationale,
    sd_type: dbType,
    status: 'draft',
    priority,
    category: categoryValue,  // Use calculated value (may be inherited from parent)
    current_phase: 'LEAD',
    target_application: resolvedTargetApplication || getCurrentVenture() || 'EHG_Engineer',
    created_by: 'Claude',
    parent_sd_id: parentId,
    success_criteria: finalSuccessCriteria,  // Array, NOT JSON.stringify()
    success_metrics: finalSuccessMetrics,    // Array with {metric, target}, NOT JSON.stringify()
    strategic_objectives: finalStrategicObjectives,  // PAT-SDCREATE-001: defaults prevent empty field
    key_changes: finalKeyChanges,                    // PAT-SDCREATE-001: now populated at creation
    smoke_test_steps: finalSmokeTestSteps,           // PAT-SDCREATE-001: now populated for feature SDs
    key_principles: key_principles || [
      'Follow LEO Protocol for all changes',
      'Ensure backward compatibility'
    ],
    risks: (typeof risks !== 'undefined' && risks && risks.length > 0) ? risks : [
      { risk: 'Implementation may not fully address root cause', likelihood: 'low', impact: 'low', mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs' }
    ],
    dependencies: (typeof dependencies !== 'undefined' && dependencies && dependencies.length > 0) ? dependencies : [
      { dependency: 'none', type: 'internal', status: 'available' }
    ],
    implementation_guidelines: (typeof implementation_guidelines !== 'undefined' && implementation_guidelines && implementation_guidelines.length > 0) ? implementation_guidelines : [
      `Implement changes for: ${title}`,
      'Verify no regressions in existing functionality'
    ],
    metadata: {
      ...metadata,
      created_via: 'leo-create-sd',
      created_at: new Date().toISOString()
    }
  };

  // CONST-014 Enforcement: Decomposition check at creation time
  // SDs with 3+ phases or 8+ FRs must use orchestrator pattern
  if (!parentId) {
    try {
      const scopeText = `${title} ${description || ''} ${(finalStrategicObjectives || []).join(' ')} ${(finalKeyChanges || []).join(' ')}`;
      const phaseSignals = ['phase 1', 'phase 2', 'phase 3', 'step 1', 'step 2', 'step 3', 'layer 1', 'layer 2', 'layer 3', 'first,', 'second,', 'third,', 'finally,'];
      const phaseCount = phaseSignals.filter(s => scopeText.toLowerCase().includes(s)).length;
      const frCount = (finalSuccessCriteria || []).length + (finalKeyChanges || []).length;

      if (phaseCount >= 3 || frCount >= 8) {
        console.log('\n' + '⚠️'.repeat(20));
        console.log('📐 CONST-014 DECOMPOSITION RECOMMENDATION');
        console.log('─'.repeat(50));
        console.log(`   Phase signals detected: ${phaseCount} (threshold: 3)`);
        console.log(`   Scope items (FRs + changes): ${frCount} (threshold: 8)`);
        console.log('');
        console.log('   This SD may benefit from orchestrator decomposition.');
        console.log('   Consider creating child SDs for focused scope.');
        console.log('   Proceeding with creation — decompose after LEAD approval.');
        console.log('─'.repeat(50));

        // Tag in metadata for downstream enforcement
        sdData.metadata = { ...sdData.metadata, decomposition_recommended: true, scope_signals: { phaseCount, frCount } };
      }
    } catch {
      // Non-fatal: decomposition check should not block creation
    }
  }

  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-069: GATE_SD_QUALITY-aligned validation with auto-enrichment
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-078: Now populates missing fields AND applies enriched data to insert
  try {
    const gateResult = validateSDFields(sdData, { enrich: true, quiet: false });
    if (gateResult.enrichments.length > 0) {
      console.log(`   ✅ Auto-enrichment applied ${gateResult.enrichments.length} fix(es) (score: ${gateResult.score}/${gateResult.threshold})`);
    }
  } catch (vErr) {
    console.warn(`   ⚠️  GATE_SD_QUALITY pre-check skipped: ${vErr.message}`);
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, sd_type, status, priority, current_phase')
    .single();

  if (error) {
    const msg = `Failed to create SD: ${error.message}`;
    console.error(msg);
    // Throw instead of process.exit — callers (EVA, corrective-sd-generator) must not be killed
    if (typeof globalThis.__LEO_CLI_MODE !== 'undefined') process.exit(1);
    throw new Error(msg);
  }

  // SD-MAN-GEN-CORRECTIVE-VISION-GAP-009: Track CLI authority for SD creation
  try {
    await trackWriteSource(supabase, {
      table: 'strategic_directives_v2',
      operation: 'insert',
      source: 'cli',
      command: 'create',
      sdKey: data.sd_key,
    });
  } catch { /* CLI tracking is fire-and-forget */ }

  // FR-005 (SD-LEO-INFRA-BRAINSTORM-SD-PIPELINE-001): Backfill brainstorm_sessions.created_sd_id
  // When an SD is created with a vision_key from a brainstorm, link it back to the originating session
  if (metadata?.vision_key) {
    try {
      const { data: visionDoc } = await supabase
        .from('eva_vision_documents')
        .select('source_brainstorm_id')
        .eq('vision_key', metadata.vision_key)
        .single();

      if (visionDoc?.source_brainstorm_id) {
        await supabase
          .from('brainstorm_sessions')
          .update({ created_sd_id: data.sd_key })
          .eq('id', visionDoc.source_brainstorm_id)
          .is('created_sd_id', null); // Only backfill if not already linked
      }
    } catch { /* Non-fatal: brainstorm backfill should not block SD creation */ }
  }

  // Vision pre-screen at SD conception (SD-LEO-INFRA-VISION-SD-CONCEPTION-GATE-001)
  // Fire-and-forget: vision scoring is advisory and should not block SD creation.
  // Blocking here caused duplicate SDs when the script timed out after DB insert.
  scoreSDAtConception(data.sd_key, title, description, supabase, {
    visionKey: metadata?.vision_key,
    archKey: metadata?.arch_key
  }).catch(err => console.log(`\n   ⚠️  Vision pre-screen failed (non-blocking): ${err.message}`));

  // Scope complexity advisory for orchestrator SDs (SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-A)
  if (dbType === 'orchestrator') {
    import('../lib/analysis/scope-complexity-scorer.js')
      .then(({ scoreComplexity, formatAdvisory }) =>
        scoreComplexity(data.sd_key, { supabase }).then(result => {
          if (result) console.log(formatAdvisory(result));
        })
      )
      .catch(err => console.log(`\n   ⚠️  Scope complexity advisory failed (non-blocking): ${err.message}`));
  }


  console.log('\n' + '═'.repeat(60));
  console.log('✅ SD CREATED');
  console.log('═'.repeat(60));
  console.log(`   SD Key:   ${data.sd_key}`);
  console.log(`   Title:    ${data.title}`);
  console.log(`   Type:     ${data.sd_type}`);
  console.log(`   Priority: ${data.priority}`);
  console.log(`   Status:   ${data.status}`);
  console.log(`   Phase:    ${data.current_phase}`);
  console.log(`   Dependencies: ${sdData.dependencies?.length ? sdData.dependencies.map(d => d.sd_id || d).join(', ') : '(none)'}`);
  console.log('═'.repeat(60));

  // QA CHECK: Detect dependency info misplaced in metadata
  const depScan = scanMetadataForMisplacedDependencies(sdData.metadata);
  if (depScan.hasMisplacedDeps) {
    console.log('\n' + '⚠'.repeat(30));
    console.log('⚠️  DEPENDENCY QA WARNING');
    console.log('⚠'.repeat(30));
    console.log('   The dependencies column is empty, but dependency-like');
    console.log('   information was found in the metadata field:');
    for (const finding of depScan.findings) {
      console.log(`\n   metadata.${finding.key}:`);
      if (Array.isArray(finding.value)) {
        finding.value.forEach(v => console.log(`     - ${typeof v === 'string' ? v : JSON.stringify(v)}`));
      } else {
        console.log(`     ${typeof finding.value === 'string' ? finding.value : JSON.stringify(finding.value)}`);
      }
      if (finding.sdKeys.length > 0) {
        console.log(`   → SD keys detected: ${finding.sdKeys.join(', ')}`);
      }
    }
    console.log('\n   ℹ️  The "dependencies" column is the correct place for SD');
    console.log('   dependencies. It controls blocking/readiness in sd:next.');
    console.log('   Metadata dependencies are NOT enforced by the queue system.');
    console.log('\n   To fix, update the SD:');
    console.log('   UPDATE strategic_directives_v2');
    console.log(`   SET dependencies = '[${depScan.findings.flatMap(f => f.sdKeys).map(k => `{"sd_id":"${k}"}`).join(',')}]'`);
    console.log(`   WHERE sd_key = '${data.sd_key}';`);
    console.log('⚠'.repeat(30));
  }

  console.log('\n📋 Next Steps:');
  console.log('   1. Review SD details');
  console.log('   2. Run LEAD-TO-PLAN handoff when ready:');
  console.log(`      node scripts/handoff.js execute LEAD-TO-PLAN ${data.sd_key}`);

  return data;
}

// Export for programmatic use (e.g., corrective-sd-generator)
export { createSD };

// ============================================================================
// CLI Handler
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
LEO Create SD - Centralized SD Creation

Usage:
  node scripts/leo-create-sd.js --from-uat <test-id>
  node scripts/leo-create-sd.js --from-learn <pattern-id>
  node scripts/leo-create-sd.js --from-feedback <feedback-id>
  node scripts/leo-create-sd.js --from-plan [path] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js --child <parent-key> [index] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js <source> <type> "<title>"

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Flags:
  --yes, -y          Skip confirmation for auto-detected plans
  --type <type>      Override SD type (for --from-plan or --child; children never inherit 'orchestrator')
  --title "<title>"  Override title (for --from-plan or --child)
  --venture <name>   Generate venture-scoped SD key (SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM})
  --vision-key <key> Link SD to EVA vision document (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --arch-key <key>   Link SD to EVA architecture plan (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --migration-reviewed  Set metadata.migration_reviewed=true to satisfy GR-MIGRATION-REVIEW
                        guardrail (required when scope contains migration/schema keywords).
  --security-reviewed   Set metadata.security_reviewed=true to satisfy GR-SECURITY-BASELINE
                        guardrail (required when scope contains auth/credential/RLS keywords).
  --help             Show this help message

Dependency Field Guide:
  The "dependencies" column (JSONB array) is the CORRECT place for SD prerequisites.
  Format: [{"sd_id": "SD-XXX-001"}, {"sd_id": "SD-YYY-002"}]

  This column controls:
    - Whether an SD shows as BLOCKED or READY in sd:next
    - Whether AUTO-PROCEED will skip or process the SD
    - Unresolved dependency warnings in the queue display

  DO NOT put dependency info in the "metadata" field — it will NOT be
  enforced by the queue system. Common mistakes:
    metadata.depends_on, metadata.dependencies, metadata.blocked_by,
    metadata.prerequisite_sds — all ignored by the dependency resolver.

  The only metadata dependency key that IS checked is:
    metadata.blocked_by_sd_key — soft/conditional blocker (single SD key)

Venture Context:
  Venture prefix is resolved in order: --venture flag > VENTURE env var > active session venture.
  When a venture context is active, SD keys are automatically prefixed with the venture name.

Examples:
  node scripts/leo-create-sd.js --from-uat abc123
  node scripts/leo-create-sd.js --from-feedback def456
  node scripts/leo-create-sd.js --from-plan                              # Auto-detect most recent plan
  node scripts/leo-create-sd.js --from-plan --yes                        # Auto-detect without confirmation
  node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md   # Use specific plan
  node scripts/leo-create-sd.js --from-plan --type feature --yes         # Override inferred type
  node scripts/leo-create-sd.js --from-plan --type feature --title "My SD" --yes  # Override both
  node scripts/leo-create-sd.js --child SD-LEO-FEAT-001 0
  node scripts/leo-create-sd.js LEO fix "Login button not working"
  node scripts/leo-create-sd.js LEO infrastructure "Tooling upgrade"

Note: SD keys starting with QF- will be redirected to create-quick-fix.js.
      Guardrails are enforced at both CLI and database level — no bypass available.
`);
    process.exit(0);
  }

  try {
    if (args[0] === '--from-uat') {
      await createFromUAT(args[1]);
    } else if (args[0] === '--from-learn') {
      await createFromLearn(args[1]);
    } else if (args[0] === '--from-feedback') {
      await createFromFeedback(args[1]);
    } else if (args[0] === '--from-plan') {
      // Check for --yes flag (skip confirmation for auto-detect)
      const hasYesFlag = args.includes('--yes') || args.includes('-y');
      // Parse --type override (e.g., --from-plan --type feature)
      const typeIdx = args.indexOf('--type');
      const typeOverride = typeIdx !== -1 ? args[typeIdx + 1] : null;
      // Parse --title override (e.g., --from-plan --title "My Title")
      const titleIdx = args.indexOf('--title');
      const titleOverride = titleIdx !== -1 ? args[titleIdx + 1] : null;
      // Parse --vision-key / --arch-key (link plan-created SD to registered vision/arch)
      const visionKeyIdx = args.indexOf('--vision-key');
      const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
      const archKeyIdx = args.indexOf('--arch-key');
      const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;
      // Parse boolean review flags (satisfy GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      const migrationReviewed = args.includes('--migration-reviewed');
      const securityReviewed = args.includes('--security-reviewed');
      // Path is any arg that isn't a flag or a flag's value
      const flagValuePositions = new Set(
        [
          typeIdx !== -1 ? typeIdx + 1 : -1,
          titleIdx !== -1 ? titleIdx + 1 : -1,
          visionKeyIdx !== -1 ? visionKeyIdx + 1 : -1,
          archKeyIdx !== -1 ? archKeyIdx + 1 : -1,
        ].filter(i => i > 0)
      );
      const knownPlanFlags = new Set([
        '--yes', '-y', '--type', '--title', '--from-plan',
        '--vision-key', '--arch-key', '--migration-reviewed', '--security-reviewed'
      ]);
      const planPath = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !flagValuePositions.has(i) && !knownPlanFlags.has(arg)
      ) || null;
      await createFromPlan(planPath, hasYesFlag, {
        typeOverride,
        titleOverride,
        visionKey,
        archKey,
        migrationReviewed,
        securityReviewed,
      });
    } else if (args[0] === '--child') {
      // Parse --type and --title overrides for child creation
      const childOverrides = {};
      const childTypeIdx = args.indexOf('--type');
      if (childTypeIdx !== -1 && args[childTypeIdx + 1]) {
        childOverrides.type = args[childTypeIdx + 1];
      }
      const childTitleIdx = args.indexOf('--title');
      if (childTitleIdx !== -1 && args[childTitleIdx + 1]) {
        childOverrides.title = args[childTitleIdx + 1];
      }
      // Parse review flags for child creation (GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      if (args.includes('--migration-reviewed')) childOverrides.migrationReviewed = true;
      if (args.includes('--security-reviewed')) childOverrides.securityReviewed = true;
      // Parse --vision-key / --arch-key for child creation
      const childVisionKeyIdx = args.indexOf('--vision-key');
      if (childVisionKeyIdx !== -1 && args[childVisionKeyIdx + 1]) {
        childOverrides.visionKey = args[childVisionKeyIdx + 1];
      }
      const childArchKeyIdx = args.indexOf('--arch-key');
      if (childArchKeyIdx !== -1 && args[childArchKeyIdx + 1]) {
        childOverrides.archKey = args[childArchKeyIdx + 1];
      }
      // args[1] = parent key, args[2] = index (skip flag positions)
      const childParentKey = args[1];
      const flagValuePositionsChild = new Set(
        [childTypeIdx, childTitleIdx, childVisionKeyIdx, childArchKeyIdx]
          .filter(i => i !== -1).map(i => i + 1)
      );
      const childIndexArg = args.find((a, i) =>
        i >= 2 && !a.startsWith('-') && !flagValuePositionsChild.has(i) && i !== childTypeIdx + 1 && i !== childTitleIdx + 1
      );
      await createChild(childParentKey, parseInt(childIndexArg || '0', 10), childOverrides);
    } else {
      // Direct creation: <source> <type> "<title>"
      // Detect unknown flags to prevent silent corruption (SD-LEO-FIX-CREATE-ARGS-001)
      const knownDirectFlags = new Set(['--venture', '--vision-key', '--arch-key']);
      const unknownFlags = args.filter(a => a.startsWith('-') && !knownDirectFlags.has(a));
      if (unknownFlags.length > 0) {
        console.error('\n❌ Unknown flag(s): ' + unknownFlags.join(', '));
        console.error('   Direct creation supports: <source> <type> "<title>" [--venture <name>]');
        console.error('   Did you mean one of these?');
        console.error('     --from-plan [path] [--type <type>] [--title "<title>"]');
        console.error('     --from-feedback <id>');
        console.error('     --from-learn <pattern-id>');
        console.error('     --from-uat <test-id>');
        process.exit(1);
      }

      const [source, type, ...titleParts] = args;
      // Strip flags and their values from the title (SD-DISTILLTOBRAINSTORM quality fix)
      // Without this, --vision-key VALUE --arch-key VALUE leak into the title text
      const flagsWithValues = new Set(['--venture', '--vision-key', '--arch-key']);
      const cleanedTitleParts = [];
      for (let i = 0; i < titleParts.length; i++) {
        if (flagsWithValues.has(titleParts[i])) {
          i++; // skip the flag's value too
        } else if (!titleParts[i].startsWith('--')) {
          cleanedTitleParts.push(titleParts[i]);
        }
      }
      const title = cleanedTitleParts.join(' ');

      if (!source || !type || !title) {
        console.error('Usage: leo-create-sd.js <source> <type> "<title>"');
        process.exit(1);
      }

      // Phase 0 exemption: vision + arch keys mean upstream brainstorm already
      // performed intent discovery, scoping, and out-of-scope contract to a
      // higher standard than Phase 0 alone. Skip the gate.
      const hasVisionKey = args.includes('--vision-key');
      const hasArchKey = args.includes('--arch-key');
      const phase0Exempt = hasVisionKey && hasArchKey;

      // SD-LEO-FIX-PHASE0-INTEGRATION-001: Phase 0 Intent Discovery Gate
      // Check if Phase 0 is required for this SD type before proceeding
      const gateResult = phase0Exempt
        ? { action: 'proceed', required: false, message: 'Phase 0 exempt: vision + arch keys provided from brainstorm pipeline.' }
        : checkGate(type);

      if (phase0Exempt) {
        console.log('✓ Phase 0 exempt: vision + arch keys provided (upstream brainstorm governance)');
      }

      if (gateResult.action === 'start') {
        // Phase 0 required but not started
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 INTENT DISCOVERY REQUIRED');
        console.log('═'.repeat(60));
        console.log(`   SD Type: ${type}`);
        console.log(`   Title: ${title}`);
        console.log('');
        console.log('   Feature and enhancement SDs require Phase 0 Intent Discovery');
        console.log('   to ensure proper scoping and crystallized requirements.');
        console.log('');
        console.log('📋 To start Phase 0:');
        console.log('   Use /leo create interactively to begin the discovery process.');
        console.log('   The discovery will ask clarifying questions one at a time.');
        console.log('');
        console.log('   After Phase 0 completes, run this command again.');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      if (gateResult.action === 'resume') {
        // Phase 0 in progress but not complete
        const status = getPhase0Status();
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 IN PROGRESS');
        console.log('═'.repeat(60));
        console.log(`   Questions answered: ${status.questionsAnswered}/${status.minQuestions} minimum`);
        console.log(`   Has intent summary: ${status.hasIntentSummary ? '✓' : '✗'}`);
        console.log(`   Out of scope items: ${status.outOfScopeCount}/${status.minOutOfScope} minimum`);
        console.log(`   Crystallization: ${(status.crystallizationScore * 100).toFixed(0)}% (need ${(status.threshold * 100).toFixed(0)}%)`);
        console.log('');
        console.log('📋 To continue Phase 0:');
        console.log('   Use /leo create interactively to continue the discovery process.');
        console.log('');
        console.log('   To reset and start over: node scripts/phase-0-cli.js reset');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      // Vision Readiness Rubric: Unified routing (QF / Direct SD / Vision-First)
      // Subsumes triage gate — evaluates scope, novelty, vision coverage, decomposition
      try {
        // Parse flags that trigger exemption
        const visionKeyIdx = args.indexOf('--vision-key');
        const rubricVisionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
        const archKeyIdx = args.indexOf('--arch-key');
        const rubricArchKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;

        // Get LOC estimate from triage gate for dimension scoring
        let locEstimate = 0;
        try {
          const triageResult = await runTriageGate({ title, description: title, type, source: 'interactive' }, supabase);
          locEstimate = triageResult.estimatedLoc || 0;
        } catch { /* LOC estimate is optional — rubric works without it */ }

        const rubricResult = await evaluateVisionReadiness({
          title,
          description: title,
          type,
          source: 'interactive',
          estimatedLoc: locEstimate,
          visionKey: rubricVisionKey,
          archKey: rubricArchKey,
        });

        if (rubricResult.route !== 'EXEMPT') {
          console.log('\n' + formatRubricResult(rubricResult));

          if (rubricResult.route === 'QUICK_FIX') {
            console.log('\n   💡 Quick Fix recommended:');
            console.log(`      node scripts/create-quick-fix.js --title "${title}" --type ${type}`);
            console.log('   Continuing with full SD creation...\n');
          } else if (rubricResult.route === 'VISION_FIRST') {
            console.log('\n   💡 Vision-First pipeline recommended:');
            console.log('      Start with /brainstorm to create a vision document,');
            console.log('      then architecture plan, then orchestrator + children.');
            console.log('   Continuing with direct SD creation...\n');
          }
        }
      } catch (rubricErr) {
        // Non-fatal: rubric failure should not block SD creation
        console.warn(`[vision-readiness] Warning: ${rubricErr.message}`);
      }

      // Phase 0 not required or complete - proceed with SD creation
      // Check if Phase 0 artifacts are available to enrich metadata
      let phase0Metadata = {};
      if (gateResult.action === 'proceed' && gateResult.session) {
        // Session exists and is complete - extract artifacts
        const artifacts = getArtifacts(gateResult.session);
        phase0Metadata = {
          phase_0: {
            intent_summary: artifacts.intentSummary,
            out_of_scope: artifacts.outOfScope,
            crystallization_score: artifacts.crystallizationScore,
            questions_answered: artifacts.questionsAnswered,
            ehg_stage: artifacts.ehgStage,
            completed_at: new Date().toISOString()
          }
        };
        console.log('\n✓ Phase 0 artifacts loaded into SD metadata');
      }

      // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
      // Check for --venture flag in args
      const ventureArgIdx = args.indexOf('--venture');
      const cliVenture = ventureArgIdx !== -1 ? args[ventureArgIdx + 1] : null;
      const venturePrefix = await resolveVenturePrefix(cliVenture);

      // Parse --vision-key and --arch-key flags (SD-MAN-INFRA-AUTOMATE-BRAINSTORM-PIPELINE-002)
      const visionKeyIdx = args.indexOf('--vision-key');
      const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
      const archKeyIdx = args.indexOf('--arch-key');
      const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;

      // FR-003: Auto-route to orchestrator creator when arch key has phases
      if (visionKey && archKey) {
        try {
          const sb = createSupabaseServiceClient();
          const { data: archPlan } = await sb
            .from('eva_architecture_plans')
            .select('content, sections')
            .eq('plan_key', archKey)
            .single();
          const structuredPhaseCount = archPlan?.sections?.implementation_phases?.length || 0;
          const hasMultipleStructuredPhases = structuredPhaseCount >= 2;
          const contentPhaseMatches = archPlan?.content
            ? (archPlan.content.match(/^##?\s*(Phase|Implementation Phase|Step)\s+\d/gim) || [])
            : [];
          const hasMultipleContentPhases = contentPhaseMatches.length >= 2;
          if (hasMultipleStructuredPhases || hasMultipleContentPhases) {
            console.log(`\n🔄 Auto-routing to orchestrator creator (${structuredPhaseCount || contentPhaseMatches.length} phases detected)...`);
            const { execSync } = await import('child_process');
            const cmd = `node scripts/create-orchestrator-from-plan.js --vision-key ${visionKey} --arch-key ${archKey} --title "${title}" --auto-children`;
            execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
            process.exit(0);
          }
        } catch (routeErr) {
          // QF-20260409-561 (P1): Fail loud; silent fallback violated feedback_auto_decompose_sd_hierarchy.
          console.error(`\n❌ Orchestrator auto-routing FAILED: ${routeErr.message}`);
          console.error(`   Check orphans: SELECT sd_key FROM strategic_directives_v2 WHERE metadata->>'vision_key'='${visionKey}';`);
          console.error('   Clean via database-agent, then re-run (create-orchestrator-from-plan.js will resume).');
          process.exit(1);
        }

        // Advisory: warn about uncovered architecture phases (SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001)
        try {
          const sb2 = createSupabaseServiceClient();
          const { data: archPlanSections } = await sb2
            .from('eva_architecture_plans')
            .select('sections')
            .eq('plan_key', archKey)
            .single();
          const phases = archPlanSections?.sections?.implementation_phases;
          if (phases && Array.isArray(phases)) {
            const uncovered = phases.filter(p => !p.covered_by_sd_key);
            if (uncovered.length > 0) {
              console.log('\n⚠️  Architecture Phase Coverage Warning:');
              console.log(`   ${uncovered.length}/${phases.length} phase(s) have no assigned SD:`);
              for (const p of uncovered) {
                console.log(`   ❌ Phase ${p.number}: ${p.title}`);
              }
              console.log('   Assign SDs before LEAD-TO-PLAN to pass the phase coverage gate.\n');
            }
          }
        } catch { /* Advisory only — continue regardless */ }
      }

      const sdKey = await generateSDKey({ source, type, title, venturePrefix });

      // Quick-fix QF-20260312-516: Enrich SD fields from vision/arch documents
      const enriched = await enrichFromVisionArch(visionKey, archKey, supabase);
      if (enriched) {
        console.log('✓ SD fields enriched from vision/architecture documents');
      }

      // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve target_application from --venture flag
      const ventureConfig = cliVenture ? getVentureConfig(cliVenture) : null;
      const targetApp = ventureConfig?.name || cliVenture || null;

      await createSD({
        sdKey,
        title,
        description: enriched?.description || title,
        type,
        rationale: enriched?.rationale || 'Created via /leo create',
        success_criteria: enriched?.success_criteria || null,
        key_changes: enriched?.key_changes || null,
        target_application: targetApp,
        metadata: {
          source: source.toLowerCase(),
          ...phase0Metadata,
          ...(visionKey && { vision_key: visionKey }),
          ...(archKey && { arch_key: archKey }),
          ...(enriched?.scope && { scope: enriched.scope })
        }
      });
    }
    // Exit cleanly so fire-and-forget vision scoring doesn't block the process.
    // Without this, Node waits for the detached scoreSDAtConception() HTTP request,
    // causing the CLI to hang and users to retry — creating duplicate SDs.
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
