#!/usr/bin/env node

/**
 * STORY Agent Bootstrap
 * Auto-starts the STORY sub-agent when FEATURE_STORY_AGENT is enabled
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
import StoryAgent from '../../agents/story/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

class StoryAgentBootstrap {
  constructor() {
    this.enabled = process.env.FEATURE_STORY_AGENT === 'true';
    this.agent = null;
    this.supabase = null;
  }

  async initialize() {
    if (!this.enabled) {
      console.log('⚠️ STORY Agent is disabled (FEATURE_STORY_AGENT !== true)');
      return false;
    }

    console.log('🚀 Bootstrapping STORY Agent...');

    // Initialize Supabase client
    this.supabase = createSupabaseServiceClient();

    // Check feature flags
    console.log('📋 Feature Flags:');
    console.log('  FEATURE_STORY_AGENT:', process.env.FEATURE_STORY_AGENT);
    console.log('  FEATURE_AUTO_STORIES:', process.env.FEATURE_AUTO_STORIES);
    console.log('  FEATURE_STORY_UI:', process.env.FEATURE_STORY_UI);
    console.log('  FEATURE_STORY_GATES:', process.env.FEATURE_STORY_GATES);

    // Initialize the agent
    this.agent = new StoryAgent();
    await this.agent.initialize();

    // Subscribe to relevant database events
    this.setupEventListeners();

    console.log('✅ STORY Agent bootstrap complete');
    return true;
  }

  setupEventListeners() {
    // Listen for new PRDs
    this.supabase
      .channel('prd-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'product_requirements_v3'
      }, async (payload) => {
        console.log('📦 New PRD detected:', payload.new.prd_id);

        if (process.env.FEATURE_AUTO_STORIES === 'true') {
          // Trigger story generation
          await this.agent.handleStoryCreate({
            sd_key: payload.new.sd_id,
            prd_id: payload.new.prd_id,
            timestamp: new Date().toISOString()
          });
        }
      })
      .subscribe();

    // Listen for test run completions (simulated)
    console.log('👂 Listening for story verification events...');
  }

  async checkPendingWork() {
    // Check for any PRDs without stories
    console.log('🔍 Checking for PRDs without stories...');

    const { data: prds } = await this.supabase
      .from('product_requirements_v3')
      .select('prd_id, sd_id')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!prds || prds.length === 0) {
      console.log('  No approved PRDs found');
      return;
    }

    // Check each PRD for stories
    for (const prd of prds) {
      const { data: stories } = await this.supabase
        .from('sd_backlog_map')
        .select('story_key')
        .eq('sd_id', prd.sd_id)
        .not('story_key', 'is', null)
        .limit(1);

      if (!stories || stories.length === 0) {
        console.log(`  ⚠️ PRD ${prd.prd_id} has no stories`);

        if (process.env.FEATURE_AUTO_STORIES === 'true') {
          console.log(`  🔄 Triggering story generation for ${prd.prd_id}...`);
          await this.agent.handleStoryCreate({
            sd_key: prd.sd_id,
            prd_id: prd.prd_id,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        console.log(`  ✅ PRD ${prd.prd_id} has ${stories.length} stories`);
      }
    }
  }

  async shutdown() {
    if (this.agent) {
      console.log('👋 Shutting down STORY Agent...');
      // Clean up any resources
      this.supabase.removeAllChannels();
    }
  }
}

// Export for use in server.js
export default StoryAgentBootstrap;

// Allow standalone execution
if (isMainModule(import.meta.url)) {
  const bootstrap = new StoryAgentBootstrap();

  bootstrap.initialize()
    .then(async (success) => {
      if (success) {
        await bootstrap.checkPendingWork();
        console.log('🎯 STORY Agent is running in standalone mode');
        console.log('Press Ctrl+C to exit');
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('❌ Bootstrap error:', error);
      process.exit(1);
    });

  // Handle shutdown
  process.on('SIGINT', async () => {
    await bootstrap.shutdown();
    process.exit(0);
  });
}