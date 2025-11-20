import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const userStories = [
  // Component Refactoring Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-001",
    title: "Split SystemConfiguration into smaller components",
    user_role: "developer",
    user_want: "SystemConfiguration.tsx split into 3-4 focused components",
    user_benefit: "each component is 300-600 LOC and easier to maintain",
    acceptance_criteria: ["GeneralSettings component created (300-400 LOC)", "DatabaseSettings component created (250-350 LOC)", "IntegrationSettings component created (300-400 LOC)", "All existing functionality preserved", "No regression bugs introduced"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 8,
    e2e_test_path: "tests/e2e/settings/US-001-system-configuration-refactor.spec.ts",
    e2e_test_status: "not_created"
  },
  {
    story_key: "SD-SETTINGS-2025-10-12:US-002",
    title: "Implement NotificationSettings component",
    user_role: "user",
    user_want: "to configure my notification preferences",
    user_benefit: "I receive alerts in my preferred channels and frequency",
    acceptance_criteria: ["Email notification toggle implemented", "In-app notification settings available", "Notification frequency controls working", "Settings persist across sessions", "Component is 400-500 LOC"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-002-notification-settings.spec.ts",
    e2e_test_status: "not_created"
  },
  // Accessibility Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-003",
    title: "Fix all accessibility violations",
    user_role: "user with disabilities",
    user_want: "settings to be fully accessible",
    user_benefit: "I can configure my account independently using assistive technology",
    acceptance_criteria: ["All 33 accessibility issues resolved", "WCAG 2.1 AA compliance achieved", "axe audit shows 0 critical violations", "ARIA labels added to all interactive elements", "Semantic HTML used throughout"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "critical",
    story_points: 13,
    e2e_test_path: "tests/e2e/settings/US-003-accessibility-compliance.spec.ts",
    e2e_test_status: "not_created"
  },
  {
    story_key: "SD-SETTINGS-2025-10-12:US-004",
    title: "Implement keyboard navigation",
    user_role: "keyboard user",
    user_want: "to navigate all settings using only keyboard",
    user_benefit: "I don't need a mouse",
    acceptance_criteria: ["Tab navigation works through all settings", "Focus indicators visible on all interactive elements", "Enter/Space trigger actions appropriately", "Escape closes modals/dialogs", "Focus trap implemented for modals"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-004-keyboard-navigation.spec.ts",
    e2e_test_status: "not_created"
  },
  // Design System Compliance Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-005",
    title: "Fix design system violations",
    user_role: "designer",
    user_want: "all settings components to follow Shadcn UI design system",
    user_benefit: "the UI is consistent across the application",
    acceptance_criteria: ["All 90 design system violations fixed", "Inline styles replaced with Tailwind classes", "Shadcn components used consistently", "Color palette matches design system", "Typography follows design system"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 8,
    e2e_test_path: "tests/e2e/settings/US-005-design-system-compliance.spec.ts",
    e2e_test_status: "not_created"
  },
  {
    story_key: "SD-SETTINGS-2025-10-12:US-006",
    title: "Fix design inconsistencies",
    user_role: "user",
    user_want: "a consistent visual experience across all settings tabs",
    user_benefit: "the interface feels polished and professional",
    acceptance_criteria: ["470 design inconsistencies resolved", "Consistent spacing across all tabs", "Uniform button styles", "Consistent form field styling", "Matching icon usage"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "medium",
    story_points: 8,
    e2e_test_path: "tests/e2e/settings/US-006-design-consistency.spec.ts",
    e2e_test_status: "not_created"
  },
  // UX Enhancement Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-007",
    title: "Implement auto-save functionality",
    user_role: "user",
    user_want: "my settings to auto-save",
    user_benefit: "I don't lose my changes if I navigate away",
    acceptance_criteria: ["Settings auto-save after 2 seconds of inactivity", "Visual indicator shows save status", "No data loss in 100% of test cases", "Works across all settings tabs", "Debouncing prevents excessive API calls"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-007-auto-save.spec.ts",
    e2e_test_status: "not_created"
  },
  {
    story_key: "SD-SETTINGS-2025-10-12:US-008",
    title: "Add loading states and visual feedback",
    user_role: "user",
    user_want: "clear feedback when settings are saving or loading",
    user_benefit: "I know the system is working",
    acceptance_criteria: ["Loading spinners on save operations", "Success messages on successful save", "Error messages with clear explanations", "Disabled state for saving buttons", "Toast notifications for important actions"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "medium",
    story_points: 3,
    e2e_test_path: "tests/e2e/settings/US-008-visual-feedback.spec.ts",
    e2e_test_status: "not_created"
  },
  {
    story_key: "SD-SETTINGS-2025-10-12:US-009",
    title: "Enhance form validation",
    user_role: "user",
    user_want: "clear, helpful error messages when I enter invalid data",
    user_benefit: "I can fix my mistakes easily",
    acceptance_criteria: ["Real-time validation on all form fields", "Clear, actionable error messages", "Field-level error indicators", "Form submission prevented with validation errors", "Zod schema validation implemented"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "medium",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-009-form-validation.spec.ts",
    e2e_test_status: "not_created"
  },
  // Mobile/Responsive Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-010",
    title: "Ensure mobile responsive design",
    user_role: "mobile user",
    user_want: "all settings to work perfectly on my phone",
    user_benefit: "I can manage my account on the go",
    acceptance_criteria: ["All settings tabs work on mobile viewports", "Touch targets meet minimum size (44x44px)", "No horizontal scrolling", "Mobile navigation is intuitive", "Tested on iOS and Android"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "high",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-010-mobile-responsive.spec.ts",
    e2e_test_status: "not_created"
  },
  // Performance Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-011",
    title: "Optimize settings page performance",
    user_role: "user",
    user_want: "settings to load quickly even on slow connections",
    user_benefit: "I can access my settings without waiting",
    acceptance_criteria: ["Page loads in <2 seconds on 3G", "Lighthouse performance score >90", "Lazy loading implemented for heavy components", "Code splitting reduces initial bundle", "Images optimized"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "medium",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-011-performance.spec.ts",
    e2e_test_status: "not_created"
  },
  // Cross-browser Stories
  {
    story_key: "SD-SETTINGS-2025-10-12:US-012",
    title: "Ensure cross-browser compatibility",
    user_role: "user",
    user_want: "settings to work consistently across all modern browsers",
    user_benefit: "my experience doesn't depend on my browser choice",
    acceptance_criteria: ["Works in Chrome, Firefox, Safari, Edge", "No browser-specific bugs", "Consistent rendering across browsers", "Feature parity across browsers", "Graceful degradation for older browsers"],
    implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),
    priority: "medium",
    story_points: 5,
    e2e_test_path: "tests/e2e/settings/US-012-cross-browser.spec.ts",
    e2e_test_status: "not_created"
  }
];

async function createUserStories() {
  console.log('📝 Creating user stories for SD-SETTINGS-2025-10-12...\n');

  let created = 0;
  let skipped = 0;

  for (const story of userStories) {
    const { error } = await supabase
      .from('user_stories')
      .insert({
        story_key: story.story_key,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        acceptance_criteria: story.acceptance_criteria,
        priority: story.priority,
        story_points: story.story_points,
        e2e_test_path: story.e2e_test_path,
        e2e_test_status: story.e2e_test_status,
        sd_id: 'SD-SETTINGS-2025-10-12',
        prd_id: 'PRD-SD-SETTINGS-2025-10-12',
        status: 'ready',
        created_at: new Date().toISOString()
      });

    if (error) {
      if (error.code === '23505') {
        console.log(`⏭️  ${story.story_key}: Already exists`);
        skipped++;
      } else {
        console.error(`❌ ${story.story_key}: Error -`, error.message);
      }
    } else {
      console.log(`✅ ${story.story_key}: ${story.title}`);
      created++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${userStories.length}`);
  console.log(`\n✅ User stories ready for E2E test generation`);
  console.log(`   Each story has e2e_test_path for 100% coverage mapping`);
}

createUserStories();
