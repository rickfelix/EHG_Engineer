#!/usr/bin/env node

/**
 * Add LEO Protocol v4.2.0 - Story Gates & Automated Release Control
 * This script adds the new protocol version to the database
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const protocolContent = `# LEO Protocol v4.2.0 - Story Gates & Automated Release Control

## Overview
LEO Protocol v4.2.0 introduces automated release gates that enforce quality standards through user story verification.

## Key Features
1. **User Story Generation**: Automatic generation from PRD acceptance criteria
2. **CI/CD Integration**: Real-time verification status updates via webhooks
3. **Release Gates**: 80% threshold for merge approval
4. **Branch Protection**: Automated blocking of PRs below threshold
5. **Full Automation**: No manual intervention required

## Story Verification System

### Architecture
PRD Acceptance Criteria → Story Generation → CI/CD Testing → Status Updates → Gate Calculation → Merge Decision

### Database Schema
- Story tracking via sd_backlog_map extensions
- Views: v_story_verification_status, v_sd_release_gate
- Real-time gate calculations

## Agent Responsibilities

### PLAN Agent
- Create comprehensive acceptance criteria
- Generate stories: SELECT * FROM fn_generate_stories_from_prd('SD-KEY', 'PRD-ID', 'upsert')
- Verify story creation and coverage

### EXEC Agent
- Name tests with story keys: 'SD-XXX:US-abc123'
- Configure CI webhooks for status updates
- Monitor story verification during implementation

### LEAD Agent
- Review story coverage before approval
- Monitor gate status across active SDs
- Ensure 80% threshold met before completion

## CI/CD Integration

### Webhook Configuration
- Endpoint: /api/stories/verify
- Authentication: SERVICE_TOKEN_PROD (must be service-role)
- Payload: { build_id, stories: [{ story_key, status, coverage }] }

### Branch Protection
- Required checks: e2e-stories, Story Verification
- Strict mode enabled
- Admin enforcement active
- Automatic PR blocking when <80%

## Environment Configuration

### Production (Gates ON)
FEATURE_STORY_GATES=true
VITE_FEATURE_STORY_GATES=true
SERVICE_TOKEN_PROD=[service-role-token]

### Development (Tracking only)
FEATURE_STORY_GATES=false

## Emergency Rollback
# Disable gates
export FEATURE_STORY_GATES=false
export VITE_FEATURE_STORY_GATES=false
# Redeploy application

## Success Metrics
- Story generation: <1s per PRD
- Webhook processing: <500ms
- Gate calculation: <100ms
- Query P95: ≤200ms
- Quality bar: 80% minimum
- Manual overhead: 0%`;

async function addProtocolToDatabase() {
  console.log('🚀 Adding LEO Protocol v4.2.0 to database...\n');

  try {
    // Check if v4.2.0 already exists
    const { data: existing } = await supabase
      .from('leo_protocols')
      .select('id, version')
      .eq('version', 'v4.2.0_story_gates')
      .single();

    if (existing) {
      console.log('⚠️  Protocol v4.2.0_story_gates already exists in database');
      console.log('   ID:', existing.id);

      const confirm = process.argv[2] === '--force';
      if (!confirm) {
        console.log('\n   Use --force to update existing protocol');
        process.exit(0);
      }
      console.log('   Updating existing protocol...');
    }

    // Prepare protocol data
    const protocolData = {
      id: 'leo-v4-2-0-story-gates',
      version: 'v4.2.0_story_gates',
      title: 'LEO Protocol v4.2.0 - Story Gates & Automated Release Control',
      description: 'Automated release gates with user story verification, CI/CD integration, and branch protection enforcement. Enforces 80% quality threshold for all merges.',
      content: protocolContent,
      status: 'draft', // Start as draft, activate separately
      metadata: {
        created_at: new Date().toISOString(),
        created_by: 'add-leo-protocol-v4.2.0-story-gates.js',
        key_features: [
          'User Story Generation',
          'Release Gates (80% threshold)',
          'Branch Protection',
          'CI/CD Webhooks',
          'Automated Merge Blocking'
        ],
        backward_compatible: true,
        requires_migration: true,
        migration_scripts: [
          'database/migrations/2025-01-17-user-stories-compat.sql',
          'database/migrations/verify-2025-01-17-user-stories.sql',
          'database/migrations/2025-01-17-prod-hardening.sql'
        ]
      }
    };

    // Insert or update protocol
    const { data, error } = existing
      ? await supabase
          .from('leo_protocols')
          .update(protocolData)
          .eq('id', existing.id)
          .select()
          .single()
      : await supabase
          .from('leo_protocols')
          .insert([protocolData])
          .select()
          .single();

    if (error) {
      throw error;
    }

    console.log('✅ Protocol added successfully!');
    console.log('   Version:', data.version);
    console.log('   Status:', data.status);
    console.log('   ID:', data.id);

    console.log('\n📋 Next Steps:');
    console.log('1. Review protocol content');
    console.log('2. Activate protocol:');
    console.log("   UPDATE leo_protocols SET status = 'active' WHERE version = 'v4.2.0_story_gates';");
    console.log("   UPDATE leo_protocols SET status = 'superseded' WHERE version != 'v4.2.0_story_gates';");
    console.log('3. Regenerate CLAUDE.md:');
    console.log('   node scripts/generate-claude-md-from-db.js');

  } catch (error) {
    console.error('❌ Error adding protocol to database:', error);
    process.exit(1);
  }
}

// Run the script
addProtocolToDatabase();