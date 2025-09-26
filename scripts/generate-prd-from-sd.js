#!/usr/bin/env node
// PRD Generation from Strategic Directives (Non-lossy)
// Preserves all backlog item nuance in Evidence Appendix
// Enhanced with SD overlap detection

import { createClient } from '@supabase/supabase-js';
import { program } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { SDOverlapDetector } from './sd-overlap-detector.js';
import { CrossSDBacklogManager } from './cross-sd-backlog-manager.js';
import { AutomaticReasoningEngine } from '../src/services/AutomaticReasoningEngine.js';
import chalk from 'chalk';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

program
  .option('--sd-id <id>', 'SD ID to generate PRD for')
  .option('--all', 'Generate PRDs for all SDs')
  .option('--output <dir>', 'Output directory for markdown files', './prds')
  .option('--force', 'Skip overlap warnings and proceed')
  .option('--check-overlaps', 'Only check for overlaps, do not generate PRD')
  .option('--enhanced-validation', 'Include PLAN technical validation data in PRD')
  .parse();

const options = program.opts();

// Function to get PLAN validation data if enhanced validation is requested
async function getPlanValidationData(sdId) {
  if (!options.enhancedValidation) return null;

  try {
    console.log(`🔧 Fetching PLAN technical validation data for ${sdId}...`);

    const { data: validation } = await supabase
      .rpc('get_latest_plan_validation', { p_sd_id: sdId });

    if (!validation || validation.length === 0) {
      console.log(chalk.yellow(`⚠️  No PLAN validation found for ${sdId}`));
      return null;
    }

    // Get quality gates
    const { data: qualityGates } = await supabase
      .from('plan_quality_gates')
      .select('*')
      .eq('validation_id', validation[0].validation_id)
      .order('gate_name');

    // Get sub-agent reports
    const { data: subAgentReports } = await supabase
      .from('plan_sub_agent_executions')
      .select('*')
      .eq('validation_id', validation[0].validation_id)
      .order('sub_agent_type');

    return {
      ...validation[0],
      quality_gates: qualityGates || [],
      sub_agent_reports: subAgentReports || []
    };

  } catch (error) {
    console.error(chalk.red(`Error fetching PLAN validation: ${error.message}`));
    return null;
  }
}

async function checkBacklogCompletion(sdId) {
  try {
    const manager = new CrossSDBacklogManager();

    // Get backlog items for this SD
    const { data: items } = await supabase
      .from('sd_backlog_map')
      .select('backlog_id, backlog_title')
      .eq('sd_id', sdId);

    if (!items || items.length === 0) return null;

    let completedCount = 0;
    let completedElsewhere = [];

    for (const item of items) {
      const completion = await manager.getCompletionStatus(item.backlog_id);

      if (completion.status === 'COMPLETED') {
        completedCount++;

        if (completion.completed_by && completion.completed_by !== sdId) {
          completedElsewhere.push({
            title: item.backlog_title,
            completedBy: completion.completed_by
          });
        }
      }
    }

    if (completedCount > 0) {
      let warning = `${completedCount}/${items.length} backlog items already completed`;

      if (completedElsewhere.length > 0) {
        const elsewhere = completedElsewhere.map(i =>
          `${i.title.substring(0, 30)} (by ${i.completedBy})`
        ).join(', ');
        warning += `. Cross-SD completions: ${elsewhere}`;
      }

      return warning;
    }

    return null;

  } catch (error) {
    console.error(chalk.yellow(`⚠️  Could not check completion: ${error.message}`));
    return null;
  }
}

async function checkSDOverlaps(sdId) {
  try {
    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (!sd) return null;

    const detector = new SDOverlapDetector();

    // Get other active SDs
    const { data: otherSDs } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .neq('id', sdId)
      .in('status', ['active', 'in_progress']);

    if (!otherSDs || otherSDs.length === 0) return null;

    let criticalOverlaps = [];

    // Check for overlaps
    for (const otherSD of otherSDs) {
      const overlap = await detector.analyzePair(sd, otherSD);

      if (overlap && overlap.overlap_score >= 50) {
        criticalOverlaps.push({
          sd_key: otherSD.sd_key,
          title: otherSD.title,
          score: overlap.overlap_score,
          recommendation: overlap.recommendation
        });
      }
    }

    if (criticalOverlaps.length > 0) {
      const warnings = criticalOverlaps.map(o =>
        `${o.sd_key}: ${o.score}% overlap (${o.recommendation})`
      ).join(', ');

      return `SD has critical overlaps with: ${warnings}`;
    }

    return null;

  } catch (error) {
    console.error(chalk.yellow(`⚠️  Could not check overlaps: ${error.message}`));
    return null;
  }
}

/**
 * Generate acceptance criteria from backlog item descriptions
 */
function generateAcceptanceCriteria(items) {
  const criteria = [];

  // Group items by priority
  const criticalItems = items.filter(i => i.priority === 'Critical' || i.priority === 'Very High');
  const highItems = items.filter(i => i.priority === 'High');
  const mediumItems = items.filter(i => i.priority === 'Medium');

  // Generate criteria for critical items
  criticalItems.forEach(item => {
    if (item.item_description) {
      criteria.push({
        id: `AC-${item.backlog_id}`,
        priority: 'MUST',
        description: item.backlog_title,
        criteria: `System must ${item.item_description.toLowerCase().replace(/^the |^a |^an /, '')}`,
        source: item.backlog_id
      });
    }
  });

  // Generate criteria for high priority items
  highItems.forEach(item => {
    if (item.item_description) {
      criteria.push({
        id: `AC-${item.backlog_id}`,
        priority: 'SHOULD',
        description: item.backlog_title,
        criteria: `System should ${item.item_description.toLowerCase().replace(/^the |^a |^an /, '')}`,
        source: item.backlog_id
      });
    }
  });

  // Generate criteria for medium priority items
  mediumItems.forEach(item => {
    if (item.item_description) {
      criteria.push({
        id: `AC-${item.backlog_id}`,
        priority: 'COULD',
        description: item.backlog_title,
        criteria: `System could ${item.item_description.toLowerCase().replace(/^the |^a |^an /, '')}`,
        source: item.backlog_id
      });
    }
  });

  return criteria;
}

function generatePRDMarkdown(payload) {
  const sd = payload;
  const items = sd.items || [];

  // Build scope list
  const scopeItems = items.map(item =>
    `- [${item.backlog_id}] ${item.backlog_title}`
  ).join('\n');

  // Generate acceptance criteria
  const acceptanceCriteria = generateAcceptanceCriteria(items);

  // Format acceptance criteria for markdown
  const formattedCriteria = acceptanceCriteria.map(ac =>
    `### ${ac.id}: ${ac.description}
- **Priority:** ${ac.priority}
- **Criteria:** ${ac.criteria}
- **Source:** Backlog item ${ac.source}`
  ).join('\n\n');
  
  
  const markdown = `# PRD – ${sd.sd_id}: ${sd.sd_title}

**Page:** ${sd.page_category || 'N/A'} / ${sd.page_title || 'N/A'}  
**Sequence Rank:** ${sd.sequence_rank}  
**Rolled Triage:** ${sd.rolled_triage}  
**Counts:** H=${sd.h_count}, M=${sd.m_count}, L=${sd.l_count}, F=${sd.future_count}  
**Must-have:** ${sd.must_have_count} / ${sd.total_items} (${sd.must_have_pct}%)

## 1. Problem & Context

This strategic directive addresses the need for ${sd.sd_title}. With ${sd.total_items} backlog items identified, ${sd.must_have_count} are marked as must-have requirements (${sd.must_have_pct}% of total scope).

${sd.sd_extras && sd.sd_extras.context ? sd.sd_extras.context : 'The initiative focuses on delivering key capabilities as outlined in the backlog items below.'}

## 2. Objectives & KPIs

### Primary Objectives:
- Deliver all ${sd.must_have_count} must-have requirements
- Complete implementation within the ${sd.rolled_triage} priority timeline
- Ensure all ${sd.h_count} high-priority items are addressed first

### Key Performance Indicators:
- Completion rate of must-have items: Target 100%
- User adoption rate: Measure within 30 days of launch
- Performance metrics: Meet or exceed baseline requirements
${sd.readiness ? `- Readiness score: Current ${sd.readiness}` : ''}

## 3. Scope (backlog-driven)

### In-scope items (${items.length} total):
${scopeItems}

### Priority Distribution:
- High Priority: ${sd.h_count} items
- Medium Priority: ${sd.m_count} items
- Low Priority: ${sd.l_count} items
- Future Consideration: ${sd.future_count} items

${sd.new_module_pct ? `### New Module Requirements:
${sd.new_module_pct}% of items require new module development` : ''}

## 4. User Experience & EVA Hooks

### Key User Flows:
Based on the backlog analysis, the primary user interactions will involve:
${items.filter(i => i.new_module).length > 0 ? `
- ${items.filter(i => i.new_module).length} new module integrations
` : ''}
- Progressive enhancement of existing features
- Seamless integration with current workflows

### EVA Integration Points:
- Activation triggers based on user context
- Natural language processing for intent recognition
- Contextual assistance throughout the workflow

## 5. Technical Notes

### Implementation Considerations:
- Total implementation items: ${sd.total_items}
- New module requirements: ${items.filter(i => i.new_module).length} items
${sd.must_have_density ? `- Must-have density: ${sd.must_have_density}` : ''}
${sd.readiness ? `- Current readiness: ${sd.readiness}` : ''}

### Dependencies:
Items are distributed across ${new Set(items.map(i => i.phase)).size} phases with dependencies managed through stage sequencing.

## 6. Acceptance Criteria (Auto-Generated from Backlog)

${acceptanceCriteria.length > 0 ? formattedCriteria : '*No acceptance criteria could be generated from backlog items.*'}

## 7. Traceability

- **Strategic Directive:** ${sd.sd_id}
- **Target Application:** ${sd.target_application || 'Not specified'}
- **Backlog Items:** ${items.map(i => i.backlog_id).join(', ')}
- **Import Run:** ${sd.import_run_id || 'N/A'}
- **Generated:** ${new Date().toISOString()}

---

## Appendix A — Backlog Evidence

*See evidence_appendix field for full backlog item details*

---

*This PRD was generated from the EHG Backlog import, preserving all original item details and metadata.*`;

  return markdown;
}

async function generatePRD(sdId) {
  console.log(`\n📋 Generating PRD for ${sdId}...`);

  // Initialize automatic reasoning engine
  const reasoningEngine = new AutomaticReasoningEngine();

  // First, get the SD to check target_application
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ SD ${sdId} not found:`, sdError?.message);
    return null;
  }

  console.log(`🎯 Target Application: ${sdData.target_application || 'Not specified'}`);

  // Get PLAN validation data if enhanced validation is requested
  const planValidation = await getPlanValidationData(sdId);

  // Check target_application and use appropriate view
  let backlogView;
  if (sdData.target_application === 'EHG_ENGINEER') {
    backlogView = 'v_ehg_engineer_backlog';
    console.log('📚 Using EHG_ENGINEER backlog view');
  } else if (sdData.target_application === 'EHG' || !sdData.target_application) {
    backlogView = 'v_ehg_backlog';
    console.log('📚 Using EHG backlog view');
  } else {
    console.error(`❌ Unknown target_application: ${sdData.target_application}`);
    return null;
  }

  // Check for boundary violations
  const { data: validationData } = await supabase
    .from('v_backlog_validation')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (validationData) {
    if (validationData.potential_ehg_in_engineer > 0) {
      console.log(chalk.yellow(`⚠️  WARNING: ${validationData.potential_ehg_in_engineer} EHG items detected in EHG_ENGINEER SD`));
    }
    if (validationData.potential_engineer_in_ehg > 0) {
      console.log(chalk.yellow(`⚠️  WARNING: ${validationData.potential_engineer_in_ehg} EHG_ENGINEER items detected in EHG SD`));
    }
  }

  // Check for completed backlog items
  const completionWarning = await checkBacklogCompletion(sdId);
  if (completionWarning) {
    console.log(chalk.yellow(`\n⚠️  WARNING: ${completionWarning}`));
    console.log(chalk.yellow('Some backlog items may already be completed.\n'));
  }

  // Check for overlaps before generating PRD
  const overlapWarning = await checkSDOverlaps(sdId);
  if (overlapWarning) {
    console.log(chalk.yellow(`\n⚠️  WARNING: ${overlapWarning}`));
    console.log(chalk.yellow('Consider reviewing overlaps before proceeding.\n'));

    // Ask for confirmation if running interactively
    if (process.stdin.isTTY && !program.opts().force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question('Continue with PRD generation? (y/n): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('PRD generation cancelled.');
        return null;
      }
    }
  }

  // Get backlog items from the appropriate view
  const { data: backlogItems, error: backlogError } = await supabase
    .from(backlogView)
    .select('*')
    .eq('sd_id', sdId)
    .order('priority_rank')
    .order('stage_number');

  if (backlogError) {
    console.error(`❌ Error fetching backlog items:`, backlogError.message);
  }

  // Fetch SD with items from view
  const { data: payload, error } = await supabase
    .from('v_prd_sd_payload')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (error) {
    console.error(`❌ Error fetching SD ${sdId}:`, error.message);
    return null;
  }

  if (!payload) {
    console.error(`❌ SD ${sdId} not found`);
    return null;
  }
  
  // Generate content - use backlog items from the correct view
  const items = backlogItems || payload.items || [];

  // === AUTOMATIC REASONING ANALYSIS ===
  console.log('\n🧠 INITIATING AUTOMATIC REASONING ANALYSIS');
  console.log('=' .repeat(50));

  // Prepare reasoning context
  const reasoningContext = {
    sdId: sdId,
    prdId: payload.prd_id || `PRD-${payload.sd_id}`,
    description: payload.sd_title || payload.description || '',
    requirements: payload.scope_overview || '',
    priority: payload.priority_score || 50,
    functionalRequirements: items.map(item => ({
      title: item.backlog_title,
      description: item.item_description,
      priority: item.priority
    })),
    backlogItems: items
  };

  // Analyze complexity and determine reasoning depth
  const complexityAnalysis = await reasoningEngine.analyzeComplexity(reasoningContext);

  // Execute chain-of-thought reasoning
  const reasoningResults = await reasoningEngine.executeChainOfThought(
    { ...reasoningContext, ...complexityAnalysis },
    complexityAnalysis.reasoningDepth
  );

  console.log(`✅ Reasoning completed with ${complexityAnalysis.reasoningDepth.toUpperCase()} depth`);
  console.log(`📊 Confidence: ${reasoningResults.synthesis?.confidence || 'N/A'}%`);

  // Enhance payload with target_application, backlog items, validation data, and reasoning
  const enhancedPayload = {
    ...payload,
    items: items,
    target_application: sdData.target_application,
    plan_validation: planValidation,
    reasoning_analysis: reasoningResults,
    complexity_analysis: complexityAnalysis
  };

  // Prepare PRD data for database storage (database-first approach)
  const prdData = {
    id: payload.prd_id || `PRD-${payload.sd_id}`,
    directive_id: payload.sd_id,
    sd_id: payload.sd_id,
    title: payload.sd_title,
    version: '1.0',
    status: 'draft',
    category: 'technical',
    priority: payload.priority || 'high',
    executive_summary: `PRD for ${payload.sd_title}`,
    scope_overview: payload.scope_overview || '',
    acceptance_criteria: payload.items || [],
    technical_specifications: {
      sequence_rank: payload.sequence_rank,
      page_category: payload.page_category,
      page_title: payload.page_title,
      rolled_triage: payload.rolled_triage,
      counts: {
        h: payload.h_count,
        m: payload.m_count,
        l: payload.l_count,
        f: payload.future_count,
        total: payload.total_items
      },
      must_have: {
        count: payload.must_have_count,
        percentage: payload.must_have_pct
      }
    },
    plan_validation: enhancedPayload.plan_validation || null,
    validation_status: enhancedPayload.plan_validation ? 'validated' : 'pending_validation',
    reasoning_analysis: enhancedPayload.reasoning_analysis || null,
    complexity_analysis: enhancedPayload.complexity_analysis || null,
    reasoning_depth: enhancedPayload.complexity_analysis?.reasoningDepth || 'standard',
    confidence_score: enhancedPayload.reasoning_analysis?.synthesis?.confidence || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Store evidence as structured JSON for database
  const evidenceData = items.map(item => ({
    backlog_id: item.backlog_id,
    backlog_title: item.backlog_title,
    my_comments: item.my_comments,
    priority: item.priority,
    stage_number: item.stage_number,
    phase: item.phase,
    new_module: item.new_module,
    item_description: item.item_description,
    description_raw: item.description_raw,
    extras: item.extras || {}
  }));

  // Add evidenceData to prdData
  prdData.evidence_data = evidenceData;
  prdData.backlog_items = items || [];
  
  // Store in database (database-first approach)
  console.log(`📋 Storing PRD ${prdData.id} in database...`);

  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();
  
  if (prdError && prdError.code === '23505') {
    // Duplicate - update existing
    console.log(`⚠️  ${prdData.id} already exists, updating with validation data...`);

    const updateData = {
      title: prdData.title,
      priority: prdData.priority,
      executive_summary: prdData.executive_summary,
      technical_specifications: prdData.technical_specifications,
      evidence_data: prdData.evidence_data,
      backlog_items: prdData.backlog_items,
      plan_validation: prdData.plan_validation,
      validation_status: prdData.validation_status,
      reasoning_analysis: prdData.reasoning_analysis,
      complexity_analysis: prdData.complexity_analysis,
      reasoning_depth: prdData.reasoning_depth,
      confidence_score: prdData.confidence_score,
      updated_at: new Date().toISOString()
    };

    const { data: updatedPrd, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(updateData)
      .eq('id', prdData.id)
      .select()
      .single();

    if (updateError) {
      console.error(`❌ Error updating PRD:`, updateError.message);
      return null;
    }

    console.log(`✅ Updated ${prdData.id} with PLAN validation data`);
    return updatedPrd;
  } else if (prdError) {
    console.error(`❌ Error creating PRD:`, prdError.message);
    return null;
  }
  
  console.log(`✅ Generated ${prdData.id} in database`);

  // Log PLAN validation status
  if (prdData.plan_validation) {
    console.log(`🔍 PLAN Validation: ${prdData.plan_validation.final_decision} (${prdData.plan_validation.complexity_score}/10 complexity)`);
    console.log(`✅ Technical Feasibility: ${prdData.plan_validation.technical_feasibility}`);
    console.log(`⚠️ Implementation Risk: ${prdData.plan_validation.implementation_risk}`);
  } else {
    console.log(`⚠️ No PLAN validation data - PRD marked as 'pending_validation'`);
  }

  // No file output - database-first approach only
  if (options.output) {
    console.log(`⚠️ --output option ignored: Using database-first approach per LEO Protocol v4.2.0`);
  }
  
  return prd;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 PRD GENERATION TOOL');
  console.log('='.repeat(60));
  
  if (options.all) {
    // Generate for all SDs (from v2 table)
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('present_in_latest_import', true)
      .order('sequence_rank');
    
    if (sds) {
      console.log(`\nGenerating PRDs for ${sds.length} SDs...`);
      for (const sd of sds) {
        await generatePRD(sd.id);
      }
    }
  } else if (options.sdId) {
    // Generate for specific SD
    const prd = await generatePRD(options.sdId);
    
    if (prd) {
      console.log('\n📊 PRD Summary:');
      console.log(`   id: ${prd.id}`);
      console.log(`   directive_id: ${prd.directive_id}`);
      console.log(`   status: ${prd.status}`);
      console.log(`   backlog_items: ${prd.backlog_items?.length || 0} items`);
      
      // Show first 40 lines of markdown
      const lines = prd.content.split('\n');
      console.log('\n📄 First 40 lines of Markdown:');
      console.log('-'.repeat(60));
      console.log(lines.slice(0, 40).join('\n'));
      console.log('-'.repeat(60));
      
      // Show first 2 items from backlog_items
      if (prd.backlog_items && prd.backlog_items.length > 0) {
        console.log('\n📦 First 2 backlog items:');
        console.log(JSON.stringify(prd.backlog_items.slice(0, 2), null, 2));
      }
    }
  } else {
    console.log('Please specify --sd-id <id> or --all');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ PRD generation complete');
  console.log('='.repeat(60));
}

main().catch(console.error);