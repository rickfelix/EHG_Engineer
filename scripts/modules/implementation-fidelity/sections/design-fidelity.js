/**
 * Section A: Design Implementation Fidelity (25 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Phase-aware weighting: Reduced from 25 to make room for critical database checks
 */

import { getSDSearchTerms, gitLogForSD, detectImplementationRepos } from '../utils/index.js';
import { getSectionEnforcement } from '../sd-type-section-policy.js';
import { classifyBackendLeaf, isEhgEngineerTarget } from './backend-leaf-detection.js';

/**
 * Validate Design Implementation Fidelity
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateDesignFidelity(sd_id, designAnalysis, validation, supabase) {
  // Database-driven exemption check (mirrors Section B pattern from database-fidelity.js)
  const exemptSections = validation.details.gate2_exempt_sections || [];
  if (exemptSections.includes('A_design')) {
    validation.score += 25;
    validation.gate_scores.design_fidelity = 25;
    validation.details.design_fidelity = {
      exempt: true,
      reason: 'Section A exempt via gate2_exempt_sections (A_design)'
    };
    console.log('   ✅ Section A exempt via gate2_exempt_sections (25/25)');
    return;
  }

  // Centralized SD-type section enforcement policy (fallback after DB exemptions)
  const sdType = validation.details.sd_type || '';
  const enforcement = getSectionEnforcement(sdType, 'A');
  if (enforcement === 'SKIP') {
    validation.score += 25;
    validation.gate_scores.design_fidelity = 25;
    validation.details.design_fidelity = {
      skipped: true,
      reason: `Section A skipped for ${sdType} SD (policy: SKIP)`
    };
    console.log(`   ✅ Section A skipped for ${sdType} SD - full credit (25/25)`);
    return;
  }
  const isAdvisory = enforcement === 'ADVISORY';
  const issueCountBefore = validation.issues.length;

  // PAT-GATE2-BE-001: target_application-aware exemption (checked FIRST - definitive signal)
  // EHG_Engineer is a backend-only repo (CLI, scripts, tooling) - never has UI components
  {
    const targetApp = validation.details.target_application || null;
    if (isEhgEngineerTarget(targetApp)) {
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

  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI requirements (hardcoded fallback)
  // SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001: Use canonical resolver (replaces 2-step UUID-then-sd_key lookup).
  try {
    const { resolveSdInputOrNull } = await import('../../../lib/sd-id-resolver.js');
    const { sd: sdResolved } = await resolveSdInputOrNull(sd_id, supabase);
    let sd = sdResolved ? { sd_type: sdResolved.sd_type, scope: sdResolved.scope, title: sdResolved.title } : null;
    // Legacy 2-step fallback removed: resolver handles both forms via single .or() query.

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

    // PAT-GATE2-LIBFEATURE-001: Frontend presentational / lib-level feature exemption.
    // An EHG (frontend app) feature whose scope is library-level code (src/lib/ or lib/)
    // and which EXPLICITLY declares no new UI components/forms AND no new DB is a pure
    // transform (e.g. a src/lib/gvos prompt renderer). It legitimately ships zero component
    // files and zero DB queries, so Section A's UI-component / workflow / CRUD checks
    // otherwise false-penalize it (witnessed: SD-SURFACEAWARE-...-001-D scored RED at
    // EXEC-TO-PLAN, forcing 3 gate bypasses). This is the ONLY exemption that fires when
    // hasUIScope is true — the precise false-positive condition, since a lib feature trips
    // hasUIScope via the words "component"/"frontend"/"page"/"dashboard" in its scope.
    // Additive-only: the strict no-UI + no-DB declaration conjunction can never be satisfied
    // by a real UI/DB feature without contradicting its own scope, so it never relaxes one.
    // (validation-agent condition C2 "also require hasUIScope===false" is intentionally NOT
    // adopted: it would block the exact case being fixed.)
    if (sd?.sd_type === 'feature' && (validation.details.target_application || null) === 'EHG') {
      let excludedText = '';
      if (typeof sd?.scope === 'object' && sd.scope?.excluded) {
        excludedText = Array.isArray(sd.scope.excluded) ? sd.scope.excluded.join(' ') : String(sd.scope.excluded);
      }
      const fullScopeText = `${scopeToCheck} ${excludedText}`;
      const hasLibScope = /(^|[^a-z])(src\/)?lib\//i.test(fullScopeText);
      const declaresNoUI = /\bno\s+(new\s+)?(ui\s+components?|components?|forms?)\b/i.test(fullScopeText);
      const declaresNoDB = /\bno\s+(new\s+)?(db|database|tables?|columns?|migrations?|schema\s+changes?)\b/i.test(fullScopeText);
      if (hasLibScope && declaresNoUI && declaresNoDB) {
        console.log('   ✅ EHG frontend lib-level feature (no UI/DB by design) - Section A not applicable (25/25) [PAT-GATE2-LIBFEATURE-001]');
        validation.score += 25;
        validation.gate_scores.design_fidelity = 25;
        validation.details.design_fidelity = {
          skipped: true,
          reason: 'EHG frontend lib-level feature with no DB/forms/UI by design (PAT-GATE2-LIBFEATURE-001)'
        };
        return;
      }
    }

    // SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (PAT-GATE2-BACKEND-ONLY-001 broadened):
    // LAST exemption — existing exemptions (incl. PAT-GATE2-LIBFEATURE-001 above) keep
    // precedence. Covers cross-repo BACKEND venture leaves (e.g. DataDistill D1 distillation
    // engine — "engine/worker" scope, target=datadistill) and bugfix backend leaves whose
    // scope/title miss the narrow keyword set above. Fence is !hasUISurface, so venture UI
    // leaves (F1 dashboard, G1 widget) stay enforced. classifyBackendLeaf is pure/sync — the
    // enclosing try/catch still falls through to normal scoring on a resolver error.
    {
      const leaf = classifyBackendLeaf(sd?.sd_type, scopeToCheck, sd?.title);
      if (leaf.exempt) {
        console.log(`   ✅ Backend leaf (${leaf.reason}) - Section A not applicable (25/25) [SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001]`);
        validation.score += 25;
        validation.gate_scores.design_fidelity = 25;
        validation.details.design_fidelity = { skipped: true, reason: `Backend leaf - ${leaf.reason}` };
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
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    let gitLog = '';
    for (const repo of implementationRepos) {
      try {
        gitLog += await gitLogForSD(
          `git -C "${repo}" log --all --grep="\${TERM}" --name-only --pretty=format:""`,
          searchTerms,
          { timeout: 10000 }
        );
      } catch (_) { /* skip repos without matching commits */ }
    }

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
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    let gitDiff = '';
    for (const repo of implementationRepos) {
      try {
        gitDiff += await gitLogForSD(
          `git -C "${repo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
          searchTerms,
          { timeout: 15000 }
        );
      } catch (_) { /* skip repos without matching commits */ }
    }

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

  // ADVISORY mode: convert issues to warnings, award full credit
  if (isAdvisory) {
    const newIssues = validation.issues.splice(issueCountBefore);
    validation.warnings.push(...newIssues.map(i => `[ADVISORY] ${i}`));
    sectionScore = 25;
    console.log(`   ℹ️  Section A in ADVISORY mode for ${sdType} SD - full credit (25/25)`);
  }

  validation.score += sectionScore;
  validation.gate_scores.design_fidelity = sectionScore;
  validation.details.design_fidelity = sectionDetails;
  console.log(`\n   Section A Score: ${sectionScore}/25`);
}
