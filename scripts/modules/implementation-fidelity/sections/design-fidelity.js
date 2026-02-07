/**
 * Section A: Design Implementation Fidelity (25 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Phase-aware weighting: Reduced from 25 to make room for critical database checks
 */

import { getSDSearchTerms, gitLogForSD, detectImplementationRepo } from '../utils/index.js';

/**
 * Validate Design Implementation Fidelity
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateDesignFidelity(sd_id, designAnalysis, validation, supabase) {
  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI requirements
  try {
    let sd = null;
    const { data: sdById } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, scope, title')
      .eq('id', sd_id)
      .single();

    if (sdById) {
      sd = sdById;
    } else {
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id, use sd_key instead (column dropped 2026-01-24)
      const { data: sdBySdKey } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type, scope, title')
        .eq('sd_key', sd_id)
        .single();
      sd = sdBySdKey;
    }

    // Extract scope text for analysis
    let scopeToCheck = '';
    if (typeof sd?.scope === 'object' && sd.scope?.included) {
      scopeToCheck = Array.isArray(sd.scope.included)
        ? sd.scope.included.join(' ')
        : String(sd.scope.included);
    } else if (typeof sd?.scope === 'string') {
      try {
        const parsed = JSON.parse(sd.scope);
        if (parsed?.included) {
          scopeToCheck = Array.isArray(parsed.included)
            ? parsed.included.join(' ')
            : String(parsed.included);
        }
      } catch {
        scopeToCheck = sd.scope;
      }
    }

    const hasUIScope = /component|ui\s|frontend|form|page|view|dashboard/i.test(scopeToCheck);

    // SD types that never require UI component validation
    const noUITypes = ['database', 'infrastructure', 'documentation'];
    if (noUITypes.includes(sd?.sd_type) && !hasUIScope) {
      console.log(`   ✅ ${sd.sd_type} SD without UI requirements - Section A not applicable (25/25)`);
      validation.score += 25;
      validation.gate_scores.design_fidelity = 25;
      validation.details.design_fidelity = {
        skipped: true,
        reason: `${sd.sd_type} SD without UI requirements - design fidelity not applicable`
      };
      return;
    }

    // PAT-GATE2-BE-001: target_application-aware exemption
    // EHG_Engineer is a backend-only repo (CLI, scripts, tooling) - never has UI components
    if (!hasUIScope) {
      let targetApp = null;
      try {
        const sdKey = sd_id;
        const { data: fullSd } = await supabase
          .from('strategic_directives_v2')
          .select('target_application')
          .or(`id.eq.${sdKey},sd_key.eq.${sdKey}`)
          .single();
        targetApp = fullSd?.target_application;
      } catch { /* continue with other checks */ }

      if (targetApp === 'EHG_Engineer') {
        console.log('   ✅ EHG_Engineer target application (backend-only) - Section A not applicable (25/25)');
        validation.score += 25;
        validation.gate_scores.design_fidelity = 25;
        validation.details.design_fidelity = {
          skipped: true,
          reason: 'EHG_Engineer target application - backend-only repo, no UI components'
        };
        return;
      }
    }

    // PAT-GATE2-BACKEND-ONLY-001: Backend-only feature SDs (CLI, scripts, APIs)
    if (sd?.sd_type === 'feature' && !hasUIScope) {
      const hasBackendScope = /\b(script|cli|command|api[\s-]?route|backend|server|lib\/|node\s)/i.test(scopeToCheck);
      const titleText = (sd.title || '').toLowerCase();
      const hasBackendTitle = /\b(script|cli|command|api|backend|server|tooling|utility)\b/i.test(titleText);

      if (hasBackendScope || hasBackendTitle) {
        console.log('   ✅ Backend-only feature SD (scripts/CLI/API) - Section A not applicable (25/25)');
        validation.score += 25;
        validation.gate_scores.design_fidelity = 25;
        validation.details.design_fidelity = {
          skipped: true,
          reason: 'Backend-only feature SD - no UI components expected'
        };
        return;
      }
    }
  } catch (_e) {
    // Continue with normal validation
  }

  if (!designAnalysis) {
    validation.warnings.push('[A] No DESIGN analysis found - skipping design fidelity check');
    validation.score += 13;
    validation.gate_scores.design_fidelity = 13;
    console.log('   ⚠️  No DESIGN analysis - partial credit (13/25)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};

  // A1: Check for UI component implementation (10 points)
  console.log('\n   [A1] UI Components Implementation...');

  try {
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const gitLog = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --name-only --pretty=format:""`,
      searchTerms,
      { timeout: 10000 }
    );

    const componentFiles = gitLog.split('\n')
      .filter(f => f.match(/\.(tsx?|jsx?)$/) && (f.includes('component') || f.includes('Component') || f.includes('src/')))
      .filter(Boolean);

    if (componentFiles.length > 0) {
      sectionScore += 10;
      sectionDetails.components_implemented = componentFiles.length;
      sectionDetails.component_files = componentFiles.slice(0, 5);
      console.log(`   ✅ Found ${componentFiles.length} component files`);
    } else {
      validation.warnings.push('[A1] No component files found in git commits');
      sectionScore += 5;
      console.log('   ⚠️  No component files found (5/10)');
    }
  } catch (error) {
    validation.warnings.push(`[A1] Git log check failed: ${error.message}`);
    sectionScore += 5;
    console.log('   ⚠️  Cannot verify components (5/10)');
  }

  // A2: Check for workflow implementation (10 points)
  console.log('\n   [A2] User Workflows Implementation...');

  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('deliverables, metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.deliverables) {
    const deliverables = JSON.stringify(handoffData[0].deliverables).toLowerCase();
    const hasWorkflowMention = deliverables.includes('workflow') ||
                                deliverables.includes('user flow') ||
                                deliverables.includes('user action');

    if (hasWorkflowMention) {
      sectionScore += 10;
      sectionDetails.workflows_mentioned = true;
      console.log('   ✅ Workflows mentioned in EXEC deliverables');
    } else {
      validation.warnings.push('[A2] Workflows not explicitly mentioned in deliverables');
      sectionScore += 5;
      console.log('   ⚠️  Workflows not mentioned (5/10)');
    }
  } else {
    validation.warnings.push('[A2] No EXEC→PLAN handoff found');
    sectionScore += 5;
    console.log('   ⚠️  No handoff found (5/10)');
  }

  // A3: Check for user action support (5 points)
  console.log('\n   [A3] User Actions Support...');

  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const gitDiff = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
      searchTerms,
      { timeout: 15000 }
    );

    const hasCRUD = gitDiff.toLowerCase().includes('create') ||
                    gitDiff.toLowerCase().includes('update') ||
                    gitDiff.toLowerCase().includes('delete') ||
                    gitDiff.toLowerCase().includes('insert');

    if (hasCRUD) {
      sectionScore += 5;
      sectionDetails.crud_operations_found = true;
      console.log('   ✅ CRUD operations found in code changes');
    } else {
      validation.warnings.push('[A3] No CRUD operations detected in code changes');
      sectionScore += 3;
      console.log('   ⚠️  No CRUD operations detected (3/5)');
    }
  } catch (_error) {
    sectionScore += 3;
    console.log('   ⚠️  Cannot verify CRUD operations (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.design_fidelity = sectionScore;
  validation.details.design_fidelity = sectionDetails;
  console.log(`\n   Section A Score: ${sectionScore}/25`);
}
