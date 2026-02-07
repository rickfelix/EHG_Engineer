/**
 * Main Execution Function for STORIES Sub-Agent
 * Orchestrates user story context engineering
 *
 * @module execute
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { createSupabaseServiceClient } from '../../../../scripts/lib/supabase-connection.js';
import { validateUserStoryQuality } from '../../../../scripts/modules/user-story-quality-validation.js';
import {
  generateQualityStoryContent,
  generateStoriesBatch,
  isLLMGenerationAvailable
} from './quality-generation.js';
import { analyzeCodebasePatterns } from './codebase-analysis.js';
import {
  generateImplementationContext,
  generateArchitectureReferences,
  generateCodePatterns,
  generateTestingScenarios
} from './context-generation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../../.env') });

/**
 * Execute User Story Context Engineering
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Enhancement results
 */
export async function execute(sdId, subAgent, options = {}) {
  const sdKey = options.sdKey || sdId;
  console.log(`\nUSER STORY CONTEXT ENGINEERING - Executing for ${sdKey}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Resolve SD UUID: support both UUID and sd_key input formats
  // The user_stories.sd_id FK references strategic_directives_v2.id (UUID), not sd_key
  let resolvedSdId = sdId;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  if (!isUUID) {
    console.log(`   Resolving SD key '${sdId}' to UUID...`);
    const { data: sdRecord, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title')
      .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
      .single();

    if (sdError || !sdRecord) {
      console.error(`   ❌ SD not found: ${sdId}`);
      return {
        sd_id: sdId,
        timestamp: new Date().toISOString(),
        verdict: 'FAIL',
        confidence: 0,
        critical_issues: [{
          issue: `Strategic Directive '${sdId}' not found in database`,
          mitigation_required: true
        }]
      };
    }

    resolvedSdId = sdRecord.id;
    console.log(`   ✅ Resolved to UUID: ${resolvedSdId} (${sdRecord.title})`);
  }

  const results = {
    sd_id: resolvedSdId,
    timestamp: new Date().toISOString(),
    stories_processed: 0,
    stories_enhanced: 0,
    context_added: [],
    already_complete: [],
    failed: [],
    verdict: 'PASS',
    confidence: 0
  };

  try {
    // Step 1: Fetch user stories
    console.log('Step 1: Fetching user stories...');
    let { data: userStories, error: storiesError } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', resolvedSdId);

    if (storiesError) {
      throw new Error(`Failed to fetch user stories: ${storiesError.message}`);
    }

    // Step 1B: Detect and remove placeholder stories
    userStories = await removeplaceholderStories(supabase, userStories, results);

    // Step 1A: Create user stories if none exist
    if (!userStories || userStories.length === 0) {
      userStories = await createStoriesFromPRD(supabase, resolvedSdId, sdKey, options, results);
      if (!userStories) {
        return results;
      }
    }

    console.log(`   Found ${userStories.length} user stories`);
    results.stories_processed = userStories.length;

    // Step 2: Fetch PRD for context
    console.log('\nStep 2: Fetching PRD for context...');
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', resolvedSdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (prd) {
      console.log(`   PRD found: ${prd.title}`);
    } else {
      console.log('   Warning: No PRD found - using limited context');
    }

    // Step 3: Analyze codebase patterns
    console.log('\nStep 3: Analyzing codebase patterns...');
    const codebasePatterns = await analyzeCodebasePatterns(sdId, prd);
    console.log(`   Found ${Object.keys(codebasePatterns).length} relevant patterns`);

    // Step 4: Enhance each user story
    console.log('\nStep 4: Enhancing user stories with context...\n');
    await enhanceUserStories(supabase, userStories, prd, codebasePatterns, results);

    // Step 5: Generate summary
    console.log('\nStep 5: Generating summary...');
    generateSummary(results);

    // Step 6: Generate recommendations
    generateRecommendations(results);

    // Step 7: Print final summary
    printFinalSummary(results);

    return results;

  } catch (error) {
    console.error('Context Engineering Failed:', error.message);
    return {
      ...results,
      verdict: 'FAIL',
      confidence: 0,
      critical_issues: [{
        issue: `Context engineering failed: ${error.message}`,
        mitigation_required: false
      }]
    };
  }
}

/**
 * Remove placeholder stories (PAT-STORIES-PLACEHOLDER-001)
 */
async function removeplaceholderStories(supabase, userStories, results) {
  if (!userStories || userStories.length === 0) {
    return userStories;
  }

  const placeholderPatterns = [
    /to be defined/i,
    /placeholder/i,
    /tbd/i,
    /^us-\d+$/i
  ];

  const placeholderStories = userStories.filter(story => {
    const hasPlaceholderTitle = placeholderPatterns.some(p => p.test(story.title || ''));
    const hasMinimalContext = !story.implementation_context || story.implementation_context.length < 50;
    const hasPlaceholderCreator = story.created_by === 'PRODUCT_REQUIREMENTS_EXPERT';
    return hasPlaceholderTitle || (hasMinimalContext && hasPlaceholderCreator);
  });

  if (placeholderStories.length > 0) {
    console.log(`   Warning: Found ${placeholderStories.length} placeholder stories (PAT-STORIES-PLACEHOLDER-001)`);
    console.log('   Removing placeholder stories to regenerate from PRD...');

    const placeholderIds = placeholderStories.map(s => s.id);
    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .in('id', placeholderIds);

    if (deleteError) {
      console.log(`   Warning: Could not delete placeholders: ${deleteError.message}`);
    } else {
      console.log(`   Removed ${placeholderStories.length} placeholder stories`);
      results.placeholders_removed = placeholderStories.length;
      return userStories.filter(s => !placeholderIds.includes(s.id));
    }
  }

  return userStories;
}

/**
 * Create user stories from PRD acceptance criteria
 */
async function createStoriesFromPRD(supabase, sdId, sdKey, options, results) {
  console.log('   Warning: No user stories found');
  console.log('\nStep 1A: Creating user stories from acceptance criteria...');

  console.log(`   Fetching PRD for SD: ${sdKey} (${sdId})`);

  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const prdId = prd?.id || options.prd_id || `PRD-${sdKey}`;

  if (prdError || !prd) {
    console.log(`   PRD not found: ${prdError?.message || 'No PRD exists'}`);
    results.verdict = 'WARNING';
    results.confidence = 50;
    results.warnings = ['No user stories found and no PRD to generate from. Create PRD first.'];
    return null;
  }

  if (!prd.acceptance_criteria || prd.acceptance_criteria.length === 0) {
    console.log('   PRD has no acceptance criteria');
    results.verdict = 'WARNING';
    results.confidence = 50;
    results.warnings = ['No acceptance criteria in PRD to generate user stories from.'];
    return null;
  }

  console.log(`   Found ${prd.acceptance_criteria.length} acceptance criteria`);

  // Check if LLM generation is available
  const llmAvailable = isLLMGenerationAvailable();
  if (llmAvailable) {
    console.log('   LLM generation: ENABLED (using Claude for semantic understanding)');
  } else {
    console.log('   LLM generation: DISABLED (using rule-based templates)');
  }
  console.log('   Generating user stories with implementation context...\n');

  const codebasePatterns = await analyzeCodebasePatterns(sdId, prd);
  const createdStories = [];

  // Use batch LLM generation for efficiency
  const batchResult = await generateStoriesBatch(prd.acceptance_criteria, prd, { sdKey });
  console.log(`   Generation method: ${batchResult.generated_by}`);

  if (batchResult.gaps && batchResult.gaps.length > 0) {
    console.log(`   Detected ${batchResult.gaps.length} requirement gaps:`);
    batchResult.gaps.forEach(gap => {
      console.log(`      - [${gap.type}] ${gap.description}`);
    });
    results.detected_gaps = batchResult.gaps;
  }

  for (let i = 0; i < prd.acceptance_criteria.length; i++) {
    const criterion = prd.acceptance_criteria[i];
    const storyKey = `${sdKey}:US-${String(i + 1).padStart(3, '0')}`;

    // Get story content from batch results or generate individually
    const storyContent = batchResult.stories[i] || generateQualityStoryContent(criterion, prd, i);

    const storyTemplate = {
      title: storyContent.title || criterion,
      sd_id: sdId,
      prd_id: prdId
    };

    const implContext = await generateImplementationContext(storyTemplate, prd, codebasePatterns);

    const userStory = {
      id: randomUUID(),
      story_key: storyKey,
      sd_id: sdId,
      prd_id: prdId,
      title: storyContent.title || criterion,
      user_role: storyContent.user_role,
      user_want: storyContent.user_want,
      user_benefit: storyContent.user_benefit,
      story_points: storyContent.story_points,
      priority: i === 0 ? 'critical' : (i < 3 ? 'high' : 'medium'),
      status: 'ready',
      acceptance_criteria: storyContent.acceptance_criteria,
      implementation_context: implContext,
      created_by: storyContent.generated_by === 'LLM' ? 'PLAN_LLM' : 'PLAN',
      // Note: metadata field removed - user_stories table doesn't have this column
      // Store generation context in technical_notes instead
      technical_notes: JSON.stringify({
        generated_by: storyContent.generated_by || 'RULE_BASED',
        original_criterion: criterion,
        gaps_detected: storyContent.gaps_detected || []
      })
    };

    const qualityCheck = await validateUserStoryQuality(userStory);
    if (!qualityCheck.valid) {
      console.log(`   Warning: Quality check failed for ${storyKey} (score: ${qualityCheck.score}%)`);
      const issues = qualityCheck.issues || [];
      issues.forEach(issue => console.log(`      - ${issue}`));
    } else {
      console.log(`   Quality check passed for ${storyKey} (score: ${qualityCheck.score}%)`);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('user_stories')
      .insert(userStory)
      .select()
      .single();

    if (insertError) {
      console.log(`   Failed to create ${storyKey}: ${insertError.message}`);
      continue;
    }

    console.log(`   Created ${storyKey}: ${criterion.substring(0, 60)}...`);
    createdStories.push(inserted);
  }

  if (createdStories.length === 0) {
    results.verdict = 'FAIL';
    results.confidence = 0;
    results.critical_issues = [{
      issue: 'Failed to create any user stories from acceptance criteria',
      mitigation_required: true
    }];
    return null;
  }

  console.log(`\n   Created ${createdStories.length} user stories from acceptance criteria`);
  results.stories_created = createdStories.length;
  return createdStories;
}

/**
 * Enhance user stories with context
 */
async function enhanceUserStories(supabase, userStories, prd, codebasePatterns, results) {
  for (const story of userStories) {
    console.log(`   Processing: ${story.story_id || story.id}`);
    console.log(`   Title: ${story.title}`);

    if (story.implementation_context && story.implementation_context.length > 100) {
      console.log('   Already enhanced - skipping');
      results.already_complete.push({
        story_id: story.story_id || story.id,
        reason: 'Already has implementation context'
      });
      continue;
    }

    const context = await generateImplementationContext(story, prd, codebasePatterns);
    const architectureRefs = await generateArchitectureReferences(story, prd, codebasePatterns);
    const codePatterns = await generateCodePatterns(story, prd, codebasePatterns);
    const testingScenarios = await generateTestingScenarios(story, prd);

    const { error: updateError } = await supabase
      .from('user_stories')
      .update({
        implementation_context: context,
        architecture_references: architectureRefs,
        example_code_patterns: codePatterns,
        testing_scenarios: testingScenarios,
        updated_at: new Date().toISOString()
      })
      .eq('id', story.id);

    if (updateError) {
      console.log(`   Failed to update: ${updateError.message}`);
      results.failed.push({
        story_id: story.story_id || story.id,
        reason: `Update failed: ${updateError.message}`
      });
    } else {
      console.log('   Enhanced with implementation context');
      results.stories_enhanced++;
      results.context_added.push({
        story_id: story.story_id || story.id,
        title: story.title,
        context_length: context.length,
        architecture_refs: architectureRefs.length,
        code_patterns: codePatterns.length,
        test_scenarios: testingScenarios.length
      });
    }

    console.log('');
  }
}

/**
 * Generate summary from results
 */
function generateSummary(results) {
  const totalProcessed = results.stories_processed;
  const successfullyHandled = results.stories_enhanced + results.already_complete.length;
  const failureCount = results.failed.length;

  if (failureCount > 0) {
    results.verdict = 'FAIL';
    results.confidence = Math.max(0, 100 - (failureCount / totalProcessed * 100));
    console.log(`   ${failureCount} stories failed to enhance`);
  } else if (successfullyHandled === totalProcessed) {
    results.verdict = 'PASS';
    results.confidence = 95;
    if (results.already_complete.length > 0) {
      console.log(`   All stories validated: ${results.stories_enhanced} enhanced, ${results.already_complete.length} already complete`);
    } else {
      console.log(`   All ${results.stories_enhanced} stories enhanced`);
    }
  } else if (results.stories_enhanced > 0) {
    results.verdict = 'CONDITIONAL_PASS';
    console.log(`   Warning: ${results.stories_enhanced}/${results.stories_processed} stories enhanced`);
  } else {
    results.verdict = 'WARNING';
    console.log('   Warning: No stories were enhanced');
  }
}

/**
 * Generate recommendations from results
 */
function generateRecommendations(results) {
  results.recommendations = [];

  if (results.stories_enhanced > 0) {
    results.recommendations.push({
      title: 'Context Engineering Complete',
      description: `${results.stories_enhanced} user stories enhanced with implementation context. EXEC agents will have detailed guidance.`
    });
  }

  if (results.already_complete.length > 0) {
    results.recommendations.push({
      title: 'Stories Already Complete',
      description: `${results.already_complete.length} stories already have implementation context. This is a success - no additional work needed.`
    });
  }

  if (results.failed.length > 0) {
    results.recommendations.push({
      title: 'Failed Story Enhancements',
      description: `${results.failed.length} stories failed to enhance. Review errors and retry.`
    });
    results.critical_issues = results.failed.map(f => ({
      issue: `Story ${f.story_id} failed: ${f.reason}`,
      mitigation_required: true
    }));
  }

  results.recommendations.push({
    title: 'EXEC Phase Guidance',
    description: 'User stories now include: implementation_context (architecture patterns, component locations), architecture_references (existing code to reference), example_code_patterns (code snippets), and testing_scenarios (test cases).'
  });
}

/**
 * Print final summary
 */
function printFinalSummary(results) {
  const totalProcessed = results.stories_processed;
  const successfullyHandled = results.stories_enhanced + results.already_complete.length;

  console.log('\n' + '='.repeat(60));
  console.log('USER STORY CONTEXT ENGINEERING COMPLETE');
  console.log('='.repeat(60));
  console.log(`Stories Processed: ${results.stories_processed}`);
  console.log(`Stories Enhanced: ${results.stories_enhanced}`);
  console.log(`Already Complete: ${results.already_complete.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Success Rate: ${(successfullyHandled / totalProcessed * 100).toFixed(1)}%`);
  console.log(`Verdict: ${results.verdict} (${results.confidence}% confidence)`);
  console.log('='.repeat(60) + '\n');
}
