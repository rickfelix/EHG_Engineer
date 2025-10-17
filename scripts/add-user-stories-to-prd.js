#!/usr/bin/env node
/**
 * Add User Stories to PRD-SUBAGENT-001 Metadata
 *
 * Stores 15 user stories in PRD metadata field
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const userStories = [
  { id: 'US-001', title: 'Infrastructure Discovery - Enhance VALIDATION Sub-Agent', priority: 'CRITICAL', points: 5 },
  { id: 'US-002', title: 'Testing Enforcement - Make QA Director Verdicts Blocking', priority: 'CRITICAL', points: 5 },
  { id: 'US-003', title: 'CI/CD Verification - Add PLAN_VERIFICATION Trigger', priority: 'CRITICAL', points: 3 },
  { id: 'US-004', title: 'Trigger Accuracy - Add 20-30 New Trigger Keywords', priority: 'HIGH', points: 5 },
  { id: 'US-005', title: 'Result Quality - Enhance Sub-Agent Personas', priority: 'HIGH', points: 8 },
  { id: 'US-006', title: 'Context Efficiency - Implement TIER_1/2/3 Compression', priority: 'HIGH', points: 5 },
  { id: 'US-007', title: 'Retrospective Analysis Script - Extract Patterns', priority: 'HIGH', points: 3 },
  { id: 'US-008', title: 'Database UPDATE Scripts - Enhance 13 Sub-Agents', priority: 'HIGH', points: 8 },
  { id: 'US-009', title: 'Enhanced Trigger Detection - Update unified-handoff-system.js', priority: 'MEDIUM', points: 5 },
  { id: 'US-010', title: 'Unit Tests - Validate Trigger Detection and Compression', priority: 'MEDIUM', points: 3 },
  { id: 'US-011', title: 'Integration Tests - Validate Handoff Workflows', priority: 'MEDIUM', points: 5 },
  { id: 'US-012', title: 'E2E Tests - Full Protocol Execution with Enhanced Sub-Agents', priority: 'MEDIUM', points: 5 },
  { id: 'US-013', title: 'Performance Measurement - Baseline vs Enhanced Comparison', priority: 'MEDIUM', points: 3 },
  { id: 'US-014', title: 'Rollback Script - Revert Enhancements if Needed', priority: 'LOW', points: 2 },
  { id: 'US-015', title: 'Documentation - Update CLAUDE.md with Enhanced Sub-Agents', priority: 'LOW', points: 1 }
];

async function addUserStories() {
  console.log('📋 Adding 15 User Stories to PRD-SUBAGENT-001 metadata...\n');

  const { data: updated, error } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: {
        user_stories: userStories,
        user_story_count: 15,
        total_story_points: 65,
        story_breakdown: {
          critical: 3,
          high: 5,
          medium: 5,
          low: 2
        }
      }
    })
    .eq('id', 'PRD-SUBAGENT-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ User stories added to PRD metadata!\n');
  console.log('   PRD ID:', updated.id);
  console.log('   User Stories:', userStories.length);
  console.log('   Total Story Points:', 65);
  console.log('');
  console.log('📊 Story Breakdown:');
  console.log('   Critical: 3 stories (US-001, US-002, US-003) = 13 points');
  console.log('   High: 5 stories (US-004 to US-008) = 34 points');
  console.log('   Medium: 5 stories (US-009 to US-013) = 21 points');
  console.log('   Low: 2 stories (US-014, US-015) = 3 points');
  console.log('');
  console.log('🚀 Ready for testing strategy definition!');
}

addUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
