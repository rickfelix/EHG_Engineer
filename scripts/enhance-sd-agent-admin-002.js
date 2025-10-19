#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function enhanceSD() {
  console.log('\n🔧 Enhancing SD-AGENT-ADMIN-002 with required fields...\n');

  const sd_id = 'SD-AGENT-ADMIN-002';

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      strategic_objectives: [
        {
          id: 'obj-1',
          title: 'Complete Agent Configuration Management',
          description: 'Enable agent managers to create, save, and apply configuration presets for rapid agent setup and consistent behavior across deployments',
          success_criteria: 'Agents can be configured from presets in <60 seconds (vs 5-10 minutes manual), 80% of configurations use presets',
          business_value: 'Reduces agent setup time by 90%, ensures configuration consistency, prevents misconfiguration errors'
        },
        {
          id: 'obj-2',
          title: 'Implement Prompt Template Library with A/B Testing',
          description: 'Provide centralized prompt management with versioning, categorization, and built-in A/B testing to optimize agent performance',
          success_criteria: 'Prompt reuse rate >70%, A/B tests show 15%+ performance improvement, prompt iteration time <2 minutes',
          business_value: 'Continuous prompt improvement, data-driven optimization, reduced prompt engineering time'
        },
        {
          id: 'obj-3',
          title: 'Enable Advanced Performance Analytics',
          description: 'Add historical trend analysis, comparative dashboards, and performance alerts to monitor and optimize agent behavior over time',
          success_criteria: 'Performance trends visible across 7d/30d/90d, alerts configured for 100% of production agents, anomaly detection <5 min',
          business_value: 'Proactive performance monitoring, early issue detection, data-driven optimization decisions'
        }
      ],
      success_metrics: [
        {
          metric: 'Agent Configuration Time',
          baseline: '5-10 minutes manual configuration',
          target: '<60 seconds with presets',
          measurement: 'Time from configuration start to agent ready',
          critical: true
        },
        {
          metric: 'Prompt Reuse Rate',
          baseline: '0% (no prompt library)',
          target: '70%+ of agent prompts use library templates',
          measurement: 'Percentage of prompts sourced from library',
          critical: true
        },
        {
          metric: 'Performance Visibility',
          baseline: 'Current-state metrics only (0 historical)',
          target: '100% of agents have 90-day trend visibility',
          measurement: 'Agents with historical performance charts',
          critical: false
        },
        {
          metric: 'A/B Test Adoption',
          baseline: '0 prompt A/B tests conducted',
          target: '10+ A/B tests per month, 15%+ average improvement',
          measurement: 'Monthly A/B tests conducted and average performance delta',
          critical: false
        }
      ],
      key_principles: [
        'SIMPLICITY FIRST: Use proven stack (React + Supabase + Radix UI), no custom frameworks',
        'REUSE EXISTING PATTERNS: Extend AgentSettingsTab pattern for all new tabs',
        'COMPONENT SIZING: Target 300-600 LOC per component, split if >800 LOC',
        'SECURITY BY DEFAULT: RLS policies on all tables, input validation on user-generated content',
        'ACCESSIBILITY: WCAG 2.1 AA compliance, full keyboard navigation',
        'DATABASE-FIRST: All data in database tables, no markdown files',
        'BORING TECHNOLOGY: Recharts for charts, Monaco for editor, Supabase for backend'
      ],
      risks: [
        {
          id: 'risk-1',
          category: 'Security',
          title: 'Prompt Injection via Monaco Editor',
          severity: 'HIGH',
          probability: 'MEDIUM',
          impact: 'Malicious prompts could manipulate agent behavior or expose sensitive data',
          mitigation: 'Implement prompt sanitization, validation rules, audit logging, sandboxed execution',
          owner: 'EXEC - Security implementation',
          status: 'IDENTIFIED'
        },
        {
          id: 'risk-2',
          category: 'Performance',
          title: 'Monaco Editor Performance with Large Prompts',
          severity: 'MEDIUM',
          probability: 'MEDIUM',
          impact: 'Prompts >10KB could cause editor lag, poor UX',
          mitigation: 'Lazy load Monaco editor, implement virtualization, set prompt size limits',
          owner: 'EXEC - Design implementation',
          status: 'IDENTIFIED'
        },
        {
          id: 'risk-3',
          category: 'Security',
          title: 'A/B Test Result Manipulation',
          severity: 'MEDIUM',
          probability: 'LOW',
          impact: 'Users could manipulate test results to favor specific variants',
          mitigation: 'Append-only results table, cryptographic signatures, statistical validation',
          owner: 'PLAN - Database schema + EXEC - Backend',
          status: 'IDENTIFIED'
        },
        {
          id: 'risk-4',
          category: 'UX',
          title: 'Tab Overflow on Mobile (9 total tabs)',
          severity: 'LOW',
          probability: 'HIGH',
          impact: 'Tabs may not fit on small screens, poor mobile UX',
          mitigation: 'Responsive tab dropdown for mobile, tab prioritization',
          owner: 'EXEC - UI implementation',
          status: 'IDENTIFIED'
        }
      ],
      updated_at: new Date().toISOString()
    })
    .eq('id', sd_id)
    .select();

  if (error) {
    console.error('❌ Error enhancing SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD enhanced successfully!\n');
  console.log('Strategic Objectives:', data[0].strategic_objectives?.length || 0);
  console.log('Success Metrics:', data[0].success_metrics?.length || 0);
  console.log('Key Principles:', data[0].key_principles?.length || 0);
  console.log('Risks:', data[0].risks?.length || 0);

  console.log('\n✅ SD is now ready for LEAD→PLAN handoff!\n');
}

enhanceSD().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
