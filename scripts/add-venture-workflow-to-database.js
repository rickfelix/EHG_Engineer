#!/usr/bin/env node

/**
 * Add Venture Workflow Strategic Directive and PRDs to database
 * This script adds the complete 40-stage venture workflow implementation to the database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Main Strategic Directive
const ventureSD = {
  id: 'SD-VENTURE-WORKFLOW',
  title: 'Complete 40-Stage Venture Lifecycle Management System',
  description: `Comprehensive venture workflow implementation covering all 40 stages from ideation through exit. 
    This includes multi-venture portfolio coordination, strategic growth management, exit sequencing optimization, 
    and automated PRD generation capabilities. The system provides end-to-end venture lifecycle management with 
    sophisticated portfolio-level optimization and governance features.`,
  priority: 'critical',
  status: 'active',
  category: 'portfolio_management',
  strategic_intent: 'Transform venture portfolio management through comprehensive lifecycle automation',
  rationale: 'Enable systematic venture creation, growth, and exit optimization across the entire portfolio',
  scope: 'All 40 stages of venture lifecycle from ideation through exit, including portfolio coordination',
  strategic_objectives: [
    'Implement complete 40-stage venture workflow from ideation to exit',
    'Enable multi-venture portfolio coordination and resource optimization',
    'Provide strategic growth and governance management for active ventures',
    'Optimize portfolio exit sequencing for maximum value realization',
    'Automate PRD generation for new venture initiatives'
  ],
  success_criteria: [
    'All 40 workflow stages fully implemented and documented',
    'Portfolio coordination system operational across ventures',
    'Exit sequencing optimization achieving target IRR improvements',
    'Governance compliance tracking at 99%+ accuracy',
    'PRD generation engine producing implementation-ready specifications'
  ],
  success_metrics: {
    portfolio_roi_increase: '200%',
    resource_utilization: '70% optimization',
    governance_compliance: '99%',
    exit_irr_improvement: '40%',
    stages_completed: 40
  },
  metadata: {
    stages_count: 40,
    completion_date: new Date().toISOString(),
    implementation_status: 'production_ready',
    portfolio_impact: 'critical',
    completed_at: new Date().toISOString(),
    progress_percentage: 100
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  approved_by: 'Chairman',
  approval_date: new Date().toISOString()
};

// PRD definitions with file paths
const venturePRDs = [
  {
    id: 'PRD-VENTURE-39',
    directive_id: 'SD-VENTURE-WORKFLOW',
    title: 'Stage 39 - Multi-Venture Coordination',
    file_path: 'docs/04_features/39_multi_venture_coordination.md',
    category: 'portfolio_management',
    priority: 'critical',
    executive_summary: `Enables sophisticated portfolio-level coordination across multiple active ventures to optimize 
      resource allocation, identify synergies, resolve conflicts, and maximize portfolio value through intelligent 
      orchestration and Chairman strategic oversight. Increases portfolio ROI by 200%, optimizes resource utilization 
      by 70%, identifies $10M+ in synergy opportunities annually.`,
    plan_checklist: [
      { item: 'Define portfolio coordination requirements', completed: true },
      { item: 'Design resource allocation algorithms', completed: true },
      { item: 'Create synergy identification engine', completed: true },
      { item: 'Implement conflict resolution system', completed: true }
    ],
    exec_checklist: [
      { item: 'Build coordination dashboard components', completed: true },
      { item: 'Implement resource allocation matrix', completed: true },
      { item: 'Deploy synergy opportunity explorer', completed: true },
      { item: 'Integrate with portfolio database', completed: true }
    ]
  },
  {
    id: 'PRD-VENTURE-40A',
    directive_id: 'SD-VENTURE-WORKFLOW',
    title: 'Stage 40A - Venture Active: Strategic Growth & Governance',
    file_path: 'docs/04_features/40a_venture_active.md',
    category: 'governance',
    priority: 'critical',
    executive_summary: `Establishes comprehensive strategic growth management and portfolio governance for active ventures 
      through systematic scaling frameworks, governance compliance monitoring, and performance optimization with Chairman 
      strategic oversight. Increases portfolio growth rate by 300%, ensures 99% governance compliance, optimizes scaling 
      decisions for maximum ROI.`,
    plan_checklist: [
      { item: 'Design growth strategy optimization engine', completed: true },
      { item: 'Create governance framework management', completed: true },
      { item: 'Define compliance monitoring requirements', completed: true },
      { item: 'Plan performance tracking systems', completed: true }
    ],
    exec_checklist: [
      { item: 'Implement strategic growth dashboard', completed: true },
      { item: 'Build portfolio governance console', completed: true },
      { item: 'Deploy compliance monitoring panel', completed: true },
      { item: 'Integrate growth optimization planner', completed: true }
    ]
  },
  {
    id: 'PRD-VENTURE-40B',
    directive_id: 'SD-VENTURE-WORKFLOW',
    title: 'Stage 40B - Portfolio Exit Sequencing',
    file_path: 'docs/02_api/40b_portfolio_exit_sequencing.md',
    category: 'exit_strategy',
    priority: 'critical',
    executive_summary: `Orchestrates strategic exit optimization across the portfolio with Chairman oversight, 
      multi-company coordination, and Performance Drive cycle integration for maximum value realization. 
      40% improvement in portfolio IRR through strategic decisions, 60% reduction in concentration risk, 
      2.5x improvement in capital efficiency.`,
    plan_checklist: [
      { item: 'Design exit sequencing optimization algorithms', completed: true },
      { item: 'Create dependency analysis engine', completed: true },
      { item: 'Plan capital redeployment system', completed: true },
      { item: 'Define market window coordination', completed: true }
    ],
    exec_checklist: [
      { item: 'Build portfolio exit dashboard', completed: true },
      { item: 'Implement dependency matrix visualization', completed: true },
      { item: 'Deploy capital recycling optimizer', completed: true },
      { item: 'Integrate market timing coordinator', completed: true }
    ]
  },
  {
    id: 'PRD-VENTURE-61',
    directive_id: 'SD-VENTURE-WORKFLOW',
    title: 'Stage 61 - Venture PRD Generation Engine',
    file_path: 'docs/03_guides/61_venture_prd_generation.md',
    category: 'automation',
    priority: 'high',
    executive_summary: `Meta-capability that applies enhancement methodology to generate implementation-ready 
      specifications for individual venture applications. Takes validated venture ideas and produces comprehensive 
      PRDs that developers can immediately use to build venture applications in Lovable.dev. Includes pattern 
      extraction, template systems, and quality validation.`,
    plan_checklist: [
      { item: 'Extract patterns from platform PRDs', completed: true },
      { item: 'Design template generation system', completed: true },
      { item: 'Create quality validation framework', completed: true },
      { item: 'Plan learning feedback loop', completed: true }
    ],
    exec_checklist: [
      { item: 'Implement PRD pattern extraction engine', completed: true },
      { item: 'Build template management system', completed: true },
      { item: 'Deploy multi-format export capability', completed: true },
      { item: 'Integrate recursive learning system', completed: true }
    ]
  }
];

async function addVentureWorkflow() {
  console.log('🚀 Adding Venture Workflow to database...\n');
  
  try {
    // Step 1: Add Strategic Directive
    console.log('📋 Adding Strategic Directive...');
    
    // Check if SD already exists
    const { data: existingSD } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', ventureSD.id)
      .single();
    
    if (existingSD) {
      console.log('⚠️  Strategic Directive already exists, updating...');
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update(ventureSD)
        .eq('id', ventureSD.id);
      
      if (updateError) {
        console.log('❌ Error updating SD:', updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from('strategic_directives_v2')
        .insert([ventureSD]);
      
      if (insertError) {
        console.log('❌ Error inserting SD:', insertError.message);
        return;
      }
    }
    
    console.log('✅ Strategic Directive added/updated successfully');
    
    // Step 2: Add PRDs
    console.log('\n📋 Adding PRDs...');
    
    for (const prd of venturePRDs) {
      console.log(`\n  Processing ${prd.id}: ${prd.title}`);
      
      // Try to read the actual file content if it exists
      const filePath = path.join(__dirname, '..', prd.file_path);
      let fileContent = '';
      
      try {
        if (fs.existsSync(filePath)) {
          fileContent = fs.readFileSync(filePath, 'utf8');
          console.log(`    ✓ Read content from ${prd.file_path}`);
        }
      } catch (err) {
        console.log(`    ⚠️  Could not read file, using summary`);
      }
      
      // Prepare PRD data
      const prdData = {
        id: prd.id,
        directive_id: prd.directive_id,
        title: prd.title,
        version: '1.0',
        status: 'approved',
        category: prd.category,
        priority: prd.priority,
        executive_summary: prd.executive_summary,
        plan_checklist: prd.plan_checklist,
        exec_checklist: prd.exec_checklist,
        business_context: fileContent ? extractSection(fileContent, 'Business Logic') : prd.executive_summary,
        technical_requirements: fileContent ? extractSection(fileContent, 'Component Architecture') : '',
        acceptance_criteria: fileContent ? extractSection(fileContent, 'Success Criteria') : prd.executive_summary,
        functional_requirements: fileContent ? extractSection(fileContent, 'Functional') : '',
        implementation_approach: fileContent ? extractSection(fileContent, 'Implementation') : '',
        phase: 'completed',
        progress: 100,
        phase_progress: {
          plan: 100,
          exec: 100,
          overall: 100
        },
        metadata: {
          file_path: prd.file_path,
          completion_date: new Date().toISOString(),
          implementation_status: 'completed'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        approved_by: 'Chairman',
        approval_date: new Date().toISOString()
      };
      
      // Check if PRD already exists
      const { data: existingPRD } = await supabase
        .from('product_requirements_v2')
        .select('id')
        .eq('id', prd.id)
        .single();
      
      if (existingPRD) {
        console.log(`    ⚠️  PRD already exists, updating...`);
        const { error: updateError } = await supabase
          .from('product_requirements_v2')
          .update(prdData)
          .eq('id', prd.id);
        
        if (updateError) {
          console.log(`    ❌ Error updating PRD:`, updateError.message);
        } else {
          console.log(`    ✅ PRD updated successfully`);
        }
      } else {
        const { error: insertError } = await supabase
          .from('product_requirements_v2')
          .insert([prdData]);
        
        if (insertError) {
          console.log(`    ❌ Error inserting PRD:`, insertError.message);
        } else {
          console.log(`    ✅ PRD added successfully`);
        }
      }
    }
    
    console.log('\n🎉 Venture Workflow successfully added to database!');
    console.log('\n📊 Summary:');
    console.log(`  - Strategic Directive: ${ventureSD.id}`);
    console.log(`  - PRDs Added: ${venturePRDs.length}`);
    console.log(`  - Status: All marked as completed`);
    console.log('\n✨ You can now view the Venture Workflow in the dashboard');
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }
}

// Helper function to extract sections from markdown
function extractSection(content, sectionName) {
  const regex = new RegExp(`##.*${sectionName}.*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim().substring(0, 2000) : ''; // Limit to 2000 chars
}

// Run the script
addVentureWorkflow();