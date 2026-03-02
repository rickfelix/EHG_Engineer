/** V06: cli_authoritative_workflow — Venture progression executed and enforced through CLI. */
export default {
  id: 'V06', name: 'cli_authoritative_workflow',
  checks: [
    { id: 'V06-C1', label: 'run-stage.js imports and invokes stage execution engine',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/eva/run-stage.js', pattern: 'executeStage|stage-execution-engine' } },
    { id: 'V06-C2', label: 'run-rounds.js imports and invokes rounds scheduler',
      type: 'code_pattern', weight: 25,
      params: { glob: 'scripts/eva/run-rounds.js', pattern: 'listRounds|runRound|rounds-scheduler' } },
    { id: 'V06-C3', label: 'CLI commands registered in package.json scripts',
      type: 'code_pattern', weight: 25,
      params: { glob: 'package.json', pattern: 'run-stage|run-rounds|eva' } },
    { id: 'V06-C4', label: 'Stage execution engine exports executeStage',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/stage-execution-engine.js', exportName: 'executeStage' } },
  ],
};
