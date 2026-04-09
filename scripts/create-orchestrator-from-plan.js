#!/usr/bin/env node

/**
 * Orchestrator + Children Creator from Vision/Architecture Plans
 *
 * Creates an orchestrator SD with children derived from architecture plan
 * implementation phases. Propagates vision_key and arch_key to all SDs,
 * injects traceable success metrics, and scores at conception.
 *
 * Usage:
 *   node scripts/create-orchestrator-from-plan.js \
 *     --vision-key VISION-EHG-L2-001 \
 *     --arch-key ARCH-EHG-001 \
 *     --title "Orchestrator Title" \
 *     [--auto-children]
 *     [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { inheritStrategicFields, inferSDType } from './modules/child-sd-template.js';
import { generateTraceableMetrics, mapDimensionsToPhases } from './modules/vision-arch-traceability.js';
import { scoreSDAtConception } from './leo-create-sd.js';

dotenv.config();

// QF-20260409-561 (P0): DB-authoritative sd_type list (mirrors sd_type_check constraint).
const DB_VALID_SD_TYPES = ['feature','implementation','infrastructure','bugfix','refactor','documentation','orchestrator','database','security','performance','enhancement','docs','discovery_spike','ux_debt','uat'];

/**
 * Parse architecture plan content for implementation phases.
 */
function parsePhases(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const phases = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^#{1,4}\s*(Phase|Implementation Phase|Step)\s+(\d+)[:\s-]*(.*)/i);
    if (match) {
      if (current) phases.push(current);
      current = {
        number: parseInt(match[2], 10),
        title: match[3].trim() || `Phase ${match[2]}`,
        description: '',
        content: ''
      };
      continue;
    }

    if (current) {
      current.content += line + '\n';
      // First non-empty, non-header line becomes description
      if (!current.description && line.trim() && !line.startsWith('#')) {
        current.description = line.trim();
      }
    }
  }

  if (current) phases.push(current);
  return phases;
}

/**
 * Generate an SD key from title and type.
 */
function generateSDKey(title, suffix = '') {
  const words = title.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const abbreviated = words.slice(0, 4).map(w => w.toUpperCase()).join('-');
  return `SD-${abbreviated}${suffix}-001`;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse CLI args
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const visionKey = getArg('--vision-key');
  const archKey = getArg('--arch-key');
  const title = getArg('--title');
  const autoChildren = args.includes('--auto-children');
  const dryRun = args.includes('--dry-run');

  if (!visionKey && !archKey) {
    console.error('Error: At least one of --vision-key or --arch-key is required');
    process.exit(1);
  }
  if (!title) {
    console.error('Error: --title is required');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🏗️  Creating Orchestrator from Vision/Architecture Plan');
  console.log('═'.repeat(60));
  console.log(`   Title: ${title}`);
  console.log(`   Vision Key: ${visionKey || 'N/A'}`);
  console.log(`   Arch Key: ${archKey || 'N/A'}`);
  console.log(`   Auto-Children: ${autoChildren}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');

  // Load architecture plan for phase extraction
  let phases = [];
  let archPlan = null;
  if (archKey) {
    const { data, error } = await supabase
      .from('eva_architecture_plans')
      .select('plan_key, content, sections, extracted_dimensions')
      .eq('plan_key', archKey)
      .single();

    if (error || !data) {
      console.error(`Error: Architecture plan '${archKey}' not found: ${error?.message || 'no record'}`);
      process.exit(1);
    }
    archPlan = data;
    // Prefer structured phases from JSONB sections (used by phase coverage gate)
    // Fall back to markdown parsing for legacy plans without structured sections
    const structuredPhases = data.sections?.implementation_phases;
    if (structuredPhases && Array.isArray(structuredPhases) && structuredPhases.length > 0) {
      phases = structuredPhases;
      console.log(`   📋 Found ${phases.length} structured phase(s) in sections.implementation_phases`);
    } else {
      phases = parsePhases(data.content);
      console.log(`   📋 Found ${phases.length} phase(s) parsed from architecture plan content`);
    }
  }

  // Load vision document
  let visionDoc = null;
  if (visionKey) {
    const { data, error } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, extracted_dimensions')
      .eq('vision_key', visionKey)
      .single();

    if (error || !data) {
      console.warn(`   ⚠️  Vision document '${visionKey}' not found: ${error?.message || 'no record'}`);
    } else {
      visionDoc = data;
      console.log(`   📄 Vision document loaded: ${visionDoc.extracted_dimensions?.length || 0} dimensions`);
    }
  }

  // Generate traceable metrics
  const { visionMetrics, archMetrics } = await generateTraceableMetrics(
    supabase, visionKey, archKey
  );
  const allMetrics = [...visionMetrics, ...archMetrics];
  console.log(`   📊 Generated ${allMetrics.length} traceable success metric(s)`);

  // Create orchestrator SD
  let orchestratorId = randomUUID();
  const orchestratorKey = generateSDKey(title, '-ORCH');
  let orchestratorAlreadyExists = false;

  // QF-20260409-561 (P2): Idempotency pre-check — resume partial prior runs instead of colliding.
  if (!dryRun) {
    const { data: existingOrch } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata')
      .eq('sd_key', orchestratorKey)
      .maybeSingle();
    if (existingOrch) {
      if (existingOrch.metadata?.vision_key !== visionKey || existingOrch.metadata?.arch_key !== archKey) {
        console.error(`\n❌ Key collision: ${orchestratorKey} exists with different vision/arch. Clean up or rename.`);
        process.exit(1);
      }
      console.log(`\n   ♻️  Resuming existing orchestrator: ${orchestratorKey}`);
      orchestratorId = existingOrch.id;
      orchestratorAlreadyExists = true;
    }
  }

  // Build strategic objectives from phases
  const strategicObjectives = phases.map(p => `Phase ${p.number}: ${p.title}`);
  if (strategicObjectives.length === 0) {
    strategicObjectives.push(title);
  }

  // Build success criteria from traceable metrics
  const successCriteria = allMetrics.slice(0, 5).map(m => m.metric);
  if (successCriteria.length === 0) {
    successCriteria.push(`All implementation phases completed for ${title}`);
  }

  const orchestratorSD = {
    id: orchestratorId,
    sd_key: orchestratorKey,
    title,
    description: `Orchestrator for ${title}. Created from vision/architecture plan.`,
    sd_type: 'orchestrator',
    category: 'feature',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'high',
    scope: `Orchestrator coordinating ${phases.length} implementation phase(s)`,
    rationale: `Auto-generated from vision (${visionKey || 'N/A'}) and architecture (${archKey || 'N/A'}) plans`,
    success_metrics: allMetrics,
    key_principles: ['Follow LEO Protocol for all changes', 'Ensure backward compatibility'],
    strategic_objectives: strategicObjectives,
    success_criteria: successCriteria,
    implementation_guidelines: [],
    dependencies: [],
    risks: [],
    stakeholders: [],
    metadata: {
      is_orchestrator: true,
      vision_key: visionKey,
      arch_key: archKey,
      auto_generated: true,
      child_count: phases.length
    },
    key_changes: phases.map(p => `Phase ${p.number}: ${p.title}`),
    target_application: 'EHG_Engineer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (dryRun) {
    console.log('\n📋 DRY RUN — Orchestrator SD:');
    console.log(JSON.stringify(orchestratorSD, null, 2));
  } else if (!orchestratorAlreadyExists) {
    // QF-20260409-561 (P2): Only insert if not already present (idempotency).
    const { error: orchError } = await supabase
      .from('strategic_directives_v2')
      .insert(orchestratorSD);

    if (orchError) {
      console.error(`Error creating orchestrator: ${orchError.message}`);
      process.exit(1);
    }
    console.log(`\n   ✅ Orchestrator created: ${orchestratorKey} (${orchestratorId})`);
  }

  // Create children from phases
  if (phases.length > 0 && (autoChildren || !archPlan)) {
    console.log(`\n📦 Creating ${phases.length} child SD(s)...`);
    console.log('-'.repeat(40));

    // Map dimensions to phases for targeted metrics
    const allDimensions = [
      ...(visionDoc?.extracted_dimensions || []),
      ...(archPlan?.extracted_dimensions || [])
    ];
    const dimensionMap = mapDimensionsToPhases(allDimensions, phases);

    for (const phase of phases) {
      // FR-002: Skip phases that already have an existing SD
      if (phase.covered_by_sd_key) {
        const { data: existingSd } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, status')
          .eq('sd_key', phase.covered_by_sd_key)
          .single();

        if (existingSd) {
          console.log(`   ⏭️  Skip Phase ${phase.number}: ${phase.title} — covered by ${existingSd.sd_key} (${existingSd.status})`);
          continue;
        }
        console.log(`   ⚠️  Phase ${phase.number}: covered_by_sd_key=${phase.covered_by_sd_key} not found — creating new SD`);
      }

      const childId = randomUUID();
      const suffix = `-${String.fromCharCode(64 + phase.number)}`; // -A, -B, -C...
      const childKey = `${orchestratorKey}${suffix}`;
      // FR-004: Handle separate_orchestrator phases (no parent, orchestrator type)
      const isSeparateOrchestrator = phase.child_designation === 'separate_orchestrator';
      const typeResult = inferSDType(phase.title, phase.description || '', phase.content || '');
      let childType = isSeparateOrchestrator ? 'orchestrator' : (typeof typeResult === 'string' ? typeResult : (typeResult?.sdType || 'feature'));
      // QF-20260409-561 (P0): Validate against sd_type_check constraint; fall back to 'implementation'.
      if (!DB_VALID_SD_TYPES.includes(childType)) { console.warn(`   ⚠️  Phase ${phase.number}: '${childType}' invalid → 'implementation'`); childType = 'implementation'; }

      // Inherit strategic fields from orchestrator
      const inherited = inheritStrategicFields(orchestratorSD, {
        phaseNumber: phase.number,
        phaseTitle: phase.title,
        phaseObjective: phase.description
      });

      // Build phase-specific metrics from dimension mapping
      const phaseDims = dimensionMap.get(phases.indexOf(phase)) || [];
      const phaseMetrics = phaseDims.map(dim => ({
        metric: `${dim.name} implementation`,
        target: '>=90%',
        measurement: 'Dimension coverage',
        source: `${archKey || visionKey}:${dim.name}`,
        traceability: archKey ? 'arch_dimension' : 'vision_dimension'
      }));

      const childSD = {
        id: childId,
        sd_key: childKey,
        title: `Phase ${phase.number}: ${phase.title}`,
        description: phase.description || phase.content?.trim().slice(0, 2000) || `Phase ${phase.number}: ${phase.title}`,
        sd_type: childType,
        category: orchestratorSD.category,
        status: 'draft',
        current_phase: 'LEAD_APPROVAL',
        priority: orchestratorSD.priority,
        parent_sd_id: isSeparateOrchestrator ? null : orchestratorId,
        scope: phase.content?.trim().slice(0, 2000) || phase.description || '',
        rationale: phase.description
          ? `${phase.description.slice(0, 500)}${phase.description.length > 500 ? '...' : ''}`
          : `Phase ${phase.number} of ${title}: ${phase.title}`,
        success_metrics: phaseMetrics.length > 0 ? phaseMetrics : inherited.success_metrics || [],
        key_principles: inherited.key_principles?.length > 0 ? inherited.key_principles : orchestratorSD.key_principles,
        strategic_objectives: inherited.strategic_objectives?.length > 0 ? inherited.strategic_objectives : [`Phase ${phase.number}: ${phase.title}`],
        success_criteria: inherited.success_criteria?.length > 0 ? inherited.success_criteria : [`Phase ${phase.number} deliverables completed`],
        implementation_guidelines: [],
        dependencies: [],
        risks: inherited.risks || [],
        stakeholders: [],
        target_application: 'EHG_Engineer',
        metadata: {
          vision_key: visionKey,
          arch_key: archKey,
          phase_number: phase.number,
          parent_orchestrator: orchestratorKey,
          auto_generated: true
        },
        key_changes: [phase.title],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (dryRun) {
        console.log(`\n   📋 DRY RUN — Child ${childKey}:`);
        console.log(`      Type: ${childType}, Metrics: ${phaseMetrics.length}`);
      } else {
        const { error: childError } = await supabase
          .from('strategic_directives_v2')
          .insert(childSD);

        if (childError) {
          console.error(`   ❌ Error creating child ${childKey}: ${childError.message}`);
        } else {
          console.log(`   ✅ Child ${childKey}: ${phase.title} (type: ${childType}${isSeparateOrchestrator ? ', separate orchestrator' : ''})`);

          // FR-001: Update covered_by_sd_key in architecture plan sections
          if (archKey && archPlan?.sections?.implementation_phases) {
            try {
              const updatedPhases = [...archPlan.sections.implementation_phases];
              const phaseIdx = updatedPhases.findIndex(p => p.number === phase.number);
              if (phaseIdx !== -1) {
                updatedPhases[phaseIdx] = { ...updatedPhases[phaseIdx], covered_by_sd_key: childKey };
                archPlan.sections = { ...archPlan.sections, implementation_phases: updatedPhases };
                await supabase
                  .from('eva_architecture_plans')
                  .update({ sections: archPlan.sections })
                  .eq('plan_key', archKey);
              }
            } catch (linkErr) {
              console.warn(`   ⚠️  Failed to link Phase ${phase.number} → ${childKey}: ${linkErr.message}`);
            }
          }
        }
      }
    }
  } else if (phases.length > 0) {
    console.log(`\n   ℹ️  ${phases.length} phases found but --auto-children not specified`);
    console.log('   Run with --auto-children to create child SDs automatically');
  }

  // Score orchestrator at conception
  if (!dryRun) {
    console.log('\n📊 Scoring orchestrator at conception...');
    try {
      await scoreSDAtConception(orchestratorKey, title, orchestratorSD.description, supabase, {
        visionKey,
        archKey
      });
      console.log('   ✅ Conception score recorded');
    } catch (err) {
      console.warn(`   ⚠️  Conception scoring failed (non-fatal): ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Orchestrator creation complete');
  console.log(`   Key: ${orchestratorKey}`);
  console.log(`   Children: ${phases.length}`);
  if (!dryRun) {
    console.log(`\n   Next: node scripts/handoff.js execute LEAD-TO-PLAN ${orchestratorKey}`);
  }
}

// Only run CLI when invoked directly
const _isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1]?.replace(/\\\\/g, '/')}` ||
                      import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (_isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { parsePhases, generateSDKey };
