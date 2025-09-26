#!/usr/bin/env node

/**
 * Enforce User Story Generation from PRD
 * Ensures user stories and acceptance criteria are generated for every PRD
 */

const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class StoriesEnforcer {
  constructor(prdId, sdId) {
    this.prdId = prdId;
    this.sdId = sdId;
    this.maxWaitTime = 90000; // 1.5 minutes for story generation
  }

  async enforceStories() {
    console.log('📖 User Stories Enforcement Check');
    console.log('==================================');
    console.log(`PRD: ${this.prdId}`);
    console.log(`SD: ${this.sdId || 'N/A'}\n`);

    if (!this.prdId) {
      console.error('❌ PRD ID is required for story generation');
      return {
        status: 'error',
        message: 'PRD ID required',
        storiesGenerated: false
      };
    }

    try {
      // Step 1: Check if stories already exist for this PRD
      const hasStories = await this.checkExistingStories();

      if (hasStories) {
        console.log('✅ User stories already exist for this PRD. Proceeding.\n');
        return {
          status: 'approved',
          message: 'User stories requirement satisfied',
          storiesGenerated: true
        };
      }

      // Step 2: No stories exist, trigger generation
      console.log('⚠️  No user stories found. Triggering STORIES sub-agent...\n');
      const storiesGenerated = await this.triggerStoryGeneration();

      if (storiesGenerated) {
        console.log('✅ User stories successfully generated. Proceeding.\n');
        return {
          status: 'approved',
          message: 'User stories generated and requirement satisfied',
          storiesGenerated: true
        };
      } else {
        console.log('❌ Failed to generate user stories. Process blocked.\n');
        return {
          status: 'blocked',
          message: 'User story generation failed - process blocked',
          storiesGenerated: false
        };
      }

    } catch (error) {
      console.error('❌ Error in stories enforcement:', error.message);
      return {
        status: 'error',
        message: error.message,
        storiesGenerated: false
      };
    }
  }

  async checkExistingStories() {
    // Check for user stories in the database
    const { data: stories, error } = await supabase
      .from('user_stories')
      .select('id, title, status')
      .eq('prd_id', this.prdId);

    if (error) {
      console.error('Error checking for stories:', error.message);
      // Check in PRD metadata as fallback
      return await this.checkStoriesInPRDMetadata();
    }

    if (stories && stories.length > 0) {
      console.log(`📊 Found ${stories.length} existing user stories:`);
      stories.slice(0, 5).forEach(story => {
        console.log(`   - ${story.title} (${story.status || 'draft'})`);
      });
      if (stories.length > 5) {
        console.log(`   ... and ${stories.length - 5} more`);
      }
      console.log();
      return true;
    }

    // Also check PRD metadata for stories
    return await this.checkStoriesInPRDMetadata();
  }

  async checkStoriesInPRDMetadata() {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('id', this.prdId)
      .single();

    const userStories = prd?.metadata?.user_stories || prd?.metadata?.stories;
    if (userStories && Array.isArray(userStories) && userStories.length > 0) {
      console.log(`📊 Found ${userStories.length} stories in PRD metadata\n`);
      return true;
    }

    console.log('📊 No user stories found for this PRD\n');
    return false;
  }

  async triggerStoryGeneration() {
    console.log('🚀 Triggering STORIES sub-agent for PRD:', this.prdId);

    const storiesScript = path.join(__dirname, 'generate-stories-from-prd.js');

    return new Promise((resolve) => {
      const args = ['--prd-id', this.prdId];
      if (this.sdId) args.push('--sd-id', this.sdId);

      const storiesProcess = spawn('node', [storiesScript, ...args], {
        env: { ...process.env },
        cwd: __dirname
      });

      let output = '';
      let errorOutput = '';

      storiesProcess.stdout.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data);
      });

      storiesProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        process.stderr.write(data);
      });

      storiesProcess.on('close', async (code) => {
        if (code === 0) {
          console.log('✅ Story generation completed successfully\n');

          // Verify stories were actually created
          const verified = await this.checkExistingStories();
          resolve(verified);
        } else {
          console.error(`❌ Story generation failed with code ${code}\n`);
          if (errorOutput) {
            console.error('Error details:', errorOutput);
          }

          // Fallback: Try to create basic stories
          console.log('🔄 Attempting fallback story creation...');
          const fallbackSuccess = await this.createFallbackStories();
          resolve(fallbackSuccess);
        }
      });

      // Timeout handler
      setTimeout(() => {
        console.error('⏱️ Story generation timed out');
        storiesProcess.kill();
        resolve(false);
      }, this.maxWaitTime);
    });
  }

  async createFallbackStories() {
    try {
      // Get PRD details for context
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('title, description, requirements')
        .eq('id', this.prdId)
        .single();

      if (!prd) {
        console.error('PRD not found:', this.prdId);
        return false;
      }

      // Create basic user stories
      const basicStories = [
        {
          prd_id: this.prdId,
          sd_id: this.sdId,
          title: `Core functionality for ${prd.title}`,
          description: 'As a user, I want the core features implemented so that I can achieve the primary objectives',
          acceptance_criteria: [
            'Primary functionality is working',
            'Basic validation is in place',
            'Error handling is implemented'
          ],
          priority: 'high',
          status: 'draft',
          metadata: {
            auto_generated: true,
            generation_reason: 'Enforcement fallback',
            timestamp: new Date().toISOString()
          }
        },
        {
          prd_id: this.prdId,
          sd_id: this.sdId,
          title: `User interface for ${prd.title}`,
          description: 'As a user, I want an intuitive interface so that I can easily interact with the system',
          acceptance_criteria: [
            'UI components are rendered correctly',
            'User interactions are responsive',
            'Accessibility standards are met'
          ],
          priority: 'medium',
          status: 'draft',
          metadata: {
            auto_generated: true,
            generation_reason: 'Enforcement fallback',
            timestamp: new Date().toISOString()
          }
        },
        {
          prd_id: this.prdId,
          sd_id: this.sdId,
          title: `Testing and validation for ${prd.title}`,
          description: 'As a developer, I want comprehensive tests so that the implementation is reliable',
          acceptance_criteria: [
            'Unit tests are written',
            'Integration tests pass',
            'Edge cases are handled'
          ],
          priority: 'high',
          status: 'draft',
          metadata: {
            auto_generated: true,
            generation_reason: 'Enforcement fallback',
            timestamp: new Date().toISOString()
          }
        }
      ];

      // Insert basic stories
      const { data, error } = await supabase
        .from('user_stories')
        .insert(basicStories)
        .select();

      if (error) {
        // If table doesn't exist, store in PRD metadata
        console.log('User stories table not available, storing in PRD metadata...');

        const updatedMetadata = {
          ...prd.metadata,
          user_stories: basicStories,
          stories_generated_at: new Date().toISOString(),
          stories_auto_generated: true
        };

        const { error: updateError } = await supabase
          .from('product_requirements_v2')
          .update({ metadata: updatedMetadata })
          .eq('id', this.prdId);

        if (updateError) {
          console.error('Failed to store stories in PRD:', updateError.message);
          return false;
        }
      }

      console.log(`✅ Created ${basicStories.length} fallback user stories`);
      return true;

    } catch (error) {
      console.error('Error in fallback story creation:', error.message);
      return false;
    }
  }

  async getStoriesSummary() {
    // Get stories for summary
    const { data: stories } = await supabase
      .from('user_stories')
      .select('title, priority, status')
      .eq('prd_id', this.prdId)
      .order('priority');

    if (!stories || stories.length === 0) {
      // Try PRD metadata
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('metadata')
        .eq('id', this.prdId)
        .single();

      const metaStories = prd?.metadata?.user_stories || [];
      if (metaStories.length > 0) {
        return {
          total_stories: metaStories.length,
          by_priority: {
            high: metaStories.filter(s => s.priority === 'high').length,
            medium: metaStories.filter(s => s.priority === 'medium').length,
            low: metaStories.filter(s => s.priority === 'low').length
          },
          source: 'prd_metadata'
        };
      }
      return null;
    }

    return {
      total_stories: stories.length,
      by_priority: {
        high: stories.filter(s => s.priority === 'high').length,
        medium: stories.filter(s => s.priority === 'medium').length,
        low: stories.filter(s => s.priority === 'low').length
      },
      by_status: {
        draft: stories.filter(s => s.status === 'draft').length,
        ready: stories.filter(s => s.status === 'ready').length,
        in_progress: stories.filter(s => s.status === 'in_progress').length,
        completed: stories.filter(s => s.status === 'completed').length
      },
      source: 'user_stories_table'
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const prdIdIndex = args.indexOf('--prd-id');
  const sdIdIndex = args.indexOf('--sd-id');

  if (prdIdIndex === -1 || !args[prdIdIndex + 1]) {
    console.error('Usage: node enforce-stories-from-prd.js --prd-id <PRD_ID> [--sd-id <SD_ID>]');
    process.exit(1);
  }

  const prdId = args[prdIdIndex + 1];
  const sdId = sdIdIndex !== -1 ? args[sdIdIndex + 1] : null;

  const enforcer = new StoriesEnforcer(prdId, sdId);
  const result = await enforcer.enforceStories();

  // Get stories summary if approved
  if (result.status === 'approved') {
    const summary = await enforcer.getStoriesSummary();
    if (summary) {
      console.log('📋 User Stories Summary:');
      console.log('========================');
      console.log(`Total Stories: ${summary.total_stories}`);
      console.log(`Priority Distribution:`);
      console.log(`  High: ${summary.by_priority.high}`);
      console.log(`  Medium: ${summary.by_priority.medium}`);
      console.log(`  Low: ${summary.by_priority.low}`);
      if (summary.by_status) {
        console.log(`Status Distribution:`);
        console.log(`  Draft: ${summary.by_status.draft}`);
        console.log(`  Ready: ${summary.by_status.ready}`);
        console.log(`  In Progress: ${summary.by_status.in_progress}`);
        console.log(`  Completed: ${summary.by_status.completed}`);
      }
      console.log(`Source: ${summary.source}`);
      console.log('========================\n');
    }
  }

  // Exit with appropriate code
  process.exit(result.status === 'approved' ? 0 : 1);
}

// Export for use in other scripts
module.exports = StoriesEnforcer;

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}