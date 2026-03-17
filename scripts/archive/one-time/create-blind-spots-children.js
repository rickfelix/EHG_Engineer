#!/usr/bin/env node

/**
 * Create all Child and Grandchild SDs for SD-BLIND-SPOTS-001
 *
 * This script creates the full hierarchy:
 * - 6 Child SDs (Blind Spot Categories)
 * - 17 Grandchild SDs (Implementation SDs)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// HELPER: Create SD
// ============================================================================

async function createSD(sd) {
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .eq('id', sd.id)
    .single();

  if (existing) {
    console.log(`   ⚠️  ${sd.id} already exists (${existing.status})`);
    return existing;
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select()
    .single();

  if (error) {
    console.error(`   ❌ Failed to create ${sd.id}:`, error.message);
    throw error;
  }

  console.log(`   ✅ Created ${sd.id}`);
  return data;
}

// ============================================================================
// CHILD SD DEFINITIONS
// ============================================================================

const childSDs = [
  {
    id: 'SD-BLIND-SPOT-EVA-001',
    title: 'EVA Operating System (Multi-Venture Portfolio Management)',
    description: 'Build EVA as the "Operating System" for managing 10-32 concurrent ventures. Implements Traffic Light Health Grid, Decision Routing (Class A/B/C), and Management by Exception.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['EVA Core architecture', 'Chairman Dashboard', 'Alert/Escalation system', 'Automation executor'],
      excluded: ['AI agent development', 'External integrations beyond Stripe']
    }),
    success_metrics: ['Can manage 32 ventures', 'Health grid shows all ventures', 'Decision routing works', 'Alerts delivered per P0/P1/P2'],
    strategic_objectives: ['Build foundational data model', 'Create Chairman Dashboard', 'Implement alerting', 'Enable safe automation'],
    metadata: { grandchildren: ['SD-EVA-ARCHITECTURE-001', 'SD-EVA-DASHBOARD-001', 'SD-EVA-ALERTING-001', 'SD-EVA-AUTOMATION-001'] }
  },
  {
    id: 'SD-BLIND-SPOT-LEGAL-001',
    title: 'Legal/Compliance Foundation',
    description: 'Establish legal structure with Delaware Series LLC and reusable compliance patterns for ToS, Privacy Policy, and GDPR.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Series LLC formation', 'Master legal templates', 'GDPR compliance components'],
      excluded: ['SOC 2 (enterprise trigger)', 'HIPAA', 'Tax planning']
    }),
    success_metrics: ['Series LLC formed', 'Templates ready for ventures', 'GDPR components reusable'],
    strategic_objectives: ['Form Delaware Series LLC', 'Create master templates', 'Implement GDPR patterns'],
    metadata: { grandchildren: ['SD-LEGAL-STRUCTURE-001', 'SD-LEGAL-TEMPLATES-001', 'SD-COMPLIANCE-GDPR-001'] }
  },
  {
    id: 'SD-BLIND-SPOT-PRICING-001',
    title: 'Pricing Pattern Library',
    description: 'Create reusable pricing patterns compatible with vending machine model. Revenue from transaction #1.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Core pricing patterns', 'Decision framework', 'A/B testing infrastructure'],
      excluded: ['Freemium (only with viral)', 'Enterprise contracts', 'Dynamic pricing']
    }),
    success_metrics: ['4 patterns with Stripe', 'Framework produces recommendations', 'A/B testing works'],
    strategic_objectives: ['Implement pricing patterns', 'Create decision framework', 'Enable experimentation'],
    metadata: { grandchildren: ['SD-PRICING-PATTERNS-001', 'SD-PRICING-FRAMEWORK-001', 'SD-PRICING-TESTING-001'] }
  },
  {
    id: 'SD-BLIND-SPOT-FAILURE-001',
    title: 'Failure Learning System',
    description: 'Systematically capture and apply lessons from failed ventures. Every failure improves the pattern library.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Post-mortem template', 'Anti-pattern library', 'Feedback loop to patterns'],
      excluded: ['External failure databases', 'Video recordings']
    }),
    success_metrics: ['Post-mortems for all kills', 'Anti-patterns documented', 'Lessons become patterns'],
    strategic_objectives: ['Standardize post-mortems', 'Catalog anti-patterns', 'Create feedback loop'],
    dependencies: ['SD-BLIND-SPOT-EVA-001'],
    metadata: { grandchildren: ['SD-FAILURE-POSTMORTEM-001', 'SD-FAILURE-PATTERNS-001', 'SD-FAILURE-FEEDBACK-001'] }
  },
  {
    id: 'SD-BLIND-SPOT-SKILLS-001',
    title: 'Skills Inventory System',
    description: 'Track capabilities and guide skill acquisition decisions. Build/Buy/Partner/Avoid framework.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Capability ledger', 'Decision framework', 'Skill distance calculator'],
      excluded: ['Team management', 'Training curriculum']
    }),
    success_metrics: ['Skills documented', 'Gap analysis works', 'Framework produces recommendations'],
    strategic_objectives: ['Create capability ledger', 'Implement decision framework'],
    metadata: { grandchildren: ['SD-SKILLS-INVENTORY-001', 'SD-SKILLS-FRAMEWORK-001'] }
  },
  {
    id: 'SD-BLIND-SPOT-DEPRECATION-001',
    title: 'Pattern Deprecation System',
    description: 'Manage pattern lifecycle and detect deprecation candidates. Freeze & fork for legacy.',
    parent_sd_id: 'SD-BLIND-SPOTS-001',
    category: 'infrastructure',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Pattern lifecycle states', 'Usage metrics', 'Deprecation signals'],
      excluded: ['Automated code migration', 'Cross-venture sync']
    }),
    success_metrics: ['Lifecycle states work', 'Health scores visible', 'Deprecation candidates detected'],
    strategic_objectives: ['Implement lifecycle states', 'Track pattern health'],
    metadata: { grandchildren: ['SD-PATTERN-LIFECYCLE-001', 'SD-PATTERN-METRICS-001'] }
  }
];

// ============================================================================
// GRANDCHILD SD DEFINITIONS
// ============================================================================

const grandchildSDs = [
  // EVA Grandchildren
  {
    id: 'SD-EVA-ARCHITECTURE-001',
    title: 'EVA Core Architecture',
    description: 'Build the foundational data model, event bus, and decision router for EVA.',
    parent_sd_id: 'SD-BLIND-SPOT-EVA-001',
    category: 'database',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'database',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['eva_ventures table', 'eva_events table', 'eva_decisions table', 'EVAEventBus', 'EVADecisionRouter'],
      excluded: ['Dashboard UI', 'Alert delivery']
    }),
    success_metrics: ['Events ingested from multiple sources', 'Decisions routed by stake level', 'All actions audit logged'],
    strategic_objectives: ['Create EVA data model', 'Build event bus', 'Implement decision router']
  },
  {
    id: 'SD-EVA-DASHBOARD-001',
    title: 'EVA Chairman Dashboard',
    description: 'Create the "Cockpit" view for portfolio-wide visibility. Traffic Light Health Grid.',
    parent_sd_id: 'SD-BLIND-SPOT-EVA-001',
    category: 'product_feature',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['EVAHealthGrid', 'EVACashFlowPulse', 'EVAVentureDetail', 'EVAPortfolioCharts'],
      excluded: ['Alert management', 'Automation rules']
    }),
    success_metrics: ['All ventures visible', 'Color coding reflects health', 'Dashboard loads <3s'],
    strategic_objectives: ['Build Health Grid', 'Create drill-down views', 'Show portfolio metrics'],
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-EVA-ALERTING-001',
    title: 'EVA Alert & Escalation System',
    description: 'Implement P0/P1/P2 alerting with smart escalation and fatigue prevention.',
    parent_sd_id: 'SD-BLIND-SPOT-EVA-001',
    category: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['eva_alerts table', 'Priority routing', 'Alert aggregation', 'Escalation rules'],
      excluded: ['Third-party integrations']
    }),
    success_metrics: ['P0 alerts <1 minute', 'P1 batched daily', 'Fatigue prevented'],
    strategic_objectives: ['Create alert table', 'Build priority routing', 'Implement aggregation'],
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-EVA-AUTOMATION-001',
    title: 'EVA Automation Executor',
    description: 'Enable safe automated actions with guardrails. Class A auto-fix, Class B auto-draft.',
    parent_sd_id: 'SD-BLIND-SPOT-EVA-001',
    category: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['eva_automation_rules', 'Guardrails', 'Weekly review generator', 'Auto-draft templates'],
      excluded: ['AI agent development', 'External API actions']
    }),
    success_metrics: ['Class A executes automatically', 'Guardrails prevent danger', 'Weekly prep automated'],
    strategic_objectives: ['Create automation rules', 'Build guardrail validation', 'Generate weekly reviews'],
    dependencies: ['SD-EVA-ARCHITECTURE-001', 'SD-EVA-ALERTING-001']
  },

  // Legal Grandchildren
  {
    id: 'SD-LEGAL-STRUCTURE-001',
    title: 'Series LLC Formation',
    description: 'Establish Delaware Series LLC for liability isolation across ventures.',
    parent_sd_id: 'SD-BLIND-SPOT-LEGAL-001',
    category: 'documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'documentation',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Formation docs', 'Operating agreement', 'Series template', 'Banking checklist'],
      excluded: ['Tax planning', 'Specific venture formations']
    }),
    success_metrics: ['LLC formed', 'Process documented', 'Templates ready'],
    strategic_objectives: ['Form master LLC', 'Create templates', 'Document process']
  },
  {
    id: 'SD-LEGAL-TEMPLATES-001',
    title: 'Master Legal Templates',
    description: 'Create centralized legal templates with venture-specific overrides.',
    parent_sd_id: 'SD-BLIND-SPOT-LEGAL-001',
    category: 'documentation',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'documentation',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['ToS template', 'Privacy Policy template', 'DPA template', 'Override system'],
      excluded: ['SOC 2 docs', 'HIPAA']
    }),
    success_metrics: ['Templates cover SaaS use cases', 'Override system works', 'Legal reviewed'],
    strategic_objectives: ['Create ToS', 'Create Privacy Policy', 'Build override system']
  },
  {
    id: 'SD-COMPLIANCE-GDPR-001',
    title: 'GDPR Compliance Patterns',
    description: 'Implement reusable GDPR compliance components.',
    parent_sd_id: 'SD-BLIND-SPOT-LEGAL-001',
    category: 'product_feature',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['CookieConsentBanner', 'DeleteUserDataJob', 'DataExportJob', 'user_consent_records'],
      excluded: ['Full GDPR audit', 'DPO appointment']
    }),
    success_metrics: ['Cookie consent captures prefs', 'Deletion <24h', 'Export works'],
    strategic_objectives: ['Build consent banner', 'Implement data jobs', 'Create preference center'],
    dependencies: ['SD-LEGAL-TEMPLATES-001']
  },

  // Pricing Grandchildren
  {
    id: 'SD-PRICING-PATTERNS-001',
    title: 'Core Pricing Patterns',
    description: 'Implement 4 foundational pricing patterns with Stripe integration.',
    parent_sd_id: 'SD-BLIND-SPOT-PRICING-001',
    category: 'product_feature',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Flat Rate', 'Tiered', 'Free Trial', 'Usage-Based', 'Stripe integration'],
      excluded: ['Freemium', 'Enterprise contracts']
    }),
    success_metrics: ['Each pattern has Stripe', 'Patterns reusable', 'Checkout tested'],
    strategic_objectives: ['Build 4 patterns', 'Integrate Stripe', 'Create checkout flow']
  },
  {
    id: 'SD-PRICING-FRAMEWORK-001',
    title: 'Pricing Decision Framework',
    description: 'Create algorithm and documentation for pricing decisions.',
    parent_sd_id: 'SD-BLIND-SPOT-PRICING-001',
    category: 'product_feature',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Decision algorithm', 'PricingWizard UI', 'Documentation'],
      excluded: ['Competitive intelligence', 'Dynamic pricing']
    }),
    success_metrics: ['Framework produces recommendations', 'Wizard guides decisions', 'Docs complete'],
    strategic_objectives: ['Build decision service', 'Create wizard UI', 'Write documentation'],
    dependencies: ['SD-PRICING-PATTERNS-001']
  },
  {
    id: 'SD-PRICING-TESTING-001',
    title: 'Pricing Experimentation Infrastructure',
    description: 'Enable A/B testing of pricing with minimal volume.',
    parent_sd_id: 'SD-BLIND-SPOT-PRICING-001',
    category: 'product_feature',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Painted Door test', 'Stripe A/B', 'Conversion tracking', 'Grandfathering'],
      excluded: ['Multi-armed bandit', 'Real-time optimization']
    }),
    success_metrics: ['Painted Door <1 hour', 'A/B documented', 'Grandfathering works'],
    strategic_objectives: ['Build experiment table', 'Create A/B component', 'Implement grandfathering'],
    dependencies: ['SD-PRICING-PATTERNS-001']
  },

  // Failure Grandchildren
  {
    id: 'SD-FAILURE-POSTMORTEM-001',
    title: 'Post-Mortem Template & Automation',
    description: 'Standardize venture post-mortem capture with EVA auto-draft.',
    parent_sd_id: 'SD-BLIND-SPOT-FAILURE-001',
    category: 'product_feature',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['venture_postmortems table', 'Template component', 'Auto-draft', '5 Whys'],
      excluded: ['External sharing', 'Video recordings']
    }),
    success_metrics: ['Post-mortem for every kill', 'Auto-draft saves 80% time', 'Categories applied'],
    strategic_objectives: ['Create table', 'Build template', 'Implement auto-draft'],
    dependencies: ['SD-EVA-ARCHITECTURE-001']
  },
  {
    id: 'SD-FAILURE-PATTERNS-001',
    title: 'Anti-Pattern Library',
    description: 'Catalog common failure modes to prevent repetition.',
    parent_sd_id: 'SD-BLIND-SPOT-FAILURE-001',
    category: 'documentation',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'documentation',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['failure_patterns table', '10 initial patterns', 'Scoring service', 'Risk indicator'],
      excluded: ['Automated detection', 'External databases']
    }),
    success_metrics: ['10 patterns documented', 'Ventures scored', 'High-risk flagged'],
    strategic_objectives: ['Create table', 'Load initial patterns', 'Build scoring']
  },
  {
    id: 'SD-FAILURE-FEEDBACK-001',
    title: 'Failure → Pattern Library Feedback Loop',
    description: 'Systematically convert failure lessons into pattern improvements.',
    parent_sd_id: 'SD-BLIND-SPOT-FAILURE-001',
    category: 'product_feature',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Improvement workflow', 'Pattern mapper', 'Guardrail generator', 'Version tracking'],
      excluded: ['Auto code generation', 'Cross-company learning']
    }),
    success_metrics: ['Every post-mortem → action item', 'Improvements tracked', 'Ventures inherit'],
    strategic_objectives: ['Build workflow', 'Create mapper', 'Implement versioning'],
    dependencies: ['SD-FAILURE-POSTMORTEM-001', 'SD-FAILURE-PATTERNS-001']
  },

  // Skills Grandchildren
  {
    id: 'SD-SKILLS-INVENTORY-001',
    title: 'Capability Ledger System',
    description: 'Track skills with confidence levels and evidence.',
    parent_sd_id: 'SD-BLIND-SPOT-SKILLS-001',
    category: 'product_feature',
    priority: 'medium',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['skills_inventory table', 'SkillsMatrix', 'GapAnalyzer', 'Documentation'],
      excluded: ['Team management', 'Training curriculum']
    }),
    success_metrics: ['All skills documented', 'Evidence linked', 'Gap analysis works'],
    strategic_objectives: ['Create table', 'Build matrix', 'Implement gap analyzer']
  },
  {
    id: 'SD-SKILLS-FRAMEWORK-001',
    title: 'Build/Buy/Partner Decision Framework',
    description: 'Systematic framework for skill acquisition decisions.',
    parent_sd_id: 'SD-BLIND-SPOT-SKILLS-001',
    category: 'product_feature',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Decision framework', 'Distance calculator', 'Wizard UI', 'Documentation'],
      excluded: ['Hiring workflows', 'Contractor management']
    }),
    success_metrics: ['Framework produces recommendations', 'Distance comparable', 'Prevents overreach'],
    strategic_objectives: ['Build framework', 'Create calculator', 'Write docs'],
    dependencies: ['SD-SKILLS-INVENTORY-001']
  },

  // Deprecation Grandchildren
  {
    id: 'SD-PATTERN-LIFECYCLE-001',
    title: 'Pattern Lifecycle State Machine',
    description: 'Implement pattern states and transition rules.',
    parent_sd_id: 'SD-BLIND-SPOT-DEPRECATION-001',
    category: 'infrastructure',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'database',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Lifecycle column', 'Transition rules', 'Deprecation workflow', 'Legacy namespace'],
      excluded: ['Auto migration', 'Cross-venture sync']
    }),
    success_metrics: ['All patterns have status', 'Deprecation triggers warnings', 'Guides required'],
    strategic_objectives: ['Add lifecycle column', 'Build transition rules', 'Create workflow']
  },
  {
    id: 'SD-PATTERN-METRICS-001',
    title: 'Pattern Usage Metrics & Deprecation Signals',
    description: 'Track pattern health and detect deprecation candidates.',
    parent_sd_id: 'SD-BLIND-SPOT-DEPRECATION-001',
    category: 'product_feature',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    sd_type: 'feature',
    target_application: 'EHG',
    scope: JSON.stringify({
      included: ['Usage metrics table', 'Health scorer', 'Signal detector', 'Dashboard'],
      excluded: ['Real-time telemetry', 'Cross-company benchmarking']
    }),
    success_metrics: ['Usage tracked', 'Candidates surfaced', 'Health visible'],
    strategic_objectives: ['Create metrics table', 'Build scorer', 'Create dashboard'],
    dependencies: ['SD-PATTERN-LIFECYCLE-001']
  }
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═'.repeat(70));
  console.log('CREATING SD-BLIND-SPOTS-001 HIERARCHY');
  console.log('═'.repeat(70));

  // Add common fields to all SDs
  const now = new Date().toISOString();

  for (const sd of [...childSDs, ...grandchildSDs]) {
    sd.uuid_id = randomUUID();
    sd.created_by = 'LEAD';
    sd.created_at = now;
    sd.updated_at = now;
    sd.version = '1.0';
    sd.phase_progress = 0;
    sd.progress = 0;
    sd.is_active = true;
    // REQUIRED: rationale field is NOT NULL in database
    sd.rationale = `${sd.title}: ${sd.description}`;
    // REQUIRED: sd_key field is NOT NULL in database (typically same as id)
    sd.sd_key = sd.id;
  }

  // Create Children
  console.log('\n📁 Creating Child SDs (6 Blind Spot Categories)...');
  for (const sd of childSDs) {
    await createSD(sd);
  }

  // Create Grandchildren
  console.log('\n📄 Creating Grandchild SDs (17 Implementation SDs)...');
  for (const sd of grandchildSDs) {
    await createSD(sd);
  }

  // Verify
  console.log('\n📊 Verifying hierarchy...');

  const { data: all } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, parent_sd_id, status')
    .or(`id.eq.SD-BLIND-SPOTS-001,parent_sd_id.eq.SD-BLIND-SPOTS-001,parent_sd_id.in.(${childSDs.map(c => `"${c.id}"`).join(',')})`)
    .order('id');

  console.log('\n' + '─'.repeat(70));
  console.log('HIERARCHY SUMMARY');
  console.log('─'.repeat(70));

  // Count by level
  const parent = all?.filter(s => s.id === 'SD-BLIND-SPOTS-001') || [];
  const children = all?.filter(s => s.parent_sd_id === 'SD-BLIND-SPOTS-001') || [];
  const grandchildren = all?.filter(s => childSDs.some(c => c.id === s.parent_sd_id)) || [];

  console.log(`Parent:        ${parent.length} (SD-BLIND-SPOTS-001)`);
  console.log(`Children:      ${children.length} (6 expected)`);
  console.log(`Grandchildren: ${grandchildren.length} (17 expected)`);
  console.log(`Total:         ${parent.length + children.length + grandchildren.length} (24 expected)`);

  console.log('\n✅ Hierarchy creation complete!');
  console.log('\n🚀 Next: Run LEAD-TO-PLAN for SD-BLIND-SPOTS-001');
  console.log('   node scripts/handoff.js execute LEAD-TO-PLAN SD-BLIND-SPOTS-001');
}

main().catch(console.error);
