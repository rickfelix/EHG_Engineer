import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Load the analysis data
const analysisData = JSON.parse(fs.readFileSync('/tmp/ehg_full_analysis.json', 'utf8'));

// Define the EHG app codebase structure based on our analysis
const codebaseMap = {
  routes: {
    '/chairman': { exists: true, component: 'ChairmanDashboard', tests: true },
    '/eva-assistant': { exists: true, component: 'EVAAssistantPage', tests: false },
    '/ventures': { exists: true, component: 'VenturesPage', tests: false },
    '/ventures/:id': { exists: true, component: 'VentureDetailEnhanced', tests: false },
    '/portfolios': { exists: true, component: 'PortfoliosPage', tests: false },
    '/orchestration': { exists: true, component: 'EvaOrchestrationDashboard', tests: false },
    '/workflows': { exists: true, component: 'Workflows', tests: false },
    '/agents': { exists: true, component: 'AIAgentsPage', tests: false },
    '/ai-agents': { exists: true, component: 'AIAgentsPage', tests: false },
    '/analytics': { exists: true, component: 'AnalyticsDashboard', tests: false },
    '/integrations': { exists: true, component: 'IntegrationHubDashboard', tests: false },
    '/reports': { exists: true, component: 'Reports', tests: false },
    '/insights': { exists: true, component: 'Insights', tests: false },
    '/governance': { exists: true, component: 'GovernancePage', tests: true },
    '/settings': { exists: true, component: 'SettingsPage', tests: true },
    '/data-management': { exists: true, component: 'DataManagementPage', tests: false },
    '/security': { exists: true, component: 'SecurityPage', tests: false },
    '/performance': { exists: true, component: 'PerformancePage', tests: false },
    '/monitoring': { exists: true, component: 'MonitoringPage', tests: false },
    '/knowledge-base': { exists: true, component: 'KnowledgeBaseSystem', tests: false },
    '/eva-orchestration': { exists: true, component: 'EVAOrchestrationEngine', tests: false }
  },
  
  components: {
    eva: ['EVAOrchestrationDashboard', 'EVARealtimeVoice', 'EVASetup', 'EVATextToSpeechChat', 'EVAVoiceInterface', 'FloatingEVAAssistant'],
    agents: ['AgentCoordinationTab', 'AgentDeployDialog', 'AgentPerformanceChart', 'AgentStatusCard', 'AgentTaskQueue'],
    chairman: ['ChairmanDashboard', 'ChairmanFeedbackPanel', 'ChairmanOverridePanel', 'AIInsightsEngine', 'ExecutiveAlerts'],
    analytics: ['AnalyticsDashboard', 'AIInsightsView', 'KeyMetricsOverview', 'VentureAnalyticsView', 'ExecutiveDashboard'],
    stages: ['Stage2AIReview', 'Stage3ComprehensiveValidation', 'Stage4CompetitiveIntelligence', 'Stage5ProfitabilityForecasting', 'Stage6RiskEvaluation', 'Stage9GapAnalysis', 'Stage11StrategicNaming'],
    venture: ['VentureDetailEnhanced', 'VenturesPage'],
    integration: ['IntegrationHubDashboard', 'IntegrationHealthMonitor', 'SystemOrchestration'],
    orchestration: ['EVAOrchestrationEngine', 'AgentCoordinationView', 'ActiveWorkflowsView']
  },
  
  apis: {
    'ai-agents': ['start', 'status', 'stop'],
    'eva-nlp': true,
    'eva-orchestration': true,
    'analytics': ['events'],
    'companies': true,
    'ventures': ['create', 'list'],
    'governance': ['compliance/status', 'metrics', 'reviews/upcoming', 'violations/recent'],
    'integration': ['health-alerts', 'health-check', 'health-metrics', 'services', 'status', 'webhooks'],
    'monitoring': ['overview'],
    'onboarding': ['complete', 'progress'],
    'performance': ['overview'],
    'security': ['overview'],
    'settings': true
  },
  
  database: {
    migrations: 79, // Count from supabase/migrations
    tables: ['ventures', 'agents', 'workflows', 'analytics_events', 'onboarding_progress']
  },
  
  tests: {
    unit: ['button', 'card', 'use-toast'],
    integration: ['governance'],
    e2e: ['governance', 'onboarding', 'settings'],
    a11y: ['governance', 'onboarding', 'settings'],
    performance: ['load-testing'],
    security: ['security-validation']
  }
};

// Implementation Reality Scoring Function
function scoreBundle(bundle) {
  const scores = {
    readiness: 0,
    speed_to_impact: 0,
    reliability_guardrail: 0,
    activation_potential: 0,
    eva_alignment: 0,
    dependency_severity: 0,
    tech_debt_delta: 0
  };
  
  // Parse bundle details
  const category = bundle['Page Category'];
  const pageTitle = bundle['Page Title (Merged)'] || bundle['Page Title'];
  const backlogIds = (bundle['Backlog IDs'] || '').split(',').map(id => id.trim());
  const evaNote = bundle['AI/EVA Notes'] || '';
  const newModulePercent = parseFloat(bundle['Why Now']?.match(/New Module%=(\d+\.?\d*)/)?.[1] || 0);
  
  // 1. Readiness scoring (35% weight)
  let readinessFactors = 0;
  if (category === 'AI & Automation') {
    // Check EVA components exist
    if (pageTitle?.includes('EVA')) {
      readinessFactors += codebaseMap.components.eva.length > 0 ? 0.3 : 0;
      readinessFactors += codebaseMap.apis['eva-orchestration'] ? 0.2 : 0;
    }
    if (pageTitle?.includes('Agent')) {
      readinessFactors += codebaseMap.components.agents.length > 0 ? 0.3 : 0;
      readinessFactors += codebaseMap.apis['ai-agents'] ? 0.2 : 0;
    }
  }
  
  if (category === 'Core Dashboard' && pageTitle?.includes('Chairman')) {
    readinessFactors += codebaseMap.routes['/chairman']?.exists ? 0.4 : 0;
    readinessFactors += codebaseMap.components.chairman.length > 0 ? 0.3 : 0;
  }
  
  if (category === 'Analytics & Insights') {
    readinessFactors += codebaseMap.routes['/analytics']?.exists ? 0.2 : 0;
    readinessFactors += codebaseMap.routes['/reports']?.exists ? 0.2 : 0;
    readinessFactors += codebaseMap.routes['/insights']?.exists ? 0.2 : 0;
  }
  
  if (category === 'Venture Management' || category === 'Venture Stages') {
    readinessFactors += codebaseMap.routes['/ventures']?.exists ? 0.3 : 0;
    readinessFactors += codebaseMap.components.venture.length > 0 ? 0.2 : 0;
    readinessFactors += codebaseMap.components.stages.length > 0 ? 0.2 : 0;
  }
  
  scores.readiness = readinessFactors;
  
  // 2. Speed to impact (20% weight)
  const itemCount = backlogIds.length;
  if (itemCount <= 5) scores.speed_to_impact = 0.9;
  else if (itemCount <= 10) scores.speed_to_impact = 0.7;
  else if (itemCount <= 20) scores.speed_to_impact = 0.5;
  else scores.speed_to_impact = 0.3;
  
  // 3. Reliability guardrail (10% weight)
  let hasTests = false;
  if (category === 'Core Dashboard' || category === 'Authentication') {
    hasTests = codebaseMap.tests.e2e.length > 0;
  }
  scores.reliability_guardrail = hasTests ? 0.8 : 0.4;
  
  // 4. Activation potential (10% weight)
  if (pageTitle?.includes('Landing') || pageTitle?.includes('Onboarding') || 
      category === 'Authentication' || pageTitle?.includes('Chairman Dashboard')) {
    scores.activation_potential = 0.9;
  } else {
    scores.activation_potential = 0.5;
  }
  
  // 5. EVA alignment (10% weight)
  if (evaNote.includes('EVA') || pageTitle?.includes('EVA') || pageTitle?.includes('Assistant')) {
    scores.eva_alignment = 1.0;
  } else if (category === 'AI & Automation') {
    scores.eva_alignment = 0.7;
  } else {
    scores.eva_alignment = 0.3;
  }
  
  // 6. Dependency severity (10% weight) - penalize new modules
  if (newModulePercent === 0) scores.dependency_severity = 1.0;
  else if (newModulePercent < 20) scores.dependency_severity = 0.7;
  else if (newModulePercent < 40) scores.dependency_severity = 0.4;
  else scores.dependency_severity = 0.1;
  
  // 7. Tech debt delta (5% weight)
  scores.tech_debt_delta = itemCount <= 10 ? 0.8 : 0.4;
  
  // Calculate weighted total
  const weightedTotal = 
    scores.readiness * 0.35 +
    scores.speed_to_impact * 0.20 +
    scores.reliability_guardrail * 0.10 +
    scores.activation_potential * 0.10 +
    scores.eva_alignment * 0.10 +
    scores.dependency_severity * 0.10 +
    scores.tech_debt_delta * 0.05;
  
  return {
    ...scores,
    weighted_total: weightedTotal,
    bundle_id: bundle['Bundle ID'],
    category: category,
    page_title: pageTitle,
    backlog_count: itemCount,
    new_module_percent: newModulePercent
  };
}

// Analyze all bundles
console.log('=== IMPLEMENTATION REALITY REPORT ===\n');
console.log('Based on EHG Application Codebase Analysis\n');

// Score all bundles
const allBundles = [
  ...analysisData.sdHigh.map(b => ({...b, original_tier: 'High'})),
  ...analysisData.sdMedium.map(b => ({...b, original_tier: 'Medium'})),
  ...analysisData.sdLow.map(b => ({...b, original_tier: 'Low'}))
];

const scoredBundles = allBundles.map(bundle => ({
  ...bundle,
  implementation_score: scoreBundle(bundle)
}));

// Sort by implementation score
scoredBundles.sort((a, b) => b.implementation_score.weighted_total - a.implementation_score.weighted_total);

// Re-rank into new tiers
const newHigh = scoredBundles.slice(0, 10);
const newMedium = scoredBundles.slice(10, 20);
const newLow = scoredBundles.slice(20, 30);

console.log('IMPLEMENTATION-BASED RE-RANKING:\n');
console.log('=' .repeat(80));

// Print new HIGH tier
console.log('\nNEW HIGH PRIORITY (Implementation Ready):');
console.log('-'.repeat(80));
newHigh.forEach((bundle, i) => {
  const score = bundle.implementation_score;
  console.log(`\n${i+1}. ${score.category} :: ${score.page_title}`);
  console.log(`   Original Tier: ${bundle.original_tier} | Bundle: ${score.bundle_id}`);
  console.log(`   Implementation Score: ${(score.weighted_total * 100).toFixed(1)}%`);
  console.log(`   Readiness: ${(score.readiness * 100).toFixed(0)}% | Speed: ${(score.speed_to_impact * 100).toFixed(0)}% | EVA: ${(score.eva_alignment * 100).toFixed(0)}%`);
  console.log(`   Items: ${score.backlog_count} | New Modules: ${score.new_module_percent}%`);
  console.log(`   Why: ${bundle['Why Now']?.substring(0, 100)}`);
});

// Quick wins analysis
console.log('\n\nTOP 5 QUICK WINS (High impact, low effort):');
console.log('=' .repeat(80));
const quickWins = scoredBundles
  .filter(b => b.implementation_score.backlog_count <= 5 && b.implementation_score.readiness > 0.5)
  .slice(0, 5);

quickWins.forEach((bundle, i) => {
  const score = bundle.implementation_score;
  console.log(`\n${i+1}. ${score.page_title} (${score.category})`);
  console.log(`   Only ${score.backlog_count} items | ${(score.readiness * 100).toFixed(0)}% ready`);
  console.log(`   Backlog IDs: ${bundle['Backlog IDs']}`);
});

// EVA-first opportunities
console.log('\n\nEVA-FIRST OPPORTUNITIES:');
console.log('=' .repeat(80));
const evaFirst = scoredBundles
  .filter(b => b.implementation_score.eva_alignment >= 0.7)
  .slice(0, 5);

evaFirst.forEach((bundle, i) => {
  console.log(`\n${i+1}. ${bundle.implementation_score.page_title}`);
  console.log(`   EVA Score: ${(bundle.implementation_score.eva_alignment * 100).toFixed(0)}%`);
  console.log(`   ${bundle['AI/EVA Notes']}`);
});

// Export final report
const report = {
  summary: {
    total_bundles_analyzed: allBundles.length,
    codebase_routes: Object.keys(codebaseMap.routes).length,
    existing_components: Object.values(codebaseMap.components).flat().length,
    test_coverage: Object.values(codebaseMap.tests).flat().length,
    database_migrations: codebaseMap.database.migrations
  },
  reranked_directives: {
    high: newHigh.map(b => ({
      bundle_id: b['Bundle ID'],
      score: b.implementation_score.weighted_total,
      original_tier: b.original_tier,
      backlog_ids: b['Backlog IDs']
    })),
    medium: newMedium.map(b => ({
      bundle_id: b['Bundle ID'],
      score: b.implementation_score.weighted_total,
      original_tier: b.original_tier
    })),
    low: newLow.map(b => ({
      bundle_id: b['Bundle ID'],
      score: b.implementation_score.weighted_total,
      original_tier: b.original_tier
    }))
  },
  quick_wins: quickWins.map(b => ({
    bundle_id: b['Bundle ID'],
    items: b.implementation_score.backlog_count,
    readiness: b.implementation_score.readiness
  })),
  eva_first: evaFirst.map(b => ({
    bundle_id: b['Bundle ID'],
    eva_score: b.implementation_score.eva_alignment
  }))
};

fs.writeFileSync('/tmp/implementation_reality_report.json', JSON.stringify(report, null, 2));
console.log('\n\nFull report exported to /tmp/implementation_reality_report.json');