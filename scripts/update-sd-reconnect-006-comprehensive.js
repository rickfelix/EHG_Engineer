#!/usr/bin/env node

/**
 * Update SD-RECONNECT-006 with comprehensive navigation & discoverability enhancement strategy
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDRECONNECT006() {
  console.log('📋 Updating SD-RECONNECT-006 with comprehensive navigation enhancement strategy...\n');

  const updatedSD = {
    description: `Enhance navigation discoverability by consolidating 2 navigation sidebars (807 LOC), implementing unified search, AI-powered navigation assistant, breadcrumbs, and contextual help to reduce user confusion and improve feature adoption. Current: Navigation.tsx (230 LOC) + ModernNavigationSidebar.tsx (577 LOC) + AINavigationAssistant (80KB navigation/ directory, 1948 LOC total), but inconsistent patterns, hidden features, no global search.

**CURRENT STATE - NAVIGATION FRAGMENTATION**:
- ⚠️ 2 navigation sidebars exist: Navigation.tsx + ModernNavigationSidebar.tsx (807 LOC combined)
- ✅ Navigation components directory: 80KB, 1948 LOC (AINavigationAssistant, BreadcrumbNavigation, MobileNavigationEnhancements)
- ✅ 8 primary nav items: Dashboard, Ventures, Workflow, Portfolio, Analytics, Agents, AI Agents, Integration Hub
- ✅ Dynamic badges: ventures count, active workflows, connected integrations
- ❌ No global search - users cannot find features quickly
- ❌ No command palette (Cmd+K) - modern apps have this
- ❌ Hidden features: 63 stages, workflow orchestrator, collaboration, analytics - poor discoverability
- ❌ Inconsistent navigation patterns across pages

**NAVIGATION INFRASTRUCTURE (80KB, 1948 LOC)**:
- Navigation.tsx: 230 LOC, main sidebar with 8 primary + 7 secondary items
- ModernNavigationSidebar.tsx: 577 LOC, enhanced version with more features
- AINavigationAssistant.tsx: AI-powered search and suggestions
- BreadcrumbNavigation.tsx: Page hierarchy trails
- MobileNavigationEnhancements.tsx: Mobile-optimized navigation
- useNavigationCounts.tsx: Hook for dynamic badge counts

**GAPS IDENTIFIED**:
1. No unified global search
2. 2 sidebar implementations (consolidation needed)
3. No command palette (Cmd+K pattern)
4. Hidden features not discoverable
5. No contextual help/onboarding`,

    scope: `**6-Week Navigation Enhancement**:

**PHASE 1: Sidebar Consolidation (Week 1)**
- Merge Navigation.tsx + ModernNavigationSidebar.tsx
- Single canonical sidebar implementation
- Migrate all features to unified component

**PHASE 2: Global Search & Command Palette (Weeks 2-3)**
- Implement Cmd+K command palette
- Global search across ventures, features, pages
- AI-powered suggestions integration

**PHASE 3: Feature Discoverability (Weeks 4-5)**
- Add "What's New" section
- Feature spotlight on unused features
- Contextual help tooltips

**PHASE 4: Mobile & Accessibility (Week 6)**
- Responsive navigation
- Keyboard shortcuts
- ARIA labels and screen reader support

**OUT OF SCOPE**:
- ❌ Complete redesign
- ❌ Navigation analytics tracking (separate SD)`,

    strategic_objectives: [
      'Consolidate 2 navigation sidebars into single unified implementation, eliminating 577 LOC of duplicate code',
      'Implement global search with Cmd+K command palette, enabling instant feature discovery across ventures, pages, and actions',
      "Enhance feature discoverability through AI-powered navigation assistant, contextual help, and 'What's New' highlights",
      'Achieve ≥90% feature awareness (users know 9/10 major features exist), up from estimated 50% currently',
      'Reduce time-to-find features from 30s+ to <5s via command palette and global search',
      'Ensure 100% mobile responsiveness and WCAG AA accessibility compliance for all navigation components'
    ],

    success_criteria: [
      '✅ Single navigation sidebar: 1 implementation, 0 duplicates, <400 LOC total',
      '✅ Global search implemented: Cmd+K works, searches ventures/features/pages, <200ms response time',
      '✅ Feature awareness: ≥90% users know major features exist (survey), ≥80% have used command palette',
      '✅ Discoverability metrics: Time-to-find <5s (down from 30s+), search success rate ≥95%',
      '✅ Mobile navigation: 100% responsive, touch-optimized, <300KB bundle',
      '✅ Accessibility: WCAG AA compliant, keyboard navigation works, ARIA labels complete'
    ],

    key_principles: [
      '**Single Source of Truth**: One navigation component, not two - eliminate confusion and maintenance burden',
      '**Search First**: Global search and command palette as primary navigation - faster than clicking through menus',
      "**Progressive Disclosure**: Show 8 primary items, hide secondary behind 'More' - don't overwhelm users",
      '**AI-Powered Discovery**: Use existing AINavigationAssistant to suggest next actions based on context',
      '**Mobile-First Responsive**: Navigation must work on all screen sizes - touch targets ≥44px',
      '**Accessibility Default**: Keyboard shortcuts, ARIA labels, screen reader support - not optional'
    ],

    implementation_guidelines: [
      '**PHASE 1: Sidebar Consolidation (Week 1)**',
      '',
      '1. Compare Navigation.tsx vs ModernNavigationSidebar.tsx features',
      '2. Choose ModernNavigationSidebar as base (more features)',
      '3. Migrate unique features from Navigation.tsx',
      '4. Delete Navigation.tsx, rename ModernNavigationSidebar → Navigation',
      '5. Update all imports',
      '',
      '**PHASE 2: Global Search (Weeks 2-3)**',
      '',
      '6. Install cmdk library: npm install cmdk',
      '7. Create CommandPalette.tsx component',
      '8. Implement Cmd+K keyboard shortcut',
      '9. Add search for ventures, pages, actions',
      '10. Integrate AINavigationAssistant for AI suggestions',
      '',
      '**PHASE 3: Discoverability (Weeks 4-5)**',
      '',
      "11. Add 'What's New' badge to new features",
      '12. Implement feature spotlight for unused features',
      '13. Add contextual tooltips with keyboard shortcuts',
      '',
      '**PHASE 4: Mobile & A11y (Week 6)**',
      '',
      '14. Test on mobile devices (iOS, Android)',
      '15. Add keyboard shortcuts documentation',
      '16. ARIA labels on all nav items',
      '17. Screen reader testing with NVDA'
    ],

    risks: [
      {
        risk: 'Sidebar consolidation breaks existing layouts',
        probability: 'Medium (40%)',
        impact: 'High - Navigation broken, users cannot access features',
        mitigation: 'Feature parity audit before deletion, update all imports, comprehensive testing'
      },
      {
        risk: 'Global search performance issues with large datasets',
        probability: 'Medium (50%)',
        impact: 'Medium - Slow search, poor UX',
        mitigation: 'Debounce search input (300ms), limit results to 20, implement pagination'
      }
    ],

    success_metrics: [
      {
        metric: 'Navigation consolidation',
        target: '1 sidebar component, 0 duplicates',
        measurement: "find src -name '*Navigation*.tsx' | wc -l"
      },
      {
        metric: 'Command palette usage',
        target: '≥80% of users use Cmd+K within first week',
        measurement: "Analytics event tracking: 'command_palette_opened'"
      },
      {
        metric: 'Feature discovery time',
        target: '<5 seconds to find any feature',
        measurement: 'User testing: Time from search to finding feature'
      }
    ],

    metadata: {
      'current_navigation': {
        'Navigation.tsx': '230 LOC, 8 primary items',
        'ModernNavigationSidebar.tsx': '577 LOC, enhanced features',
        'total_nav_code': '80KB, 1948 LOC'
      },
      'implementation_plan': {
        'phase_1': 'Consolidation (Week 1)',
        'phase_2': 'Global search (Weeks 2-3)',
        'phase_3': 'Discoverability (Weeks 4-5)',
        'phase_4': 'Mobile & A11y (Week 6)'
      },
      'prd_readiness': {
        'scope_clarity': '90%',
        'execution_readiness': '85%',
        'risk_coverage': '85%',
        'business_impact': '85%'
      }
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('sd_key', 'SD-RECONNECT-006');

  if (error) {
    console.error('❌ Error updating SD-RECONNECT-006:', error);
    process.exit(1);
  }

  console.log('✅ SD-RECONNECT-006 updated successfully!\n');
  console.log('📊 Summary: 6-week navigation enhancement plan');
  console.log('  ✓ Consolidate 2 sidebars → 1');
  console.log('  ✓ Implement Cmd+K command palette');
  console.log('  ✓ Global search & AI suggestions');
  console.log('  ✓ Mobile & accessibility improvements\n');
  console.log('✨ SD-RECONNECT-006 enhancement complete!');
}

updateSDRECONNECT006();
