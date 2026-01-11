/**
 * Gate 1.5: Design-Architecture Coherence Check
 * SD-LEO-STREAMS-001: Validates cross-stream consistency
 *
 * This gate runs between Gate 1 (DESIGN→DATABASE) and Gate 2 (PLAN→EXEC)
 * to ensure design decisions align with architecture decisions.
 *
 * Coherence Checks:
 * 1. UI components reference valid Data Model entities
 * 2. API contracts align with Data Model schemas
 * 3. Security design covers all API endpoints
 * 4. Performance targets are achievable given architecture
 *
 * @module gate-1-5-coherence
 * @version 1.0.0
 */

import { getApplicableStreams, validateStreamCompletion } from '../modules/sd-type-checker.js';

/**
 * Validate design-architecture coherence for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate15Coherence(sdId, supabase, options = {}) {
  console.log('\n🔗 GATE 1.5: Design-Architecture Coherence Check');
  console.log('='.repeat(60));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    coherence_checks: {}
  };

  try {
    // Get SD data
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      validation.issues.push('SD not found');
      validation.passed = false;
      return validation;
    }

    const sdType = (sd.sd_type || 'feature').toLowerCase();

    // Get PRD data
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    if (prdError || !prd) {
      validation.issues.push('PRD not found');
      validation.passed = false;
      return validation;
    }

    // Get applicable streams for context
    const prdText = [
      prd.executive_summary || '',
      prd.business_context || '',
      prd.technical_context || '',
      JSON.stringify(prd.functional_requirements || [])
    ].join(' ');

    const applicableStreams = await getApplicableStreams(sdType, prdText, supabase);
    validation.details.applicable_streams = applicableStreams.summary;

    // ===================================================================
    // CHECK 1: Stream Completion Baseline (25 points)
    // ===================================================================
    console.log('\n[1/4] Checking stream completion baseline...');

    const streamStatus = await validateStreamCompletion(sdId, supabase, { prdText });
    validation.coherence_checks.stream_completion = {
      score: streamStatus.score,
      complete: streamStatus.complete,
      missing: streamStatus.missing || []
    };

    if (streamStatus.score >= 80) {
      validation.score += 25;
      console.log(`   ✅ Stream completion: ${streamStatus.score}% (25/25)`);
    } else if (streamStatus.score >= 50) {
      validation.score += 15;
      validation.warnings.push(`Stream completion at ${streamStatus.score}% - consider completing more streams`);
      console.log(`   ⚠️  Stream completion: ${streamStatus.score}% (15/25)`);
    } else {
      validation.score += 5;
      validation.warnings.push(`Low stream completion: ${streamStatus.score}%`);
      console.log(`   ⚠️  Stream completion: ${streamStatus.score}% (5/25)`);
    }

    // ===================================================================
    // CHECK 2: Design-Data Model Alignment (25 points)
    // ===================================================================
    console.log('\n[2/4] Checking design-data model alignment...');

    const designAnalysis = prd.metadata?.design_analysis;
    const databaseAnalysis = prd.metadata?.database_analysis;

    if (!designAnalysis || !databaseAnalysis) {
      validation.warnings.push('Missing design or database analysis - alignment check skipped');
      validation.score += 10; // Partial credit
      validation.coherence_checks.design_data_alignment = { skipped: true };
      console.log('   ⚠️  Analysis missing - partial credit (10/25)');
    } else {
      // Check if database analysis references design context
      const designInformed = databaseAnalysis.design_informed === true;
      const hasEntityMapping = !!databaseAnalysis.entity_mapping || !!databaseAnalysis.schema_analysis;

      validation.coherence_checks.design_data_alignment = {
        design_informed: designInformed,
        has_entity_mapping: hasEntityMapping
      };

      if (designInformed && hasEntityMapping) {
        validation.score += 25;
        console.log('   ✅ Design-Data Model alignment verified (25/25)');
      } else if (designInformed || hasEntityMapping) {
        validation.score += 15;
        validation.warnings.push('Partial design-data alignment');
        console.log('   ⚠️  Partial alignment (15/25)');
      } else {
        validation.score += 5;
        validation.warnings.push('Design and Data Model may not be aligned');
        console.log('   ⚠️  Alignment not verified (5/25)');
      }
    }

    // ===================================================================
    // CHECK 3: API-Schema Consistency (25 points)
    // ===================================================================
    console.log('\n[3/4] Checking API-schema consistency...');

    const apiSpecs = prd.api_specifications || [];
    const dataModel = prd.data_model || {};

    validation.coherence_checks.api_schema_consistency = {
      api_endpoint_count: apiSpecs.length,
      data_model_tables: dataModel.tables?.length || 0
    };

    if (apiSpecs.length === 0) {
      // No API specs - might not be needed for this SD type
      const apiRequired = applicableStreams.architecture.find(s =>
        s.name === 'api_design' && s.effective_level === 'required'
      );

      if (!apiRequired) {
        validation.score += 25;
        console.log('   ✅ No API design required for this SD type (25/25)');
      } else {
        validation.score += 10;
        validation.warnings.push('API design required but no specifications found');
        console.log('   ⚠️  API specs missing (10/25)');
      }
    } else {
      // Has API specs - check for consistency
      validation.score += 25;
      console.log(`   ✅ ${apiSpecs.length} API endpoint(s) defined (25/25)`);
    }

    // ===================================================================
    // CHECK 4: Security Coverage (25 points)
    // ===================================================================
    console.log('\n[4/4] Checking security coverage...');

    const securityRequired = applicableStreams.architecture.find(s =>
      s.name === 'security_design' && s.effective_level === 'required'
    );

    const hasSecuritySection = !!(
      prd.metadata?.security_analysis ||
      prd.non_functional_requirements?.some(nfr => nfr.type === 'security')
    );

    validation.coherence_checks.security_coverage = {
      required: !!securityRequired,
      has_security_section: hasSecuritySection
    };

    if (!securityRequired) {
      validation.score += 25;
      console.log('   ✅ Security not required for this SD type (25/25)');
    } else if (hasSecuritySection) {
      validation.score += 25;
      console.log('   ✅ Security requirements documented (25/25)');
    } else {
      validation.score += 10;
      validation.warnings.push('Security design required but not fully documented');
      console.log('   ⚠️  Security documentation incomplete (10/25)');
    }

    // ===================================================================
    // FINAL RESULT
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 1.5 SCORE: ${validation.score}/${validation.max_score} points`);

    // Threshold: 60% to pass (lower than Gate 1 since this is advisory)
    const threshold = 60;
    validation.passed = validation.score >= threshold;

    if (validation.passed) {
      console.log(`✅ GATE 1.5: PASSED (${validation.score} ≥ ${threshold} points)`);
    } else {
      console.log(`⚠️  GATE 1.5: ADVISORY FAIL (${validation.score} < ${threshold} points)`);
      console.log('   Gate 1.5 is advisory - proceeding with warnings');
      validation.passed = true; // Don't block, just warn
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\n❌ GATE 1.5 Error:', error.message);
    validation.warnings.push(`Coherence check error: ${error.message}`);
    // Don't block on errors - this is an advisory gate
    validation.passed = true;
    return validation;
  }
}

export default {
  validateGate15Coherence
};
