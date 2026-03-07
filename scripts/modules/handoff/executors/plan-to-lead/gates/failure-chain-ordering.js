/**
 * Failure Chain Ordering Gate (First-Failure-First) for PLAN-TO-LEAD
 *
 * Validates that orchestrator SDs with children for pipeline/integration
 * fixes include a failure chain diagram in the architecture plan and that
 * children are ordered from upstream (root cause) to downstream (symptoms).
 *
 * Rationale: SD-LEO-INFRA-EVA-STAGE-PIPELINE-002 had 6 children that all
 * fixed downstream issues (artifact types, gates, columns) while the root
 * cause (loadStageTemplate queries a non-existent table) was upstream and
 * unfixed. Ordering children by failure chain position would have caught this.
 *
 * BLOCKING gate for pipeline orchestrator SDs.
 * Auto-passes for non-orchestrator SDs and non-pipeline SDs.
 */

const PIPELINE_KEYWORDS = [
  'pipeline', 'orchestrat', 'stage-execution', 'stage_execution',
  'eva-orchestrator', 'reality-gate', 'reality_gate', 'lifecycle',
  'venture_artifact', 'venture-artifact', 'stage-template',
  'golden-nugget', 'sd-bridge', 'handoff-system',
];

const FAILURE_CHAIN_PATTERNS = [
  /##\s*(failure\s*chain|cascading\s*failure|failure\s*sequence|root\s*cause\s*chain|upstream.?downstream)/i,
  /failure.?chain.?diagram/i,
  /first.?failure.?first/i,
  /upstream.?to.?downstream/i,
  /root.?cause.*→|→.*symptom/i,
  /layer\s*\d+.*→.*layer\s*\d+/i,
];

const CHILD_ORDERING_PATTERNS = [
  /child\s*(a|1|one).*(?:root|upstream|first|foundation)/i,
  /###\s*child\s*(a|1).*(?:fix|foundation|root|upstream|schema|migration)/i,
  /implementation\s*phase/i,
  /phase\s*1.*foundation/i,
];

function isPipelineSD(sd) {
  const searchText = [
    sd.sd_key || '',
    sd.title || '',
    sd.description || '',
    ...(sd.tags || []),
  ].join(' ').toLowerCase();

  return PIPELINE_KEYWORDS.some(kw => searchText.includes(kw));
}

function hasFailureChainDiagram(content) {
  if (!content || typeof content !== 'string') return { found: false, matches: [] };

  const matches = [];
  for (const pattern of FAILURE_CHAIN_PATTERNS) {
    if (pattern.test(content)) {
      matches.push(pattern.source.substring(0, 60));
    }
  }

  return { found: matches.length > 0, matches };
}

function hasChildOrdering(content) {
  if (!content || typeof content !== 'string') return { found: false, matches: [] };

  const matches = [];
  for (const pattern of CHILD_ORDERING_PATTERNS) {
    if (pattern.test(content)) {
      matches.push(pattern.source.substring(0, 60));
    }
  }

  return { found: matches.length > 0, matches };
}

export function createFailureChainOrderingGate(supabase) {
  return {
    name: 'FAILURE_CHAIN_ORDERING',
    validator: async (ctx) => {
      console.log('\n🔗 FAILURE CHAIN ORDERING GATE (First-Failure-First)');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sd = ctx.sd || {};

      // ONLY APPLIES TO ORCHESTRATOR SDs
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title')
        .eq('parent_sd_id', sdUuid);

      if (!childSDs || childSDs.length === 0) {
        console.log('   ℹ️  Not an orchestrator SD — gate not applicable');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [],
          details: { is_orchestrator: false },
        };
      }

      // NON-PIPELINE ORCHESTRATOR BYPASS
      if (!isPipelineSD(sd)) {
        console.log(`   ℹ️  Orchestrator (${childSDs.length} children) but not pipeline — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [],
          details: { is_orchestrator: true, is_pipeline_sd: false, child_count: childSDs.length },
        };
      }

      console.log(`   📋 Pipeline orchestrator SD with ${childSDs.length} children`);

      // Fetch architecture plan
      const metadata = sd.metadata || {};
      const archKey = metadata.arch_key;

      if (!archKey) {
        console.log('   ⚠️  No arch_key — cannot validate failure chain');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['Pipeline orchestrator has no architecture plan — failure chain not checked'],
          details: { has_arch_key: false, is_pipeline_sd: true, is_orchestrator: true },
        };
      }

      const { data: archPlan } = await supabase
        .from('eva_architecture_plans')
        .select('plan_key, content')
        .eq('plan_key', archKey)
        .single();

      if (!archPlan) {
        console.log(`   ⚠️  Architecture plan '${archKey}' not found`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: [`Architecture plan '${archKey}' not found — failure chain not checked`],
          details: { arch_key: archKey, plan_found: false },
        };
      }

      const content = archPlan.content || '';
      const chainResult = hasFailureChainDiagram(content);
      const orderResult = hasChildOrdering(content);

      const issues = [];
      const warnings = [];
      let score = 100;

      // Check 1: Failure chain diagram exists
      if (!chainResult.found) {
        issues.push(
          'Pipeline orchestrator architecture plan missing failure chain diagram. ' +
          'Add a "## Failure Chain" section showing the cascading failure sequence ' +
          'from root cause (upstream) to symptoms (downstream). Format: ' +
          'Layer 1 (root cause) -> Layer 2 -> Layer 3 (observed symptom). ' +
          'Children must map to layers in chain order.'
        );
        score -= 50;
        console.log('   ❌ No failure chain diagram found');
      } else {
        console.log('   ✅ Failure chain diagram found');
      }

      // Check 2: Children reference upstream-first ordering
      if (!orderResult.found) {
        // Downgrade to warning if failure chain exists but ordering is implicit
        if (chainResult.found) {
          warnings.push(
            'Architecture plan has a failure chain but child SD ordering does not ' +
            'explicitly reference upstream-first priority. Consider labeling children ' +
            'with their position in the failure chain (e.g., "Child A: Fix root cause layer 1").'
          );
          score -= 15;
          console.log('   ⚠️  Child ordering not explicitly upstream-first');
        } else {
          issues.push(
            'Children are not ordered upstream-to-downstream. The first child must fix ' +
            'the root cause (the first point of failure in the chain). Subsequent children ' +
            'fix progressively downstream issues. This prevents fixing symptoms while ' +
            'the root cause remains.'
          );
          score -= 50;
          console.log('   ❌ No upstream-first child ordering');
        }
      } else {
        console.log('   ✅ Children ordered upstream-first');
      }

      // Log children for reference
      console.log(`\n   Children (${childSDs.length}):`);
      childSDs.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.sd_key}: ${c.title}`);
      });

      const passed = issues.length === 0;

      if (!passed) {
        console.log('\n   How to fix:');
        console.log('   1. Run the pipeline to identify the FIRST point of failure');
        console.log('   2. Add a "## Failure Chain" section to the architecture plan');
        console.log('   3. Map each layer in the chain to a child SD');
        console.log('   4. Order children so Child A fixes the root cause (Layer 1)');
        console.log('   5. Each subsequent child fixes the next downstream layer');
      }

      return {
        passed,
        score: Math.max(0, score),
        max_score: 100,
        issues,
        warnings,
        details: {
          is_orchestrator: true,
          is_pipeline_sd: true,
          child_count: childSDs.length,
          arch_key: archKey,
          has_failure_chain: chainResult.found,
          has_child_ordering: orderResult.found,
          chain_evidence: chainResult.matches,
          ordering_evidence: orderResult.matches,
          children: childSDs.map(c => ({ sd_key: c.sd_key, title: c.title })),
        },
      };
    },
    required: true,
  };
}
