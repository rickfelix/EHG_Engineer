/**
 * Section C: Data Flow Alignment (25 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 */

import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import { getSDSearchTerms, gitLogForSD, detectImplementationRepos } from '../utils/index.js';
import { getSectionEnforcement } from '../sd-type-section-policy.js';
import { classifyBackendLeaf, isEhgEngineerTarget } from './backend-leaf-detection.js';

/**
 * Validate Data Flow Alignment
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD metadata
 * @param {Object} databaseAnalysis - Database analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  // Database-driven exemption check (mirrors Section B pattern from database-fidelity.js)
  const exemptSections = validation.details.gate2_exempt_sections || [];
  if (exemptSections.includes('C_dataflow')) {
    validation.score += 25;
    validation.gate_scores.data_flow_alignment = 25;
    validation.details.data_flow_alignment = {
      exempt: true,
      reason: 'Section C exempt via gate2_exempt_sections (C_dataflow)'
    };
    console.log('   ✅ Section C exempt via gate2_exempt_sections (25/25)');
    return;
  }

  // Centralized SD-type section enforcement policy (fallback after DB exemptions)
  const sdType = validation.details.sd_type || '';
  const enforcement = getSectionEnforcement(sdType, 'C');
  if (enforcement === 'SKIP') {
    validation.score += 25;
    validation.gate_scores.data_flow_alignment = 25;
    validation.details.data_flow_alignment = {
      skipped: true,
      reason: `Section C skipped for ${sdType} SD (policy: SKIP)`
    };
    console.log(`   ✅ Section C skipped for ${sdType} SD - full credit (25/25)`);
    return;
  }
  const isAdvisory = enforcement === 'ADVISORY';
  const issueCountBefore = validation.issues.length;

  // PAT-GATE2-BE-001: target_application-aware exemption (checked FIRST - definitive signal)
  // EHG_Engineer is a backend-only repo (CLI, scripts, tooling) - never has form/UI integration
  {
    const targetApp = validation.details.target_application || null;
    if (isEhgEngineerTarget(targetApp)) {
      console.log('   ✅ EHG_Engineer target application (backend-only) - Section C not applicable (25/25)');
      validation.score += 25;
      validation.gate_scores.data_flow_alignment = 25;
      validation.details.data_flow_alignment = {
        skipped: true,
        reason: 'EHG_Engineer target application - backend-only repo, no form/UI integration expected'
      };
      return;
    }
  }

  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI/form requirements (hardcoded fallback)
  // SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001: Use canonical resolver (replaces 2-step UUID-then-sd_key lookup).
  try {
    const { resolveSdInputOrNull } = await import('../../../lib/sd-id-resolver.js');
    const { sd: sdResolved } = await resolveSdInputOrNull(sd_id, supabase);
    let sd = sdResolved ? { sd_type: sdResolved.sd_type, scope: sdResolved.scope, title: sdResolved.title } : null;
    // Legacy 2-step fallback removed: resolver handles both UUID and sd_key forms via single .or() query.

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

    const hasUIScope = /component|ui\s|frontend|form|page|view/i.test(scopeToCheck);

    // SD types that never require UI/form data flow validation
    if (sd?.sd_type === 'database' && !hasUIScope) {
      console.log('   ✅ Database SD without UI/form requirements - Section C not applicable (25/25)');
      validation.score += 25;
      validation.gate_scores.data_flow_alignment = 25;
      validation.details.data_flow_alignment = {
        skipped: true,
        reason: 'Database SD without UI/form requirements - data flow alignment not applicable'
      };
      return;
    }

    // PAT-GATE2-BACKEND-ONLY-001: Backend-only feature SDs (CLI, scripts, APIs)
    if (sd?.sd_type === 'feature' && !hasUIScope) {
      const hasBackendScope = /\b(script|cli|command|api[\s-]?route|backend|server|lib\/|node\s)/i.test(scopeToCheck);
      if (hasBackendScope) {
        console.log('   ✅ Backend-only feature SD (scripts/CLI/API) - Section C not applicable (25/25)');
        validation.score += 25;
        validation.gate_scores.data_flow_alignment = 25;
        validation.details.data_flow_alignment = {
          skipped: true,
          reason: 'Backend-only feature SD - no form/UI integration expected'
        };
        return;
      }
    }

    // PAT-GATE2-LIBFEATURE-001: Frontend presentational / lib-level feature exemption.
    // An EHG (frontend app) feature whose scope is library-level code (src/lib/ or lib/)
    // and which EXPLICITLY declares no new UI components/forms AND no new DB is a pure
    // transform (e.g. a src/lib/gvos prompt renderer). It legitimately ships zero form/UI
    // integration and zero DB queries, so Section C's C1 (database queries) and C2 (form
    // integration) checks otherwise false-penalize it (witnessed: SD-SURFACEAWARE-...-001-D
    // scored RED at EXEC-TO-PLAN, forcing 3 gate bypasses). This is the ONLY exemption that
    // fires when hasUIScope is true — the precise false-positive condition, since a lib
    // feature trips hasUIScope via the words "component"/"frontend"/"page" in its scope.
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
        console.log('   ✅ EHG frontend lib-level feature (no UI/DB by design) - Section C not applicable (25/25) [PAT-GATE2-LIBFEATURE-001]');
        validation.score += 25;
        validation.gate_scores.data_flow_alignment = 25;
        validation.details.data_flow_alignment = {
          skipped: true,
          reason: 'EHG frontend lib-level feature with no DB/forms/UI by design (PAT-GATE2-LIBFEATURE-001)'
        };
        return;
      }
    }

    // SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (PAT-GATE2-BACKEND-ONLY-001 broadened):
    // LAST exemption — existing exemptions (incl. PAT-GATE2-LIBFEATURE-001 above) keep
    // precedence. Symmetric with Section A. Covers cross-repo BACKEND venture leaves (e.g.
    // DataDistill D1 distillation engine — "engine/worker" scope, target=datadistill) and
    // infrastructure/bugfix backend leaves whose scope/title miss the narrow keyword set
    // above. Fence is !hasUISurface, so venture UI leaves (F1 dashboard, G1 widget) stay
    // enforced. Pure/sync — the enclosing try/catch falls through to normal scoring on error.
    {
      const leaf = classifyBackendLeaf(sd?.sd_type, scopeToCheck, sd?.title);
      if (leaf.exempt) {
        console.log(`   ✅ Backend leaf (${leaf.reason}) - Section C not applicable (25/25) [SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001]`);
        validation.score += 25;
        validation.gate_scores.data_flow_alignment = 25;
        validation.details.data_flow_alignment = { skipped: true, reason: `Backend leaf - ${leaf.reason}` };
        return;
      }
    }
  } catch (_e) {
    // Continue with normal validation
  }

  // SD-FDBK-ENH-GATE2-AWARE-SECTION-001: N/A-aware Section C, mirroring the Section B
  // fix in PR #3911 (database-fidelity.js). Zero DB footprint (no SD-matched migration
  // files AND no .from()/.rpc()/SQL DDL/DML in the diff) → Section C is Not Applicable;
  // award full credit instead of the ~13/25 partial that RED-capped zero-DB frontend
  // feature SDs. Full credit == denominator-neutral under the hardcoded max_score=100
  // score-as-percentage model (index.js unchanged, as in PR #3911). Sits AFTER the
  // existing exemptions (they keep precedence); any DB signal / detection error falls
  // through to normal C1/C2/C3 scoring below.
  const dbScope = await detectDatabaseScope(sd_id, supabase);
  if (!dbScope.hasMigrations && !dbScope.hasQueries) {
    validation.score += 25;
    validation.gate_scores.data_flow_alignment = 25;
    validation.details.data_flow_alignment = {
      applicable: false,
      reason: 'Not applicable — SD has zero database footprint (no migration files, no database queries detected)',
      db_scope: dbScope,
    };
    console.log('   ✅ Section C N/A — zero database footprint (no migrations, no DB queries) — full credit (25/25)');
    return;
  }

  // Re-use exemptSections from top of function for sub-section checks
  const isC1Exempt = exemptSections.includes('C1_queries');
  const isC2Exempt = exemptSections.includes('C2_form_integration');

  let sectionScore = 0;
  const sectionDetails = {};
  sectionDetails.exemptions = { C1: isC1Exempt, C2: isC2Exempt };

  console.log('\n   [C] Data Flow Alignment...');

  // Get gitDiff for all C checks
  let gitDiff = '';
  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    for (const repo of implementationRepos) {
      try {
        gitDiff += await gitLogForSD(
          `git -C "${repo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
          searchTerms,
          { timeout: 15000 }
        );
      } catch (_) { /* skip repos without matching commits */ }
    }
  } catch (_e) {
    gitDiff = '';
  }

  // C1: Check for database query code (10 points)
  console.log('\n   [C1] Database Query Integration...');

  if (isC1Exempt) {
    sectionScore += 10;
    sectionDetails.C1_exempt = true;
    console.log('   ✅ C1 exempt for this SD type - full credit (10/10)');
  } else {
    const hasQueries = gitDiff.includes('.select(') ||
                       gitDiff.includes('.insert(') ||
                       gitDiff.includes('.update(') ||
                       gitDiff.includes('.from(');

    if (hasQueries) {
      sectionScore += 10;
      sectionDetails.database_queries_found = true;
      console.log('   ✅ Database queries found in code changes');
    } else {
      validation.warnings.push('[C1] No database queries detected in code');
      sectionScore += 5;
      console.log('   ⚠️  No database queries detected (5/10)');
    }
  }

  // C2: Check for form/UI integration (10 points)
  console.log('\n   [C2] Form/UI Integration...');

  if (isC2Exempt) {
    sectionScore += 10;
    sectionDetails.C2_exempt = true;
    console.log('   ✅ C2 exempt for this SD type - full credit (10/10)');
  } else {
    const hasFormIntegration = gitDiff.includes('useState') ||
                                gitDiff.includes('useForm') ||
                                gitDiff.includes('onSubmit') ||
                                gitDiff.includes('<form') ||
                                gitDiff.includes('Input') ||
                                gitDiff.includes('Button');

    if (hasFormIntegration) {
      sectionScore += 10;
      sectionDetails.form_integration_found = true;
      console.log('   ✅ Form/UI integration found');
    } else {
      validation.warnings.push('[C2] No form/UI integration detected');
      sectionScore += 5;
      console.log('   ⚠️  No form/UI integration detected (5/10)');
    }
  }

  // C3: Check for data validation (5 points)
  console.log('\n   [C3] Data Validation...');

  const hasValidation = gitDiff.includes('zod') ||
                        gitDiff.includes('validate') ||
                        gitDiff.includes('schema') ||
                        gitDiff.includes('.required()');

  if (hasValidation) {
    sectionScore += 5;
    sectionDetails.data_validation_found = true;
    console.log('   ✅ Data validation found');
  } else {
    validation.warnings.push('[C3] No data validation detected');
    sectionScore += 3;
    console.log('   ⚠️  No data validation detected (3/5)');
  }

  // ADVISORY mode: convert issues to warnings, award full credit
  if (isAdvisory) {
    const newIssues = validation.issues.splice(issueCountBefore);
    validation.warnings.push(...newIssues.map(i => `[ADVISORY] ${i}`));
    sectionScore = 25;
    console.log(`   ℹ️  Section C in ADVISORY mode for ${sdType} SD - full credit (25/25)`);
  }

  validation.score += sectionScore;
  validation.gate_scores.data_flow_alignment = sectionScore;
  validation.details.data_flow_alignment = sectionDetails;
  console.log(`\n   Section C Score: ${sectionScore}/25`);
}

/**
 * SD-FDBK-ENH-GATE2-AWARE-SECTION-001: zero-DB-footprint detector for the Section C
 * N/A check. DELIBERATE byte-for-byte DUPLICATE of detectDatabaseScope in
 * database-fidelity.js (PR #3911) so both DB-centric sections agree — TODO: extract
 * to utils/index.js (deferred to avoid touching the PR #3911 file + its mock test).
 * Signals: hasMigrations (SD-matched migration file on disk) + hasQueries (.from(/.rpc(
 * or SQL DDL/DML in the diff). Conservative: returns true/true on error (no free N/A).
 * @returns {Promise<{hasMigrations:boolean, hasQueries:boolean, detection_error?:boolean}>}
 */
async function detectDatabaseScope(sd_id, supabase) {
  try {
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const searchLower = searchTerms.map(t => t.replace('SD-', '').toLowerCase());

    // Signal 1: SD-matched migration files on disk (mirrors B1 detection).
    let hasMigrations = false;
    const migrationDirs = ['database/migrations', 'supabase/migrations', 'migrations'];
    for (const repo of implementationRepos) {
      for (const dir of migrationDirs) {
        const fullPath = path.join(repo, dir);
        if (existsSync(fullPath)) {
          const files = await readdir(fullPath);
          if (files.some(f => searchLower.some(term => f.toLowerCase().includes(term)))) {
            hasMigrations = true;
          }
        }
      }
    }

    // Signal 2: database query signals in the SD's diff.
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
    const dbSignal = /\.from\(|\.rpc\(|create\s+table|alter\s+table|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+policy|alter\s+policy/i;
    const hasQueries = dbSignal.test(gitDiff);

    return { hasMigrations, hasQueries };
  } catch (error) {
    // Conservative: on detection failure do NOT grant the N/A pass.
    return { hasMigrations: true, hasQueries: true, detection_error: true };
  }
}
