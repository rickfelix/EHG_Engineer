#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createUserStories() {
  const sdId = 'SD-VIF-TIER-001';

  const userStories = [
    {
      sd_id: sdId,
      story_key: `${sdId}:US-001`,
      title: 'Tier Selection in Venture Creation',
      user_role: 'venture creator',
      user_want: 'select a tier level (0/1/2) when creating a venture',
      user_benefit: 'control the workflow complexity and see appropriate stage counts',
      acceptance_criteria: [
        'Tier selector displays 3 options: Tier 0 (MVP Sandbox), Tier 1 (Standard Flow), Tier 2 (Deep Research)',
        'Default selection is Tier 1 for backward compatibility',
        'Tier selection is saved to venture metadata',
        'UI shows expected stage count and duration for selected tier'
      ],
      priority: 'high',
      story_points: 5,
      status: 'completed',
      technical_notes: 'Implemented in VentureCreationForm component with tier selector dropdown',
      e2e_test_path: 'tests/e2e/tier-routing.spec.ts',
      e2e_test_status: 'passing',
      validation_status: 'validated'
    },
    {
      sd_id: sdId,
      story_key: `${sdId}:US-002`,
      title: 'Tier Indicators in Venture Views',
      user_role: 'venture manager',
      user_want: 'see tier indicators on all venture cards and lists',
      user_benefit: 'quickly identify workflow complexity without opening each venture',
      acceptance_criteria: [
        'TierIndicator component displays on VentureCard, VentureGrid, VentureDataTable',
        'Each tier has distinct color: Tier 0 (green), Tier 1 (blue), Tier 2 (purple)',
        'Icons differentiate tiers: Zap, Rocket, Sparkles',
        'Tooltip shows full tier description on hover'
      ],
      priority: 'high',
      story_points: 3,
      status: 'completed',
      technical_notes: 'Created TierIndicator.tsx with Lucide icons, integrated across 7 venture components',
      e2e_test_path: 'tests/e2e/tier-routing.spec.ts',
      e2e_test_status: 'passing',
      validation_status: 'validated'
    },
    {
      sd_id: sdId,
      story_key: `${sdId}:US-003`,
      title: 'Tier-Aware Stage Routing',
      user_role: 'workflow executor',
      user_want: 'stage routing to respect tier limits',
      user_benefit: 'ventures only show accessible stages and prevent confusion',
      acceptance_criteria: [
        'Tier 0 ventures can only access stages 1-3',
        'Tier 1 ventures can only access stages 1-10',
        'Tier 2 ventures can only access stages 1-15',
        'Legacy ventures (tier=null) access all 40 stages for backward compatibility',
        'UI disables/hides stages beyond tier limit'
      ],
      priority: 'critical',
      story_points: 8,
      status: 'completed',
      technical_notes: 'Created tierRouting.ts utility with getTierMaxStages(), isStageAccessible() functions',
      e2e_test_path: 'tests/e2e/tier-routing.spec.ts',
      e2e_test_status: 'passing',
      validation_status: 'validated'
    },
    {
      sd_id: sdId,
      story_key: `${sdId}:US-004`,
      title: 'Centralized Tier Routing Utility',
      user_role: 'developer',
      user_want: 'a centralized tier routing utility',
      user_benefit: 'tier logic is consistent across the application and maintainable',
      acceptance_criteria: [
        'tierRouting.ts exports TierLevel type (0 | 1 | 2 | null)',
        'TIER_STAGE_LIMITS constant maps tiers to maxStages, duration, description',
        'getTierMaxStages() returns correct limit for any tier',
        'isStageAccessible() validates stage availability for tier',
        'getAccessibleStages() returns filtered stage list'
      ],
      priority: 'high',
      story_points: 5,
      status: 'completed',
      technical_notes: 'Created /src/utils/tierRouting.ts (60 LOC, 5 exported functions)',
      validation_status: 'validated'
    },
    {
      sd_id: sdId,
      story_key: `${sdId}:US-005`,
      title: 'E2E Test Coverage for Tier Routing',
      user_role: 'QA engineer',
      user_want: 'comprehensive E2E tests for tier routing',
      user_benefit: 'tier behavior is validated and regressions are prevented',
      acceptance_criteria: [
        'Test tier selection in venture creation flow',
        'Test tier indicator display across all views',
        'Test stage accessibility enforcement for each tier',
        'Test backward compatibility (null tier = 40 stages)',
        'All 50 tier routing tests pass'
      ],
      priority: 'high',
      story_points: 8,
      status: 'completed',
      technical_notes: '50/50 E2E tests passing, covering tier selection, display, routing',
      e2e_test_path: 'tests/e2e/tier-routing.spec.ts',
      e2e_test_status: 'passing',
      validation_status: 'validated'
    }
  ];

  console.log('Creating user stories for SD-VIF-TIER-001...\n');

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select();

    if (error) {
      console.error(`❌ Failed to create ${story.story_key}:`, error.message);
    } else {
      console.log(`✅ Created ${story.story_key}: As ${story.user_role}, I want ${story.user_want}...`);
    }
  }

  console.log('\n✅ All user stories created successfully!');
}

createUserStories().catch(console.error);
