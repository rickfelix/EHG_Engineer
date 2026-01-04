#!/usr/bin/env node

/**
 * Insert Chairman-approved Strategic Directives batch
 * 7 SDs focused on truth labeling, sub-agent audit, and venture tools
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SDS_TO_INSERT = [
  {
    id: 'SD-TRUTH-LABELING-001',
    sd_key: 'SD-TRUTH-LABELING-001',
    title: 'Platform Truth Labeling & Documentation',
    version: '1.0',
    status: 'draft',
    category: 'documentation',
    priority: 'critical',
    description: 'Label scaffolding honestly. Document what exists vs what doesn\'t. GDPR current-state posture. Convert TBDs to backlog items or delete. Add VISION/SCAFFOLD_ONLY/IMPLEMENTED labels.',
    rationale: 'Eliminate documentation debt that misleads about implementation status. Create single source of truth for what is built vs what is planned.',
    scope: `- Document GDPR implementation gaps (what we CAN'T do yet)
- Label Exit Pipeline specs as "VISION ONLY"
- Audit Pattern Scorer service documentation
- Create missing PRDs for 6 "completed" SDs
- Add truth labels convention to codebase`,
    success_criteria: [
      { criterion: 'Every doc claim links to code reference or explicit "NOT IMPLEMENTED"', measure: '100% of documentation audited' },
      { criterion: 'GDPR gap list created with remediation plan', measure: 'Document exists and reviewed' },
      { criterion: 'All files labeled with truth status', measure: 'VISION/SCAFFOLD/IMPLEMENTED labels added' }
    ],
    current_phase: 'LEAD',
    sd_type: 'documentation',
    relationship_type: 'standalone',
    target_application: 'EHG_Engineer',
    complexity_level: 'moderate',
    metadata: {
      effort_estimate: '2-3 days',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04'
    },
    smoke_test_steps: [], // N/A for documentation
    created_by: 'CHAIRMAN',
    sequence_rank: 1
  },
  {
    id: 'SD-SUBAGENT-AUDIT-001',
    sd_key: 'SD-SUBAGENT-AUDIT-001',
    title: 'Sub-Agent Audit & Deprecation Decisions',
    version: '1.0',
    status: 'draft',
    category: 'infrastructure',
    priority: 'critical',
    description: 'Audit 10 unknown/minimal sub-agents. Make DELETE/KEEP decision for each. Do NOT complete or merge - just document status and decide. Default: if unknown, delete it.',
    rationale: 'Reduce complexity and maintenance burden of unused or unclear sub-agents. Focus on proven, documented agents only.',
    scope: `- Audit: monitoring.js, crm.js, uat.js, retro.js, regression.js, quickfix.js, docmon.js, dependency.js, performance.js, github-enhanced.js
- For each: document current state, usage count (grep), decision (DELETE/KEEP)
- Delete unused agents immediately
- Document surviving agents with I/O schema`,
    success_criteria: [
      { criterion: 'All 10 agents have documented status', measure: 'Audit document exists with all 10 agents' },
      { criterion: 'Unused agents deleted from codebase', measure: 'Agents with DELETE decision removed' },
      { criterion: 'Surviving agents have minimal documentation', measure: 'I/O schema documented for KEEP agents' }
    ],
    current_phase: 'LEAD',
    sd_type: 'infrastructure',
    relationship_type: 'standalone',
    target_application: 'EHG_Engineer',
    complexity_level: 'moderate',
    metadata: {
      effort_estimate: '3-5 days',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      agents_to_audit: [
        'monitoring.js',
        'crm.js',
        'uat.js',
        'retro.js',
        'regression.js',
        'quickfix.js',
        'docmon.js',
        'dependency.js',
        'performance.js',
        'github-enhanced.js'
      ]
    },
    smoke_test_steps: [], // N/A for infrastructure
    created_by: 'CHAIRMAN',
    sequence_rank: 2
  },
  {
    id: 'SD-CONTENT-FORGE-IMPL-001',
    sd_key: 'SD-CONTENT-FORGE-IMPL-001',
    title: 'Content Forge API Implementation',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    description: 'Implement Content Forge APIs for marketing content generation. Factory must be complete before building ventures. Uses OpenAI + Gemini as LLM providers.',
    rationale: 'Enable marketing content generation for ventures. Foundation for Marketing Automation SD.',
    scope: `- POST /api/v2/content-forge/generate (LLM integration)
- GET /api/v2/content-forge/list
- POST /api/v2/content-forge/compliance-check
- GET /api/v2/brand-genome/:id
- LLM Adapter for OpenAI/Gemini with cost tracking`,
    success_criteria: [
      { criterion: 'All 4 endpoints pass existing E2E tests', measure: 'E2E test suite passes' },
      { criterion: 'LLM cost tracking implemented', measure: 'Cost data logged per generation' },
      { criterion: 'Brand Genome integration working', measure: 'Generated content matches brand voice' }
    ],
    dependencies: [],
    current_phase: 'LEAD',
    sd_type: 'feature',
    relationship_type: 'standalone',
    target_application: 'EHG',
    complexity_level: 'complex',
    metadata: {
      effort_estimate: '6 weeks',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      third_party_services: ['OpenAI API', 'Google Gemini API']
    },
    smoke_test_steps: [
      {
        step_number: 1,
        instruction: 'Navigate to Content Forge in EHG app',
        expected_outcome: 'Content Forge page loads successfully'
      },
      {
        step_number: 2,
        instruction: 'Select a venture with Brand Genome',
        expected_outcome: 'Venture selected, Brand Genome data visible'
      },
      {
        step_number: 3,
        instruction: 'Click "Generate Landing Page Copy"',
        expected_outcome: 'Generation request submitted'
      },
      {
        step_number: 4,
        instruction: 'Wait up to 30 seconds',
        expected_outcome: 'Generated content appears on screen'
      },
      {
        step_number: 5,
        instruction: 'Review generated content quality',
        expected_outcome: 'Content matches brand voice from genome'
      }
    ],
    created_by: 'CHAIRMAN',
    sequence_rank: 3
  },
  {
    id: 'SD-MARKETING-AUTOMATION-001',
    sd_key: 'SD-MARKETING-AUTOMATION-001',
    title: 'Marketing Content Distribution',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    description: 'Marketing content distribution system. Approach TBD pending triangulation research (manual copy/paste vs API vs computer-use automation).',
    rationale: 'Complete marketing workflow from generation to distribution. Enable ventures to publish content to social platforms.',
    scope: `- Content review queue (from Content Forge)
- Distribution approach (research needed)
- UTM tracking and validation
- Basic analytics integration`,
    success_criteria: [
      { criterion: 'Content can flow from generation to distribution', measure: 'End-to-end workflow functions' },
      { criterion: 'UTM parameters correctly applied', measure: 'All distributed content has valid UTM' },
      { criterion: 'Basic click tracking working', measure: 'Analytics data captured' }
    ],
    dependencies: [
      { dependency: 'SD-CONTENT-FORGE-IMPL-001', type: 'technical', status: 'blocked' }
    ],
    current_phase: 'LEAD',
    sd_type: 'feature',
    relationship_type: 'standalone',
    target_application: 'EHG',
    complexity_level: 'complex',
    metadata: {
      effort_estimate: '4 weeks',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      research_needed: [
        'Social platform integration approach (Buffer vs direct API vs computer-use vs manual)',
        'Analytics integration (GA4 vs internal)'
      ]
    },
    smoke_test_steps: [
      {
        step_number: 1,
        instruction: 'Go to Marketing Queue in EHG app',
        expected_outcome: 'Marketing Queue page loads'
      },
      {
        step_number: 2,
        instruction: 'See list of generated content awaiting distribution',
        expected_outcome: 'Content list displays with pending items'
      },
      {
        step_number: 3,
        instruction: 'Select a piece of content',
        expected_outcome: 'Content details shown'
      },
      {
        step_number: 4,
        instruction: 'Click "Prepare for LinkedIn"',
        expected_outcome: 'LinkedIn format preview appears'
      },
      {
        step_number: 5,
        instruction: 'Verify UTM parameters present',
        expected_outcome: 'Formatted content shows UTM parameters ready to copy'
      }
    ],
    created_by: 'CHAIRMAN',
    sequence_rank: 4
  },
  {
    id: 'SD-NAMING-ENGINE-001',
    sd_key: 'SD-NAMING-ENGINE-001',
    title: 'Venture Naming Generation Engine',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    description: 'LLM-powered venture name generation with domain checking. Internal use + potential pilot venture test. Trademark checking deferred due to liability concerns.',
    rationale: 'Accelerate venture naming process with AI-powered suggestions and domain availability checks.',
    scope: `- Name Generator (LLM-powered with constraints)
- Name Scorer (phonetic + memorability)
- Domain Checker (single provider API)
- NO trademark checking (liability - consult lawyer)`,
    success_criteria: [
      { criterion: 'Generate 10 scored names in under 5 seconds', measure: 'Performance benchmark met' },
      { criterion: 'Domain availability shown for each name', measure: 'All names have domain status' },
      { criterion: 'Clear disclaimer about trademark consultation', measure: 'Disclaimer displayed in UI' }
    ],
    current_phase: 'LEAD',
    sd_type: 'feature',
    relationship_type: 'standalone',
    target_application: 'EHG',
    complexity_level: 'moderate',
    metadata: {
      effort_estimate: '4 weeks',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      research_needed: ['Domain availability API selection (triangulation)'],
      legal_note: 'NO trademark checking - liability risk'
    },
    smoke_test_steps: [
      {
        step_number: 1,
        instruction: 'Go to Naming Engine in Genesis pipeline',
        expected_outcome: 'Naming Engine page loads'
      },
      {
        step_number: 2,
        instruction: 'Enter venture description and constraints',
        expected_outcome: 'Input form accepts description'
      },
      {
        step_number: 3,
        instruction: 'Click "Generate Names"',
        expected_outcome: 'Generation starts'
      },
      {
        step_number: 4,
        instruction: 'Wait up to 5 seconds',
        expected_outcome: '10 ranked name suggestions appear'
      },
      {
        step_number: 5,
        instruction: 'Verify domain availability shown',
        expected_outcome: 'Each name shows .com and .io availability'
      }
    ],
    created_by: 'CHAIRMAN',
    sequence_rank: 5
  },
  {
    id: 'SD-FINANCIAL-ENGINE-001',
    sd_key: 'SD-FINANCIAL-ENGINE-001',
    title: 'Financial Modeling Engine (ModelBuilder)',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    description: 'Real financial modeling with dynamic projections. HIGH VENTURE POTENTIAL - build with productization mindset. Core of ModelBuilder venture ($1B+ TAM).',
    rationale: 'Enable data-driven financial planning for ventures. Foundation for potential standalone ModelBuilder venture.',
    scope: `- SaaS model first (constrain scope)
- Input assumptions → Output P&L table
- Break-even analysis (dynamic)
- Scenario modeling (base/optimistic/pessimistic)
- Industry benchmarks (hardcoded initially, API later)`,
    success_criteria: [
      { criterion: 'Input 10 assumptions, get 3-year P&L projection', measure: 'P&L generation works' },
      { criterion: 'Scenarios toggle correctly', measure: 'All 3 scenarios calculate properly' },
      { criterion: 'Break-even point calculated dynamically', measure: 'Break-even shown accurately' }
    ],
    current_phase: 'LEAD',
    sd_type: 'feature',
    relationship_type: 'standalone',
    target_application: 'EHG',
    complexity_level: 'complex',
    metadata: {
      effort_estimate: '4 weeks',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      venture_potential: 'HIGH - Core of ModelBuilder venture ($1B+ TAM)',
      research_needed: ['Benchmark data sources (triangulation later)']
    },
    smoke_test_steps: [
      {
        step_number: 1,
        instruction: 'Go to Financial Engine in Genesis pipeline',
        expected_outcome: 'Financial Engine page loads'
      },
      {
        step_number: 2,
        instruction: 'Enter: "SaaS, $50/mo, 5% monthly churn"',
        expected_outcome: 'Input accepted in form'
      },
      {
        step_number: 3,
        instruction: 'Click "Generate Projections"',
        expected_outcome: 'Calculation begins'
      },
      {
        step_number: 4,
        instruction: 'Review output',
        expected_outcome: '3-year P&L with revenue, costs, profit displayed'
      },
      {
        step_number: 5,
        instruction: 'Toggle "Optimistic" scenario',
        expected_outcome: 'Numbers change to reflect optimistic assumptions'
      }
    ],
    created_by: 'CHAIRMAN',
    sequence_rank: 6
  },
  {
    id: 'SD-LEGAL-GENERATOR-001',
    sd_key: 'SD-LEGAL-GENERATOR-001',
    title: 'Legal Document Generator',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'medium',
    description: 'Legal document generation for ventures. RESEARCH FIRST - may not be our problem to solve. High liability risk.',
    rationale: 'Explore whether legal doc generation adds value or should be delegated to existing services (Clerky, Stripe Atlas).',
    scope: `TBD after research:
- Research: Is this our problem? (Clerky, Stripe Atlas, lawyers exist)
- Research: Template fill-in vs generation vs partnership
- Research: Jurisdiction requirements`,
    success_criteria: [
      { criterion: 'Research completed', measure: 'Decision document created: build vs buy vs skip' }
    ],
    current_phase: 'LEAD',
    sd_type: 'feature',
    relationship_type: 'standalone',
    target_application: 'EHG',
    complexity_level: 'complex',
    metadata: {
      effort_estimate: 'TBD (4 weeks if built)',
      chairman_approved: true,
      batch_id: 'CHAIRMAN-SDS-BATCH-2026-01-04',
      research_needed: [
        'Is legal doc generation our problem?',
        'Template sourcing approach',
        'Liability mitigation'
      ],
      blocked_on: 'Research phase completion',
      legal_risk: 'HIGH - liability concerns'
    },
    smoke_test_steps: [], // TBD after research
    created_by: 'CHAIRMAN',
    sequence_rank: 7
  }
];

async function insertSDs() {
  console.log('🚀 Inserting Chairman-approved SDs...\n');

  const results = {
    success: [],
    errors: []
  };

  for (const sd of SDS_TO_INSERT) {
    console.log(`📝 Processing ${sd.id}...`);

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert(sd, {
          onConflict: 'id'
        })
        .select();

      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.errors.push({ id: sd.id, error: error.message });
      } else {
        console.log('   ✅ Success');
        results.success.push(sd.id);
      }
    } catch (err) {
      console.error(`   ❌ Exception: ${err.message}`);
      results.errors.push({ id: sd.id, error: err.message });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully inserted: ${results.success.length}/${SDS_TO_INSERT.length}`);

  if (results.success.length > 0) {
    console.log('\nSuccessful SDs:');
    results.success.forEach(id => console.log(`   - ${id}`));
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Failed SDs:');
    results.errors.forEach(({ id, error }) => {
      console.log(`   - ${id}: ${error}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  return results;
}

async function verifySDs() {
  console.log('\n🔍 Verifying inserted SDs...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, category, current_phase')
    .in('id', SDS_TO_INSERT.map(sd => sd.id))
    .order('sequence_rank');

  if (error) {
    console.error('❌ Verification failed:', error.message);
    return;
  }

  console.log('✅ Found in database:');
  console.log('─'.repeat(60));
  data.forEach(sd => {
    console.log(`${sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status} | Phase: ${sd.current_phase}`);
    console.log(`   Priority: ${sd.priority} | Category: ${sd.category}`);
    console.log('');
  });

  return data;
}

// Run the script
(async () => {
  try {
    const results = await insertSDs();
    await verifySDs();

    if (results.errors.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  }
})();
