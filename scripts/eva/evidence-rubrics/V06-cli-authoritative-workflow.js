/** V06: cli_authoritative_workflow — Venture progression executed and enforced through CLI. */
export default {
  id: 'V06', name: 'cli_authoritative_workflow',
  checks: [
    { id: 'V06-C1', label: 'run-stage.js CLI entry point exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'scripts/eva/run-stage.js' } },
    { id: 'V06-C2', label: 'run-rounds.js CLI for round execution exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'scripts/eva/run-rounds.js' } },
    { id: 'V06-C3', label: 'CLI commands registered in package.json scripts',
      type: 'code_pattern', weight: 25,
      params: { glob: 'package.json', pattern: 'run-stage|run-rounds|eva' } },
    { id: 'V06-C4', label: 'Stage execution engine exists as CLI backend',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/stage-execution-engine.js' } },
  ],
};
