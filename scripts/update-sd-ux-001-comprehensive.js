#!/usr/bin/env node

/**
 * Update SD-UX-001 with comprehensive first-run experience strategy
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDUX001() {
  console.log('📋 Updating SD-UX-001 with comprehensive first-run experience strategy...\n');

  const updatedSD = {
    description: `Connect fully-built FirstRunWizard (542 LOC, 20KB) to application entry point, creating guided onboarding for new users with demo/clean mode options, preventing empty-state confusion. Currently, new users land in empty application with no guidance, causing high bounce rate and poor first impressions. FirstRunWizard complete with 5-step flow (welcome → choice → config → confirm), demo data seeding (20 ventures via generateMockVentures()), clean slate handling, localStorage persistence, BUT 0 imports - wizard never renders.

**CURRENT STATE - COMPLETE ONBOARDING SITTING DARK**:
- ✅ FirstRunWizard: 542 LOC, 20KB complete React component with Dialog UI
- ✅ 5-step wizard flow: welcome (intro) → choice (demo/clean) → demo-config/clean-config (options) → confirm (review) → complete
- ✅ Demo mode: Inserts 20 mock ventures via generateMockVentures(), 2 demo companies, marks is_demo=true for cleanup
- ✅ Clean mode: Empty state with guidance, localStorage flag set, ready for real ventures
- ✅ Empty state detection: checkFirstRun() queries ventures table, shows wizard if 0 ventures + no completion flag
- ✅ localStorage persistence: ehg_wizard_completed (demo/clean/skip), ehg_demo_mode (true/false)
- ✅ Configurable demo options: includeVentures, includeCompanies, includeMetrics, autoProgress checkboxes
- ❌ ZERO integration: 0 imports means wizard never shown, users land in empty app with no help
- ❌ No App.tsx integration: FirstRunWizard not imported or rendered in application entry point
- ❌ No product tour: After wizard, no guided tour of key features (Dashboard, Ventures, Analytics)
- ❌ No onboarding progress: Cannot track user activation funnel (wizard seen → completed → first venture created)
- ❌ No cleanup UI: Demo data marked is_demo=true, but no settings UI to remove it
- ❌ No re-trigger mechanism: Once wizard_completed flag set, cannot show wizard again (e.g., for reset)

**FIRSTRUNWIZARD ANALYSIS (542 LOC, 20KB)**:

**5-Step Wizard Flow**:
1. **welcome** (Lines 193-231): Intro screen with Rocket icon, "Skip for now" or "Get Started" buttons
2. **choice** (Lines 233-315): Radio cards for Demo Mode (GraduationCap icon, recommended for new users, 20 sample ventures) vs Clean Slate (Sparkles icon, for production)
3. **demo-config** (Lines 317-420): Checkboxes for includeVentures, includeCompanies, includeMetrics, autoProgress, Alert shows is_demo flag
4. **clean-config** (Lines 422-463): Confirmation screen showing clean slate benefits (no data, clean metrics, production-ready)
5. **confirm** (Lines 465-530): Review selection, Back button, "Confirm & Start" with loading state

**Demo Data Seeding (Lines 79-157)**:
- insertDemoData(): Calls generateMockVentures() from @/data/mockVentures (20 ventures)
- Companies: Inserts 2 demo companies ('Demo Ventures Inc', 'Innovation Labs') with is_demo=true
- Ventures: Maps mockVentures to venture table schema (id, name, description, status, current_workflow_stage, industry, ai_score, risk_score, metadata, is_demo=true)
- Toast: "Successfully loaded 20 demo ventures"
- localStorage: Sets ehg_demo_mode='true'

**Empty State Detection (Lines 55-68)**:
- checkFirstRun(): Queries SELECT id FROM ventures LIMIT 1
- If no ventures AND no localStorage.getItem('ehg_wizard_completed'), shows wizard
- Runs in useEffect on component mount

**GAPS IDENTIFIED**:
1. **No App.tsx Integration**: FirstRunWizard not imported in App.tsx, never rendered
2. **No Product Tour**: After wizard completes, no guided tour of Dashboard, Ventures, Workflow, Analytics
3. **No Progress Tracking**: Cannot measure activation funnel (wizard completion rate, demo vs clean choice, first venture creation rate)
4. **No Demo Cleanup UI**: is_demo=true flag exists, but no settings page to bulk delete demo data
5. **No Wizard Reset**: localStorage flag permanent, cannot re-trigger wizard (useful for testing or user reset)
6. **No Feature Highlights**: Wizard mentions features ("Pre-populated ventures", "Sample metrics") but doesn't explain what they do
7. **No Skip Consequences**: "Skip for now" button exists, but user lands in empty app with no next steps`,

    scope: `**4-Week First-Run Experience Implementation**:

**PHASE 1: App.tsx Integration (Week 1)**
- Import FirstRunWizard in App.tsx
- Render wizard conditionally on app load
- Handle onComplete callback (demo/clean/skip)
- Add wizard completion tracking to database

**PHASE 2: Product Tour (Week 2)**
- Create ProductTour component with react-joyride or intro.js
- Define 7-step tour: Dashboard → Ventures → Create Venture → Workflow → Analytics → Settings → Complete
- Trigger tour after wizard completion (demo mode)
- Add skip tour option

**PHASE 3: Demo Cleanup & Management (Week 3)**
- Add Demo Data Manager to Settings
- Display demo venture count, cleanup button
- Bulk delete WHERE is_demo=true
- Reset wizard option

**PHASE 4: Progress Tracking & Analytics (Week 4)**
- Create user_onboarding_progress table
- Track wizard steps, completion, mode choice
- Track first venture creation timestamp
- Build onboarding analytics dashboard

**OUT OF SCOPE**:
- ❌ Advanced tour customization (tooltips, arrows sufficient)
- ❌ Video tutorials (written guides sufficient)
- ❌ Multi-step product tours (single tour sufficient)`,

    strategic_objectives: [
      'Integrate FirstRunWizard into App.tsx entry point, rendering wizard on first load for users with 0 ventures and no completion flag, preventing empty-state confusion',
      'Build ProductTour component with 7-step guided tour (Dashboard, Ventures, Create, Workflow, Analytics, Settings, Complete) using react-joyride, triggering after wizard completion',
      'Create Demo Data Manager in Settings: Display demo venture count, bulk cleanup button (DELETE WHERE is_demo=true), wizard reset option to re-trigger FirstRunWizard',
      'Implement onboarding progress tracking: Create user_onboarding_progress table (wizard_seen, wizard_completed, mode_choice, first_venture_created_at), measure activation funnel',
      "Enhance wizard UX: Add feature highlights (explain what Dashboard/Analytics do), improve skip consequences (show next steps), add 'Learn More' tooltips",
      'Achieve 80%+ wizard completion: Target 80% of new users complete wizard (not skip), ≥60% choose demo mode, ≥50% create first venture within 7 days',
      "Reduce time-to-first-value: From current 'never' (empty app) to <5 minutes (wizard + tour + first venture created), demonstrating product value immediately"
    ],

    success_criteria: [
      '✅ FirstRunWizard integrated: Imported in App.tsx, renders on first load, onComplete handler functional, wizard completion persists',
      '✅ Empty state prevention: New users see wizard, not empty app, ≥95% of first-time users see wizard (track with analytics)',
      '✅ Demo data functional: Demo mode creates 20 ventures successfully, ventures marked is_demo=true, data visible in Dashboard/Ventures',
      "✅ Clean mode functional: Clean mode shows empty state guidance, provides 'Create First Venture' CTA, no demo data inserted",
      '✅ ProductTour operational: 7-step tour triggers after wizard, highlights Dashboard/Ventures/Analytics, skip option works, completion tracked',
      "✅ Demo cleanup available: Settings has Demo Data Manager, shows count (e.g., '20 demo ventures'), cleanup button deletes WHERE is_demo=true, confirmation dialog",
      '✅ Progress tracked: user_onboarding_progress table populated, wizard completion rate ≥80%, demo mode choice ≥60%, first venture creation ≥50% within 7 days',
      '✅ Wizard completion rate: ≥80% of new users complete wizard (not skip), measured via user_onboarding_progress.wizard_completed',
      '✅ Time-to-first-value: ≥50% of users create first venture within 5 minutes of completing wizard (demo or real venture)',
      '✅ User activation: ≥70% of wizard completers become activated users (≥3 ventures created, ≥5 dashboard views within 30 days)'
    ],

    key_principles: [
      '**First Impression Critical**: Users decide product value in first 60 seconds - wizard must show value immediately via demo data or clear next steps',
      "**Choice Empowers**: Offer demo (learn) vs clean (do) modes - users control experience, not forced into demo they don't want",
      "**Demo Data Discoverable**: All demo data marked is_demo=true, cleanup easy, transparency builds trust ('You can remove this anytime')",
      "**Progressive Disclosure**: Wizard → Tour → First Venture - layer guidance, don't overwhelm, user learns incrementally",
      "**Skip Respects Time**: 'Skip for now' is valid choice for experienced users, but must provide next steps (not empty void)",
      "**Wizard Skippable But Recommended**: Don't force wizard, but strongly recommend ('Recommended for new users' badge), track skip rate to optimize",
      '**Track Everything**: Measure wizard completion, mode choice, tour completion, first venture creation - data drives optimization',
      '**Performance Budget**: Wizard load <500ms, demo data insert <3s, tour navigation <100ms - onboarding must feel instant'
    ],

    implementation_guidelines: [
      '**PHASE 1: App.tsx Integration (Week 1)**',
      '',
      '1. Import FirstRunWizard in App.tsx:',
      "   - Add: import { FirstRunWizard } from '@/components/onboarding/FirstRunWizard';",
      '   - State: const [wizardCompleted, setWizardCompleted] = useState(false);',
      '   - Render: {!wizardCompleted && <FirstRunWizard onComplete={handleWizardComplete} />}',
      '',
      '2. Handle onComplete callback:',
      "   - const handleWizardComplete = async (choice: 'demo' | 'clean' | 'skip') => {",
      "   -   await supabase.from('user_onboarding_progress').upsert({ user_id, wizard_completed: true, mode_choice: choice, completed_at: new Date() });",
      '   -   setWizardCompleted(true);',
      "   -   if (choice === 'demo') startProductTour();",
      '   - }',
      '',
      '3. Create user_onboarding_progress table:',
      '   - CREATE TABLE user_onboarding_progress (user_id UUID PRIMARY KEY, wizard_seen BOOLEAN, wizard_completed BOOLEAN, mode_choice TEXT, tour_completed BOOLEAN, first_venture_created_at TIMESTAMP, completed_at TIMESTAMP)',
      '',
      '**PHASE 2: Product Tour (Week 2)**',
      '',
      '4. Install react-joyride:',
      '   - npm install react-joyride',
      '',
      '5. Create ProductTour.tsx component:',
      "   - Import: import Joyride, { Step } from 'react-joyride';",
      '   - Steps: const steps: Step[] = [',
      "   -   { target: '.dashboard-section', content: 'This is your Executive Dashboard showing key metrics' },",
      "   -   { target: '.ventures-nav', content: 'View all your ventures here' },",
      "   -   { target: '.create-venture-btn', content: 'Click here to create your first venture' },",
      "   -   { target: '.workflow-section', content: 'Track venture progress through 40-stage workflow' },",
      "   -   { target: '.analytics-nav', content: 'Analyze performance with advanced analytics' },",
      "   -   { target: '.settings-nav', content: 'Configure your account and preferences' },",
      "   -   { target: 'body', content: 'You're all set! Explore the platform and create your first venture.' }",
      '   - ];',
      '',
      '6. Trigger tour after wizard:',
      "   - if (choice === 'demo') { setRunTour(true); }",
      '   - <Joyride steps={steps} run={runTour} continuous showSkipButton onFinish={handleTourComplete} />',
      '',
      '**PHASE 3: Demo Cleanup (Week 3)**',
      '',
      '7. Create DemoDataManager.tsx in settings:',
      "   - Query: const { data: demoVentures } = await supabase.from('ventures').select('id').eq('is_demo', true);",
      "   - Display: 'You have {demoVentures.length} demo ventures'",
      "   - Button: 'Clean Up Demo Data' → confirmation dialog → DELETE FROM ventures WHERE is_demo=true",
      '',
      '8. Add wizard reset option:',
      "   - Button: 'Reset Onboarding' → localStorage.removeItem('ehg_wizard_completed') → toast 'Wizard will show on next reload'",
      '',
      '**PHASE 4: Progress Tracking (Week 4)**',
      '',
      '9. Track wizard steps:',
      '   - On wizard open: INSERT INTO user_onboarding_progress (user_id, wizard_seen) VALUES (auth.uid(), true)',
      "   - On step change: UPDATE user_onboarding_progress SET current_step='{step}' WHERE user_id=auth.uid()",
      "   - On complete: UPDATE user_onboarding_progress SET wizard_completed=true, mode_choice='{choice}', completed_at=NOW()",
      '',
      '10. Track first venture creation:',
      '    - Venture creation handler: if (isFirstVenture) { UPDATE user_onboarding_progress SET first_venture_created_at=NOW() WHERE user_id=auth.uid(); }',
      '',
      '11. Build onboarding analytics:',
      '    - Dashboard: SELECT wizard_completed, mode_choice, COUNT(*) FROM user_onboarding_progress GROUP BY wizard_completed, mode_choice',
      '    - Funnel: wizard_seen → wizard_completed → first_venture_created (show conversion rates)',
      '    - Time-to-value: AVG(first_venture_created_at - completed_at) WHERE first_venture_created_at IS NOT NULL'
    ],

    risks: [
      {
        risk: 'Demo data insert fails: Network error, database permissions, generateMockVentures() error, users stuck in loading state',
        probability: 'Medium (40%)',
        impact: 'High - Poor first impression, wizard unusable, users abandon',
        mitigation: 'Add error handling, retry logic (max 3 attempts), fallback to clean mode on failure, clear error messages, log errors to integration_events'
      },
      {
        risk: 'Wizard appears for existing users: checkFirstRun() bug, localStorage cleared, users see wizard again, confused/annoyed',
        probability: 'Low (20%)',
        impact: 'Medium - User annoyance, support tickets',
        mitigation: "Also check user_onboarding_progress table (not just localStorage), require both conditions (0 ventures AND no database record), add 'Don't show again' option"
      },
      {
        risk: 'Product tour interferes with UI: Joyride tooltips overlap critical elements, tour steps target wrong elements, users cannot skip',
        probability: 'Medium (40%)',
        impact: 'Medium - Frustrating tour, users disable immediately',
        mitigation: 'Test tour on multiple screen sizes, add z-index management, ensure skip button always visible, allow ESC key to exit, test with keyboard navigation'
      }
    ],

    success_metrics: [
      {
        metric: 'Wizard completion rate',
        target: '≥80% of new users complete wizard (not skip)',
        measurement: 'SELECT COUNT(*) FILTER (WHERE wizard_completed) / COUNT(*) FROM user_onboarding_progress WHERE wizard_seen'
      },
      {
        metric: 'Demo mode adoption',
        target: '≥60% of wizard completers choose demo mode',
        measurement: "SELECT COUNT(*) FILTER (WHERE mode_choice='demo') / COUNT(*) FROM user_onboarding_progress WHERE wizard_completed"
      },
      {
        metric: 'First venture creation',
        target: '≥50% of users create first venture within 7 days',
        measurement: "SELECT COUNT(*) FILTER (WHERE first_venture_created_at < completed_at + INTERVAL '7 days') / COUNT(*) FROM user_onboarding_progress WHERE wizard_completed"
      },
      {
        metric: 'Time-to-first-value',
        target: '≥50% of users create first venture within 5 minutes',
        measurement: 'SELECT AVG(EXTRACT(EPOCH FROM (first_venture_created_at - completed_at))/60) FROM user_onboarding_progress WHERE first_venture_created_at IS NOT NULL'
      },
      {
        metric: 'Tour completion',
        target: '≥70% of demo mode users complete product tour',
        measurement: "SELECT COUNT(*) FILTER (WHERE tour_completed) / COUNT(*) FROM user_onboarding_progress WHERE mode_choice='demo'"
      }
    ],

    metadata: {
      'first_run_wizard': {
        'file': 'src/components/onboarding/FirstRunWizard.tsx',
        'loc': 542,
        'size': '20KB',
        'steps': 5,
        'current_imports': 0
      },
      'wizard_steps': ['welcome', 'choice', 'demo-config/clean-config', 'confirm', 'complete'],
      'demo_data': {
        'ventures': 20,
        'companies': 2,
        'source': 'generateMockVentures() from @/data/mockVentures.ts'
      },
      'implementation_plan': {
        'phase_1': 'App.tsx integration (Week 1)',
        'phase_2': 'Product tour (Week 2)',
        'phase_3': 'Demo cleanup (Week 3)',
        'phase_4': 'Progress tracking (Week 4)'
      },
      'business_value': 'HIGH - Prevents empty-state confusion, improves first impression, increases user activation and retention',
      'prd_readiness': {
        'scope_clarity': '95%',
        'execution_readiness': '95%',
        'risk_coverage': '90%',
        'business_impact': '95%'
      }
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('id', 'SD-UX-001');

  if (error) {
    console.error('❌ Error updating SD-UX-001:', error);
    process.exit(1);
  }

  console.log('✅ SD-UX-001 updated successfully!\n');
  console.log('📊 Summary: 4-week first-run experience implementation');
  console.log('  ✓ Integrate FirstRunWizard into App.tsx (currently 0 imports)');
  console.log('  ✓ Build 7-step ProductTour with react-joyride');
  console.log('  ✓ Create Demo Data Manager in Settings (cleanup, reset)');
  console.log('  ✓ Track onboarding progress (wizard, tour, first venture)\n');
  console.log('✨ SD-UX-001 enhancement complete!');
}

updateSDUX001();
