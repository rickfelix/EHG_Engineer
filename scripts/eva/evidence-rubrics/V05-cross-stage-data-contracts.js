/** V05: cross_stage_data_contracts — Each stage defines and produces structured artifacts with clear contracts. */
export default {
  id: 'V05', name: 'cross_stage_data_contracts',
  checks: [
    { id: 'V05-C1', label: 'Stage contracts definition file exists',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/contracts/stage-contracts.{js,yaml}' } },
    { id: 'V05-C2', label: 'YAML contract loader parses stage schemas',
      type: 'file_exists', weight: 20,
      params: { glob: 'lib/eva/contracts/yaml-contract-loader.js' } },
    { id: 'V05-C3', label: 'Contracts define consumes/produces per stage',
      type: 'code_pattern', weight: 30,
      params: { glob: 'lib/eva/contracts/stage-contracts.{js,yaml}', pattern: 'consumes|produces|inputContract|outputContract' } },
    { id: 'V05-C4', label: 'Output schema extractor validates stage template outputs',
      type: 'file_exists', weight: 25,
      params: { glob: 'lib/eva/stage-templates/output-schema-extractor.js' } },
  ],
};
