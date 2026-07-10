/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: direct-args creation lane (`<source> <type> "<title>"`),
 * moved VERBATIM from the else-branch of main() in scripts/leo-create-sd.js. Lives under
 * scripts/ — this is CLI-side lane code (argv-coupled Phase-0 gates, rubric routing,
 * orchestrator auto-route exec) whose informational early-exits stay process.exit calls.
 * Only the final createSD call site changed: it consumes the pipeline's {ok,...} result
 * and maps it back to the historical exit behavior.
 */
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { generateSDKey } from '../sd-key-generator.js';
import {
  checkGate,
  getArtifacts,
  getStatus as getPhase0Status
} from '../phase-0/leo-integration.js';
import { runTriageGate } from '../triage-gate.js';
import { evaluateVisionReadiness, formatRubricResult } from '../vision-readiness-rubric.js';
import { getVentureConfig } from '../../../lib/venture-resolver.js';
import { supabase } from '../../../lib/sd-creation/context.js';
import {
  enrichFromVisionArch,
  resolveVenturePrefix,
  createSD,
} from '../../../lib/sd-creation/pipeline.js';
import { parseTargetReposArg, buildOrchestratorCmd } from './target-repos.js';

/**
 * Run the direct creation lane: <source> <type> "<title>" [flags].
 * @param {string[]} args - full CLI argv slice (process.argv.slice(2))
 */
export async function runDirectCreation(args) {
  // Direct creation: <source> <type> "<title>"
  // Detect unknown flags to prevent silent corruption (SD-LEO-FIX-CREATE-ARGS-001)
  // QF-20260509-LEO-CREATE-FLAGS: --migration-reviewed / --security-reviewed / --yes / -y
  // are now valid in direct-args mode (closes 8a640d32 sibling-parity gap with --from-plan).
  const knownDirectFlags = new Set([
    '--venture', '--vision-key', '--arch-key', '--target-repos',
    '--migration-reviewed', '--security-reviewed', '--yes', '-y'
  ]);
  const unknownFlags = args.filter(a => a.startsWith('-') && !knownDirectFlags.has(a));
  if (unknownFlags.length > 0) {
    console.error('\n❌ Unknown flag(s): ' + unknownFlags.join(', '));
    console.error('   Direct creation supports: <source> <type> "<title>" [--venture <name>]');
    console.error('   Did you mean one of these?');
    console.error('     --from-plan [path] [--type <type>] [--title "<title>"]');
    console.error('     --from-feedback <id>');
    console.error('     --from-qf <QF-ID>');
    console.error('     --from-learn <pattern-id>');
    console.error('     --from-uat <test-id>');
    process.exit(1);
  }

  const [source, type, ...titleParts] = args;
  // Strip flags and their values from the title (SD-DISTILLTOBRAINSTORM quality fix)
  // Without this, --vision-key VALUE --arch-key VALUE leak into the title text
  const flagsWithValues = new Set(['--venture', '--vision-key', '--arch-key', '--target-repos']);
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
  const venturePrefix = await resolveVenturePrefix(cliVenture, type);

  // Parse --vision-key and --arch-key flags (SD-MAN-INFRA-AUTOMATE-BRAINSTORM-PIPELINE-002)
  const visionKeyIdx = args.indexOf('--vision-key');
  const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
  const archKeyIdx = args.indexOf('--arch-key');
  const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;
  // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo SDs
  const targetReposIdx = args.indexOf('--target-repos');
  const targetRepos = targetReposIdx !== -1 ? parseTargetReposArg(args[targetReposIdx + 1]) : null;

  // FR-003: Auto-route to orchestrator creator when arch key has phases
  // SD-FDBK-REFAC-LEO-CREATE-003-001: decision logic extracted to
  // scripts/modules/leo-create-sd/auto-route-decider.js. Layers A
  // (locked_decisions intent gate) and B (PR-staged disambiguator) prevent
  // misclassification of single-SD intent as orchestrator (witnessed on
  // SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001).
  if (visionKey && archKey) {
    let archPlan = null;
    let brainstormSession = null;
    try {
      const sb = createSupabaseServiceClient();
      const { data: archPlanData, error: archPlanErr } = await sb
        .from('eva_architecture_plans')
        .select('content, sections')
        .eq('plan_key', archKey)
        .single();
      if (archPlanErr) {
        if (archPlanErr.code === 'PGRST116') {
          // Not found: likely a typo in --arch-key. Warn, skip FR-003, continue.
          console.warn(`\n⚠️  archPlan not found for --arch-key='${archKey}', skipping FR-003 auto-route.`);
          console.warn('   Verify spelling, or omit --arch-key to skip the auto-route check.');
          archPlan = null;
        } else {
          throw archPlanErr;
        }
      } else {
        archPlan = archPlanData;
      }

      // Reverse-lookup the brainstorm session that authored this plan key.
      // Uses metadata->>plan_key (no FK exists; JSONB-only linkage). .limit(2)
      // so we can distinguish 0 / 1 / 2+ rows (conservative bias on ambiguity).
      if (archPlan) {
        const { data: bsRows } = await sb
          .from('brainstorm_sessions')
          .select('metadata')
          .eq('metadata->>plan_key', archKey)
          .limit(2);
        brainstormSession = Array.isArray(bsRows) && bsRows.length === 1 ? bsRows[0] : null;
      }
    } catch (routeErr) {
      // QF-20260409-561 (P1): Fail loud; silent fallback violated feedback_auto_decompose_sd_hierarchy.
      // SD-FDBK-REFAC-LEO-CREATE-003-001 FR-5: PGRST116 was already handled above.
      console.error(`\n❌ Orchestrator auto-routing FAILED: ${routeErr.message}`);
      console.error(`   Check orphans: SELECT sd_key FROM strategic_directives_v2 WHERE metadata->>'vision_key'='${visionKey}';`);
      console.error('   Clean via database-agent, then re-run (create-orchestrator-from-plan.js will resume).');
      process.exit(1);
    }

    const { shouldAutoRouteToOrchestrator } = await import('./auto-route-decider.js');
    const decision = shouldAutoRouteToOrchestrator({
      archPlan,
      brainstormSession,
      archKey,
      visionKey,
      title,
      options: { forceOrchestrator: args.includes('--force-orchestrator') },
    });

    // FR-4: emit a single structured telemetry line on every decision.
    console.log(`[AUTO-ROUTE-DECISION] ${JSON.stringify(decision.telemetry)}`);

    if (decision.route === 'orchestrator' && (decision.telemetry.structured_phase_count > 0 || decision.telemetry.content_phase_count >= 2)) {
      console.log(`\n🔄 Auto-routing to orchestrator creator (${decision.telemetry.structured_phase_count || decision.telemetry.content_phase_count} phases detected)...`);
      try {
        const { execSync } = await import('child_process');
        // QF-20260524-566 / feedback 0ee3c3b8 Bug 2: forward --target-repos so the
        // orchestrator + auto-created children inherit metadata.target_repos.
        const cmd = buildOrchestratorCmd({ visionKey, archKey, title, targetRepos });
        execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
        process.exit(0);
      } catch (execErr) {
        console.error(`\n❌ Orchestrator auto-routing FAILED: ${execErr.message}`);
        console.error(`   Check orphans: SELECT sd_key FROM strategic_directives_v2 WHERE metadata->>'vision_key'='${visionKey}';`);
        console.error('   Clean via database-agent, then re-run (create-orchestrator-from-plan.js will resume).');
        process.exit(1);
      }
    } else if (decision.route === 'single' && (decision.layer_a_signal !== 'absent' || decision.layer_b_signal !== 'absent')) {
      // FR-4 UX hint: explain the single-SD route + how to override.
      console.error('↪ Single-SD route taken. To force orchestrator: re-run with --force-orchestrator,');
      console.error('  or set LEO_AUTO_ROUTE_LAYER_A=off LEO_AUTO_ROUTE_LAYER_B=off to bypass both gates.');
    }
    // else: fall through to normal single-SD creation flow.

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
  // QF-20260509-171 (closes feedback 92ff36a1): refuse INSERT when a supplied
  // --vision-key/--arch-key resolves to no row in eva_vision_documents /
  // eva_architecture_plans. The metadata.vision_key/arch_key fields are an
  // FK-by-string, so an unresolved key would produce an orphan SD whose
  // strategic provenance LEAD evaluators cannot trace.
  const enrichResult = await enrichFromVisionArch(visionKey, archKey, supabase);
  if (enrichResult.missing.vision) {
    console.error(`\n❌ --vision-key '${visionKey}' not found in eva_vision_documents`);
    console.error('   Writing it to metadata would create an orphan FK-by-string with no source row.');
    console.error('   Verify the key, or omit --vision-key.\n');
    process.exit(1);
  }
  if (enrichResult.missing.arch) {
    console.error(`\n❌ --arch-key '${archKey}' not found in eva_architecture_plans`);
    console.error('   Writing it to metadata would create an orphan FK-by-string with no source row.');
    console.error('   Verify the key, or omit --arch-key.\n');
    process.exit(1);
  }
  const enriched = enrichResult.enriched;
  if (enriched) {
    console.log('✓ SD fields enriched from vision/architecture documents');
  }

  // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve target_application from --venture flag
  const ventureConfig = cliVenture ? getVentureConfig(cliVenture) : null;
  const targetApp = ventureConfig?.name || cliVenture || null;

  // QF-20260509-LEO-CREATE-FLAGS: honor --migration-reviewed / --security-reviewed
  // in direct-args mode (closes 8a640d32 sibling parity with --from-plan / --from-feedback).
  const directMigrationReviewed = args.includes('--migration-reviewed');
  const directSecurityReviewed = args.includes('--security-reviewed');

  const createRes = await createSD({
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
      ...(enriched?.scope && { scope: enriched.scope }),
      ...(targetRepos && { target_repos: targetRepos }),
      ...(directMigrationReviewed ? { migration_reviewed: true } : {}),
      ...(directSecurityReviewed ? { security_reviewed: true } : {})
    }
  });
  // SD-ARCH-HOTSPOT-LEO-CREATE-001: map the pipeline's {ok,...} result back to the
  // historical CLI behavior — done-results (QF-prefix redirect) exit 0 at the site,
  // guardrail/cascade violations exit 1 at the site, and an insert failure re-throws
  // so main()'s catch prints the historical "Error: ..." line and exits 1.
  if (createRes.ok === true && createRes.done === true) process.exit(createRes.exitCode ?? 0);
  if (createRes.ok === false) {
    if (createRes.code === 'INSERT_FAILED') throw new Error(createRes.error);
    process.exit(createRes.exitCode ?? 1);
  }
  return createRes.sd;
}
