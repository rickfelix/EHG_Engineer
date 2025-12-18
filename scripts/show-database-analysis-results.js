#!/usr/bin/env node
/**
 * Display DATABASE sub-agent analysis results for SD-HARDENING-V1-001
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  const result = await client.query(`
    SELECT
      id, verdict, confidence,
      critical_issues, warnings, recommendations,
      detailed_analysis, metadata, created_at
    FROM sub_agent_execution_results
    WHERE sd_id = 'SD-HARDENING-V1-001' AND sub_agent_code = 'DATABASE'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.log('No results found');
    await client.end();
    return;
  }

  const r = result.rows[0];

  console.log('='.repeat(70));
  console.log('DATABASE SUB-AGENT EXECUTION REPORT');
  console.log('SD-HARDENING-V1-001: RLS Security Hardening');
  console.log('='.repeat(70));
  console.log('');
  console.log('Execution ID:', r.id);
  console.log('Timestamp:', r.created_at);
  console.log('Verdict:', r.verdict);
  console.log('Confidence:', r.confidence + '%');
  console.log('');

  console.log('CRITICAL ISSUES (' + r.critical_issues.length + ')');
  console.log('-'.repeat(70));
  r.critical_issues.forEach((issue, i) => {
    console.log((i + 1) + '. [' + issue.severity + '] ' + issue.issue);
    console.log('   → ' + issue.recommendation);
    if (issue.impact) console.log('   Impact: ' + issue.impact);
    console.log('');
  });

  console.log('WARNINGS (' + r.warnings.length + ')');
  console.log('-'.repeat(70));
  r.warnings.forEach((warning, i) => {
    console.log((i + 1) + '. [' + warning.severity + '] ' + (warning.table || 'General') + ': ' + warning.issue);
    console.log('   → ' + warning.recommendation);
    if (warning.current_policies) {
      console.log('   Current policies: ' + warning.current_policies.join(', '));
    }
    console.log('');
  });

  console.log('RECOMMENDATIONS (' + r.recommendations.length + ')');
  console.log('-'.repeat(70));
  r.recommendations.forEach((rec, i) => {
    console.log((i + 1) + '. ' + rec);
  });
  console.log('');

  console.log('DETAILED FINDINGS');
  console.log('-'.repeat(70));
  console.log('');

  console.log('Tables Verified:');
  const tables = r.detailed_analysis.tables_verified;
  for (const tableName of Object.keys(tables)) {
    const info = tables[tableName];
    console.log('  • ' + tableName + ':');
    if (info.exists === false) {
      console.log('    ❌ NOT FOUND' + (info.blocker ? ' (BLOCKER)' : ''));
      if (info.action_required) console.log('    Action: ' + info.action_required);
    } else {
      console.log('    ✅ EXISTS (' + info.columns + ' columns, ' + info.row_count + ' rows)');
      console.log('    RLS Policies: ' + info.current_rls_policies);
      if (info.insecure_predicates && info.insecure_predicates.length > 0) {
        console.log('    ⚠️  Insecure: ' + info.insecure_predicates.join(', '));
      }
    }
  }
  console.log('');

  console.log('Dependencies:');
  const deps = r.detailed_analysis.dependencies;
  for (const depName of Object.keys(deps)) {
    const info = deps[depName];
    console.log('  • ' + depName + ':');
    console.log('    Status: ' + (info.exists ? '✅ EXISTS' : '❌ MISSING'));
    if (info.return_type) console.log('    Returns: ' + info.return_type);
    if (info.columns) console.log('    Columns: ' + info.columns);
    if (info.suitable_for_rls !== undefined) {
      console.log('    Suitable for RLS: ' + (info.suitable_for_rls ? 'YES' : 'NO'));
    }
    if (info.needs_verification) console.log('    ⚠️  ' + info.needs_verification);
  }
  console.log('');

  console.log('Migration Safety:');
  const safety = r.detailed_analysis.migration_safety;
  console.log('  Data at Risk: ' + (safety.data_at_risk ? 'YES ⚠️' : 'NO ✅'));
  console.log('  Reason: ' + safety.reason);
  console.log('  Recommendation: ' + safety.recommendation);
  console.log('');

  console.log('RLS Hardening Approach:');
  const approach = r.detailed_analysis.rls_hardening_approach;
  console.log('  Chairman Access: ' + approach.chairman_access);
  console.log('  Venture-Scoped: ' + approach.venture_scoped);
  console.log('  Pattern Example:');
  console.log('    ' + approach.pattern_example);
  console.log('');

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('Tables Analyzed: ' + r.metadata.tables_analyzed);
  console.log('Tables Found: ' + r.metadata.tables_found);
  console.log('Tables Missing: ' + r.metadata.tables_missing);
  console.log('RLS Policies Found: ' + r.metadata.rls_policies_found);
  console.log('Insecure Policies: ' + r.metadata.insecure_policies);
  console.log('');
  console.log('VERDICT: ' + r.verdict + ' (Confidence: ' + r.confidence + '%)');
  console.log('='.repeat(70));

  await client.end();
}

main().catch(console.error);
