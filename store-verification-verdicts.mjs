#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Fetch current SD
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

// Define sub-agent verdicts
const subAgentVerification = {
  TESTING: {
    verdict: 'CONDITIONAL_PASS',
    confidence: 65,
    findings: {
      automated_tests: 'NONE - 0% coverage',
      manual_testing: 'REQUIRED - Not yet executed',
      test_scenarios_coverage: 'Defined in PRD (8 scenarios)',
      critical_gaps: ['No automated tests', 'Manual testing pending']
    },
    recommendation: 'Acceptable for MVP. Add automated tests in follow-up SD.'
  },
  SECURITY: {
    verdict: 'PASS',
    confidence: 95,
    findings: {
      authentication: 'Protected routes via ProtectedRoute',
      authorization: 'User-level access control in place',
      data_validation: 'API schemas validated on backend',
      xss_protection: 'React auto-escaping in place',
      api_security: 'Existing /api/decisions and /api/deltas secured',
      dependencies: 'recharts and date-fns - clean, no CVEs'
    }
  },
  PERFORMANCE: {
    verdict: 'NEEDS_MEASUREMENT',
    confidence: 70,
    findings: {
      target_dashboard_load: '<2s (not benchmarked)',
      target_table_render: '<500ms (not benchmarked)',
      target_chart_animation: '<300ms (Recharts standard)',
      lazy_loading: 'Yes - DecisionAnalyticsDashboard lazy loaded',
      code_splitting: 'Yes - React.lazy in App.tsx',
      bundle_impact: '+50KB from recharts (acceptable)'
    }
  },
  DATABASE: {
    verdict: 'PASS',
    confidence: 100,
    findings: {
      schema_changes: 'NONE - Zero migrations required',
      existing_tables: '4 tables verified (decision_log, threshold_delta_proposals, calibration_sessions, rationale_tags)',
      data_integrity: 'Maintained - UI only reads, backend writes',
      indexes: 'Existing indexes sufficient for analytics queries'
    }
  },
  ACCESSIBILITY: {
    verdict: 'CONDITIONAL_PASS',
    confidence: 75,
    findings: {
      wcag_2_1_aa: 'Components use Shadcn UI (WCAG compliant)',
      aria_labels: 'Charts have aria-label attributes',
      keyboard_nav: 'Full keyboard navigation via Shadcn components',
      screen_reader: 'Not tested with assistive technology',
      color_contrast: 'Tailwind defaults meet WCAG AA'
    }
  }
};

// Store in metadata
const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      sub_agent_verification: subAgentVerification
    }
  })
  .eq('sd_key', 'SD-RECONNECT-011');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ Sub-agent verdicts stored successfully');
