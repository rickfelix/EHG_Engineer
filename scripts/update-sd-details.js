#!/usr/bin/env node

/**
 * Update Strategic Directive details in database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function updateSDDetails() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const sdId = 'SD-DASHBOARD-AUDIT-2025-08-31-A';
  
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        title: 'Critical Issues Audit for LEO Protocol Dashboard',
        status: 'active',
        category: 'technical',
        priority: 'high',
        description: 'Comprehensive audit of the LEO Protocol Dashboard to identify and document critical issues affecting system stability, user experience, security, and data integrity',
        strategic_intent: 'Ensure LEO Protocol Dashboard reliability and security through systematic audit',
        rationale: 'System stability and security issues have been identified that require immediate attention',
        scope: 'Core dashboard components, LEO Protocol integration, critical workflows, technical infrastructure',
        key_changes: [
          'Systematic audit of all dashboard components',
          'Security vulnerability assessment',
          'Performance bottleneck identification',
          'Progress calculation validation'
        ],
        strategic_objectives: [
          'Identify and eliminate critical bugs',
          'Detect UI/UX issues impairing usability',
          'Verify accurate progress calculations',
          'Assess security vulnerabilities',
          'Identify performance bottlenecks'
        ],
        success_criteria: [
          '100% of critical issues identified and documented',
          '100% of security vulnerabilities assessed',
          'Progress calculation accuracy verified to 100%',
          'All agent handoff workflows validated',
          'Zero console errors in production build'
        ],
        success_metrics: [
          { metric: 'Critical issues identified', target: '100%' },
          { metric: 'Security vulnerabilities assessed', target: '100%' },
          { metric: 'Page load time', target: '< 2 seconds' },
          { metric: 'WebSocket stability', target: 'No disconnections' }
        ],
        risks: [
          { risk: 'Progress calculation errors', impact: 'HIGH', mitigation: 'Comprehensive testing' },
          { risk: 'State management issues', impact: 'MEDIUM', mitigation: 'WebSocket monitoring' },
          { risk: 'Security vulnerabilities', impact: 'HIGH', mitigation: 'Security scanning' }
        ],
        approved_by: 'LEAD',
        approval_date: new Date().toISOString(),
        effective_date: new Date().toISOString(),
        execution_order: 2,
        version: '1.0'
      })
      .eq('id', sdId)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database update error:', error.message);
      process.exit(1);
    }
    
    console.log(`✅ ${sdId} updated successfully!`);
    console.log('Updated record:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }
}

updateSDDetails();