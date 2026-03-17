#!/usr/bin/env node
/**
 * Intelligent Data Healing: Empty Success Metrics
 *
 * Uses LLM to generate context-appropriate success_metrics for SDs
 * that were created with empty arrays.
 *
 * Root Cause: SDs created via direct database insert bypassed the
 * standard creation scripts that generate success_metrics.
 *
 * This script:
 * 1. Finds all SDs with empty success_metrics
 * 2. Gathers full context for each SD (title, description, scope, type, parent, PRD)
 * 3. Uses GPT to generate appropriate success_metrics based on context
 * 4. Updates each SD with the generated metrics
 *
 * Usage:
 *   node scripts/heal-empty-success-metrics.js [--dry-run] [--limit N]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getLLMClient } from '../lib/llm/client-factory.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = getLLMClient({ purpose: 'generation' });

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

/**
 * Build comprehensive context for LLM to generate success_metrics
 */
async function buildSDContext(sd) {
  const context = {
    sd_key: sd.sd_key,
    title: sd.title,
    description: sd.description,
    scope: sd.scope,
    sd_type: sd.sd_type,
    category: sd.category,
    rationale: sd.rationale,
    strategic_objectives: sd.strategic_objectives,
    key_principles: sd.key_principles,
    parent: null,
    prd: null
  };

  // Get parent SD context if this is a child
  if (sd.parent_sd_id) {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, description, success_metrics, strategic_objectives')
      .eq('id', sd.parent_sd_id)
      .single();

    if (parent) {
      context.parent = {
        sd_key: parent.sd_key,
        title: parent.title,
        description: parent.description,
        strategic_objectives: parent.strategic_objectives
      };
    }
  }

  // Get PRD context if available
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('title, problem_statement, proposed_solution, functional_requirements, non_functional_requirements')
    .eq('sd_id', sd.id)
    .single();

  if (prd) {
    context.prd = {
      title: prd.title,
      problem_statement: prd.problem_statement,
      proposed_solution: prd.proposed_solution,
      functional_requirements: prd.functional_requirements,
      non_functional_requirements: prd.non_functional_requirements
    };
  }

  return context;
}

/**
 * Generate success_metrics using Claude
 */
async function generateSuccessMetrics(context) {
  const prompt = `You are helping populate success_metrics for a Strategic Directive (SD) in a software development system.

## SD Context

**SD Key**: ${context.sd_key}
**Title**: ${context.title}
**Type**: ${context.sd_type || 'feature'}
**Category**: ${context.category || 'unknown'}

**Description**:
${context.description || 'No description provided'}

**Scope**:
${context.scope || 'No scope defined'}

**Rationale**:
${context.rationale || 'No rationale provided'}

**Strategic Objectives**:
${JSON.stringify(context.strategic_objectives || [], null, 2)}

**Key Principles**:
${JSON.stringify(context.key_principles || [], null, 2)}

${context.parent ? `
## Parent Orchestrator Context
**Parent SD**: ${context.parent.sd_key}
**Parent Title**: ${context.parent.title}
**Parent Description**: ${context.parent.description || 'N/A'}
` : ''}

${context.prd ? `
## PRD Context
**Problem Statement**: ${context.prd.problem_statement || 'N/A'}
**Proposed Solution**: ${context.prd.proposed_solution || 'N/A'}
**Functional Requirements**: ${JSON.stringify(context.prd.functional_requirements || [], null, 2)}
` : ''}

## Task

Generate 3-5 specific, measurable success_metrics for this SD. Each metric should:
1. Be specific to THIS SD's deliverables (not generic)
2. Have a clear, measurable target
3. Specify how it will be measured

Return ONLY a valid JSON array with objects containing: metric, target, measurement

Example format:
[
  {"metric": "API response time", "target": "<200ms p95", "measurement": "Load test results"},
  {"metric": "Test coverage for new endpoints", "target": "≥90%", "measurement": "Jest coverage report"}
]

Generate success_metrics for the SD described above:`;

  try {
    const response = await openai.chat.completions.create({
      max_completion_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates success metrics for software development projects. Always respond with valid JSON in the exact format requested.'
        },
        { role: 'user', content: prompt }
      ]
    });

    const content = response.choices[0].message.content;

    // Parse JSON response (JSON mode ensures valid JSON)
    let jsonStr = content;
    // Handle case where LLM wraps in code blocks despite JSON mode
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Parse response - may be {metrics: [...]} or just [...]
    const parsed = JSON.parse(jsonStr);
    const metrics = Array.isArray(parsed) ? parsed : (parsed.metrics || parsed.success_metrics || []);

    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new Error('Generated metrics is not a valid non-empty array');
    }

    // Validate and normalize structure
    const normalizedMetrics = metrics.map(m => ({
      metric: m.metric || m.name || 'Unknown metric',
      target: m.target || m.goal || 'Defined',
      measurement: m.measurement || m.how_measured || m.verification || 'Verification check'
    }));

    // Final validation
    for (const m of normalizedMetrics) {
      if (!m.metric || !m.target) {
        throw new Error('Metric missing required fields (metric, target)');
      }
    }

    return normalizedMetrics;
  } catch (error) {
    console.error(`   ❌ LLM generation failed: ${error.message}`);
    return null;
  }
}

/**
 * Fallback: Generate default metrics based on SD type
 */
function generateFallbackMetrics(sd) {
  const sdType = sd.sd_type || 'feature';
  const title = sd.title || 'SD';

  const baseMetrics = [
    { metric: `${title} implementation complete`, target: '100%', measurement: 'Deliverables checklist' },
    { metric: 'Quality gate pass rate', target: '≥85%', measurement: 'Handoff validation score' }
  ];

  const typeSpecificMetrics = {
    feature: [
      { metric: 'Test coverage for new code', target: '≥80%', measurement: 'Jest/Playwright coverage' },
      { metric: 'User acceptance criteria met', target: '100%', measurement: 'UAT sign-off' }
    ],
    infrastructure: [
      { metric: 'System stability maintained', target: '0 regressions', measurement: 'CI test results' },
      { metric: 'Documentation updated', target: 'Complete', measurement: 'DOCMON validation' }
    ],
    bugfix: [
      { metric: 'Issue resolved', target: 'Verified fixed', measurement: 'Reproduction test passes' },
      { metric: 'No new regressions', target: '0', measurement: 'Regression test suite' }
    ],
    refactor: [
      { metric: 'Behavior unchanged', target: '100% parity', measurement: 'Before/after test comparison' },
      { metric: 'Code complexity reduced', target: 'Measurable improvement', measurement: 'Cyclomatic complexity' }
    ],
    documentation: [
      { metric: 'Documentation completeness', target: '100%', measurement: 'Doc coverage check' },
      { metric: 'Accuracy verified', target: 'No errors', measurement: 'Technical review' }
    ]
  };

  return [...baseMetrics, ...(typeSpecificMetrics[sdType] || typeSpecificMetrics.feature)];
}

/**
 * Main execution
 */
async function main() {
  console.log('');
  console.log('🔧 Intelligent Data Healing: Empty Success Metrics');
  console.log('='.repeat(60));
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  if (limit) console.log(`   Limit: ${limit} SDs`);
  console.log('');

  // Find SDs with empty success_metrics
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, description, scope, sd_type, category, rationale, strategic_objectives, key_principles, parent_sd_id, status')
    .or('success_metrics.is.null,success_metrics.eq.[]')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: sdsToHeal, error } = await query;

  if (error) {
    console.error('❌ Failed to query SDs:', error.message);
    process.exit(1);
  }

  console.log(`📊 Found ${sdsToHeal.length} SD(s) with empty success_metrics`);
  console.log('');

  if (sdsToHeal.length === 0) {
    console.log('✅ No SDs need healing');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const sd of sdsToHeal) {
    console.log(`\n📋 Processing: ${sd.sd_key}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Type: ${sd.sd_type || 'unknown'}`);

    // Build comprehensive context
    console.log('   Building context...');
    const context = await buildSDContext(sd);

    // Generate metrics with LLM
    console.log('   Generating metrics with LLM...');
    let metrics = await generateSuccessMetrics(context);

    // Fallback if LLM fails
    if (!metrics) {
      console.log('   ⚠️ Using fallback metrics generation');
      metrics = generateFallbackMetrics(sd);
    }

    console.log(`   ✅ Generated ${metrics.length} metrics:`);
    metrics.forEach((m, i) => {
      console.log(`      ${i + 1}. ${m.metric}: ${m.target}`);
    });

    if (!dryRun) {
      // Update the SD
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          success_metrics: metrics,
          updated_at: new Date().toISOString()
        })
        .eq('id', sd.id);

      if (updateError) {
        console.log(`   ❌ Update failed: ${updateError.message}`);
        failCount++;
      } else {
        console.log('   ✅ SD updated successfully');
        successCount++;
      }
    } else {
      console.log('   [DRY RUN] Would update SD with these metrics');
      successCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total processed: ${sdsToHeal.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  if (dryRun) {
    console.log('');
    console.log('   Run without --dry-run to apply changes');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
