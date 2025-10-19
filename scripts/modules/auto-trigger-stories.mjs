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
    console.log('🤖 Step 3: Generating user stories from PRD...');
    console.log('   ⚠️  This is a placeholder - actual sub-agent execution not implemented yet\n');

    // TODO: Implement actual user story generation logic
    // For now, we just notify that the sub-agent SHOULD be executed
    console.log('💡 RECOMMENDATION:');
    console.log('   Run Product Requirements Expert sub-agent manually:');
    console.log(`   node scripts/create-user-stories-[sd-id].mjs\n`);

    // Step 5: Store execution result
    const duration = Math.round((Date.now() - startTime) / 1000);

    const result = {
      executed: false, // Set to true when actual implementation added
      recommendation: 'RUN_PRODUCT_REQUIREMENTS_EXPERT',
      sd_id: sdId,
      prd_id: prdId,
      execution_id: executionId,
      duration_seconds: duration
    };

    if (logExecution) {
      await logSubAgentResult(supabase, sdId, prdId, executionId, result);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Auto-trigger check complete\n');

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
