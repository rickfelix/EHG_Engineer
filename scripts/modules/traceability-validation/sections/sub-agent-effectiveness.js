/**
 * Section D: Sub-Agent Effectiveness (10 points - MINOR)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 *
 * Phase-aware: Meta-analysis less important than actual results
 */

/**
 * Validate Sub-Agent Effectiveness
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} sdUuid - Resolved SD UUID
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateSubAgentEffectiveness(sd_id, sdUuid, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Sub-Agent Effectiveness...');

  // D1: Sub-agent execution metrics (10 points)
  console.log('\n   [D1] Sub-Agent Execution Metrics...');

  const { data: subAgentResults, error: subAgentError } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_name, execution_time, verdict, created_at')
    .eq('sd_id', sdUuid);

  if (subAgentError) {
    sectionScore += 5;
    console.log('   WARN Cannot fetch sub-agent results (5/10)');
  } else if (subAgentResults && subAgentResults.length > 0) {
    sectionScore += 10;
    sectionDetails.sub_agents_executed = subAgentResults.length;

    const totalTime = subAgentResults.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    sectionDetails.total_execution_time_ms = totalTime;
    sectionDetails.sub_agent_details = subAgentResults.map(r => ({
      name: r.sub_agent_name,
      time_ms: r.execution_time,
      verdict: r.verdict
    }));

    console.log(`   OK ${subAgentResults.length} sub-agents executed in ${totalTime}ms`);
  } else {
    sectionScore += 5;
    validation.warnings.push('[D1] No sub-agent execution records found');
    console.log('   WARN No sub-agent records found (5/10)');
  }

  // D2: Recommendation quality (10 points)
  console.log('\n   [D2] Recommendation Quality...');

  if (subAgentResults && subAgentResults.length > 0) {
    const { data: resultsWithOutput } = await supabase
      .from('sub_agent_execution_results')
      .select('recommendations, detailed_analysis')
      .eq('sd_id', sdUuid);

    if (resultsWithOutput && resultsWithOutput.length > 0) {
      let hasSubstantialOutput = false;

      for (const record of resultsWithOutput) {
        const combinedOutput = JSON.stringify({
          recommendations: record.recommendations,
          detailed_analysis: record.detailed_analysis
        });
        if (combinedOutput.length > 500) {
          hasSubstantialOutput = true;
          break;
        }
      }

      if (hasSubstantialOutput) {
        sectionScore += 10;
        sectionDetails.substantial_recommendations = true;
        console.log('   OK Sub-agents provided substantial recommendations');
      } else {
        sectionScore += 6;
        validation.warnings.push('[D2] Sub-agent recommendations appear minimal');
        console.log('   WARN Minimal recommendations (6/10)');
      }
    } else {
      sectionScore += 6;
      console.log('   WARN Cannot verify recommendation quality (6/10)');
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No sub-agent data to assess (5/10)');
  }

  // Scale from 20 to 10 points (MINOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 10);
  validation.score += scaledScore;
  validation.gate_scores.sub_agent_effectiveness = scaledScore;
  validation.details.sub_agent_effectiveness = sectionDetails;
  console.log(`\n   Section D Score: ${scaledScore}/10 (MINOR - meta-analysis)`);
}
