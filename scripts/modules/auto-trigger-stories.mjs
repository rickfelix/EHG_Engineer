#!/usr/bin/env node

/**
 * Auto-Trigger Product Requirements Expert (STORIES Sub-Agent)
 *
 * Automatically generates user stories after PRD creation
 * Part of Phase 3.2: Enhanced user story validation enforcement
 *
 * Usage:
 *   import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';
 *   await autoTriggerStories(supabase, sdId, prdId);
 */

import { randomUUID } from 'crypto';

/**
 * Auto-trigger Product Requirements Expert sub-agent
 *
 * @param {object} supabase - Supabase client instance
 * @param {string} sdId - Strategic Directive ID (e.g., 'SD-EVA-MEETING-001')
 * @param {string} prdId - Product Requirements Document ID (e.g., 'PRD-SD-EVA-MEETING-001')
 * @param {object} options - Optional configuration
 * @returns {object} Execution result
 */
export async function autoTriggerStories(supabase, sdId, prdId, options = {}) {
  const {
    skipIfExists = true,
    notifyOnSkip = true,
    logExecution = true
  } = options;

  console.log('\n🎯 Product Requirements Expert: Auto-Trigger Check');
  console.log('═══════════════════════════════════════════════════\n');

  const executionId = randomUUID();
  const startTime = Date.now();

  try {
    // Step 1: Check if user stories already exist
    console.log('📝 Step 1: Checking for existing user stories...');
    const { data: existingStories, error: checkError } = await supabase
      .from('user_stories')
      .select('story_key, title, status')
      .eq('sd_id', sdId);

    if (checkError) {
      throw new Error(`Failed to check existing user stories: ${checkError.message}`);
    }

    if (existingStories && existingStories.length > 0) {
      const message = `User stories already exist for ${sdId} (${existingStories.length} stories)`;

      if (skipIfExists) {
        console.log(`   ✅ ${message}`);
        console.log(`   ⏭️  Skipping Product Requirements Expert execution\n`);

        if (notifyOnSkip) {
          await logSubAgentSkip(supabase, sdId, prdId, executionId, {
            reason: 'USER_STORIES_EXIST',
            existing_count: existingStories.length,
            stories: existingStories.map(s => s.story_key)
          });
        }

        return {
          skipped: true,
          reason: 'USER_STORIES_EXIST',
          existing_stories: existingStories.length,
          message
        };
      } else {
        console.log(`   ⚠️  ${message}`);
        console.log(`   ⚙️  Proceeding anyway (skipIfExists=false)\n`);
      }
    } else {
      console.log('   📋 No existing user stories found');
      console.log('   ✅ Product Requirements Expert execution REQUIRED\n');
    }

    // Step 2: Retrieve PRD for context
    console.log('📄 Step 2: Retrieving PRD...');
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (prdError || !prd) {
      throw new Error(`Failed to retrieve PRD: ${prdError?.message || 'PRD not found'}`);
    }

    console.log(`   ✅ PRD retrieved: ${prd.title}`);
    console.log(`   📊 Status: ${prd.status}, Priority: ${prd.priority}\n`);

    // Step 3: Log execution attempt
    if (logExecution) {
      await logSubAgentAttempt(supabase, sdId, prdId, executionId, {
        trigger_reason: 'PRD_CREATED',
        trigger_type: 'AUTOMATIC',
        prd_title: prd.title,
        prd_status: prd.status
      });
    }

    // Step 4: Execute Product Requirements Expert logic
    console.log('🤖 Step 3: Generating user stories from PRD...\n');

    // Generate user stories from PRD functional requirements
    const userStories = await generateUserStoriesFromPRD(prd, sdId, prdId);

    if (userStories.length === 0) {
      console.log('   ⚠️  No functional requirements found in PRD');
      console.log('   💡 Add functional_requirements array to PRD for auto-generation\n');
    } else {
      console.log(`   ✅ Generated ${userStories.length} user stories from PRD\n`);

      // Step 5: Insert user stories into database
      console.log('💾 Step 4: Storing user stories in database...');
      let created = 0;
      let failed = 0;

      for (const story of userStories) {
        try {
          const { error: insertError } = await supabase
            .from('user_stories')
            .insert(story);

          if (insertError) {
            if (insertError.code === '23505') {
              console.log(`   ⏭️  ${story.story_key} - Already exists`);
            } else {
              console.log(`   ❌ ${story.story_key} - Error: ${insertError.message}`);
              failed++;
            }
          } else {
            console.log(`   ✅ ${story.story_key} - ${story.title}`);
            created++;
          }
        } catch (err) {
          console.log(`   ❌ ${story.story_key} - Exception: ${err.message}`);
          failed++;
        }
      }

      console.log('');
      console.log(`   Created: ${created}/${userStories.length} user stories`);
      if (failed > 0) {
        console.log(`   Failed: ${failed}`);
      }
    }

    // Step 6: Store execution result
    const duration = Math.round((Date.now() - startTime) / 1000);

    const result = {
      executed: true,
      generated_count: userStories.length,
      sd_id: sdId,
      prd_id: prdId,
      execution_id: executionId,
      duration_seconds: duration
    };

    if (logExecution) {
      await logSubAgentResult(supabase, sdId, prdId, executionId, result);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ User story generation complete\n');

    return result;

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.error('❌ Error in auto-trigger:', error.message);

    if (logExecution) {
      await logSubAgentError(supabase, sdId, prdId, executionId, error, duration);
    }

    return {
      executed: false,
      error: error.message,
      execution_id: executionId
    };
  }
}

/**
 * Generate user stories from PRD functional requirements
 */
async function generateUserStoriesFromPRD(prd, sdId, prdId) {
  const userStories = [];

  // Extract functional requirements if available
  const functionalRequirements = prd.functional_requirements || [];

  if (functionalRequirements.length === 0) {
    return userStories;
  }

  for (let i = 0; i < functionalRequirements.length; i++) {
    const fr = functionalRequirements[i];
    const storyNumber = String(i + 1).padStart(3, '0');
    const storyKey = `${sdId}:US-${storyNumber}`;

    // Determine story points based on priority
    const storyPoints = fr.priority === 'CRITICAL' ? 5 :
                        fr.priority === 'HIGH' ? 3 :
                        fr.priority === 'MEDIUM' ? 2 : 1;

    // Determine user role from requirement or default to stakeholder
    const userRole = extractUserRole(fr.requirement, prd.category);

    // Convert priority to lowercase for user story status
    const priority = (fr.priority || 'medium').toLowerCase();

    const userStory = {
      id: randomUUID(),
      story_key: storyKey,
      sd_id: sdId,
      prd_id: prdId,
      title: fr.requirement || `Implement ${fr.id}`,
      user_role: userRole,
      user_want: fr.description || `to implement ${fr.requirement}`,
      user_benefit: extractUserBenefit(fr.description, fr.rationale),
      story_points: storyPoints,
      priority: priority,
      status: 'ready',
      acceptance_criteria: fr.acceptance_criteria || [],
      implementation_context: fr.description || '',
      technical_notes: fr.rationale || '',
      created_by: 'PRODUCT_REQUIREMENTS_EXPERT'
    };

    userStories.push(userStory);
  }

  return userStories;
}

/**
 * Extract user role from requirement text or category
 */
function extractUserRole(requirement, category) {
  const requirementLower = (requirement || '').toLowerCase();

  // Role keywords mapping
  if (requirementLower.includes('user') || requirementLower.includes('customer')) {
    return 'User';
  }
  if (requirementLower.includes('admin') || requirementLower.includes('administrator')) {
    return 'Administrator';
  }
  if (requirementLower.includes('developer') || requirementLower.includes('engineer')) {
    return 'Developer';
  }
  if (requirementLower.includes('qa') || requirementLower.includes('tester')) {
    return 'QA Engineer';
  }
  if (requirementLower.includes('devops')) {
    return 'DevOps Engineer';
  }

  // Category-based defaults
  if (category === 'infrastructure') return 'DevOps Engineer';
  if (category === 'accessibility') return 'User';
  if (category === 'product_feature') return 'User';
  if (category === 'technical') return 'Developer';

  return 'Stakeholder';
}

/**
 * Extract user benefit from description
 */
function extractUserBenefit(description, rationale) {
  // If rationale explains "why", use it as benefit
  if (rationale && rationale.length > 0) {
    return rationale;
  }

  // Otherwise extract benefit from description
  if (description && description.length > 0) {
    // If description is long, extract a concise benefit
    if (description.length > 100) {
      return 'this functionality meets the system requirements';
    }
    return description;
  }

  return 'the system meets its requirements';
}

/**
 * Log sub-agent skip event
 */
async function logSubAgentSkip(supabase, sdId, prdId, executionId, metadata) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .insert({
        id: executionId,
        sub_agent_id: 'product-requirements-expert',
        sub_agent_code: 'STORIES',
        version: '1.0.0',
        sd_id: sdId,
        verdict: 'SKIPPED',
        confidence: 100,
        summary: {
          action: 'SKIPPED',
          reason: metadata.reason,
          existing_stories: metadata.existing_count,
          message: 'User stories already exist, skipping generation'
        },
        metadata: {
          prd_id: prdId,
          ...metadata
        }
      });
  } catch (error) {
    console.warn('⚠️  Failed to log skip event:', error.message);
  }
}

/**
 * Log sub-agent execution attempt
 */
async function logSubAgentAttempt(supabase, sdId, prdId, executionId, metadata) {
  console.log(`📝 Logging execution attempt (ID: ${executionId.substring(0, 8)}...)`);

  try {
    await supabase
      .from('sub_agent_execution_results')
      .insert({
        id: executionId,
        sub_agent_id: 'product-requirements-expert',
        sub_agent_code: 'STORIES',
        version: '1.0.0',
        sd_id: sdId,
        verdict: 'IN_PROGRESS',
        confidence: 0,
        summary: {
          status: 'STARTING',
          trigger: metadata.trigger_type,
          reason: metadata.trigger_reason
        },
        metadata: {
          prd_id: prdId,
          ...metadata,
          started_at: new Date().toISOString()
        }
      });
  } catch (error) {
    console.warn('⚠️  Failed to log attempt:', error.message);
  }
}

/**
 * Log sub-agent execution result
 */
async function logSubAgentResult(supabase, sdId, prdId, executionId, result) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .update({
        verdict: result.executed ? 'PASS' : 'WARNING',
        confidence: result.executed ? 95 : 50,
        summary: {
          executed: result.executed,
          recommendation: result.recommendation,
          duration_seconds: result.duration_seconds
        },
        execution_duration_seconds: result.duration_seconds,
        updated_at: new Date().toISOString()
      })
      .eq('id', executionId);
  } catch (error) {
    console.warn('⚠️  Failed to log result:', error.message);
  }
}

/**
 * Log sub-agent execution error
 */
async function logSubAgentError(supabase, sdId, prdId, executionId, error, duration) {
  try {
    await supabase
      .from('sub_agent_execution_results')
      .update({
        verdict: 'ERROR',
        confidence: 0,
        summary: {
          error: error.message,
          duration_seconds: duration
        },
        execution_duration_seconds: duration,
        updated_at: new Date().toISOString()
      })
      .eq('id', executionId);
  } catch (logError) {
    console.warn('⚠️  Failed to log error:', logError.message);
  }
}

export default autoTriggerStories;
