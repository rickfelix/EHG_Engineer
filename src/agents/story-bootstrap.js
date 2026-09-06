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
    // product_requirements_v3 realtime subscription retired (SD-LEO-ORCH-CAPA-
    // SCHEMA-TRUTH-001-E-A): that relation never existed live -- its CREATE TABLE
    // (database/schema/010_ehg_backlog_schema.sql) was authored but never applied,
    // and this was already flagged unresolved in the 2026-06-10 committed-unapplied
    // sweep. Retired rather than resurrected; PRD change events are not observed.
    console.log('👂 Listening for story verification events...');
  }

  async checkPendingWork() {
    // product_requirements_v3 query retired (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-A):
    // that relation never existed live. Flipping FEATURE_STORY_AGENT=true previously
    // crashed here with Postgres 42P01; this now no-ops with a clear log instead.
    console.log('🔍 Checking for PRDs without stories...');
    console.log('  ⚠️ product_requirements_v3 was retired (never existed live) -- skipping');
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