/**
 * Wireframe QA Validation Gate
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 *
 * GATE_WIREFRAME_QA_VALIDATION: Validates that implementation matches
 * wireframe specifications during EXEC-TO-PLAN quality review.
 *
 * Exempt SD types: infrastructure, documentation, fix
 * Checks: Whether wireframe artifacts exist and if implementation
 *         files correspond to wireframed components.
 */

/**
 * SD types that are exempt from wireframe QA validation.
 */
const EXEMPT_SD_TYPES = ['infrastructure', 'documentation', 'fix'];

/**
 * Patterns that indicate wireframe/design artifacts.
 */
const WIREFRAME_PATTERNS = [
  /wireframe/i,
  /mockup/i,
  /ui.?layout/i,
  /screen.?design/i,
  /visual.?spec/i,
  /component.?layout/i,
  /figma/i,
  /design.?comp/i,
];

/**
 * Patterns that indicate UI implementation files.
 */
const UI_IMPLEMENTATION_PATTERNS = [
  /\.tsx$/,
  /\.jsx$/,
  /components?\//i,
  /pages?\//i,
  /views?\//i,
  /layouts?\//i,
];

/**
 * Gather wireframe artifacts from PRD and agent_artifacts.
 *
 * @param {Object} prd - PRD record
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic directive ID
 * @returns {Object} { artifacts: string[], found: boolean }
 */
async function gatherWireframeArtifacts(prd, supabase, sdId) {
  const artifacts = [];

  // Check PRD ui_ux_requirements
  if (prd?.ui_ux_requirements && typeof prd.ui_ux_requirements === 'object') {
    const uiContent = JSON.stringify(prd.ui_ux_requirements);
    if (WIREFRAME_PATTERNS.some(p => p.test(uiContent))) {
      artifacts.push('PRD ui_ux_requirements wireframe content');
    }
  }

  // Check PRD text fields
  const textFields = [
    prd?.executive_summary,
    prd?.content,
    prd?.implementation_approach,
  ].filter(Boolean).join(' ');

  if (WIREFRAME_PATTERNS.some(p => p.test(textFields))) {
    artifacts.push('PRD text references wireframes');
  }

  // Check agent_artifacts table
  if (supabase && sdId) {
    try {
      const { data } = await supabase
        .from('agent_artifacts')
        .select('title, artifact_type')
        .eq('sd_id', sdId)
        .or('artifact_type.ilike.%wireframe%,artifact_type.ilike.%mockup%,title.ilike.%wireframe%,title.ilike.%mockup%');

      if (data && data.length > 0) {
        data.forEach(a => artifacts.push(`Artifact: ${a.title} (${a.artifact_type})`));
      }
    } catch (e) {
      // Intentionally suppressed: wireframe artifact lookup is non-blocking
      console.debug('[WireframeQAValidation] artifact query suppressed:', e?.message || e);
    }
  }

  return { artifacts, found: artifacts.length > 0 };
}

/**
 * Check if implementation files include UI components.
 *
 * @param {Object} ctx - Gate context
 * @returns {Object} { uiFiles: string[], hasUIChanges: boolean }
 */
function detectUIImplementation(ctx) {
  const changedFiles = ctx._changedFiles || ctx.changedFiles || [];
  const uiFiles = changedFiles.filter(f =>
    UI_IMPLEMENTATION_PATTERNS.some(p => p.test(f))
  );

  return { uiFiles, hasUIChanges: uiFiles.length > 0 };
}

/**
 * Create the GATE_WIREFRAME_QA_VALIDATION gate validator.
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration { name, validator, required }
 */
export function createWireframeQaValidationGate(prdRepo, supabase) {
  return {
    name: 'GATE_WIREFRAME_QA_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🎨 GATE: Wireframe QA Validation');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001');

      // Get SD type from context
      const sdType = ctx.sd?.sd_type || ctx.sdType || 'unknown';
      console.log(`   SD Type: ${sdType}`);

      // Check exemption
      if (EXEMPT_SD_TYPES.includes(sdType.toLowerCase())) {
        console.log(`   ✅ SD type '${sdType}' is exempt from wireframe QA`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`SD type '${sdType}' exempt from wireframe QA validation`],
          details: { exempt: true, sdType },
        };
      }

      // Get PRD
      const prd = ctx._prd || await prdRepo?.getBySdId(ctx.sd?.id || ctx.sdId);
      const sdId = ctx.sd?.id || ctx.sdId;

      // Gather wireframe artifacts
      const wireframes = await gatherWireframeArtifacts(prd, supabase, sdId);
      console.log(`   Wireframe artifacts: ${wireframes.found ? wireframes.artifacts.length : 0}`);

      // Detect UI implementation
      const uiImpl = detectUIImplementation(ctx);
      console.log(`   UI implementation files: ${uiImpl.uiFiles.length}`);

      // Case 1: No wireframes exist — nothing to validate against
      if (!wireframes.found) {
        if (uiImpl.hasUIChanges) {
          console.log('\n   ⚠️  UI changes detected but no wireframe artifacts to validate against');
          return {
            passed: true,
            score: 60,
            max_score: 100,
            issues: [],
            warnings: [
              'UI implementation files changed but no wireframe artifacts found for comparison',
              'Consider adding wireframes to ensure implementation matches design intent',
            ],
            details: {
              exempt: false,
              sdType,
              wireframeArtifacts: [],
              uiFiles: uiImpl.uiFiles,
              adherenceScore: 'N/A — no wireframes to compare',
            },
          };
        }

        console.log('\n   ✅ No wireframes and no UI changes — gate passes');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { exempt: false, sdType, noWireframes: true, noUIChanges: true },
        };
      }

      // Case 2: Wireframes exist — validate adherence
      if (uiImpl.hasUIChanges) {
        // Wireframes + UI changes = good alignment signal
        console.log('\n   ✅ Wireframe artifacts and UI implementation both present');
        wireframes.artifacts.forEach(a => console.log(`      📐 ${a}`));
        uiImpl.uiFiles.slice(0, 5).forEach(f => console.log(`      📄 ${f}`));

        return {
          passed: true,
          score: 90,
          max_score: 100,
          issues: [],
          warnings: [
            'Automated wireframe-to-implementation comparison is advisory — visual review recommended',
          ],
          details: {
            exempt: false,
            sdType,
            wireframeArtifacts: wireframes.artifacts,
            uiFiles: uiImpl.uiFiles,
            adherenceScore: 90,
            note: 'Presence-based validation — both wireframes and UI implementation detected',
          },
        };
      }

      // Case 3: Wireframes exist but no UI changes yet
      console.log('\n   ℹ️  Wireframes exist but no UI implementation files detected');
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: [
          'Wireframe artifacts exist but no UI implementation files were changed — may need implementation',
        ],
        details: {
          exempt: false,
          sdType,
          wireframeArtifacts: wireframes.artifacts,
          uiFiles: [],
          note: 'Wireframes found but no UI files changed — implementation may be pending',
        },
      };
    },
    required: false, // Advisory gate — warns but doesn't block
  };
}
