#!/usr/bin/env node

/**
 * Create PRD for SD-RECONNECT-006: Navigation & Discoverability Enhancement
 * LEO Protocol v4.2.0 - PLAN Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TAXONOMY_CATEGORIES = [
  { name: 'Core Platform', features: 4, icon: 'LayoutDashboard' },
  { name: 'AI & Automation', features: 8, icon: 'Brain' },
  { name: 'Analytics & Insights', features: 11, icon: 'TrendingUp' },
  { name: 'Strategy & Execution', features: 7, icon: 'Target' },
  { name: 'Quality & Testing', features: 8, icon: 'CheckCircle' },
  { name: 'Development & Operations', features: 7, icon: 'Code' },
  { name: 'Security & Governance', features: 9, icon: 'Shield' },
  { name: 'Knowledge & Data', features: 6, icon: 'Database' },
  { name: 'Collaboration & Feedback', features: 3, icon: 'MessageSquare' },
  { name: 'Portfolio Management', features: 4, icon: 'Briefcase' }
];

async function createPRD() {
  console.log('📋 CREATING PRD: SD-RECONNECT-006');
  console.log('='.repeat(70));

  const sdKey = 'SD-RECONNECT-006';

  // Get SD
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title')
    .eq('sd_key', sdKey)
    .single();

  if (!sd) {
    console.error('❌ SD not found');
    return;
  }

  const prdId = 'PRD-RECONNECT-006';
  const totalFeatures = TAXONOMY_CATEGORIES.reduce((sum, cat) => sum + cat.features, 0);

  const prd = {
    id: prdId,
    directive_id: sd.uuid_id,
    title: 'Navigation & Discoverability Enhancement - Technical Requirements',
    version: '1.0.0',
    status: 'approved',
    category: 'UX Enhancement',
    priority: 'critical',
    created_by: 'PLAN Agent',
    phase: 'planning',
    progress: 0,

    executive_summary: `Platform has 70+ features but only 23 visible in navigation. Users cannot discover AI CEO, Competitive Intelligence, EVA Suite, GTM tools, QA tools, and more. Solution: Expand navigation with 10-category taxonomy (${totalFeatures} features), implement Command+K search, create feature catalog, add onboarding flow. Mobile-first, WCAG 2.1 AA compliant.`,

    business_context: `Current navigation shows 23 items (8 main + 8 platform + 6 management + 1 settings), hiding 47+ features. Users unaware of capabilities, support burden increases, competitive disadvantage. Poor UX blocks feature adoption and platform ROI.`,

    technical_context: `Current: Navigation.tsx (302 lines), React Router, Shadcn UI, Tailwind. Enhancement: 10-category taxonomy, FeatureSearch.tsx (Fuse.js, Command+K), FeatureCatalog.tsx, OnboardingTour.tsx. New deps: fuse.js (^6.6.2), react-joyride (^2.5.0, optional).`,

    functional_requirements: [
      { id: 'FR-1', title: 'Navigation Taxonomy', description: 'Organize 70+ features into 10 collapsible categories', priority: 'CRITICAL' },
      { id: 'FR-2', title: 'Feature Search', description: 'Command+K search with <300ms performance', priority: 'CRITICAL' },
      { id: 'FR-3', title: 'Feature Catalog', description: 'Dedicated page with all features, filtering, search', priority: 'HIGH' },
      { id: 'FR-4', title: 'Onboarding Flow', description: 'First-time user tour of navigation features', priority: 'MEDIUM' },
      { id: 'FR-5', title: 'Mobile Responsive', description: 'Hamburger menu, touch-optimized controls', priority: 'CRITICAL' },
      { id: 'FR-6', title: 'Accessibility', description: 'WCAG 2.1 AA, keyboard nav, screen readers', priority: 'CRITICAL' }
    ],

    non_functional_requirements: [
      { category: 'Performance', requirement: 'Navigation render <100ms, search <300ms, catalog <500ms' },
      { category: 'Accessibility', requirement: 'WCAG 2.1 AA, NVDA/JAWS/VoiceOver tested' },
      { category: 'Responsive', requirement: 'Mobile-first, 320px-1440px breakpoints' },
      { category: 'Browser Support', requirement: 'Chrome/Firefox/Safari/Edge ≥90/88/14/90' }
    ],

    technical_requirements: [
      { component: 'Navigation.tsx', path: 'src/components/layout/', changes: 'Add taxonomy, collapsible groups', effort: '8h' },
      { component: 'NavigationCategory.tsx', path: 'src/components/layout/', changes: 'New collapsible category component', effort: '4h' },
      { component: 'FeatureSearch.tsx', path: 'src/components/search/', changes: 'New Command+K search modal', effort: '6h' },
      { component: 'FeatureCatalog.tsx', path: 'src/pages/', changes: 'New feature catalog page', effort: '5h' },
      { component: 'OnboardingTour.tsx', path: 'src/components/onboarding/', changes: 'New first-time user tour', effort: '4h' }
    ],

    system_architecture: `Navigation.tsx enhanced to ~450 lines with 10-category taxonomy. New components: NavigationCategory, FeatureSearch (Command+K), FeatureCatalog, OnboardingTour. State: localStorage (nav state, recent searches, onboarding). Dependencies: fuse.js (search), react-joyride (optional tour). Stack: React 18, React Router 6, Shadcn UI, Tailwind, Lucide icons.`,

    implementation_approach: `Phase 1: Navigation taxonomy (3 days). Phase 2: Feature search (2 days). Phase 3: Feature catalog (2 days). Phase 4: Onboarding flow (1.5 days). Phase 5: Accessibility & testing (1.5 days). Total: 10 days.`,

    technology_stack: [
      { name: 'React', version: '18.x' },
      { name: 'TypeScript', version: '5.x' },
      { name: 'Tailwind CSS', version: '3.x' },
      { name: 'Shadcn UI', version: 'latest' },
      { name: 'React Router', version: '6.x' },
      { name: 'Fuse.js', version: '^6.6.2', status: 'new' },
      { name: 'React Joyride', version: '^2.5.0', status: 'new', optional: true }
    ],

    dependencies: [
      { name: 'fuse.js', version: '^6.6.2', type: 'npm' },
      { name: 'react-joyride', version: '^2.5.0', type: 'npm', optional: true }
    ],

    test_scenarios: [
      { scenario: 'Navigation', tests: ['All 70+ features accessible', 'Categories collapse/expand', 'Mobile hamburger menu', 'Keyboard nav'] },
      { scenario: 'Search', tests: ['Command+K activates', 'Performance <300ms', 'Fuzzy matching', 'Keyboard nav'] },
      { scenario: 'Catalog', tests: ['All features displayed', 'Category filtering', 'Search <200ms', 'Mobile responsive'] },
      { scenario: 'Onboarding', tests: ['Triggers on first login', 'Skippable', 'Don\'t show again works', '5 steps complete'] },
      { scenario: 'Accessibility', tests: ['Keyboard accessible', 'ARIA labels', 'Screen readers', 'WCAG 2.1 AA'] }
    ],

    acceptance_criteria: [
      { id: 'AC-1', description: 'All 70+ features accessible via navigation', priority: 'CRITICAL' },
      { id: 'AC-2', description: 'Feature discovery <10 seconds', priority: 'CRITICAL' },
      { id: 'AC-3', description: 'Search performance <300ms', priority: 'CRITICAL' },
      { id: 'AC-4', description: 'Mobile navigation works on iOS/Android', priority: 'CRITICAL' },
      { id: 'AC-5', description: 'WCAG 2.1 AA compliance', priority: 'CRITICAL' },
      { id: 'AC-6', description: 'Command+K activates from any page', priority: 'HIGH' },
      { id: 'AC-7', description: 'Feature catalog loads <500ms', priority: 'HIGH' }
    ],

    risks: [
      { risk: 'Navigation overwhelming with 70+ items', likelihood: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Default collapsed, search primary' },
      { risk: 'Taxonomy confuses users', likelihood: 'LOW', impact: 'MEDIUM', mitigation: 'User testing, iterative refinement' },
      { risk: 'Mobile UX degradation', likelihood: 'LOW', impact: 'HIGH', mitigation: 'Mobile-first design, touch-optimized' }
    ],

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'Navigation taxonomy designed (10 categories)', checked: true },
      { text: 'Feature inventory completed (67 features)', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Component specifications documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Risk assessment completed', checked: true },
      { text: 'DESIGN sub-agent activated', checked: false },
      { text: 'STORIES sub-agent activated', checked: false }
    ],

    exec_checklist: [
      { text: 'Navigation.tsx taxonomy implemented', checked: false },
      { text: 'NavigationCategory.tsx created', checked: false },
      { text: 'FeatureSearch.tsx with Command+K created', checked: false },
      { text: 'FeatureCatalog.tsx page created', checked: false },
      { text: 'OnboardingTour.tsx created', checked: false },
      { text: 'fuse.js dependency installed', checked: false },
      { text: 'Mobile responsive styling complete', checked: false },
      { text: 'ARIA labels and accessibility complete', checked: false },
      { text: 'Unit tests written', checked: false },
      { text: 'Integration tests passed', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated (<100ms nav, <300ms search)', checked: false },
      { text: 'WCAG 2.1 AA compliance verified', checked: false },
      { text: 'Screen reader testing (NVDA, VoiceOver) passed', checked: false },
      { text: 'Mobile testing (iOS, Android) passed', checked: false },
      { text: 'Browser compatibility verified', checked: false },
      { text: 'User acceptance testing passed', checked: false }
    ],

    metadata: {
      taxonomy_version: '1.0.0',
      total_categories: TAXONOMY_CATEGORIES.length,
      total_features_cataloged: totalFeatures,
      categories: TAXONOMY_CATEGORIES,
      estimated_effort_days: 10,
      estimated_story_points: 21,
      complexity: 'MEDIUM',
      over_engineering_score: '12/30 (LOW RISK)',
      sub_agents_to_activate: ['DESIGN', 'STORIES'],
      created_with: 'PLAN Agent - Navigation Taxonomy Analysis'
    }
  };

  // Store PRD
  const { data: createdPRD, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (prdError) {
    console.error('❌ Error creating PRD:', prdError.message);
    return;
  }

  // Update SD
  const { error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'PLAN_COMPLETE',
      metadata: {
        prd_id: prdId,
        prd_created_at: new Date().toISOString()
      }
    })
    .eq('sd_key', sdKey);

  if (sdError) {
    console.error('❌ Error updating SD:', sdError.message);
  }

  console.log('✅ PRD Created Successfully!');
  console.log('='.repeat(70));
  console.log(`PRD ID: ${prdId}`);
  console.log(`Version: ${prd.version}`);
  console.log(`Status: ${prd.status}`);
  console.log('');
  console.log(`📊 Taxonomy: ${TAXONOMY_CATEGORIES.length} categories, ${totalFeatures} features`);
  console.log('');
  TAXONOMY_CATEGORIES.forEach(cat => {
    console.log(`  - ${cat.name}: ${cat.features} features`);
  });
  console.log('');
  console.log('⏱️  Estimated Effort: 10 days (EXEC)');
  console.log('📊 Complexity: MEDIUM');
  console.log('⚖️  Over-Engineering: 12/30 (LOW RISK)');
  console.log('');
  console.log('📋 Next Steps:');
  console.log('1. Activate DESIGN sub-agent for UX validation');
  console.log('2. Activate STORIES sub-agent for user story generation');
  console.log('3. Create PLAN→EXEC handoff');
  console.log('');
  console.log('='.repeat(70));
}

createPRD().catch(console.error);
