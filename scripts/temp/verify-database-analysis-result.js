import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  const result = await client.query(`
    SELECT
      id,
      sd_id,
      sub_agent_code,
      sub_agent_name,
      verdict,
      confidence,
      execution_time,
      metadata,
      recommendations,
      created_at
    FROM sub_agent_execution_results
    WHERE sd_id = 'SD-QUALITY-UI-001' AND sub_agent_code = 'DATABASE'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length > 0) {
    const analysis = result.rows[0];
    console.log('\n✅ DATABASE ANALYSIS VERIFICATION\n');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`SD ID: ${analysis.sd_id}`);
    console.log(`Sub-Agent: ${analysis.sub_agent_name} (${analysis.sub_agent_code})`);
    console.log(`Verdict: ${analysis.verdict}`);
    console.log(`Confidence: ${analysis.confidence}%`);
    console.log(`Execution Time: ${analysis.execution_time}s`);
    console.log(`Created: ${analysis.created_at}`);
    console.log('══════════════════════════════════════════════════════════\n');

    console.log('🔍 METADATA:');
    console.log(`  Design Informed: ${analysis.metadata.design_informed ? '✅ YES' : '❌ NO'}`);
    console.log(`  Dependency Verified: ${analysis.metadata.dependency_verified}`);
    console.log('\n📊 Schema Verification:');
    const schema = analysis.metadata.schema_verification;
    console.log(`  Tables Verified: ${schema.tables_verified.join(', ')}`);
    console.log(`  Tables Exist: ${schema.tables_exist ? '✅' : '❌'}`);
    console.log(`  RLS Policies: ${schema.rls_policies_count}`);
    console.log(`  Foreign Keys: ${schema.foreign_keys_count}`);
    console.log(`  Indexes Optimized: ${schema.indexes_optimized ? '✅' : '❌'}`);

    console.log('\n🎯 Query Patterns Documented:');
    Object.keys(analysis.metadata.query_patterns).forEach(view => {
      const pattern = analysis.metadata.query_patterns[view];
      console.log(`  ${view}:`);
      console.log(`    - Table: ${pattern.table}`);
      console.log(`    - Filter: ${pattern.filter || 'none'}`);
      console.log(`    - Order: ${pattern.order_by}`);
    });

    console.log('\n🔒 RLS Compliance:');
    const rls = analysis.metadata.rls_compliance;
    console.log(`  Read Access: ${rls.read_access}`);
    console.log(`  Write Access: ${rls.write_access}`);
    console.log(`  Widget Note: ${rls.widget_feedback_submission}`);

    console.log('\n✅ DESIGN Sub-Agent Conditions Verified:');
    analysis.metadata.design_conditions_verified.forEach((condition, idx) => {
      console.log(`  ${idx + 1}. ${condition}`);
    });

    console.log('\n📋 Recommendations:');
    analysis.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('✅ DATABASE analysis complete and stored');
    console.log('══════════════════════════════════════════════════════════\n');
  } else {
    console.log('❌ No DATABASE analysis found for SD-QUALITY-UI-001');
  }

  await client.end();
})();
