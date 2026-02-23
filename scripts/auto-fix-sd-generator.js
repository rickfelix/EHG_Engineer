#!/usr/bin/env node

/**
 * Auto-Fix SD Generator for UAT Issues
 * Automatically creates Strategic Directives for failed tests
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class AutoFixSDGenerator {
  async generateFixSD(issue) {
    console.log(`🔧 Generating fix SD for issue: ${issue.issue_key}`);

    const sdId = `SD-FIX-${issue.issue_key}`;

    const sdData = {
      id: sdId,
      title: `Fix: ${issue.title}`,
      description: `Automated fix directive for UAT issue ${issue.issue_key}. ${issue.description}`,
      status: 'draft',
      priority: this.mapPriority(issue.severity),
      category: 'Bug Fix',
      strategic_intent: 'Resolve identified UAT failure to maintain quality gates',
      rationale: issue.actual_behavior,
      scope: {
        module: issue.affected_module,
        url: issue.affected_url,
        test_case: issue.test_case_id
      },
      strategic_objectives: [
        { objective: 'Fix the identified issue and verify with UAT test', metric: 'UAT test passes after fix' },
        { objective: 'Prevent regression in related functionality', metric: '0 existing tests broken' },
        { objective: 'Maintain ≥85% overall UAT pass rate', metric: 'UAT pass rate >= 85%' }
      ],
      success_criteria: [
        { criterion: 'Issue resolved and UAT test passes', measure: 'Test status = pass' },
        { criterion: 'No regression in other tests', measure: '0 previously-passing tests now failing' },
        { criterion: 'Fix deployed to production', measure: 'Deployment confirmed in prod environment' }
      ],
      dependencies: [issue.issue_key],
      target_application: 'EHG',
      current_phase: 'LEAD',
      phase_progress: 0,
      progress: 0,
      is_active: true,
      created_by: 'uat-system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        auto_generated: true,
        source_issue: issue.issue_key,
        test_result_id: issue.test_result_id,
        run_id: issue.run_id
      }
    };

    // Create SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('Error creating fix SD:', error);
      return null;
    }

    // Update issue with fix SD reference
    await supabase
      .from('uat_issues')
      .update({ fix_sd_id: sdId })
      .eq('id', issue.id);

    console.log(`   ✅ Fix SD created: ${sdId}`);
    return data;
  }

  mapPriority(severity) {
    switch(severity) {
      case 'critical': return 'critical';
      case 'major': return 'high';
      case 'minor': return 'medium';
      default: return 'low';
    }
  }

  async processFailedTests() {
    // Get all open issues without fix SDs
    const { data: issues } = await supabase
      .from('uat_issues')
      .select('*')
      .eq('status', 'open')
      .is('fix_sd_id', null);

    if (!issues || issues.length === 0) {
      console.log('No issues require fix SDs');
      return;
    }

    console.log(`Found ${issues.length} issues requiring fix SDs`);

    for (const issue of issues) {
      await this.generateFixSD(issue);
    }
  }
}

export default AutoFixSDGenerator;

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const generator = new AutoFixSDGenerator();
  generator.processFailedTests()
    .then(() => {
      console.log('✅ Auto-fix SD generation complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
