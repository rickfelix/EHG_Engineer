/**
 * Section A: Recommendation Adherence (30 points - CRITICAL)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 */

/**
 * Validate Recommendation Adherence
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD
 * @param {Object} databaseAnalysis - Database analysis from PRD
 * @param {Object} gate2Data - Gate 2 validation results
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 * @param {string|null} sdCategory - SD category
 * @param {string|null} sdType - SD type
 */
export async function validateRecommendationAdherence(sd_id, designAnalysis, databaseAnalysis, gate2Data, validation, supabase, sdCategory = null, sdType = null) {
  let sectionScore = 0;
  const sectionDetails = {};

  // Database SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  const isDatabaseSD = sdCategory === 'database';
  if (isDatabaseSD && gate2Data && gate2Data.validation_score >= 85) {
    console.log('   OK Database SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Database SD passed Gate 2 - recommendation adherence validated via migration execution',
      gate2_score: gate2Data.validation_score
    };
    return;
  }

  // Refactor SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  const isRefactorSD = sdCategory === 'refactor';
  if (isRefactorSD && gate2Data && gate2Data.validation_score >= 80) {
    console.log('   OK Refactor SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    console.log('   INFO Refactor validation via REGRESSION sub-agent (no behavior change)');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Refactor SD passed Gate 2 - recommendation adherence validated via REGRESSION sub-agent',
      gate2_score: gate2Data.validation_score
    };
    return;
  }

  // Docs/Infrastructure SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  const isDocsSD = sdType === 'docs' || sdType === 'infrastructure' || sdCategory === 'infrastructure';
  if (isDocsSD && gate2Data && gate2Data.score >= 80) {
    console.log('   OK Docs/Infrastructure SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    console.log('   INFO Docs SDs validated via implementation quality, not design/database fidelity');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Docs/Infrastructure SD passed Gate 2 - no design/database recommendations to adhere to',
      gate2_score: gate2Data.score
    };
    return;
  }

  // A1: Design recommendations adherence (10 points)
  console.log('\n   [A1] Design Recommendations Adherence...');

  const designFidelityScore = gate2Data?.gate_scores?.design_fidelity;
  const designFidelityDetails = gate2Data?.details?.design_fidelity;
  const hasDesignFidelityData = designFidelityScore !== undefined ||
    (designFidelityDetails && (designFidelityDetails.components_implemented > 0 || designFidelityDetails.component_files?.length > 0));

  if (designAnalysis && hasDesignFidelityData) {
    let adherencePercent;
    if (designFidelityScore !== undefined) {
      adherencePercent = (designFidelityScore / 25) * 100;
    } else if (designFidelityDetails?.components_implemented > 0) {
      adherencePercent = Math.min(100, (designFidelityDetails.components_implemented / 5) * 100);
    } else if (designFidelityDetails?.component_files?.length > 0) {
      adherencePercent = Math.min(100, (designFidelityDetails.component_files.length / 5) * 100);
    } else {
      adherencePercent = 50;
    }

    sectionDetails.design_adherence_percent = Math.round(adherencePercent);

    if (adherencePercent >= 80) {
      sectionScore += 10;
      console.log(`   OK Design adherence: ${Math.round(adherencePercent)}%`);
    } else if (adherencePercent >= 60) {
      sectionScore += 7;
      validation.warnings.push(`[A1] Design adherence below target: ${Math.round(adherencePercent)}%`);
      console.log(`   WARN Design adherence: ${Math.round(adherencePercent)}% (7/10)`);
    } else {
      sectionScore += 4;
      validation.warnings.push(`[A1] Low design adherence: ${Math.round(adherencePercent)}%`);
      console.log(`   WARN Design adherence: ${Math.round(adherencePercent)}% (4/10)`);
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No design fidelity data available (5/10)');
  }

  // A2: Database recommendations adherence (10 points)
  console.log('\n   [A2] Database Recommendations Adherence...');

  const databaseFidelityScore = gate2Data?.gate_scores?.database_fidelity;
  const databaseFidelityDetails = gate2Data?.details?.database_fidelity;
  const dataFlowAlignment = gate2Data?.details?.data_flow_alignment;
  const hasDatabaseFidelityData = databaseFidelityScore !== undefined ||
    (databaseFidelityDetails && Object.keys(databaseFidelityDetails).length > 0) ||
    (dataFlowAlignment && (dataFlowAlignment.database_queries_found || dataFlowAlignment.data_validation_found));

  if (databaseAnalysis && hasDatabaseFidelityData) {
    let adherencePercent;
    if (databaseFidelityScore !== undefined) {
      adherencePercent = (databaseFidelityScore / 25) * 100;
    } else if (dataFlowAlignment) {
      const checks = [
        dataFlowAlignment.database_queries_found,
        dataFlowAlignment.data_validation_found,
        dataFlowAlignment.form_integration_found
      ];
      const passedChecks = checks.filter(Boolean).length;
      adherencePercent = (passedChecks / checks.length) * 100;
    } else {
      adherencePercent = 70;
    }

    sectionDetails.database_adherence_percent = Math.round(adherencePercent);

    if (adherencePercent >= 80) {
      sectionScore += 10;
      console.log(`   OK Database adherence: ${Math.round(adherencePercent)}%`);
    } else if (adherencePercent >= 60) {
      sectionScore += 7;
      validation.warnings.push(`[A2] Database adherence below target: ${Math.round(adherencePercent)}%`);
      console.log(`   WARN Database adherence: ${Math.round(adherencePercent)}% (7/10)`);
    } else {
      sectionScore += 4;
      validation.warnings.push(`[A2] Low database adherence: ${Math.round(adherencePercent)}%`);
      console.log(`   WARN Database adherence: ${Math.round(adherencePercent)}% (4/10)`);
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No database fidelity data available (5/10)');
  }

  // Scale from 20 to 30 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 30);
  validation.score += scaledScore;
  validation.gate_scores.recommendation_adherence = scaledScore;
  validation.details.recommendation_adherence = sectionDetails;
  console.log(`\n   Section A Score: ${scaledScore}/30 (CRITICAL - fidelity focus)`);
}
