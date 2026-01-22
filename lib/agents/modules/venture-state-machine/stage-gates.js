/**
 * VentureStateMachine - Stage Gates Module
 *
 * SD-INDUSTRIAL-2025-001: Stage-Specific Gate Validation
 * Validates business rules for critical stage transitions.
 *
 * @module lib/agents/modules/venture-state-machine/stage-gates
 */

/**
 * SD-INDUSTRIAL-2025-001: Stage-Specific Gate Validation
 * Validates business rules for critical stage transitions
 * Called BEFORE Golden Nugget validation in _approveHandoff
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {number} fromStage - Current stage
 * @param {number} toStage - Target stage
 * @returns {Promise<Object>} { passed: boolean, gate_name: string, details: object }
 */
export async function validateStageGate(supabase, ventureId, fromStage, toStage) {
  const transition = `${fromStage}->${toStage}`;
  console.log(`   Checking stage gate for transition ${transition}`);

  switch (transition) {
    case '5->6':
      return validateFinancialViabilityGate(supabase, ventureId);
    case '21->22':
      return validateUATSignoffGate(supabase, ventureId);
    case '22->23':
      return validateDeploymentHealthGate(supabase, ventureId);
    default:
      // No specific gate for this transition
      return { passed: true, gate_name: null, details: { message: 'No stage-specific gate required' } };
  }
}

/**
 * Financial Viability Gate (Stage 5->6)
 * Validates business model before proceeding to GTM stages
 * Checks: pricing_model artifact exists with valid unit economics
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateFinancialViabilityGate(supabase, ventureId) {
  console.log('   Validating Financial Viability Gate (5->6)');

  const gateResult = {
    passed: false,
    gate_name: 'FINANCIAL_VIABILITY',
    checks: [],
    details: {}
  };

  // Check 1: pricing_model artifact exists
  const { data: pricingArtifact, error: pricingError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 7) // Stage 7 is Pricing Strategy
    .eq('artifact_type', 'pricing_model')
    .eq('is_current', true)
    .single();

  if (pricingError || !pricingArtifact) {
    gateResult.checks.push({ check: 'pricing_model_exists', passed: false, reason: 'No pricing model artifact found' });
    gateResult.details.missing_artifact = 'pricing_model';
    return gateResult;
  }
  gateResult.checks.push({ check: 'pricing_model_exists', passed: true });

  // Check 2: business_model_canvas artifact exists
  const { data: bmcArtifact, error: bmcError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 8) // Stage 8 is BMC
    .eq('artifact_type', 'business_model_canvas')
    .eq('is_current', true)
    .single();

  if (bmcError || !bmcArtifact) {
    gateResult.checks.push({ check: 'bmc_exists', passed: false, reason: 'No business model canvas found' });
    gateResult.details.missing_artifact = 'business_model_canvas';
    return gateResult;
  }
  gateResult.checks.push({ check: 'bmc_exists', passed: true });

  // Check 3: Validate pricing data has required fields
  const pricingData = pricingArtifact.artifact_data;
  const hasRevenueStreams = pricingData?.revenueStreams?.length > 0 || pricingData?.tiers?.length > 0;
  if (!hasRevenueStreams) {
    gateResult.checks.push({ check: 'revenue_streams_defined', passed: false, reason: 'No revenue streams or pricing tiers defined' });
    return gateResult;
  }
  gateResult.checks.push({ check: 'revenue_streams_defined', passed: true });

  gateResult.passed = true;
  gateResult.details = {
    pricing_artifact_date: pricingArtifact.created_at,
    bmc_artifact_date: bmcArtifact.created_at,
    message: 'Financial viability validated - pricing model and BMC present'
  };

  console.log('   Financial Viability Gate PASSED');
  return gateResult;
}

/**
 * UAT Programmatic Signoff Gate (Stage 21->22)
 * Validates all UAT scenarios passed before deployment
 * Checks: test_coverage_report artifact with 100% UAT pass rate
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateUATSignoffGate(supabase, ventureId) {
  console.log('   Validating UAT Signoff Gate (21->22)');

  const gateResult = {
    passed: false,
    gate_name: 'UAT_SIGNOFF',
    checks: [],
    details: {}
  };

  // Check 1: test_coverage_report artifact exists
  const { data: testArtifact, error: testError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 21)
    .eq('artifact_type', 'test_coverage_report')
    .eq('is_current', true)
    .single();

  if (testError || !testArtifact) {
    gateResult.checks.push({ check: 'test_report_exists', passed: false, reason: 'No test coverage report found' });
    gateResult.details.missing_artifact = 'test_coverage_report';
    return gateResult;
  }
  gateResult.checks.push({ check: 'test_report_exists', passed: true });

  // Check 2: Validate UAT scenarios completion
  const testData = testArtifact.artifact_data;
  const uatScenarios = testData?.uatScenarios || [];
  const passedScenarios = uatScenarios.filter(s => s.status === 'passed').length;
  const totalScenarios = uatScenarios.length;
  const uatPassRate = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;

  if (uatPassRate < 100) {
    gateResult.checks.push({
      check: 'uat_100_percent_pass',
      passed: false,
      reason: `UAT pass rate ${uatPassRate.toFixed(1)}% < 100% required`,
      details: { passed: passedScenarios, total: totalScenarios, rate: uatPassRate }
    });
    gateResult.details.uat_pass_rate = uatPassRate;
    gateResult.details.scenarios_remaining = totalScenarios - passedScenarios;
    return gateResult;
  }
  gateResult.checks.push({ check: 'uat_100_percent_pass', passed: true, details: { rate: uatPassRate } });

  // Check 3: Validate automated test suites pass rate
  const testSuites = testData?.testSuites || [];
  const totalTests = testSuites.reduce((sum, s) => sum + (s.total || 0), 0);
  const passedTests = testSuites.reduce((sum, s) => sum + (s.passed || 0), 0);
  const automatedPassRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

  if (automatedPassRate < 95) { // Allow 5% tolerance for flaky tests
    gateResult.checks.push({
      check: 'automated_tests_threshold',
      passed: false,
      reason: `Automated test pass rate ${automatedPassRate.toFixed(1)}% < 95% threshold`,
      details: { passed: passedTests, total: totalTests, rate: automatedPassRate }
    });
    return gateResult;
  }
  gateResult.checks.push({ check: 'automated_tests_threshold', passed: true, details: { rate: automatedPassRate } });

  gateResult.passed = true;
  gateResult.details = {
    uat_pass_rate: uatPassRate,
    automated_pass_rate: automatedPassRate,
    total_uat_scenarios: totalScenarios,
    total_automated_tests: totalTests,
    message: 'UAT signoff validated - all scenarios passed, automated tests at threshold'
  };

  console.log(`   UAT Signoff Gate PASSED (UAT: ${uatPassRate}%, Automated: ${automatedPassRate.toFixed(1)}%)`);
  return gateResult;
}

/**
 * Deployment Health Verification Gate (Stage 22->23)
 * Validates deployment readiness before production launch
 * Checks: deployment_runbook artifact with all checklist items complete
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateDeploymentHealthGate(supabase, ventureId) {
  console.log('   Validating Deployment Health Gate (22->23)');

  const gateResult = {
    passed: false,
    gate_name: 'DEPLOYMENT_HEALTH',
    checks: [],
    details: {}
  };

  // Check 1: deployment_runbook artifact exists
  const { data: deployArtifact, error: deployError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 22)
    .eq('artifact_type', 'deployment_runbook')
    .eq('is_current', true)
    .single();

  if (deployError || !deployArtifact) {
    gateResult.checks.push({ check: 'runbook_exists', passed: false, reason: 'No deployment runbook found' });
    gateResult.details.missing_artifact = 'deployment_runbook';
    return gateResult;
  }
  gateResult.checks.push({ check: 'runbook_exists', passed: true });

  // Check 2: All infrastructure configured
  const deployData = deployArtifact.artifact_data;
  const infrastructure = deployData?.infrastructure || [];
  const configuredCount = infrastructure.filter(i => i.status === 'configured').length;
  const totalInfra = infrastructure.length;
  const infraReady = totalInfra > 0 && configuredCount === totalInfra;

  if (!infraReady) {
    gateResult.checks.push({
      check: 'infrastructure_configured',
      passed: false,
      reason: `Infrastructure ${configuredCount}/${totalInfra} configured`,
      details: { configured: configuredCount, total: totalInfra }
    });
    gateResult.details.infrastructure_gap = totalInfra - configuredCount;
    return gateResult;
  }
  gateResult.checks.push({ check: 'infrastructure_configured', passed: true });

  // Check 3: Deployment checklist complete
  const checklist = deployData?.checklist || [];
  const checkedCount = checklist.filter(c => c.checked === true).length;
  const totalChecklist = checklist.length;
  const checklistComplete = totalChecklist > 0 && checkedCount === totalChecklist;

  if (!checklistComplete) {
    gateResult.checks.push({
      check: 'checklist_complete',
      passed: false,
      reason: `Deployment checklist ${checkedCount}/${totalChecklist} complete`,
      details: { checked: checkedCount, total: totalChecklist }
    });
    gateResult.details.checklist_remaining = totalChecklist - checkedCount;
    gateResult.details.unchecked_items = checklist.filter(c => !c.checked).map(c => c.item);
    return gateResult;
  }
  gateResult.checks.push({ check: 'checklist_complete', passed: true });

  // Check 4: At least one environment active
  const environments = deployData?.environments || [];
  const activeEnvs = environments.filter(e => e.status === 'active').length;
  if (activeEnvs === 0) {
    gateResult.checks.push({
      check: 'environment_active',
      passed: false,
      reason: 'No active environments found'
    });
    return gateResult;
  }
  gateResult.checks.push({ check: 'environment_active', passed: true, details: { active_envs: activeEnvs } });

  gateResult.passed = true;
  gateResult.details = {
    infrastructure_ready: `${configuredCount}/${totalInfra}`,
    checklist_complete: `${checkedCount}/${totalChecklist}`,
    active_environments: activeEnvs,
    message: 'Deployment health validated - infrastructure configured, checklist complete'
  };

  console.log(`   Deployment Health Gate PASSED (Infra: ${configuredCount}/${totalInfra}, Checklist: ${checkedCount}/${totalChecklist})`);
  return gateResult;
}
