#!/usr/bin/env node

/**
 * P0 Database Audit Script
 * SD-STAGE-ARCH-001-P0: Audit & Clean Database
 *
 * Purpose: Identify orphaned entries in database tables that reference
 * non-existent stage files before the cleanup phase (P1) deletes them.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VISION_V2_TOTAL_STAGES = 25;

async function auditDatabase() {
  const report = [];
  const findings = {
    orphanedEntries: [],
    testVentures: [],
    stageMismatches: [],
    recommendations: []
  };

  report.push('='.repeat(70));
  report.push('DATABASE AUDIT REPORT - P0: SD-STAGE-ARCH-001-P0');
  report.push('Date: ' + new Date().toISOString());
  report.push('='.repeat(70));
  report.push('');

  // 1. Check venture_stages table
  report.push('## 1. venture_stages Audit');
  report.push('-'.repeat(50));

  const { data: ventureStages, error: vsError } = await supabase
    .from('venture_stages')
    .select('id, venture_id, stage_number, created_at')
    .limit(100);

  if (vsError) {
    report.push('   Table not found or error: ' + vsError.message);
    findings.recommendations.push('venture_stages table may not exist - verify schema');
  } else {
    report.push('   Total entries: ' + (ventureStages?.length || 0));
    if (ventureStages && ventureStages.length > 0) {
      const stageNumbers = [...new Set(ventureStages.map(s => s.stage_number))].sort((a,b) => a-b);
      report.push('   Stage numbers found: ' + stageNumbers.join(', '));
      const maxStage = Math.max(...stageNumbers);
      report.push('   Max stage number: ' + maxStage);
      if (maxStage > VISION_V2_TOTAL_STAGES) {
        report.push('   ⚠️ ORPHANED: Stages > 25 found (Vision V2 only has 25)');
        const orphaned = ventureStages.filter(s => s.stage_number > 25);
        findings.orphanedEntries.push(...orphaned.map(s => ({
          table: 'venture_stages',
          id: s.id,
          stage_number: s.stage_number,
          reason: 'Stage number exceeds Vision V2 limit of 25'
        })));
      }
    }
  }
  report.push('');

  // 2. Check workflow_stages table
  report.push('## 2. workflow_stages Audit');
  report.push('-'.repeat(50));

  const { data: workflowStages, error: wsError } = await supabase
    .from('workflow_stages')
    .select('*')
    .limit(100);

  if (wsError) {
    report.push('   Table not found or error: ' + wsError.message);
    findings.recommendations.push('workflow_stages table may not exist - verify schema');
  } else {
    report.push('   Total entries: ' + (workflowStages?.length || 0));
  }
  report.push('');

  // 3. Check ventures table for test data
  report.push('## 3. ventures Table Audit');
  report.push('-'.repeat(50));

  const { data: ventures, error: vError } = await supabase
    .from('ventures')
    .select('id, name, current_stage, created_at')
    .limit(50);

  if (vError) {
    report.push('   Table not found or error: ' + vError.message);
    findings.recommendations.push('ventures table may not exist - verify schema');
  } else {
    report.push('   Total ventures: ' + (ventures?.length || 0));
    if (ventures && ventures.length > 0) {
      const testVentures = ventures.filter(v =>
        v.name?.toLowerCase().includes('test') ||
        v.name?.toLowerCase().includes('demo')
      );
      report.push('   Test/Demo ventures: ' + testVentures.length);
      testVentures.forEach(v => {
        report.push('     - ' + v.name + ' (stage ' + v.current_stage + ')');
        findings.testVentures.push({
          id: v.id,
          name: v.name,
          current_stage: v.current_stage
        });
      });

      if (testVentures.length > 0) {
        findings.recommendations.push('Consider deleting ' + testVentures.length + ' test ventures before P1');
      }
    }
  }
  report.push('');

  // 4. Check workflows table
  report.push('## 4. workflows Table Audit');
  report.push('-'.repeat(50));

  const { data: workflows, error: wError } = await supabase
    .from('workflows')
    .select('id, name, total_stages, created_at')
    .limit(20);

  if (wError) {
    report.push('   Table not found or error: ' + wError.message);
    findings.recommendations.push('workflows table may not exist - verify schema');
  } else {
    report.push('   Total workflows: ' + (workflows?.length || 0));
    if (workflows && workflows.length > 0) {
      workflows.forEach(w => {
        report.push('     - ' + w.name + ': ' + w.total_stages + ' stages');
        if (w.total_stages !== VISION_V2_TOTAL_STAGES) {
          report.push('       ⚠️ MISMATCH: Expected 25 stages (Vision V2)');
          findings.stageMismatches.push({
            table: 'workflows',
            id: w.id,
            name: w.name,
            total_stages: w.total_stages,
            expected: VISION_V2_TOTAL_STAGES
          });
        }
      });
    }
  }
  report.push('');

  // Summary & Recommendations
  report.push('='.repeat(70));
  report.push('## SUMMARY');
  report.push('='.repeat(70));
  report.push('');
  report.push('Orphaned entries found: ' + findings.orphanedEntries.length);
  report.push('Test ventures found: ' + findings.testVentures.length);
  report.push('Stage mismatches found: ' + findings.stageMismatches.length);
  report.push('');

  report.push('## RECOMMENDATIONS FOR P1');
  report.push('-'.repeat(50));
  if (findings.testVentures.length > 0) {
    report.push('1. Delete test ventures: ' + findings.testVentures.map(v => v.name).join(', '));
  }
  if (findings.stageMismatches.length > 0) {
    report.push('2. Update workflow total_stages to 25 for: ' + findings.stageMismatches.map(m => m.name).join(', '));
  }
  if (findings.orphanedEntries.length > 0) {
    report.push('3. Archive/delete ' + findings.orphanedEntries.length + ' orphaned venture_stages entries');
  }
  findings.recommendations.forEach((rec, i) => {
    report.push((i + 4) + '. ' + rec);
  });
  report.push('');

  report.push('='.repeat(70));
  report.push('END OF AUDIT');
  report.push('='.repeat(70));

  // Save report
  const reportContent = report.join('\n');
  const reportPath = path.join(process.cwd(), 'docs', 'reports', 'P0_DATABASE_AUDIT_REPORT.md');
  fs.writeFileSync(reportPath, reportContent);

  console.log(reportContent);
  console.log('\n📄 Report saved to: ' + reportPath);

  return findings;
}

auditDatabase().catch(e => console.error('Audit error:', e.message));
