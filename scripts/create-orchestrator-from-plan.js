#!/usr/bin/env node

/**
 * Orchestrator + Children Creator from Vision/Architecture Plans (CLI wrapper).
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-A
 *
 * Thin CLI shim over lib/eva/create-orchestrator-from-plan.js.
 * Backwards-compatible flags: --vision-key, --arch-key, --title, --auto-children,
 * --dry-run, --target-repos.
 *
 * parsePhases is re-exported here so existing dynamic-import call sites
 * (lib/eva/archplan-upsert.js:63) keep working without code changes.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateTraceableMetrics, mapDimensionsToPhases } from './modules/vision-arch-traceability.js';
import { scoreSDAtConception, parseTargetReposArg } from './leo-create-sd.js';
import {
  buildOrchestratorSD,
  buildChildSD,
  insertCascade,
  parsePhases,
  withTargetRepos,
} from '../lib/eva/create-orchestrator-from-plan.js';

dotenv.config();

export { parsePhases, withTargetRepos };

async function resolveTargetApplication(supabase, visionDoc) {
  if (visionDoc?.venture_id) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('name')
      .eq('id', visionDoc.venture_id)
      .maybeSingle();
    if (venture?.name) return venture.name;
  }
  return 'EHG_Engineer';
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const visionKey = getArg('--vision-key');
  const archKey = getArg('--arch-key');
  const title = getArg('--title');
  const autoChildren = args.includes('--auto-children');
  const dryRun = args.includes('--dry-run');
  const targetRepos = parseTargetReposArg(getArg('--target-repos'));
  const targetApplicationOverride = getArg('--target-application');

  if (!visionKey && !archKey) {
    console.error('Error: At least one of --vision-key or --arch-key is required');
    process.exit(1);
  }
  if (!title) {
    console.error('Error: --title is required');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log('🏗️  Creating Orchestrator from Vision/Architecture Plan');
  console.log('═'.repeat(60));
  console.log(`   Title: ${title}`);
  console.log(`   Vision Key: ${visionKey || 'N/A'}`);
  console.log(`   Arch Key: ${archKey || 'N/A'}`);
  console.log(`   Auto-Children: ${autoChildren}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');

  // Load archplan
  let phases = [];
  let archPlan = null;
  if (archKey) {
    const { data, error } = await supabase
      .from('eva_architecture_plans')
      .select('plan_key, content, sections, extracted_dimensions, venture_id')
      .eq('plan_key', archKey)
      .single();
    if (error || !data) {
      console.error(`Error: Architecture plan '${archKey}' not found: ${error?.message || 'no record'}`);
      process.exit(1);
    }
    archPlan = data;
    const structured = data.sections?.implementation_phases;
    if (structured && Array.isArray(structured) && structured.length > 0) {
      phases = structured;
      console.log(`   📋 Found ${phases.length} structured phase(s) in sections.implementation_phases`);
    } else {
      phases = parsePhases(data.content);
      console.log(`   📋 Found ${phases.length} phase(s) parsed from architecture plan content`);
    }
  }

  // Load vision
  let visionDoc = null;
  if (visionKey) {
    const { data, error } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, extracted_dimensions, venture_id')
      .eq('vision_key', visionKey)
      .single();
    if (error || !data) {
      console.warn(`   ⚠️  Vision document '${visionKey}' not found: ${error?.message || 'no record'}`);
    } else {
      visionDoc = data;
      console.log(`   📄 Vision document loaded: ${visionDoc.extracted_dimensions?.length || 0} dimensions`);
    }
  }

  // F3 fix: derive target_application from venture instead of hardcoding 'EHG_Engineer'
  const targetApplication = targetApplicationOverride
    || await resolveTargetApplication(supabase, visionDoc);
  console.log(`   🎯 Target application: ${targetApplication}`);

  // Generate traceable metrics
  const { visionMetrics, archMetrics } = await generateTraceableMetrics(supabase, visionKey, archKey);
  const allMetrics = [...visionMetrics, ...archMetrics];
  console.log(`   📊 Generated ${allMetrics.length} traceable success metric(s)`);

  // Build orchestrator record (pure)
  const { record: orchestratorRecord, key: orchestratorKey } = buildOrchestratorSD({
    visionDoc, archPlan, phases, traceableMetrics: allMetrics, title,
    targetApplication, targetRepos, visionKey, archKey,
  });

  // Build child records (pure)
  let childRecords = [];
  let dimensionMap = null;
  if (phases.length > 0 && (autoChildren || !archPlan)) {
    const allDimensions = [
      ...(visionDoc?.extracted_dimensions || []),
      ...(archPlan?.extracted_dimensions || []),
    ];
    dimensionMap = mapDimensionsToPhases(allDimensions, phases);

    for (const phase of phases) {
      // Skip phases already covered (covered_by_sd_key check happens here at CLI level since
      // it requires a DB lookup — pure builder cannot do that)
      if (phase.covered_by_sd_key) {
        const { data: existingSd } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, status')
          .eq('sd_key', phase.covered_by_sd_key)
          .maybeSingle();
        if (existingSd) {
          console.log(`   ⏭️  Skip Phase ${phase.number}: covered by ${existingSd.sd_key} (${existingSd.status})`);
          continue;
        }
      }
      const { record: childRecord } = buildChildSD({
        phase, orchestratorRecord, orchestratorKey, orchestratorId: orchestratorRecord.id,
        dimensionMap, targetApplication, targetRepos,
      });
      childRecords.push(childRecord);
    }
  } else if (phases.length > 0) {
    console.log(`\n   ℹ️  ${phases.length} phases found but --auto-children not specified`);
  }

  // Persist via insertCascade (DB)
  if (dryRun) {
    console.log('\n📋 DRY RUN — Orchestrator SD:');
    console.log(JSON.stringify(orchestratorRecord, null, 2));
    for (const c of childRecords) console.log(`\n   📋 DRY RUN — Child ${c.sd_key} (type: ${c.sd_type})`);
  } else {
    const result = await insertCascade({ supabase, orchestratorRecord, childRecords, archPlan, logger: console });
    if (result.errors.length > 0) {
      console.error('\n⚠️  Cascade had errors:');
      for (const e of result.errors) console.error(`   - [${e.stage}] ${e.error}`);
      if (result.errors.some(e => e.stage === 'orchestrator')) process.exit(1);
    }
    if (result.orchestrator && !result.orchestrator._dry_run) {
      console.log('\n📊 Scoring orchestrator at conception...');
      try {
        await scoreSDAtConception(orchestratorKey, title, orchestratorRecord.description, supabase, { visionKey, archKey });
        console.log('   ✅ Conception score recorded');
      } catch (err) {
        console.warn(`   ⚠️  Conception scoring failed (non-fatal): ${err.message}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Orchestrator creation complete');
  console.log(`   Key: ${orchestratorKey}`);
  console.log(`   Children: ${childRecords.length}`);
  if (!dryRun) {
    console.log(`\n   Next: node scripts/handoff.js execute LEAD-TO-PLAN ${orchestratorKey}`);
  }
}

const _isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1]?.replace(/\\\\/g, '/')}` ||
                      import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (_isMainModule) {
  main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
}
