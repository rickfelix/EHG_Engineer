/**
 * Design Sub-Agent Context Builder
 * Queries EHG application architecture to provide intelligent UI placement recommendations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Build comprehensive context for Design sub-agent decision making
 * @param {Object} options - Context options
 * @param {string} options.featureDescription - Description of feature being designed
 * @param {string} options.relatedArea - Optional feature area code (e.g., 'VENTURES')
 * @param {string} options.keywords - Optional search keywords
 */
export async function buildDesignContext(options = {}) {
  const { featureDescription, relatedArea, keywords } = options;

  console.log('🎨 Building Design Sub-Agent Context\n');

  const context = {
    feature_description: featureDescription,
    timestamp: new Date().toISOString(),
    application_knowledge: {},
    recommendations: {}
  };

  try {
    // 1. Get all feature areas
    const { data: featureAreas, error: areasError } = await supabase
      .from('ehg_feature_areas')
      .select('*')
      .order('code');

    if (areasError) throw areasError;

    context.application_knowledge.feature_areas = featureAreas;
    console.log(`✓ Loaded ${featureAreas.length} feature areas`);

    // 2. Get relevant page routes
    let routesQuery = supabase
      .from('ehg_page_routes')
      .select('*, feature_area:ehg_feature_areas(code, name)');

    if (relatedArea) {
      const matchingArea = featureAreas.find(a => a.code === relatedArea);
      if (matchingArea) {
        routesQuery = routesQuery.eq('feature_area_id', matchingArea.id);
      }
    }

    const { data: pageRoutes, error: routesError } = await routesQuery
      .order('route_path');

    if (routesError) throw routesError;

    context.application_knowledge.page_routes = pageRoutes;
    console.log(`✓ Loaded ${pageRoutes.length} page routes`);

    // 3. Get component patterns
    const { data: componentPatterns, error: patternsError } = await supabase
      .from('ehg_component_patterns')
      .select('*')
      .order('pattern_type');

    if (patternsError) throw patternsError;

    context.application_knowledge.component_patterns = componentPatterns;
    console.log(`✓ Loaded ${componentPatterns.length} component patterns`);

    // 4. Get user workflows
    let workflowsQuery = supabase
      .from('ehg_user_workflows')
      .select('*');

    if (relatedArea) {
      workflowsQuery = workflowsQuery.contains('related_features', [relatedArea]);
    }

    const { data: userWorkflows, error: workflowsError } = await workflowsQuery
      .order('workflow_name');

    if (workflowsError) throw workflowsError;

    context.application_knowledge.user_workflows = userWorkflows;
    console.log(`✓ Loaded ${userWorkflows.length} user workflows`);

    // 5. Search for similar past decisions
    if (keywords) {
      const { data: designDecisions, error: decisionsError } = await supabase
        .from('ehg_design_decisions')
        .select('*, feature_area:ehg_feature_areas(code, name)')
        .ilike('decision_context', `%${keywords}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!decisionsError) {
        context.application_knowledge.past_decisions = designDecisions;
        console.log(`✓ Found ${designDecisions.length} similar past decisions`);
      }
    }

    // 6. Generate intelligent recommendations
    context.recommendations = generateRecommendations(context.application_knowledge, {
      featureDescription,
      relatedArea,
      keywords
    });

    console.log('\n📊 Context Summary:');
    console.log(`  Feature Areas: ${featureAreas.length}`);
    console.log(`  Page Routes: ${pageRoutes.length}`);
    console.log(`  Component Patterns: ${componentPatterns.length}`);
    console.log(`  User Workflows: ${userWorkflows.length}`);
    console.log(`  Past Decisions: ${context.application_knowledge.past_decisions?.length || 0}`);

    return context;

  } catch (error) {
    console.error('❌ Error building context:', error.message);
    throw error;
  }
}

/**
 * Generate intelligent UI placement recommendations
 */
function generateRecommendations(knowledge, options) {
  const recommendations = {
    placement_options: [],
    component_reuse: [],
    workflow_integration: [],
    warnings: []
  };

  // Analyze feature areas for placement
  if (options.relatedArea) {
    const area = knowledge.feature_areas.find(a => a.code === options.relatedArea);
    if (area) {
      recommendations.placement_options.push({
        type: 'feature_area_match',
        area: area.code,
        navigation_path: area.navigation_path,
        rationale: `Feature maps to existing ${area.name} domain`
      });

      // Check for related pages in this area
      const areaPages = knowledge.page_routes.filter(r => r.feature_area?.code === options.relatedArea);
      if (areaPages.length > 0) {
        recommendations.placement_options.push({
          type: 'extend_existing_page',
          pages: areaPages.map(p => ({
            route: p.route_path,
            name: p.page_name,
            purpose: p.purpose
          })),
          rationale: `${areaPages.length} existing pages in this area could be extended`
        });
      }
    }
  }

  // Identify reusable components
  const searchTerms = options.keywords?.toLowerCase() || '';
  if (searchTerms.includes('table') || searchTerms.includes('list')) {
    const tablePattern = knowledge.component_patterns.find(p => p.pattern_name === 'Data Table');
    if (tablePattern) {
      recommendations.component_reuse.push({
        pattern: tablePattern.pattern_name,
        path: tablePattern.component_path,
        rationale: tablePattern.description,
        examples: tablePattern.example_usage
      });
    }
  }

  if (searchTerms.includes('dashboard') || searchTerms.includes('card')) {
    const cardPattern = knowledge.component_patterns.find(p => p.pattern_name === 'Dashboard Card');
    if (cardPattern) {
      recommendations.component_reuse.push({
        pattern: cardPattern.pattern_name,
        path: cardPattern.component_path,
        rationale: cardPattern.description,
        examples: cardPattern.example_usage
      });
    }
  }

  // Suggest workflow integration
  knowledge.user_workflows.forEach(workflow => {
    if (options.relatedArea && workflow.related_features.includes(options.relatedArea)) {
      recommendations.workflow_integration.push({
        workflow: workflow.workflow_name,
        code: workflow.workflow_code,
        entry_points: workflow.entry_points,
        suggestion: `Consider integrating with "${workflow.workflow_name}" workflow`
      });
    }
  });

  // Warnings for potential issues
  if (recommendations.placement_options.length === 0) {
    recommendations.warnings.push({
      type: 'no_existing_area',
      message: 'No existing feature area match found. Consider if this is truly a new domain or fits existing areas.',
      action: 'Review all feature areas before creating new top-level navigation'
    });
  }

  if (recommendations.component_reuse.length === 0 && searchTerms) {
    recommendations.warnings.push({
      type: 'no_pattern_match',
      message: 'No matching component patterns found. Ensure new components are truly necessary.',
      action: 'Review all component patterns before creating custom components'
    });
  }

  return recommendations;
}

/**
 * Query for similar features in the application
 */
export async function findSimilarFeatures(searchTerm) {
  console.log(`🔍 Searching for features similar to: "${searchTerm}"\n`);

  const { data: routes, error } = await supabase
    .from('ehg_page_routes')
    .select('*, feature_area:ehg_feature_areas(code, name)')
    .or(`page_name.ilike.%${searchTerm}%,purpose.ilike.%${searchTerm}%,user_workflow.ilike.%${searchTerm}%`)
    .limit(10);

  if (error) {
    console.error('❌ Search failed:', error.message);
    return [];
  }

  console.log(`Found ${routes.length} similar features:\n`);
  routes.forEach(route => {
    console.log(`  📄 ${route.page_name}`);
    console.log(`     Route: ${route.route_path}`);
    console.log(`     Area: ${route.feature_area?.name || 'N/A'}`);
    console.log(`     Purpose: ${route.purpose}`);
    console.log('');
  });

  return routes;
}

/**
 * Record a design decision for future reference
 */
export async function recordDesignDecision(decision) {
  console.log('📝 Recording design decision...\n');

  const { data, error } = await supabase
    .from('ehg_design_decisions')
    .insert({
      decision_context: decision.context,
      options_considered: decision.options || {},
      chosen_solution: decision.solution,
      rationale: decision.rationale,
      feature_area_id: decision.feature_area_id,
      route_id: decision.route_id,
      related_sd_key: decision.sd_key,
      metadata: decision.metadata || {}
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to record decision:', error.message);
    throw error;
  }

  console.log('✅ Design decision recorded successfully');
  console.log(`   ID: ${data.id}`);
  return data;
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'search':
      findSimilarFeatures(args[1] || 'dashboard')
        .then(() => process.exit(0))
        .catch(err => {
          console.error(err);
          process.exit(1);
        });
      break;

    case 'context':
      buildDesignContext({
        featureDescription: args[1] || 'New feature',
        relatedArea: args[2],
        keywords: args[3]
      })
        .then(context => {
          console.log('\n📋 Recommendations:\n');
          console.log(JSON.stringify(context.recommendations, null, 2));
          process.exit(0);
        })
        .catch(err => {
          console.error(err);
          process.exit(1);
        });
      break;

    default:
      console.log('Usage:');
      console.log('  node scripts/design-subagent-context-builder.js search <term>');
      console.log('  node scripts/design-subagent-context-builder.js context <description> [area] [keywords]');
      console.log('\nExamples:');
      console.log('  node scripts/design-subagent-context-builder.js search "venture"');
      console.log('  node scripts/design-subagent-context-builder.js context "New reporting feature" REPORTS "dashboard table"');
      process.exit(1);
  }
}
