/** V05: cross_stage_data_contracts — Each stage defines and produces structured artifacts with clear contracts. */
export default {
  id: 'V05', name: 'cross_stage_data_contracts',
  checks: [
    { id: 'V05-C1', label: 'Stage contracts module exports getContract',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/contracts/stage-contracts.js', exportName: 'getContract' } },
    { id: 'V05-C2', label: 'YAML contract loader exports loadContractsFromYaml',
      type: 'export_exists', weight: 20,
      params: { module: 'lib/eva/contracts/yaml-contract-loader.js', exportName: 'loadContractsFromYaml' } },
    { id: 'V05-C3', label: 'Contracts define consumes/produces per stage',
      type: 'code_pattern', weight: 30,
      params: { glob: 'lib/eva/contracts/stage-contracts.{js,yaml}', pattern: 'consumes|produces|inputContract|outputContract' } },
    { id: 'V05-C4', label: 'Output schema extractor exports extractOutputSchema',
      type: 'export_exists', weight: 25,
      params: { module: 'lib/eva/stage-templates/output-schema-extractor.js', exportName: 'extractOutputSchema' } },
  ],
};
