#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating PRD for SD-VWC-A11Y-003...\n');

// Get SD uuid_id
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', 'SD-VWC-A11Y-003')
  .single();

if (!sd) {
  console.error('❌ SD not found');
  process.exit(1);
}

const { data: prd, error} = await supabase
  .from('product_requirements_v2')
  .insert({
    id: 'PRD-VWC-A11Y-003',
    directive_id: 'SD-VWC-A11Y-003',
    sd_id: 'SD-VWC-A11Y-003',
    sd_uuid: sd.uuid_id,
    title: 'Shared Components WCAG 2.1 AA Color Contrast Fixes',
    version: '1.0',
    status: 'approved',
    category: 'accessibility',
    priority: 'high',
    executive_summary: 'Fix 3 color contrast violations in ProgressStepper and PersonaToggle components discovered during E2E testing. Achieve WCAG 2.1 AA compliance (4.5:1 minimum contrast ratio).',
    business_context: 'Automated E2E accessibility tests (venture-creation-a11y.spec.ts) detected color contrast violations in shared components after fixing E2E authentication infrastructure. These shared components are used across multiple features, making their accessibility critical for platform-wide WCAG compliance.',
    technical_context: 'Color contrast violations found: ProgressStepper current step text (1.01:1 and 1.47:1 ratios) and PersonaToggle active button (3.76:1 ratio). WCAG 2.1 AA requires minimum 4.5:1 contrast for normal text.',
    functional_requirements: [
      'ProgressStepper current step title must achieve 4.5:1 minimum contrast',
      'ProgressStepper current step description must achieve 4.5:1 minimum contrast',
      'PersonaToggle active button must achieve 4.5:1 minimum contrast'
    ],
    technical_requirements: [
      'Update Tailwind CSS classes in ProgressStepper.tsx lines 148-159',
      'Update Tailwind CSS classes in PersonaToggle.tsx line 66',
      'Maintain existing component functionality and design intent',
      'Ensure changes work in both light mode contexts'
    ],
    acceptance_criteria: [
      'All 36 venture-creation-a11y.spec.ts E2E tests pass',
      'Zero axe-core accessibility violations reported',
      'Visual regression acceptable to design team',
      'No breaking changes to component APIs'
    ],
    test_scenarios: [
      {
        id: 1,
        title: 'E2E Accessibility Test - ProgressStepper',
        description: 'Run axe-core audit on VentureCreationPage with ProgressStepper visible',
        expected: 'Zero color-contrast violations for current step text',
        test_file: 'tests/e2e/venture-creation-a11y.spec.ts'
      },
      {
        id: 2,
        title: 'E2E Accessibility Test - PersonaToggle',
        description: 'Run axe-core audit on page with PersonaToggle in active state',
        expected: 'Zero color-contrast violations for active button',
        test_file: 'tests/e2e/venture-creation-a11y.spec.ts'
      }
    ],
    implementation_approach: 'Replace text-blue-600 with text-blue-900 or white text for ProgressStepper title, use darker gray for description. For PersonaToggle, darken bg-primary or use conditional accessible color token.'
  })
  .select()
  .single();

if (error) {
  console.error('❌ Failed:', error.message);
  console.error('Error:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('✅ PRD created successfully!');
console.log('   ID:', prd.id);
console.log('   SD:', prd.sd_id);
console.log('   Title:', prd.title);
console.log('   Status:', prd.status);
console.log('\n🎯 Phase 2 (PLAN) PRD complete');
console.log('📋 Next: Create deliverables and user stories');
