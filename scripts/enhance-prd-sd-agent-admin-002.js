#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function enhancePRD() {
  console.log('\n🔧 Enhancing PRD-SD-AGENT-ADMIN-002...\n');

  const prd_id = 'PRD-SD-AGENT-ADMIN-002';

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({
      system_architecture: `
**Target Application**: EHG (Business Application) at /mnt/c/_EHG/ehg/
**Route**: /ai-agents page (NOT /agents)
**UI Framework**: React 18+ with Hooks
**Component Library**: Shadcn UI (Radix UI + Tailwind CSS)
**State Management**: Supabase real-time hooks + React useState/useEffect
**Charting**: Recharts (already available, 113+ components)
**Code Editor**: Monaco Editor (@monaco-editor/react, lazy loaded)
**Navigation**: Tab-based architecture with 9 total tabs
**Database**: Supabase PostgreSQL with RLS
**Backend**: Supabase API + Edge Functions (for statistical calculations)

**Database Schema**:
- agent_configs: Configuration presets (50-200 rows)
- prompt_templates: Prompt library with versioning (200-1000 rows)
- ab_tests: A/B test configurations and results (100-500 rows)
- search_preferences: User search settings (10-100 rows)

**Component Architecture**:
- 6 new major components
- 15-20 sub-components
- 2 enhanced existing components
- Total: ~2,650 new lines of code
- Component sizing target: 300-600 LOC per component

**Security Architecture**:
- RLS policies on all 4 tables (16 total policies)
- Row-level data isolation (users see only their own data)
- Input validation for prompt injection prevention
- API key encryption using pgcrypto
- Audit logging for sensitive operations
      `.trim(),

      implementation_approach: `
**Phase 1: Database Layer (COMPLETED)**
- ✅ Created 4 database tables with RLS policies
- ✅ Applied indexes for performance
- ✅ Implemented soft delete pattern
- ✅ Created triggers for updated_at timestamps

**Phase 2: Component Development (UPCOMING)**

**Subsystem 1: Preset Management (25 SP)**
- Component: AgentPresetsTab (400 LOC)
- Layout: Two-column (preset list + preview/edit)
- Features: CRUD operations, import/export JSON, apply to settings
- Integration: Two-way sync with AgentSettingsTab
- Database: agent_configs table

**Subsystem 2: Prompt Library + A/B Testing (35 SP)**
- Component: PromptLibraryTab (600 LOC)
- Layout: Three-column (category tree + prompt list + Monaco editor)
- Features: Versioning, tags, search, A/B test creation
- Component: ABTestingTab (500 LOC)
- Layout: Test list + test details/results
- Features: Test creation wizard, results dashboard, winner declaration
- Database: prompt_templates, ab_tests tables
- External Dependency: @monaco-editor/react (lazy loaded)

**Subsystem 3: Agent Settings Completion (15 SP)**
- Component: AgentSettingsTab enhancement (+200 LOC = 606 total)
- Features: Preset dropdown, save as preset, preset indicator, reset button
- Integration: Real-time sync with AgentPresetsTab

**Subsystem 4: Search Preferences (24 SP)**
- Component: SearchPreferencesTab (350 LOC)
- Layout: Single column with sections
- Features: Engine selection, custom endpoints, test search
- Database: search_preferences table with encrypted API keys

**Subsystem 5: Advanced Performance (21 SP)**
- Component: AgentPerformanceTab enhancement (+400 LOC = ~900 total)
- Features: Trend charts (7d/30d/90d), alerts, comparative analysis
- Charting: Recharts (LineChart, BarChart, AreaChart, PieChart)

**Implementation Strategy**:
1. Extend existing /ai-agents page (no new route)
2. Reuse AgentSettingsTab pattern for all new tabs
3. Leverage Shadcn UI components (Card, Button, Dialog, etc.)
4. Lazy load Monaco editor to reduce bundle size
5. Use Supabase real-time subscriptions for live updates
6. Implement responsive design (mobile, tablet, desktop)
7. Ensure WCAG 2.1 AA accessibility compliance

**Development Order**:
1. AgentPresetsTab (foundation for preset system)
2. Enhance AgentSettingsTab (preset integration)
3. PromptLibraryTab (Monaco editor integration)
4. ABTestingTab (Recharts integration)
5. SearchPreferencesTab (simpler component)
6. Enhance AgentPerformanceTab (final component)

**Testing Approach**:
- Tier 1 (Smoke): 5 tests validating basic functionality
- Tier 2 (E2E - Playwright): 30-50 tests covering all user stories
- Professional test case generation from user stories
- Given-When-Then scenarios for each feature
- 100% user story coverage required for approval
      `.trim(),

      ui_ux_requirements: [
        {
          requirement: 'Tab-based navigation on /ai-agents page',
          details: '9 total tabs: Settings, Presets, Prompts, A/B Testing, Performance, Search, Coordination, Task Queue',
          accessibility: 'Full keyboard navigation, ARIA labels, focus management'
        },
        {
          requirement: 'Responsive design for all screen sizes',
          details: 'Mobile (320px): Stack columns vertically. Tablet (768px): Two-column layout. Desktop (1024px+): Full three-column layouts',
          accessibility: 'Touch-friendly tap targets, readable text sizes'
        },
        {
          requirement: 'Monaco editor integration for prompt editing',
          details: 'Syntax highlighting, line numbers, search/replace, undo/redo',
          accessibility: 'Built-in screen reader support, keyboard shortcuts documented'
        },
        {
          requirement: 'Recharts visualizations for performance and A/B testing',
          details: 'Line charts for trends, bar charts for comparisons, pie charts for breakdowns',
          accessibility: 'Alt text for charts, data tables for screen readers, color contrast 4.5:1 minimum'
        },
        {
          requirement: 'Real-time updates via Supabase subscriptions',
          details: 'Performance metrics update automatically, A/B test results refresh in real-time',
          accessibility: 'ARIA live regions for dynamic content updates'
        }
      ],

      technology_stack: [
        { name: 'React', version: '18+', purpose: 'UI framework' },
        { name: 'TypeScript', version: 'Latest', purpose: 'Type safety' },
        { name: 'Shadcn UI', version: 'Latest', purpose: 'Component library (Radix UI + Tailwind)' },
        { name: 'Tailwind CSS', version: 'Latest', purpose: 'Styling framework' },
        { name: 'Recharts', version: 'Already installed', purpose: 'Data visualization' },
        { name: '@monaco-editor/react', version: '^4.6.0', purpose: 'Code editor for prompts (NEW DEPENDENCY)' },
        { name: 'Supabase', version: 'Latest', purpose: 'Backend (database + real-time + auth)' },
        { name: 'Playwright', version: 'Latest', purpose: 'E2E testing' },
        { name: 'Vitest', version: 'Latest', purpose: 'Unit testing' }
      ],

      updated_at: new Date().toISOString()
    })
    .eq('id', prd_id)
    .select();

  if (error) {
    console.error('❌ Error enhancing PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD enhanced successfully!\n');
  console.log('Fields added:');
  console.log('  ✅ system_architecture (comprehensive architecture description)');
  console.log('  ✅ implementation_approach (detailed development plan)');
  console.log('  ✅ ui_ux_requirements (5 requirements with accessibility)');
  console.log('  ✅ technology_stack (9 technologies documented)');

  console.log('\n✅ PRD is now ready for PLAN→EXEC handoff!\n');
}

enhancePRD().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
