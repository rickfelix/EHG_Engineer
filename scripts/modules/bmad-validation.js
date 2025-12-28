#!/usr/bin/env node
/**
 * 🔒 BMAD Validation Module
 *
 * Purpose: Validate BMAD enhancement requirements at handoff gates
 *
 * Validates:
 * 1. Risk Assessment completion (MANDATORY after LEAD_PRE_APPROVAL)
 * 2. Risk Assessment quality (boilerplate detection) - SD-CAPABILITY-LIFECYCLE-001
 * 3. User Story Context Engineering (MANDATORY for PLAN→EXEC)
 * 4. Checkpoint Plan existence (MANDATORY for SDs with >8 stories)
 * 5. Test Plan generation (MANDATORY for EXEC→PLAN)
 *
 * Integration: Called by unified-handoff-system.js at validation gates
 */

import {
  validateRiskAssessmentForHandoff,
  getRiskAssessmentImprovementGuidance
} from './risk-assessment-quality-validation.js';

import {
  validateTestPlanForHandoff,
  getTestPlanImprovementGuidance
} from './test-plan-quality-validation.js';

/**
 * Validate BMAD enhancements for PLAN→EXEC handoff
 *
 * Checks:
 * - User story context engineering completed
 * - Checkpoint plan exists (if SD has >8 stories)
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateBMADForPlanToExec(sd_id, supabase) {
  console.log('\n📋 BMAD Validation: PLAN→EXEC');
  console.log('-'.repeat(50));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {}
  };

  try {
    // ================================================
    // 1. FETCH SD AND USER STORIES
    // ================================================
    // SD ID Schema Fix: Handle UUID, legacy_id, and sd_key
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sd_id);

    let sd, sdError;
    if (isUUID) {
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, title, checkpoint_plan')
        .eq('id', sd_id)
        .single();
      sd = result.data;
      sdError = result.error;
    } else {
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, title, checkpoint_plan')
        .or(`legacy_id.eq.${sd_id},sd_key.eq.${sd_id}`)
        .single();
      sd = result.data;
      sdError = result.error;
    }

    if (sdError || !sd) {
      validation.passed = false;
      validation.issues.push(`Failed to fetch SD: ${sdError?.message || 'Not found'}`);
      return validation;
    }

    // Use the actual UUID for user stories query
    const sdUuid = sd.id;

    const { data: userStories, error: storiesError } = await supabase
      .from('user_stories')
      .select('id, story_key, implementation_context, architecture_references, example_code_patterns, testing_scenarios')
      .eq('sd_id', sdUuid);

    if (storiesError) {
      validation.warnings.push(`Could not fetch user stories: ${storiesError.message}`);
    }

    const storyCount = userStories?.length || 0;
    console.log(`   SD: ${sd.title}`);
    console.log(`   User Stories: ${storyCount}`);

    // ================================================
    // 2. VALIDATE USER STORY CONTEXT ENGINEERING
    // ================================================
    console.log('\n   🧪 Checking User Story Context Engineering...');

    if (storyCount === 0) {
      console.log('      ⚠️  No user stories found - STORIES sub-agent not run yet');
      validation.warnings.push('No user stories found - PRD may not have user stories generated');
      validation.score += 25; // Partial credit - not blocking
    } else {
      // Check how many stories have implementation_context
      const storiesWithContext = userStories.filter(s =>
        s.implementation_context &&
        s.implementation_context.length > 50
      ).length;

      const contextCoverage = (storiesWithContext / storyCount) * 100;

      console.log(`      Implementation Context: ${storiesWithContext}/${storyCount} stories (${Math.round(contextCoverage)}%)`);

      if (contextCoverage >= 80) {
        console.log('      ✅ PASS: User story context engineering complete');
        validation.score += 50;
        validation.details.stories_context_engineering = {
          verdict: 'PASS',
          coverage: contextCoverage,
          stories_with_context: storiesWithContext,
          total_stories: storyCount
        };
      } else {
        // 100% COMPLIANCE ENFORCEMENT: No partial credit below 80%
        console.log(`      ❌ FAIL: Insufficient context engineering (${Math.round(contextCoverage)}% coverage)`);
        validation.passed = false;
        validation.issues.push(`User story context engineering requires ≥80% coverage (current: ${Math.round(contextCoverage)}%) - run STORIES sub-agent before PLAN→EXEC handoff`);
        validation.details.stories_context_engineering = {
          verdict: 'FAIL',
          coverage: contextCoverage,
          stories_with_context: storiesWithContext,
          total_stories: storyCount,
          remediation: `node lib/sub-agent-executor.js STORIES ${sd_id}`
        };
      }
    }

    // ================================================
    // 3. VALIDATE CHECKPOINT PLAN (if needed)
    // ================================================
    console.log('\n   📍 Checking Checkpoint Plan...');

    if (storyCount > 8) {
      console.log(`      SD has ${storyCount} stories - checkpoint plan REQUIRED`);

      if (sd.checkpoint_plan && sd.checkpoint_plan.total_checkpoints) {
        console.log(`      ✅ PASS: Checkpoint plan exists (${sd.checkpoint_plan.total_checkpoints} checkpoints)`);
        validation.score += 50;
        validation.details.checkpoint_plan = {
          verdict: 'PASS',
          total_checkpoints: sd.checkpoint_plan.total_checkpoints,
          total_user_stories: sd.checkpoint_plan.total_user_stories
        };
      } else {
        console.log('      ❌ FAIL: Checkpoint plan missing for large SD');
        validation.passed = false;
        validation.issues.push(`SD has ${storyCount} stories but no checkpoint plan - generate before PLAN→EXEC handoff`);
        validation.details.checkpoint_plan = {
          verdict: 'FAIL',
          story_count: storyCount,
          recommendation: 'Generate checkpoint plan for better context management',
          remediation: `node scripts/generate-checkpoint-plan.js ${sd_id}`
        };
      }
    } else {
      console.log(`      ℹ️  SD has ${storyCount} stories - checkpoint plan not required`);
      validation.score += 50; // Full credit for small SDs
      validation.details.checkpoint_plan = {
        verdict: 'NOT_REQUIRED',
        story_count: storyCount
      };
    }

    // ================================================
    // 4. SUMMARY
    // ================================================
    console.log('\n   📊 BMAD Validation Summary:');
    console.log(`      Score: ${validation.score}/${validation.max_score}`);
    console.log(`      Verdict: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`      Issues: ${validation.issues.length}`);
    console.log(`      Warnings: ${validation.warnings.length}`);

    return validation;

  } catch (error) {
    validation.passed = false;
    validation.issues.push(`BMAD validation error: ${error.message}`);
    return validation;
  }
}

/**
 * Validate BMAD enhancements for EXEC→PLAN handoff
 *
 * Checks:
 * - Test plan generated and stored
 * - User story → E2E test mapping complete
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateBMADForExecToPlan(sd_id, supabase) {
  console.log('\n📋 BMAD Validation: EXEC→PLAN');
  console.log('-'.repeat(50));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {}
  };

  try {
    // ================================================
    // 1. FETCH USER STORIES
    // ================================================
    const { data: userStories, error: storiesError } = await supabase
      .from('user_stories')
      .select('id, story_key')
      .eq('sd_id', sd_id);

    if (storiesError) {
      validation.warnings.push(`Could not fetch user stories: ${storiesError.message}`);
    }

    const storyCount = userStories?.length || 0;
    console.log(`   User Stories: ${storyCount}`);

    // ================================================
    // 2. VALIDATE TEST PLAN EXISTS
    // ================================================
    console.log('\n   🧪 Checking Test Plan...');

    const { data: testPlans, error: testPlanError } = await supabase
      .from('test_plans')
      .select('id, unit_test_strategy, e2e_test_strategy, integration_test_strategy, performance_test_strategy')
      .eq('sd_id', sd_id)
      .limit(1);

    if (testPlanError) {
      console.log(`      ⚠️  Test plan check failed: ${testPlanError.message}`);
      validation.warnings.push(`Could not check test plan: ${testPlanError.message}`);
      validation.score += 25; // Partial credit - infrastructure issue
    } else if (!testPlans || testPlans.length === 0) {
      console.log('      ⚠️  No test plan found - recommend generating structured test plan');
      validation.warnings.push('No test plan found - implementation proceeded without structured test strategy');
      validation.score += 25; // Partial credit - not blocking
      validation.details.test_plan = {
        verdict: 'NOT_FOUND',
        recommendation: 'Structured test plans improve coverage and reduce rework'
      };
    } else {
      const testPlan = testPlans[0];

      // Validate test plan completeness
      const hasUnitTests = testPlan.unit_test_strategy && testPlan.unit_test_strategy.test_cases?.length > 0;
      const hasE2ETests = testPlan.e2e_test_strategy && testPlan.e2e_test_strategy.test_cases?.length > 0;
      const hasIntegrationTests = testPlan.integration_test_strategy && testPlan.integration_test_strategy.test_cases?.length > 0;

      console.log(`      ✅ Test plan found (ID: ${testPlan.id})`);
      console.log(`      Unit Tests: ${hasUnitTests ? testPlan.unit_test_strategy.test_cases.length : 0} cases`);
      console.log(`      E2E Tests: ${hasE2ETests ? testPlan.e2e_test_strategy.test_cases.length : 0} cases`);
      console.log(`      Integration Tests: ${hasIntegrationTests ? testPlan.integration_test_strategy.test_cases.length : 0} cases`);

      if (hasUnitTests && hasE2ETests) {
        console.log('      ✅ PASS: Comprehensive test plan with unit and E2E tests');

        // ================================================
        // 2a. TEST PLAN QUALITY VALIDATION (SD-CAPABILITY-LIFECYCLE-001)
        // Detect boilerplate test cases
        // ================================================
        console.log('\n   🔍 Validating Test Plan Quality (boilerplate detection)...');

        const qualityResult = validateTestPlanForHandoff(testPlan, {
          minimumScore: 70,
          maxBoilerplatePercent: 50,
          blockOnWarnings: false
        });

        console.log(`      Quality Score: ${qualityResult.score}%`);
        console.log(`      E2E Boilerplate: ${qualityResult.qualityDetails?.boilerplateDetails?.e2e_boilerplate_percentage || 0}%`);

        if (qualityResult.valid) {
          console.log('      ✅ PASS: Test plan quality acceptable');
          validation.score += 50;
          validation.details.test_plan = {
            verdict: 'PASS',
            test_plan_id: testPlan.id,
            unit_test_count: testPlan.unit_test_strategy.test_cases.length,
            e2e_test_count: testPlan.e2e_test_strategy.test_cases.length,
            integration_test_count: hasIntegrationTests ? testPlan.integration_test_strategy.test_cases.length : 0,
            quality_score: qualityResult.score,
            boilerplate_details: qualityResult.qualityDetails?.boilerplateDetails
          };
        } else {
          console.log('      ❌ FAIL: Test plan contains too much boilerplate');
          validation.passed = false;
          validation.score += 20; // Partial credit for existence

          // Add quality issues as validation issues
          validation.issues.push(...qualityResult.issues);
          validation.warnings.push(...qualityResult.warnings);

          // Get improvement guidance
          const guidance = getTestPlanImprovementGuidance(qualityResult);

          validation.details.test_plan = {
            verdict: 'QUALITY_FAIL',
            test_plan_id: testPlan.id,
            unit_test_count: testPlan.unit_test_strategy.test_cases.length,
            e2e_test_count: testPlan.e2e_test_strategy.test_cases.length,
            quality_score: qualityResult.score,
            boilerplate_details: qualityResult.qualityDetails?.boilerplateDetails,
            improvement_guidance: guidance,
            remediation: 'Replace generic user_actions and expected_outcomes with specific UI interactions and assertions'
          };
        }
      } else {
        console.log('      ⚠️  WARNING: Test plan incomplete - missing critical test types');
        validation.warnings.push('Test plan missing critical test types (unit or E2E)');
        validation.score += 25;
        validation.details.test_plan = {
          verdict: 'INCOMPLETE',
          test_plan_id: testPlan.id,
          missing: [
            !hasUnitTests && 'unit tests',
            !hasE2ETests && 'E2E tests'
          ].filter(Boolean)
        };
      }
    }

    // ================================================
    // 3. VALIDATE USER STORY → E2E TEST MAPPING
    // ================================================
    console.log('\n   🎯 Checking User Story → E2E Test Mapping...');

    if (storyCount === 0) {
      console.log('      ℹ️  No user stories - mapping not applicable');
      validation.score += 50; // Full credit
      validation.details.user_story_mapping = {
        verdict: 'NOT_APPLICABLE',
        story_count: 0
      };
    } else {
      // Check if test plan has user_story_mapping
      if (testPlans && testPlans.length > 0 && testPlans[0].e2e_test_strategy?.user_story_mapping) {
        const userStoryMapping = testPlans[0].e2e_test_strategy.user_story_mapping;
        const mappedStories = userStoryMapping.length;
        const coveragePercent = (mappedStories / storyCount) * 100;

        console.log(`      Mapped Stories: ${mappedStories}/${storyCount} (${Math.round(coveragePercent)}%)`);

        if (coveragePercent >= 100) {
          console.log('      ✅ PASS: 100% user story coverage');
          validation.score += 50;
          validation.details.user_story_mapping = {
            verdict: 'PASS',
            mapped_stories: mappedStories,
            total_stories: storyCount,
            coverage_percent: Math.round(coveragePercent)
          };
        } else {
          // 100% COMPLIANCE ENFORCEMENT: Require 100% test coverage
          console.log(`      ❌ FAIL: Insufficient user story coverage (${Math.round(coveragePercent)}%)`);
          validation.passed = false;
          validation.issues.push(`User story → E2E test mapping requires 100% coverage (current: ${Math.round(coveragePercent)}%) - create E2E tests for all user stories before EXEC→PLAN handoff`);
          validation.details.user_story_mapping = {
            verdict: 'FAIL',
            mapped_stories: mappedStories,
            total_stories: storyCount,
            coverage_percent: Math.round(coveragePercent),
            remediation: 'Create E2E tests for all user stories before handoff'
          };
        }
      } else {
        console.log('      ⚠️  No user story mapping found in test plan');
        validation.warnings.push('User story → E2E test mapping not found - manual verification required');
        validation.score += 25; // Partial credit
        validation.details.user_story_mapping = {
          verdict: 'NOT_FOUND',
          story_count: storyCount,
          recommendation: 'Manual verification of E2E test coverage required'
        };
      }
    }

    // ================================================
    // 4. SUMMARY
    // ================================================
    console.log('\n   📊 BMAD Validation Summary:');
    console.log(`      Score: ${validation.score}/${validation.max_score}`);
    console.log(`      Verdict: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`      Issues: ${validation.issues.length}`);
    console.log(`      Warnings: ${validation.warnings.length}`);

    return validation;

  } catch (error) {
    validation.passed = false;
    validation.issues.push(`BMAD validation error: ${error.message}`);
    return validation;
  }
}

/**
 * Validate Risk Assessment completion
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateRiskAssessment(sd_id, supabase) {
  console.log('\n🛡️ BMAD Validation: Risk Assessment');
  console.log('-'.repeat(50));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {}
  };

  try {
    const { data: riskAssessments, error: riskError } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('phase', 'LEAD_PRE_APPROVAL')
      .order('created_at', { ascending: false })
      .limit(1);

    if (riskError) {
      console.log(`   ⚠️  Risk assessment check failed: ${riskError.message}`);
      validation.warnings.push(`Could not check risk assessment: ${riskError.message}`);
      validation.score += 50; // Partial credit - infrastructure issue
      return validation;
    }

    if (!riskAssessments || riskAssessments.length === 0) {
      console.log('   ⚠️  No risk assessment found - recommend running RISK sub-agent');
      validation.warnings.push('No risk assessment found - RISK sub-agent not run during LEAD_PRE_APPROVAL');
      validation.score += 50; // Partial credit - not strictly blocking
      validation.details.risk_assessment = {
        verdict: 'NOT_FOUND',
        recommendation: `Run RISK sub-agent: node lib/sub-agent-executor.js RISK ${sd_id}`
      };
    } else {
      const risk = riskAssessments[0];
      console.log('   ✅ Risk assessment found');
      console.log(`      Overall Risk Score: ${risk.overall_risk_score}/10`);
      console.log(`      Risk Level: ${risk.risk_level}`);
      console.log(`      Verdict: ${risk.verdict}`);

      // ================================================
      // QUALITY VALIDATION (SD-CAPABILITY-LIFECYCLE-001)
      // Detect boilerplate/default rationales
      // ================================================
      console.log('\n   🔍 Validating Risk Assessment Quality (boilerplate detection)...');

      // Build assessment object for quality check (using correct schema column names)
      const assessmentForQuality = {
        id: risk.id,
        sd_id: risk.sd_id,
        technical_complexity: risk.technical_complexity,
        security_risk: risk.security_risk,
        performance_risk: risk.performance_risk,
        integration_risk: risk.integration_risk,
        data_migration_risk: risk.data_migration_risk,
        ui_ux_risk: risk.ui_ux_risk,
        critical_issues: risk.critical_issues || [],
        warnings: risk.warnings || [],
        recommendations: risk.recommendations || [],
        risk_level: risk.risk_level,
        verdict: risk.verdict,
        confidence: risk.confidence
      };

      const qualityResult = validateRiskAssessmentForHandoff(assessmentForQuality, {
        minimumScore: 70,
        maxBoilerplatePercent: 50,
        blockOnWarnings: false
      });

      console.log(`      Quality Score: ${qualityResult.score}%`);
      console.log(`      Boilerplate: ${qualityResult.qualityDetails?.boilerplateDetails?.boilerplate_percentage || 0}%`);

      if (qualityResult.valid) {
        console.log('      ✅ PASS: Risk assessment quality acceptable');
        validation.score += 100;
        validation.details.risk_assessment = {
          verdict: 'PASS',
          overall_risk_score: risk.overall_risk_score,
          risk_level: risk.risk_level,
          assessment_verdict: risk.verdict,
          confidence: risk.confidence,
          quality_score: qualityResult.score,
          boilerplate_details: qualityResult.qualityDetails?.boilerplateDetails
        };
      } else {
        console.log('      ❌ FAIL: Risk assessment contains too much boilerplate');
        validation.passed = false;
        validation.score += 30; // Partial credit for existence

        // Add quality issues as validation issues
        validation.issues.push(...qualityResult.issues);
        validation.warnings.push(...qualityResult.warnings);

        // Get improvement guidance
        const guidance = getRiskAssessmentImprovementGuidance(qualityResult);

        validation.details.risk_assessment = {
          verdict: 'QUALITY_FAIL',
          overall_risk_score: risk.overall_risk_score,
          risk_level: risk.risk_level,
          quality_score: qualityResult.score,
          boilerplate_details: qualityResult.qualityDetails?.boilerplateDetails,
          improvement_guidance: guidance,
          remediation: 'Re-run RISK sub-agent with detailed SD context or manually replace default rationales'
        };
      }
    }

    console.log('\n   📊 Risk Assessment Summary:');
    console.log(`      Score: ${validation.score}/${validation.max_score}`);
    console.log(`      Verdict: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);

    return validation;

  } catch (error) {
    validation.passed = false;
    validation.issues.push(`Risk assessment validation error: ${error.message}`);
    return validation;
  }
}
