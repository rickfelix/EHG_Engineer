#!/usr/bin/env node

/**
 * Create SD-NAV-REFACTOR-001: Database-First Sidebar Navigation with Maturity Filtering
 * LEO Protocol v4.2.0
 *
 * Refactors EHG app sidebar to database-driven architecture with comprehensive
 * migration safety guardrails and 0-route-loss validation.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createNavRefactorSD() {
  console.log('📋 LEAD: Creating SD-NAV-REFACTOR-001 - Navigation Refactor\n');

  const sd = {
    id: 'SD-NAV-REFACTOR-001',
    sd_key: 'SD-NAV-REFACTOR-001',
    title: 'Navigation Refactor: Database-First Sidebar with Maturity Filtering',
    version: '1.0',
    status: 'draft',
    category: 'platform',
    priority: 'critical', // Critical priority
    sequence_rank: 1, // Low sequence = high execution priority

    description: `Refactor EHG app sidebar navigation to database-driven architecture with maturity filtering (Draft/Dev/Complete), prioritizing Venture Workflow (40 stages) + EVA Assistant. Includes user preferences, admin controls, and 0-route-loss migration with feature flag rollout.

Target Application: EHG (/mnt/c/_EHG/EHG)
Database: Supabase (liapbndqlqxdcgpwntbv)`,

    strategic_intent: `Transform navigation from hard-coded taxonomy to flexible, database-driven system that adapts to user preferences and feature maturity while maintaining 100% route parity during migration.`,

    rationale: `**Business Need:**
Current: 67 hard-coded routes in navigationTaxonomy.ts, no maturity filtering, Workflow buried in nav
Desired: Database-driven routes with Draft/Dev/Complete filtering, Workflow + EVA prioritized

**Strategic Value:**
1. **User Experience**: Filter routes by maturity (hide WIP features)
2. **Workflow Priority**: 40-stage Venture Workflow front-center in nav
3. **Flexibility**: Add/modify routes without code deployments
4. **Personalization**: User-specific default maturity preferences
5. **Admin Control**: Manage route metadata via Settings UI
6. **IA Clarity**: Section-based organization (Workflow → EVA → Ventures...)

**Alignment with Business Objectives:**
- Surfaces 40-stage Workflow as primary user journey
- Reduces UI clutter with maturity filtering
- Enables rapid iteration on navigation structure
- Improves discoverability of EVA Assistant features`,

    scope: `**In Scope:**
1. **Database Schema** (2 tables)
   - nav_routes (67 routes from navigationTaxonomy.ts)
   - nav_preferences (user maturity defaults)

2. **Migration Parity** (0-Route-Loss Guardrails)
   - Count match: nav_routes count === 67
   - Path match: every navigationTaxonomy path in DB
   - UI parity test: all routes visible with all filters enabled
   - Backup export: navigation_backup.json for rollback

3. **UI Components**
   - MaturityToggle (Draft | Development | Complete)
   - Enhanced Navigation with workflow stage grouping
   - NavigationSettings tab in Settings page
   - Admin route management table (feature-gated)

4. **Service Layer**
   - navigationService.ts (getRoutes, getUserPreferences, updateRoute)
   - useNavigation() hook with real-time updates
   - RLS policies (read: all users, write: admins only)

5. **Testing & Documentation**
   - Playwright E2E tests (filter behavior + a11y)
   - WCAG 2.1 AA compliance validation
   - navigation-architecture.md contributor guide

6. **Feature Flag Rollout**
   - VITE_FEATURE_NEW_NAV for gradual rollout
   - Legacy nav toggle for 1 release cycle
   - Admin/standard user RLS validation

**Out of Scope (Future):**
- AI-powered navigation recommendations
- Role-based route access (beyond admin/user)
- Multi-language route titles
- Custom user-defined sections`,

    strategic_objectives: [
      'Achieve 0-route-loss during migration (67/67 parity)',
      'Prioritize Workflow + EVA in IA (top 2 sections)',
      'Enable user maturity filtering (Draft/Dev/Complete)',
      'Provide admin route management via Settings UI',
      'Maintain WCAG 2.1 AA compliance throughout',
      'Complete feature flag rollout within 1 release cycle'
    ],

    success_criteria: [
      '✅ Migration parity: nav_routes count === 67',
      '✅ Path match: 100% of navigationTaxonomy paths in DB',
      '✅ UI parity: all routes visible with all maturity filters enabled',
      '✅ Backup created: navigation_backup.json exported',
      '✅ IA priority: Workflow + EVA are top 2 sections',
      '✅ Maturity filter: Draft/Dev/Complete toggle persisted per user',
      '✅ Settings integration: Navigation tab with prefs + admin table',
      '✅ WCAG 2.1 AA: Keyboard nav, ARIA, contrast ≥4.5:1',
      '✅ E2E tests: Playwright suite covers filter behavior + a11y',
      '✅ Documentation: navigation-architecture.md published',
      '✅ Feature flag: VITE_FEATURE_NEW_NAV rollout complete',
      '✅ RLS validation: Admin/standard user tests pass',
      '✅ Stage grouping: Workflow section groups 40 stages by category'
    ],

    key_principles: [
      'Database-first: Routes rendered from nav_routes table only',
      '0-route-loss: Comprehensive parity validation before deprecation',
      'User-centric: Maturity filtering reduces UI clutter',
      'IA priority: Workflow + EVA are primary navigation anchors',
      'Feature flag rollout: Gradual migration with legacy fallback',
      'Accessibility-first: WCAG 2.1 AA compliance non-negotiable'
    ],

    implementation_guidelines: [
      'Phase 1: DB schema with 0-route-loss validation (3 hrs)',
      'Phase 2: TypeScript contracts & navigation service (2 hrs)',
      'Phase 3: UI components (maturity toggle, workflow grouping) (4 hrs)',
      'Phase 4: Settings page integration (2 hrs)',
      'Phase 5: E2E & a11y testing (2 hrs)',
      'Phase 6: Feature flag rollout & legacy deprecation (1 hr)',
      'Total: 14 hours estimated'
    ],

    dependencies: [
      {name: 'Supabase EHG database', type: 'existing', status: 'available'},
      {name: 'navigationTaxonomy.ts', type: 'existing', status: 'available'},
      {name: 'Settings page infrastructure', type: 'existing', status: 'available'},
      {name: 'Playwright test framework', type: 'existing', status: 'available'}
    ],

    risks: [
      {
        risk: 'Route loss during migration',
        impact: 'critical',
        mitigation: 'Count match validation, path match check, UI parity test, backup export'
      },
      {
        risk: 'RLS policy misconfiguration',
        impact: 'high',
        mitigation: 'Test with admin + standard users before deprecating legacy nav'
      },
      {
        risk: 'Performance degradation from DB queries',
        impact: 'medium',
        mitigation: 'Client-side caching, real-time subscriptions, indexed queries'
      },
      {
        risk: 'Accessibility regression',
        impact: 'high',
        mitigation: 'Playwright a11y suite, manual keyboard nav testing, ARIA validation'
      }
    ],

    target_application: 'EHG',

    metadata: {
      estimated_hours: 14,
      complexity: 'medium',
      risk_level: 'medium',
      requires_approval: true,
      migration_safety_guardrails: [
        '🔒 Migration parity gate: nav_routes count === 67',
        '🔒 Path match check: every navigationTaxonomy path exists in DB',
        '🔒 UI parity test: all routes visible with all maturity filters enabled',
        '🔒 One-time backup: export navigation_backup.json before migration',
        '🔒 Feature flag rollout: VITE_FEATURE_NEW_NAV for gradual rollout',
        '🔒 RLS validation: test admin + standard user read/write before deprecation'
      ],
      milestones: [
        {
          name: 'Phase 1: DB Schema & Migration',
          target_date: 'Week 1',
          deliverables: ['nav_routes table', 'nav_preferences table', 'RLS policies', 'migration script with validation']
        },
        {
          name: 'Phase 2: Service Layer',
          target_date: 'Week 1',
          deliverables: ['navigationService.ts', 'useNavigation() hook', 'TypeScript types']
        },
        {
          name: 'Phase 3: UI Components',
          target_date: 'Week 2',
          deliverables: ['MaturityToggle', 'Enhanced Navigation', 'Workflow stage grouping']
        },
        {
          name: 'Phase 4: Settings Integration',
          target_date: 'Week 2',
          deliverables: ['NavigationSettings tab', 'Admin route table', 'User preference controls']
        },
        {
          name: 'Phase 5: Testing & Docs',
          target_date: 'Week 3',
          deliverables: ['Playwright E2E suite', 'A11y tests', 'navigation-architecture.md']
        },
        {
          name: 'Phase 6: Rollout',
          target_date: 'Week 3',
          deliverables: ['Feature flag enabled', 'Legacy nav deprecated', 'Backup verified']
        }
      ]
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error);
    process.exit(1);
  }

  console.log('✅ Strategic Directive created successfully!\n');
  console.log('SD ID:', data.id);
  console.log('SD Key:', data.sd_key);
  console.log('Title:', data.title);
  console.log('Priority:', data.priority, '(Critical)');
  console.log('Sequence Rank:', data.sequence_rank, '(Low = High Execution Priority)');
  console.log('Status:', data.status);
  console.log('\n🔗 View at: http://localhost:3000/dashboard\n');

  console.log('📋 Migration Safety Guardrails:');
  sd.metadata.migration_safety_guardrails.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g}`);
  });

  console.log('\n✅ Next Steps:');
  console.log('  1. LEAD: Review and approve SD-NAV-REFACTOR-001');
  console.log('  2. LEAD→PLAN: Create handoff with migration parity requirements');
  console.log('  3. PLAN: Create PRD with detailed acceptance criteria');
  console.log('  4. EXEC: Implement with 0-route-loss validation at each step');
}

createNavRefactorSD().catch(console.error);
