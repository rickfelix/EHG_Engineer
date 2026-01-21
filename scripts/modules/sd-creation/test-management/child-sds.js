/**
 * Test Management Child SD Definitions
 *
 * Re-exports all 10 child SD definitions from foundation and advanced modules.
 * This file maintains backward compatibility while keeping each module under 500 LOC.
 */

export {
  schemaSd,
  cleanupSd,
  scannerSd,
  cicdSd,
  automationSd
} from './child-sds-foundation.js';

export {
  selectionSd,
  llmCoreSd,
  llmAdvSd,
  docsSd,
  execSd
} from './child-sds-advanced.js';

import {
  schemaSd,
  cleanupSd,
  scannerSd,
  cicdSd,
  automationSd
} from './child-sds-foundation.js';

import {
  selectionSd,
  llmCoreSd,
  llmAdvSd,
  docsSd,
  execSd
} from './child-sds-advanced.js';

/**
 * All child SDs in execution order
 */
export const childSDs = [
  schemaSd,
  cleanupSd,
  scannerSd,
  cicdSd,
  automationSd,
  selectionSd,
  llmCoreSd,
  llmAdvSd,
  docsSd,
  execSd
];

/**
 * Execution order for child SDs
 */
export const EXECUTION_ORDER = [
  'SD-TEST-MGMT-SCHEMA-001',
  'SD-TEST-MGMT-CLEANUP-001',
  'SD-TEST-MGMT-SCANNER-001',
  'SD-TEST-MGMT-CICD-001',
  'SD-TEST-MGMT-AUTOMATION-001',
  'SD-TEST-MGMT-SELECTION-001',
  'SD-TEST-MGMT-LLM-CORE-001',
  'SD-TEST-MGMT-LLM-ADV-001',
  'SD-TEST-MGMT-DOCS-001',
  'SD-TEST-MGMT-EXEC-001'
];

/**
 * Dependency graph for child SDs
 */
export const DEPENDENCY_GRAPH = {
  'SD-TEST-MGMT-SCHEMA-001': [],
  'SD-TEST-MGMT-CLEANUP-001': ['SD-TEST-MGMT-SCHEMA-001'],
  'SD-TEST-MGMT-SCANNER-001': ['SD-TEST-MGMT-SCHEMA-001', 'SD-TEST-MGMT-CLEANUP-001'],
  'SD-TEST-MGMT-CICD-001': ['SD-TEST-MGMT-SCHEMA-001', 'SD-TEST-MGMT-SCANNER-001'],
  'SD-TEST-MGMT-AUTOMATION-001': ['SD-TEST-MGMT-CICD-001', 'SD-TEST-MGMT-SCANNER-001'],
  'SD-TEST-MGMT-SELECTION-001': ['SD-TEST-MGMT-AUTOMATION-001'],
  'SD-TEST-MGMT-LLM-CORE-001': ['SD-TEST-MGMT-SELECTION-001'],
  'SD-TEST-MGMT-LLM-ADV-001': ['SD-TEST-MGMT-LLM-CORE-001'],
  'SD-TEST-MGMT-DOCS-001': ['SD-TEST-MGMT-LLM-ADV-001'],
  'SD-TEST-MGMT-EXEC-001': ['SD-TEST-MGMT-DOCS-001']
};
