/**
 * Smoke Test Evidence Gate for PLAN-TO-LEAD
 *
 * Validates that architecture plans for pipeline/integration SDs include
 * evidence of runtime observation BEFORE the architecture was written.
 *
 * Rationale: SD-LEO-INFRA-EVA-STAGE-PIPELINE-002 fixed 6 downstream issues
 * but missed the root cause (loadStageTemplate queries a non-existent table)
 * because nobody ran the pipeline before writing the architecture.
 *
 * BLOCKING gate for pipeline/integration SDs.
 * Auto-passes for SDs without architecture plans or non-pipeline SDs.
 */

const PIPELINE_KEYWORDS = [
  'pipeline', 'orchestrat', 'stage-execution', 'stage_execution',
  'eva-orchestrator', 'reality-gate', 'reality_gate', 'lifecycle',
  'venture_artifact', 'venture-artifact', 'stage-template',
  'golden-nugget', 'sd-bridge', 'handoff-system',
];

const SMOKE_TEST_EVIDENCE_PATTERNS = [
  // Section headers indicating runtime observation
  /##\s*(smoke\s*test|baseline\s*observation|runtime\s*observation|current\s*behavior|actual\s*output|observed\s*behavior)/i,
  // Log output patterns (actual runtime evidence)
  /```[\s\S]*?\[(eva|worker|statemachine|orchestrator)\][\s\S]*?```/i,
  // Explicit evidence markers
  /smoke.?test.?evidence/i,
  /runtime.?observation/i,
  /baseline.?output/i,
  /observed.?at.?runtime/i,
  /ran\s+(the\s+)?(pipeline|stage|test|script)\s+(and|to)\s+(see|observe|capture|verify)/i,
];

/**
 * Detect if an SD is pipeline/integration work based on title, key, and tags.
 * Excludes /learn SDs (SD-LEARN-*) that merely reference pipeline patterns
 * in their description but are process-improvement SDs, not pipeline implementations.
 */
function isPipelineSD(sd) {
  const sdKey = (sd.sd_key || '').toUpperCase();

  // /learn SDs address process patterns, not pipeline implementation
  if (sdKey.startsWith('SD-LEARN-')) return false;

  const searchText = [
    sd.sd_key || '',
    sd.title || '',
    sd.description || '',
    ...(sd.tags || []),
  ].join(' ').toLowerCase();

  return PIPELINE_KEYWORDS.some(kw => searchText.includes(kw));
}

/**
 * Check if architecture plan content contains smoke test evidence.
 */
function hasRuntimeEvidence(content) {
  if (!content || typeof content !== 'string') return { found: false, matches: [] };

  const matches = [];
  for (const pattern of SMOKE_TEST_EVIDENCE_PATTERNS) {
    if (pattern.test(content)) {
      matches.push(pattern.source.substring(0, 60));
    }
  }

  return { found: matches.length > 0, matches };
}

export function createSmokeTestEvidenceGate(supabase) {
  return {
    name: 'SMOKE_TEST_EVIDENCE',
    validator: async (ctx) => {
      console.log('\n🔬 SMOKE TEST EVIDENCE GATE');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sd = ctx.sd || {};

      // ORCHESTRATOR BYPASS — orchestrators validate via children
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Orchestrator SD (${childSDs.length} children) — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Orchestrator SD — smoke test deferred to children'],
          details: { is_orchestrator: true },
        };
      }

      // NON-PIPELINE SD BYPASS
      if (!isPipelineSD(sd)) {
        console.log('   ℹ️  Not a pipeline/integration SD — gate not applicable');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [],
          details: { is_pipeline_sd: false },
        };
      }

      console.log('   📋 Pipeline/integration SD detected');

      // Fetch architecture plan
      const metadata = sd.metadata || {};
      const archKey = metadata.arch_key;

      if (!archKey) {
        console.log('   ⚠️  No arch_key in SD metadata — cannot validate smoke test');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['Pipeline SD has no architecture plan — smoke test evidence not checked'],
          details: { has_arch_key: false, is_pipeline_sd: true },
        };
      }

      const { data: archPlan } = await supabase
        .from('eva_architecture_plans')
        .select('plan_key, content, sections')
        .eq('plan_key', archKey)
        .single();

      if (!archPlan) {
        console.log(`   ⚠️  Architecture plan '${archKey}' not found`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: [`Architecture plan '${archKey}' not found — smoke test not checked`],
          details: { arch_key: archKey, plan_found: false },
        };
      }

      // Check content for runtime observation evidence
      const evidence = hasRuntimeEvidence(archPlan.content);

      // Also check sections if available
      let sectionEvidence = false;
      if (archPlan.sections && Array.isArray(archPlan.sections)) {
        sectionEvidence = archPlan.sections.some(s =>
          /smoke.?test|baseline.?observation|runtime|observed/i.test(s.title || s.heading || '')
        );
      }

      const hasEvidence = evidence.found || sectionEvidence;

      if (hasEvidence) {
        console.log('   ✅ Runtime observation evidence found in architecture plan');
        if (evidence.matches.length > 0) {
          console.log(`   Evidence patterns: ${evidence.matches.join(', ')}`);
        }
        if (sectionEvidence) {
          console.log('   Evidence: dedicated section in plan');
        }
      } else {
        console.log('   ❌ No runtime observation evidence found');
        console.log('   Pipeline/integration architecture plans must include a');
        console.log('   "Baseline Observation" or "Smoke Test" section with actual');
        console.log('   runtime output captured BEFORE the architecture was written.');
        console.log('');
        console.log('   How to fix:');
        console.log('   1. Run the pipeline/system being fixed');
        console.log('   2. Capture the actual error output');
        console.log('   3. Add a "## Baseline Observation" section to the architecture plan');
        console.log('   4. Include the captured output showing the first point of failure');
      }

      return {
        passed: hasEvidence,
        score: hasEvidence ? 100 : 0,
        max_score: 100,
        issues: hasEvidence ? [] : [
          'Pipeline/integration SD architecture plan missing runtime observation evidence. ' +
          'Add a "## Baseline Observation" section with actual runtime output showing the ' +
          'current failure behavior. This prevents fixing downstream symptoms while the ' +
          'upstream root cause is missed.',
        ],
        warnings: [],
        details: {
          is_pipeline_sd: true,
          arch_key: archKey,
          has_evidence: hasEvidence,
          evidence_patterns: evidence.matches,
          section_evidence: sectionEvidence,
        },
      };
    },
    required: true,
  };
}
