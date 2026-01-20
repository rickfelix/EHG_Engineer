/**
 * Section C: Traceability Mapping (25 points - MAJOR)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 *
 * Phase-aware: Traceability important but not critical
 * SD-type aware: Security SDs use security terms, not generic design/database terms
 */

import { execAsync } from '../utils.js';

/**
 * Validate Traceability Mapping
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} sdUuid - Resolved SD UUID
 * @param {Object} designAnalysis - Design analysis from PRD
 * @param {Object} databaseAnalysis - Database analysis from PRD
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 * @param {string|null} sdCategory - SD category
 * @param {string} gitRepoPath - Path to git repository
 * @param {string|null} sdType - SD type
 */
export async function validateTraceabilityMapping(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase, sdCategory = null, gitRepoPath = process.cwd(), sdType = null) {
  let sectionScore = 0;
  const sectionDetails = {};

  // Determine SD type flags
  const isSecuritySD = sdCategory === 'security' ||
                        sdCategory === 'authentication' ||
                        sdCategory === 'authorization';
  const isDatabaseSD = sdCategory === 'database';
  const isDocsSD = sdType === 'docs' || sdType === 'infrastructure' || sdCategory === 'infrastructure';
  const isRefactorSD = sdCategory === 'refactor';

  console.log('\n   [C] Traceability Mapping...');
  if (isSecuritySD) {
    console.log('   INFO Security SD detected - using security-specific terms');
  }
  if (isDocsSD) {
    console.log('   INFO Docs/Infrastructure SD detected - simplified traceability');
  }

  // Check for UI work in designAnalysis
  const hasUIDesign = designAnalysis?.specifications?.some(s =>
    /component|ui|frontend|form|page|view/i.test(JSON.stringify(s))
  ) || false;

  // Database SDs without UI get full credit
  if (isDatabaseSD && !hasUIDesign) {
    console.log('   OK Database SD without UI requirements - Section C not applicable (25/25)');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Database SD without UI requirements - traceability is migration file -> schema'
    };
    return;
  }

  // Refactor SDs get full credit
  if (isRefactorSD) {
    console.log('   OK Refactor SD - Section C uses REGRESSION traceability (25/25)');
    console.log('   INFO Traceability via REGRESSION: before/after behavior comparison');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Refactor SD - traceability validated via REGRESSION sub-agent behavior comparison'
    };
    return;
  }

  // Docs/Infrastructure SDs get full credit
  if (isDocsSD) {
    console.log('   OK Docs/Infrastructure SD - Section C simplified (25/25)');
    console.log('   INFO Traceability via PRD requirements -> documentation/implementation');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Docs/Infrastructure SD - no design/database requirements to trace'
    };
    return;
  }

  // C1: PRD -> Implementation mapping (7 points)
  console.log('\n   [C1] PRD -> Implementation Mapping...');

  try {
    const { stdout: gitLog } = await execAsync(
      `git log --all --grep="${sd_id}" --oneline`,
      { cwd: gitRepoPath, timeout: 10000 }
    );

    const commitCount = gitLog.trim().split('\n').filter(Boolean).length;

    if (commitCount > 0) {
      sectionScore += 7;
      sectionDetails.commits_referencing_sd = commitCount;
      console.log(`   OK Found ${commitCount} commit(s) referencing ${sd_id}`);
    } else {
      sectionScore += 3;
      validation.warnings.push('[C1] No commits found referencing SD ID');
      console.log('   WARN No commits reference SD ID (3/7)');
    }
  } catch (err) {
    sectionScore += 3;
    console.log('   WARN Cannot verify git commits (3/7)');
    console.log(`   DEBUG: Git error: ${err.message} | cwd: ${gitRepoPath}`);
  }

  // C2: Design analysis -> Code mapping (7 points)
  console.log('\n   [C2] Design Analysis -> Code Mapping...');

  if (designAnalysis) {
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables_manifest')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables_manifest) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables_manifest).toLowerCase();

      let hasMention = false;
      if (isSecuritySD) {
        hasMention = deliverablesStr.includes('security') ||
                     deliverablesStr.includes('auth') ||
                     deliverablesStr.includes('enforcement') ||
                     deliverablesStr.includes('validation') ||
                     deliverablesStr.includes('hardening') ||
                     deliverablesStr.includes('vulnerability') ||
                     deliverablesStr.includes('websocket') ||
                     deliverablesStr.includes('rls') ||
                     deliverablesStr.includes('policy');
      } else {
        hasMention = deliverablesStr.includes('design') ||
                     deliverablesStr.includes('ui') ||
                     deliverablesStr.includes('component');
      }

      if (hasMention) {
        sectionScore += 7;
        sectionDetails.design_code_mapping = true;
        const termType = isSecuritySD ? 'Security' : 'Design';
        console.log(`   OK ${termType} concepts mentioned in deliverables`);
      } else {
        sectionScore += 4;
        const termType = isSecuritySD ? 'Security' : 'Design';
        validation.warnings.push(`[C2] ${termType} concepts not clearly mentioned in deliverables`);
        console.log(`   WARN ${termType} not clearly mentioned (4/7)`);
      }
    } else {
      sectionScore += 4;
      console.log('   WARN No deliverables found (4/7)');
    }
  } else {
    sectionScore += 4;
    console.log('   WARN No design analysis to trace (4/7)');
  }

  // C3: Database analysis -> Schema mapping (6 points)
  console.log('\n   [C3] Database Analysis -> Schema Mapping...');

  if (databaseAnalysis) {
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables_manifest')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables_manifest) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables_manifest).toLowerCase();

      let hasMention = false;
      if (isSecuritySD) {
        hasMention = deliverablesStr.includes('rls') ||
                     deliverablesStr.includes('policy') ||
                     deliverablesStr.includes('permission') ||
                     deliverablesStr.includes('access') ||
                     deliverablesStr.includes('security') ||
                     deliverablesStr.includes('enforce') ||
                     deliverablesStr.includes('database') ||
                     deliverablesStr.includes('migration') ||
                     deliverablesStr.includes('schema');

        // Security SDs: If no database mentions but C2 passed, give full credit
        if (!hasMention && sectionDetails.design_code_mapping) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          sectionDetails.security_no_db_changes = true;
          console.log('   OK Security SD with no database changes (application-level hardening)');
        } else if (hasMention) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          console.log('   OK Security/database changes mentioned in deliverables');
        } else {
          sectionScore += 3;
          validation.warnings.push('[C3] Security/database changes not clearly mentioned in deliverables');
          console.log('   WARN Security/database not clearly mentioned (3/6)');
        }
      } else {
        hasMention = deliverablesStr.includes('database') ||
                     deliverablesStr.includes('migration') ||
                     deliverablesStr.includes('schema') ||
                     deliverablesStr.includes('table');

        if (hasMention) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          console.log('   OK Database changes mentioned in deliverables');
        } else {
          sectionScore += 3;
          validation.warnings.push('[C3] Database changes not clearly mentioned in deliverables');
          console.log('   WARN Database not clearly mentioned (3/6)');
        }
      }
    } else {
      sectionScore += 3;
      console.log('   WARN No deliverables found (3/6)');
    }
  } else {
    sectionScore += 3;
    console.log('   WARN No database analysis to trace (3/6)');
  }

  // Scale from 20 to 25 points (MAJOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 25);
  validation.score += scaledScore;
  validation.gate_scores.traceability_mapping = scaledScore;
  validation.details.traceability_mapping = sectionDetails;
  console.log(`\n   Section C Score: ${scaledScore}/25 (MAJOR - traceability)`);
}
