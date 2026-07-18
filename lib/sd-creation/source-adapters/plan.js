/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: plan-file source adapter — createFromPlan,
 * computePlanContentHash and findRecentSDByPlanHash moved VERBATIM from
 * scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites return
 * {ok:false, error, exitCode}; the CLI maps them back to the historical exit codes.
 */
import { createHash } from 'crypto';
import { supabase } from '../context.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import {
  parsePlanFile,
  formatFilesAsScope,
  formatStepsAsCriteria
} from '../../../scripts/modules/plan-parser.js';
import {
  findMostRecentPlan,
  archivePlanFile,
  readPlanFile,
  getDisplayPath
} from '../../../scripts/modules/plan-archiver.js';
import { resolveVenturePrefix, createSDOrThrow as createSD } from '../pipeline.js';
import { classifyPlanLinkage } from '../plan-linkage-classifier.js';

/**
 * Compute a deterministic SHA256 hash of plan content for duplicate detection.
 * Normalizes line endings (CRLF→LF) and trims trailing whitespace per line so
 * that benign editor save-formatting changes don't bypass the guard.
 *
 * @param {string} content
 * @returns {string} 64-char hex digest
 */
export function computePlanContentHash(content) {
  if (!content) return createHash('sha256').update('').digest('hex');
  const normalized = String(content).replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trimEnd();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Look up a non-cancelled SD created within the last 24h whose metadata
 * carries the same plan_content_hash. Used to refuse duplicate INSERTs from
 * back-to-back --from-plan runs.
 *
 * @param {string} hash - SHA256 hex digest from computePlanContentHash()
 * @returns {Promise<{sd_key:string,title:string,status:string,id:string}|null>}
 */
export async function findRecentSDByPlanHash(hash) {
  if (!hash) return null;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, created_at')
    .eq('metadata->>plan_content_hash', hash)
    .gte('created_at', cutoff)
    .not('status', 'in', '(cancelled,archived)')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn(`   ⚠️  duplicate-guard query failed: ${error.message} — proceeding without guard`);
    return null;
  }
  return (data && data.length > 0) ? data[0] : null;
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
export async function createFromPlan(planPath = null, skipConfirmation = false, overrides = {}) {
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
      // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
      return { ok: false, error: 'No plan file found', exitCode: 1 };
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
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `Failed to read plan file: ${targetPath}`, exitCode: 1 };
  }

  const parsed = parsePlanFile(content);

  // Apply overrides from --type, --title, --priority flags. Explicit plan-file ## Type header
  // (parsed.type) already won over inferSDType in parsePlanFile; --type overrides that further.
  const priorityFromPlan = parsed.priority;
  if (overrides.typeOverride) {
    console.log(`   Type override: ${overrides.typeOverride} (was: ${parsed.type})`);
    parsed.type = overrides.typeOverride;
  }
  if (overrides.titleOverride) {
    console.log(`   Title override: ${overrides.titleOverride} (was: ${parsed.title})`);
    parsed.title = overrides.titleOverride;
  }
  if (overrides.priorityOverride) {
    console.log(`   Priority override: ${overrides.priorityOverride} (was: ${parsed.priority ?? 'default/medium'})`);
    parsed.priority = overrides.priorityOverride;
  }

  // Determine priority source label for display. priorityFromPlan is the raw plan-file value
  // (before any --priority override). parsed.priority is the final value that will be passed to createSD.
  const prioritySource = overrides.priorityOverride ? 'override' : (priorityFromPlan ? 'from plan' : 'default');
  const priorityDisplay = parsed.priority ?? 'medium';

  // Show parsed summary
  console.log('\n   ═══════════════════════════════════════════');
  console.log('   PLAN SUMMARY');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Title: ${parsed.title || '(untitled)'}`);
  // Type source is independent — re-derive to avoid coupling with priority detection.
  const typeLabel = overrides.typeOverride ? ' (override)' : (parsed.type && priorityFromPlan !== undefined ? ' (from plan or inferred)' : ' (inferred)');
  console.log(`   Type${typeLabel}: ${parsed.type}`);
  console.log(`   Priority (${prioritySource}): ${priorityDisplay}`);
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
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: 'Plan file must have a title (# Plan: Title or # Title)', exitCode: 1 };
  }

  // Step 5: Generate SD key
  // Protocol files (CLAUDE_CORE.md, CLAUDE_LEAD.md) must be read before SD creation
  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, parsed.type);

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

  // Step 8: Build success criteria — prefer ## Acceptance/## Success bullets (FR-1) over step-derived
  // SD-LEO-INFRA-AUTO-GENERATED-PRD-001: track which plan sections were absent so FR-3
  // ENRICHMENT_WARNING can name the fields that will be default-filled downstream.
  const planFieldsAbsent = [];
  let successCriteria;
  if (parsed.successCriteria && parsed.successCriteria.length > 0) {
    successCriteria = parsed.successCriteria.map(c => typeof c === 'string' ? c : c.criterion);
  } else {
    if (parsed.successCriteria === null) planFieldsAbsent.push('success_criteria');
    successCriteria = formatStepsAsCriteria(parsed.steps, 10);
    if (successCriteria.length === 0) {
      // Use default if no steps found
      successCriteria.push('All implementation items from plan are complete');
      successCriteria.push('Code passes lint and type checks');
      successCriteria.push('PR reviewed and approved');
    }
  }

  // Step 9: Build key_changes from parsed data (null = plan silent, [] = present-but-empty)
  if (parsed.keyChanges === null) planFieldsAbsent.push('key_changes');
  const keyChanges = (parsed.keyChanges ?? []).map(kc => ({
    change: kc.change,
    impact: kc.impact
  }));

  // Step 10: Build strategic_objectives from parsed data
  if (parsed.strategicObjectives === null) planFieldsAbsent.push('strategic_objectives');
  const strategicObjectives = (parsed.strategicObjectives ?? []).map(obj => ({
    objective: obj.objective,
    metric: obj.metric
  }));

  // Step 11: Build risks from parsed data
  if (parsed.risks === null) planFieldsAbsent.push('risks');
  const risks = (parsed.risks ?? []).map(r => ({
    risk: r.risk,
    severity: r.severity || 'medium',
    mitigation: r.mitigation || 'Address during implementation'
  }));

  // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): build the four newly-extractable fields
  // from parsed.* and pass them through createOptions. Each is null when the plan omitted
  // the section, so createSD's fallthrough applies buildDefault*/inline-default (and warns,
  // FR-4) — preserving current behavior for plans that lack these sections.
  // success_metrics + smoke_test_steps are gate-relevant (SUCCESS_METRICS_PLACEHOLDER_VALUE /
  // SMOKE_TEST_SPECIFICATION); key_principles + scope are non-gating enrichment.
  const successMetrics = (parsed.successMetrics ?? []);
  const smokeTestSteps = (parsed.smokeTestSteps ?? []);
  const keyPrinciples = (parsed.keyPrinciples ?? []);
  const planScope = parsed.planScope || null;

  // QF-20260509-LEO-CREATE-PLAN-DUP-GUARD (closes feedback 082b421c).
  // Compute SHA256 of the (whitespace-normalized) plan content. We use the
  // hash for both (i) provenance metadata and (ii) the duplicate-detection
  // query a few lines down — same plan run twice within 24h ⇒ refuse, unless
  // --force-create overrides. Catches the LEO-FEAT-* / LEO-FIX-* duplicate
  // pair that landed when the auto-classifier picked different sd_types on
  // back-to-back runs of the same plan file.
  const planContentHash = computePlanContentHash(parsed.fullContent);

  // Step 12: Create SD with all extracted fields.
  // Pass priority through so plan authored `## Priority` and --priority CLI overrides reach the DB.
  // When parsed.priority is null (no header, no override), omit the field so createSD's default ('medium') applies.
  const createOptions = {
    sdKey,
    title: parsed.title,
    description: parsed.summary || parsed.title,
    type: parsed.type,
    rationale: 'Created from Claude Code plan file',
    success_criteria: successCriteria,
    strategic_objectives: strategicObjectives.length > 0 ? strategicObjectives : null,
    // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): pass scope and key_changes through createOptions
    // so createSD INSERTs them atomically — no UPDATE-after-INSERT race, and detector at the buildDefault* call site sees rich content.
    // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): an explicit `## Scope` section wins over the
    // file-table/summary-derived scope; falls back to the prior value when the plan omits it.
    scope: planScope || scope || null,
    key_changes: keyChanges.length > 0 ? keyChanges : null,
    // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): newly-extractable fields — null when absent so
    // createSD applies buildDefault*/inline-default and emits the FR-4 section-named warning.
    success_metrics: successMetrics.length > 0 ? successMetrics : null,
    smoke_test_steps: smokeTestSteps.length > 0 ? smokeTestSteps : null,
    key_principles: keyPrinciples.length > 0 ? keyPrinciples : null,
    metadata: {
      source: 'plan',
      plan_content: parsed.fullContent,
      plan_content_hash: planContentHash,
      plan_file_path: archiveResult.archivedPath || null,
      original_plan_path: originalPath,
      files_to_modify: parsed.files,
      steps_count: parsed.steps.length,
      files_count: parsed.files.length,
      auto_detected: wasAutoDetected,
      // SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-3): provenance for createSD's
      // ENRICHMENT_WARNING composer; pruned before DB insert.
      _planFieldsAbsent: planFieldsAbsent,
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.targetRepos ? { target_repos: overrides.targetRepos } : {}),
      // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): tag-at-the-door linkage stamp. Uses the
      // real waves-as-gates proposal (overrides.waveDisposition) when the plan carried one,
      // else classifies by key/venture — never a free-text guess.
      plan_linkage: classifyPlanLinkage({ sdKey, waveDisposition: overrides.waveDisposition || null })
    }
  };
  if (parsed.priority) createOptions.priority = parsed.priority;
  // SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (FR-2): thread --wave/--no-wave through to
  // createSD's orchestrator gate (which throws when an orchestrator parent
  // arrives without a disposition).
  if (overrides.waveDisposition) createOptions.wave_disposition = overrides.waveDisposition;
  // 7f0a4f54: explicit `## Target Application` plan header takes precedence
  // over detectFromKeyChanges file-path inference. Without this, plans that
  // literally name the target still landed under the path-detector's default.
  // CLI --target-application override (if added later) would slot in via
  // overrides.targetApplicationOverride above this line, before parsed.
  if (parsed.targetApplication) {
    createOptions.target_application = parsed.targetApplication;
  }

  // Pre-INSERT duplicate guard (QF-20260509-LEO-CREATE-PLAN-DUP-GUARD).
  // Same plan content within last 24h ⇒ refuse unless --force-create.
  if (!overrides.forceCreate) {
    const dup = await findRecentSDByPlanHash(planContentHash);
    if (dup) {
      console.error(`\n❌ Duplicate plan detected: SD ${dup.sd_key} (${dup.status}) was created from the same plan content within the last 24h.`);
      console.error(`   Title: ${dup.title}`);
      console.error('   To create another SD anyway, re-run with --force-create.');
      console.error('   Otherwise, edit the existing SD or cancel it first (npm run sd:cancel).');
      // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
      return { ok: false, error: `Duplicate plan detected: SD ${dup.sd_key} (${dup.status}) was created from the same plan content within the last 24h.`, exitCode: 1 };
    }
  }

  const sd = await createSD(createOptions);

  // Step 13: Update additional fields that aren't in createSD signature.
  // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): scope and key_changes now flow through createOptions
  // so they're INSERTed atomically — only `risks` remains for post-INSERT UPDATE.
  const additionalUpdates = {};
  if (risks.length > 0) additionalUpdates.risks = risks;

  if (Object.keys(additionalUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update(additionalUpdates)
      .eq('id', sd.id);

    if (updateError) {
      console.warn(`   ⚠️  Could not update additional fields: ${updateError.message}`);
    } else {
      console.log('   ✅ Updated: risks');
    }
  }

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: { planPath, skipConfirmation, overrides }.
 */
export async function toDraft(input, _deps = {}) {
  const { planPath = null, skipConfirmation = false, overrides = {} } = input || {};
  return createFromPlan(planPath, skipConfirmation, overrides);
}
