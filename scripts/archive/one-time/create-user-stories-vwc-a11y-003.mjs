#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-A11Y-003
 *
 * Generates user stories for WCAG 2.1 AA color contrast fixes
 * Part of LEO Protocol PLAN phase requirement
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-A11Y-003';
const PRD_ID = `PRD-VWC-A11Y-003`;

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix ProgressStepper Current Step Title Contrast',
    user_role: 'Vision-impaired User',
    user_want: 'to read the current step title in ProgressStepper with adequate contrast',
    user_benefit: 'I can clearly see which step I am currently on without straining my vision',
    story_points: 1,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'ProgressStepper.tsx line 150 color classes updated to achieve 4.5:1 minimum contrast ratio',
      'Current step title text is clearly visible against background',
      'axe-core reports zero color-contrast violations for current step title',
      'E2E test venture-creation-a11y.spec.ts passes for ProgressStepper title',
      'Visual appearance maintains design intent'
    ],
    implementation_context: 'Update ProgressStepper.tsx line 150 from text-blue-600 to text-blue-900 or text-white (depending on background). Current ratio is 1.01:1, target is 4.5:1. Test with WCAG contrast checker.',
    technical_notes: 'File: src/components/ventures/ProgressStepper.tsx:150. Replace className text-blue-600 with darker color. Consider text-blue-900 for light backgrounds or text-white for dark backgrounds. Verify with axe DevTools.',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix ProgressStepper Current Step Description Contrast',
    user_role: 'Vision-impaired User',
    user_want: 'to read the current step description in ProgressStepper with adequate contrast',
    user_benefit: 'I can understand the instructions for the current step without difficulty',
    story_points: 1,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'ProgressStepper.tsx line 157 color classes updated to achieve 4.5:1 minimum contrast ratio',
      'Current step description text is clearly visible against background',
      'axe-core reports zero color-contrast violations for current step description',
      'E2E test venture-creation-a11y.spec.ts passes for ProgressStepper description',
      'Text remains readable at 12px font size'
    ],
    implementation_context: 'Update ProgressStepper.tsx line 157 from text-gray-500 to text-gray-700 or darker. Current ratio is 1.47:1, target is 4.5:1. Description text is smaller (text-xs), so contrast is especially important.',
    technical_notes: 'File: src/components/ventures/ProgressStepper.tsx:157. Replace className text-gray-500 with text-gray-700 or text-gray-900. Small text (text-xs) requires good contrast. Verify with axe DevTools.',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix PersonaToggle Active Button Contrast',
    user_role: 'Vision-impaired User',
    user_want: 'to clearly distinguish the active persona toggle button from inactive buttons',
    user_benefit: 'I can confidently identify which persona mode is currently selected',
    story_points: 1,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'PersonaToggle.tsx line 66 color classes updated to achieve 4.5:1 minimum contrast ratio',
      'Active button text is clearly visible against button background',
      'axe-core reports zero color-contrast violations for active button',
      'E2E test venture-creation-a11y.spec.ts passes for PersonaToggle',
      'Active state remains visually distinct from inactive buttons'
    ],
    implementation_context: 'Update PersonaToggle.tsx line 66 bg-primary/text-primary-foreground combination. Current ratio is 3.76:1, target is 4.5:1. May need to darken bg-primary or use conditional accessible color token.',
    technical_notes: 'File: src/components/navigation/PersonaToggle.tsx:66. Current uses bg-primary with text-primary-foreground. Consider darker primary shade or white text. Verify design system color tokens support accessible contrast ratios.',
    created_by: 'PLAN'
  }
];

async function createUserStories() {
  console.log(`\n📚 Creating User Stories for ${SD_ID}...`);
  console.log('═'.repeat(70));
  console.log(`Total Stories: ${userStories.length}\n`);

  let created = 0;
  let skipped = 0;

  for (const story of userStories) {
    try {
      const { data, error } = await supabase
        .from('user_stories')
        .insert(story)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          console.log(`⏭️  ${story.story_key} - Already exists`);
          skipped++;
        } else {
          console.error(`❌ ${story.story_key} - Error:`, error.message);
        }
      } else {
        console.log(`✅ ${story.story_key} - ${story.title}`);
        created++;
      }
    } catch (err) {
      console.error(`❌ ${story.story_key} - Exception:`, err.message);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📊 Summary:');
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${userStories.length}`);

  // Calculate implementation context coverage
  const withContext = userStories.filter(s => s.implementation_context).length;
  const contextCoverage = Math.round((withContext / userStories.length) * 100);

  // Calculate acceptance criteria coverage
  const withCriteria = userStories.filter(s => s.acceptance_criteria && s.acceptance_criteria.length > 0).length;
  const criteriaCoverage = Math.round((withCriteria / userStories.length) * 100);

  console.log('\n📈 Quality Metrics:');
  console.log(`   Implementation Context Coverage: ${contextCoverage}% (${withContext}/${userStories.length})`);
  console.log(`   Acceptance Criteria Coverage: ${criteriaCoverage}% (${withCriteria}/${userStories.length})`);
  console.log(`   Average Story Points: ${Math.round(userStories.reduce((sum, s) => sum + s.story_points, 0) / userStories.length)}`);

  if (contextCoverage >= 80 && criteriaCoverage >= 80) {
    console.log('\n✅ BMAD Validation: PASS (≥80% coverage)');
  } else {
    console.log('\n⚠️  BMAD Validation: May not meet ≥80% threshold');
  }

  console.log('═'.repeat(70));
  console.log('\n✅ User story creation complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review user stories in database');
  console.log('2. Create PLAN→EXEC handoff');
  console.log('3. Begin EXEC phase implementation');
}

createUserStories().catch(console.error);
