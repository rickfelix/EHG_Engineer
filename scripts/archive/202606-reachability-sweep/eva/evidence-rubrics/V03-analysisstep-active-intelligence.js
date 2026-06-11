/** V03: analysisstep_active_intelligence — Each stage includes LLM-driven analysisStep creating compounding intelligence. */
export default {
  id: 'V03', name: 'analysisstep_active_intelligence',
  checks: [
    { id: 'V03-C1', label: 'Analysis steps index registers stage analysis modules',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/stage-templates/analysis-steps/index.js', pattern: 'import|export|analyzeStage' } },
    { id: 'V03-C2', label: 'At least 20 individual stage analysis files exist',
      type: 'file_count', weight: 25,
      params: { glob: 'lib/eva/stage-templates/analysis-steps/stage-*.js', minCount: 20 } },
    { id: 'V03-C3', label: 'Analysis steps produce structured output (return object/JSON)',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/stage-templates/analysis-steps/stage-*.js', pattern: 'return\\s*\\{|JSON\\.stringify', minMatches: 10 } },
    { id: 'V03-C4', label: 'Analysis steps reference prior stage data (compounding)',
      type: 'code_pattern', weight: 30,
      params: { glob: 'lib/eva/stage-templates/analysis-steps/stage-*.js', pattern: 'stage\\dData|previousStage|priorArtifact', minMatches: 5 } },
  ],
};
