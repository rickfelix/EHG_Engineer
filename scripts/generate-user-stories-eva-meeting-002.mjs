#!/usr/bin/env node

/**
 * GENERATE USER STORIES - SD-EVA-MEETING-002
 *
 * Product Requirements Expert Sub-Agent
 * Creates 6 user stories for EVA Meeting Interface visual polish
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-EVA-MEETING-002';
const PRD_ID = 'PRD-SD-EVA-MEETING-002';

console.log('\n📝 GENERATING USER STORIES - SD-EVA-MEETING-002');
console.log('═'.repeat(60));
console.log('Sub-Agent: Product Requirements Expert');
console.log('═'.repeat(60));

const userStories = [
  {
    story_key: 'SD-EVA-MEETING-002:US-001',
    title: 'Dark Navy Theme Implementation',
    user_role: 'EVA User',
    user_want: 'the EVA Meeting Interface to have a professional dark navy theme',
    user_benefit: 'it matches enterprise video conferencing standards and appears production-ready',
    acceptance_criteria: [
      'Background color is #1a2332 (dark navy)',
      'All card backgrounds use dark navy variants',
      'Text colors have ≥4.5:1 contrast ratio (WCAG AA)',
      'Border colors are #334155 (subtle dark)',
      'Theme is consistent across all panels (avatar, dashboard, controls)',
      'Dark mode utilities properly applied via Tailwind CSS',
      'E2E test validates background color match'
    ],
    story_points: 3,
    priority: 'high',
    depends_on: null,
    technical_notes: 'Update all className props in EVAAssistantPage.tsx, use Tailwind dark mode utilities (bg-[#1a2332], text-[#e2e8f0]). Dependencies: None',
    test_scenarios: ['Visual inspection confirms dark navy theme', 'Color picker verification matches #1a2332', 'WCAG AA contrast compliance']
  },
  {
    story_key: 'SD-EVA-MEETING-002:US-002',
    title: 'Professional Avatar Integration',
    user_role: 'EVA User',
    user_want: 'to see a professional female avatar in business attire',
    user_benefit: 'EVA appears credible and approachable',
    acceptance_criteria: [
      'Avatar image loads successfully (no placeholder)',
      'Avatar displays professional female in business attire',
      'Image is optimized (WebP format, appropriate size)',
      'Avatar has proper alt text for accessibility',
      'Avatar section styled with dark navy theme',
      'Image quality is high-resolution',
      'E2E test validates image src attribute present'
    ],
    story_points: 3,
    priority: 'high',
    depends_on: null,
    technical_notes: 'Use Shadcn Avatar component, optimize image with WebP format, proper sizing (w-48 h-48). Dependencies: Avatar asset acquisition (stock or AI-generated)',
    test_scenarios: ['Visual inspection confirms professional appearance', 'Image loads within 500ms', 'Screen reader reads alt text correctly']
  },
  {
    story_key: 'SD-EVA-MEETING-002:US-003',
    title: 'Custom Dashboard Metrics Layout',
    user_role: 'EVA User',
    user_want: 'to see specific venture metrics (Performance, Cost Savings, Revenue, Active Ventures, Investment Allocation, Quarterly, Growth)',
    user_benefit: 'I can quickly assess portfolio status at a glance',
    acceptance_criteria: [
      'Venture Performance line chart visible (Recharts LineChart)',
      'Cost Savings card shows $25,000',
      'Revenue bar chart visible (Recharts BarChart)',
      'Active Ventures count displays 5',
      'Investment Allocation pie chart shows 50%, 30% split',
      'Quarterly trend line visible',
      'Growth indicator visible',
      'All 7 metrics displayed in CSS Grid layout (2 rows)',
      'Dashboard styled with dark navy theme',
      'E2E test validates all metrics present'
    ],
    story_points: 5,
    priority: 'high',
    depends_on: null,
    technical_notes: 'New EVAMeetingDashboard.tsx component (~300 LOC), use Recharts (LineChart, BarChart, PieChart), CSS Grid layout. Dependencies: Recharts library (already installed)',
    test_scenarios: ['All 7 metrics render correctly', 'Dashboard layout matches mockup', 'Charts display mock data accurately']
  },
  {
    story_key: 'SD-EVA-MEETING-002:US-004',
    title: 'Top Navigation Bar with Meeting Controls',
    user_role: 'EVA User',
    user_want: 'a top navigation bar with meeting title, status, and controls (mic, camera, end session)',
    user_benefit: 'I can manage my meeting session effectively',
    acceptance_criteria: [
      '"EVA Assistant" title visible on left',
      '"Live Analysis Mode" subtitle/badge visible',
      'Mic button visible and clickable (Lucide icon)',
      'Camera button visible and clickable (Lucide icon)',
      '"End Session" button visible on right',
      'All buttons have hover states',
      'Buttons are keyboard accessible (tab navigation)',
      'Nav bar styled with dark navy theme',
      'E2E test validates all 5 elements present and functional'
    ],
    story_points: 3,
    priority: 'medium',
    depends_on: null,
    technical_notes: 'New EVAMeetingNavBar.tsx component (~150 LOC), use Shadcn Button and Badge, implement onClick props. Dependencies: Lucide icons (already installed)',
    test_scenarios: ['All 5 nav elements render correctly', 'Button clicks trigger appropriate handlers', 'Keyboard navigation works']
  },
  {
    story_key: 'SD-EVA-MEETING-002:US-005',
    title: 'Real-Time Waveform Visualization',
    user_role: 'EVA User',
    user_want: 'to see an animated waveform visualization during voice interaction',
    user_benefit: 'I can visually confirm EVA is listening and processing my input',
    acceptance_criteria: [
      'Waveform canvas element renders',
      'Vertical bars animate at 60fps (no dropped frames)',
      'Waveform syncs with EVARealtimeVoice audio levels',
      'Animation uses blue accent color (#3b82f6)',
      'Waveform positioned on left side of control bar',
      'Performance profiling confirms ≥58fps sustained',
      'Fallback displays if Canvas API unsupported',
      'E2E test validates canvas present and animating'
    ],
    story_points: 5,
    priority: 'high',
    depends_on: null,
    technical_notes: 'New AudioWaveform.tsx component (~200 LOC), use Canvas API with requestAnimationFrame, sync with audio level props. Dependencies: Canvas API (browser native), EVARealtimeVoice integration',
    test_scenarios: ['Waveform animates smoothly (60fps)', 'Visual feedback matches voice activity', 'Chrome DevTools FPS counter shows ≥58fps']
  },
  {
    story_key: 'SD-EVA-MEETING-002:US-006',
    title: 'Control Bar Refinement & Typography Polish',
    user_role: 'EVA User',
    user_want: 'a refined control bar layout and polished typography',
    user_benefit: 'the interface appears professional and production-ready',
    acceptance_criteria: [
      'Waveform positioned on left side of control bar',
      '"Show Transcript" toggle positioned in center',
      '"Transcript >" link positioned on right',
      'Font weights refined for hierarchy',
      'Font sizes appropriate for content type',
      'Spacing optimized (gaps, padding)',
      'Typography consistent across all components',
      'E2E test validates control bar layout structure'
    ],
    story_points: 3,
    priority: 'medium',
    depends_on: null,
    technical_notes: 'Update EVAAssistantPage.tsx control bar section, adjust Tailwind utility classes for typography and spacing. Dependencies: US-EVA-002-005 (waveform must exist first)',
    test_scenarios: ['Control bar layout matches mockup', 'Typography appears professional', 'Spacing is visually balanced']
  }
];

async function generateUserStories() {
  try {
    console.log(`\n📋 Creating ${userStories.length} user stories...`);

    let successCount = 0;
    let failureCount = 0;

    for (const story of userStories) {
      const userStory = {
        story_key: story.story_key,
        sd_id: SD_ID,
        prd_id: PRD_ID,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        acceptance_criteria: story.acceptance_criteria,
        story_points: story.story_points,
        priority: story.priority,
        status: 'ready',
        depends_on: story.depends_on,
        technical_notes: story.technical_notes,
        test_scenarios: story.test_scenarios,
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_stories')
        .insert(userStory);

      if (error) {
        console.error(`   ❌ Failed to create: ${story.title}`);
        console.error(`      Error: ${error.message}`);
        failureCount++;
      } else {
        console.log(`   ✅ Created: ${story.title} (${story.story_points} points)`);
        successCount++;
      }
    }

    console.log('\n═'.repeat(60));
    console.log('📊 USER STORIES GENERATION COMPLETE');
    console.log('═'.repeat(60));
    console.log(`   Total Stories: ${userStories.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failures: ${failureCount}`);
    console.log(`   Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
    console.log('');
    console.log('📋 Story Breakdown:');
    userStories.forEach(s => {
      console.log(`   • ${s.story_key}: ${s.title} (${s.story_points} points, ${s.priority})`);
    });
    console.log('═'.repeat(60));

    return {
      success: successCount === userStories.length,
      total: userStories.length,
      created: successCount,
      failed: failureCount,
      total_points: userStories.reduce((sum, s) => sum + s.story_points, 0)
    };

  } catch (error) {
    console.error('\n❌ Error generating user stories:', error.message);
    throw error;
  }
}

// Execute
generateUserStories()
  .then(result => {
    console.log('\n🎉 User stories generation complete!');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
