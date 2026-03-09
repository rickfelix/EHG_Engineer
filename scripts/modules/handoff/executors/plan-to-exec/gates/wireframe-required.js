/**
 * Wireframe Required Gate
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 *
 * GATE_WIREFRAME_REQUIRED: Validates that UI/feature SDs include wireframe
 * artifacts before allowing implementation in EXEC phase.
 *
 * Exempt SD types: infrastructure, documentation, fix
 */

const EXEMPT_SD_TYPES = ['infrastructure', 'documentation', 'fix'];

const WIREFRAME_INDICATORS = [
  /wireframe/i, /mockup/i, /ui.?layout/i, /screen.?design/i,
  /visual.?spec/i, /component.?layout/i, /page.?layout/i,
  /ui.?sketch/i, /figma/i, /design.?comp/i, /ascii.?wireframe/i,
  /layout.?diagram/i,
];

function checkPrdForWireframes(prd) {
  if (!prd) return { found: false, evidence: [] };
  const evidence = [];

  const uiReqs = prd.ui_ux_requirements;
  if (uiReqs && typeof uiReqs === 'object' && Object.keys(uiReqs).length > 0) {
    if (WIREFRAME_INDICATORS.some(p => p.test(JSON.stringify(uiReqs)))) {
      evidence.push('ui_ux_requirements contains wireframe references');
    }
  }

  if (Array.isArray(prd.functional_requirements)) {
    if (WIREFRAME_INDICATORS.some(p => p.test(JSON.stringify(prd.functional_requirements)))) {
      evidence.push('functional_requirements reference wireframes');
    }
  }

  const textFields = [prd.executive_summary, prd.content, prd.implementation_approach]
    .filter(Boolean).join(' ');
  if (WIREFRAME_INDICATORS.some(p => p.test(textFields))) {
    evidence.push('PRD text fields contain wireframe references');
  }

  return { found: evidence.length > 0, evidence };
}

async function checkArtifactsForWireframes(supabase, sdId) {
  if (!supabase || !sdId) return { found: false, evidence: [] };
  try {
    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('artifact_type, title')
      .eq('sd_id', sdId)
      .or('artifact_type.ilike.%wireframe%,artifact_type.ilike.%mockup%,artifact_type.ilike.%design%,title.ilike.%wireframe%,title.ilike.%mockup%');
    if (error || !data || data.length === 0) return { found: false, evidence: [] };
    return {
      found: true,
      evidence: data.map(a => `Artifact: ${a.title} (type: ${a.artifact_type})`),
    };
  } catch {
    return { found: false, evidence: [] };
  }
}

export function createWireframeRequiredGate(prdRepo, supabase) {
  return {
    name: 'GATE_WIREFRAME_REQUIRED',
    validator: async (ctx) => {
      console.log('\n🎨 GATE: Wireframe Required Check');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001');

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'unknown';
      console.log(`   SD Type: ${sdType}`);

      if (EXEMPT_SD_TYPES.includes(sdType.toLowerCase())) {
        console.log(`   ✅ SD type '${sdType}' is exempt from wireframe requirements`);
        return {
          passed: true, score: 100, max_score: 100, issues: [],
          warnings: [`SD type '${sdType}' exempt from wireframe gate`],
          details: { exempt: true, sdType, reason: 'SD type does not produce UI changes' },
        };
      }

      const prd = ctx._prd || await prdRepo?.getBySdId(ctx.sd?.id || ctx.sdId);
      const sdId = ctx.sd?.id || ctx.sdId;

      const prdCheck = checkPrdForWireframes(prd);
      console.log(`   PRD wireframe check: ${prdCheck.found ? 'FOUND' : 'NOT FOUND'}`);
      prdCheck.evidence.forEach(e => console.log(`      • ${e}`));

      const artifactCheck = await checkArtifactsForWireframes(supabase, sdId);
      console.log(`   Artifact wireframe check: ${artifactCheck.found ? 'FOUND' : 'NOT FOUND'}`);
      artifactCheck.evidence.forEach(e => console.log(`      • ${e}`));

      const hasWireframes = prdCheck.found || artifactCheck.found;
      const allEvidence = [...prdCheck.evidence, ...artifactCheck.evidence];

      if (hasWireframes) {
        console.log('\n   ✅ Wireframe artifacts found');
        return {
          passed: true, score: 100, max_score: 100, issues: [], warnings: [],
          details: { exempt: false, sdType, wireframeEvidence: allEvidence },
        };
      }

      console.log('\n   ⚠️  No wireframe artifacts found for UI/feature SD');
      return {
        passed: true, score: 50, max_score: 100, issues: [],
        warnings: [
          `No wireframe artifacts found for ${sdType} SD — consider adding wireframes to PRD ui_ux_requirements or agent_artifacts before implementation`,
          'Wireframes help ensure UI implementation matches design intent',
        ],
        details: { exempt: false, sdType, wireframeEvidence: [], wireframeMissing: true },
      };
    },
    required: false,
  };
}
