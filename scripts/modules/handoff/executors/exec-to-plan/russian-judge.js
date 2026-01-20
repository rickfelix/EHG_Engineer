/**
 * Russian Judge AI Quality Assessment for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * AI-powered retrospective quality validation
 */

/**
 * Run Russian Judge AI quality assessment on retrospective
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} sd - SD object
 */
export async function runRussianJudgeAssessment(supabase, sdId, sd) {
  const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';

  if (!russianJudgeEnabled) {
    return;
  }

  try {
    console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
    console.log('-'.repeat(50));

    // Fetch retrospective for this SD
    const { data: retrospective } = await supabase
      .from('retrospectives')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (retrospective) {
      const { RetrospectiveQualityRubric } = await import('../../../rubrics/retrospective-quality-rubric.js');
      const rubric = new RetrospectiveQualityRubric();
      const retroAssessment = await rubric.validateRetrospectiveQuality(retrospective, sd);

      console.log(`   Retrospective Score: ${retroAssessment.score}% (threshold: 70%)`);
      console.log(`   Status: ${retroAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      if (retroAssessment.issues && retroAssessment.issues.length > 0) {
        console.log('\n   ⚡ Retrospective Issues:');
        retroAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
      }

      if (retroAssessment.warnings && retroAssessment.warnings.length > 0) {
        console.log('\n   💡 Recommendations:');
        retroAssessment.warnings.forEach(warning => console.log(`     - ${warning}`));
      }

      // Mode: ADVISORY for EXEC-TO-PLAN (log but don't block)
      if (!retroAssessment.passed) {
        console.log('\n   ⚠️  Note: Proceeding despite quality concerns (ADVISORY mode)');
      } else {
        console.log('\n   ✅ Quality assessment passed');
      }

      console.log('');
    } else {
      console.log('   ℹ️  No retrospective found for assessment');
      console.log('');
    }
  } catch (error) {
    console.log(`\n   ⚠️  Russian Judge unavailable: ${error.message}`);
    console.log('   Proceeding with traditional validation only\n');
  }
}
