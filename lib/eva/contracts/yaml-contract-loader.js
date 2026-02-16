/**
 * YAML Stage Contract Loader
 *
 * Loads stage contracts from YAML format and converts to the
 * Map format expected by stage-contracts.js.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-K
 *
 * @module lib/eva/contracts/yaml-contract-loader
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import jsYaml from 'js-yaml';
const yamlParse = (str) => jsYaml.load(str);

const CONTRACTS_YAML_PATH = resolve(import.meta.dirname, 'stage-contracts.yaml');

/**
 * Load stage contracts from YAML file.
 * @param {string} [path] - Optional custom path to YAML file
 * @returns {Map<number, {consumes: Array, produces: object}>}
 */
export function loadContractsFromYaml(path) {
  const filePath = path || CONTRACTS_YAML_PATH;
  const raw = readFileSync(filePath, 'utf-8');
  const doc = yamlParse(raw);

  if (!doc || !doc.stages) {
    throw new Error('Invalid YAML contracts: missing "stages" key');
  }

  const contracts = new Map();

  for (const [stageStr, definition] of Object.entries(doc.stages)) {
    const stageNum = parseInt(stageStr, 10);
    if (isNaN(stageNum)) continue;

    contracts.set(stageNum, {
      name: definition.name || `Stage ${stageNum}`,
      consumes: definition.consumes || [],
      produces: definition.produces || {},
    });
  }

  return contracts;
}

/**
 * Validate that YAML contracts match the JS contracts.
 * Useful for migration verification.
 * @param {Map} jsContracts - Contracts from stage-contracts.js
 * @param {Map} yamlContracts - Contracts from YAML
 * @returns {{match: boolean, differences: Array<string>}}
 */
export function compareContracts(jsContracts, yamlContracts) {
  const differences = [];

  // Check all JS stages exist in YAML
  for (const [stage] of jsContracts) {
    if (!yamlContracts.has(stage)) {
      differences.push(`Stage ${stage}: exists in JS but missing from YAML`);
    }
  }

  // Check all YAML stages exist in JS
  for (const [stage] of yamlContracts) {
    if (!jsContracts.has(stage)) {
      differences.push(`Stage ${stage}: exists in YAML but missing from JS`);
    }
  }

  // Compare produce fields for stages that exist in both
  for (const [stage, jsContract] of jsContracts) {
    const yamlContract = yamlContracts.get(stage);
    if (!yamlContract) continue;

    const jsFields = Object.keys(jsContract.produces || {}).sort();
    const yamlFields = Object.keys(yamlContract.produces || {}).sort();

    if (JSON.stringify(jsFields) !== JSON.stringify(yamlFields)) {
      differences.push(
        `Stage ${stage}: produce fields differ — JS=[${jsFields}], YAML=[${yamlFields}]`
      );
    }
  }

  return {
    match: differences.length === 0,
    differences,
  };
}
