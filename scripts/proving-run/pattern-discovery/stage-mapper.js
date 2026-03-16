/**
 * Stage Mapper — loads stage-config and maps stage numbers to component paths,
 * DB tables, service scripts, and file patterns for both repos.
 *
 * Part of: Pattern Discovery Agent (SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const MAX_PROVING_STAGE = 17;

// Known service-layer scripts per stage (EHG_Engineer repo patterns)
const ENGINEER_PATTERNS = {
  // Scripts that follow naming conventions by stage
  serviceScripts: (stageNum) => [
    `scripts/*stage${stageNum}*`,
    `scripts/*stage-${stageNum}*`,
    `lib/proving-companion/*`,
  ],
  // DB table patterns per stage (common conventions)
  dbPatterns: (stageNum, artifactType) => [
    `database/migrations/*${artifactType}*`,
    `database/migrations/*stage_${stageNum}*`,
  ],
  // Test file patterns
  testPatterns: (stageNum, componentName) => [
    `tests/**/*${componentName}*`,
    `tests/**/*stage${stageNum}*`,
    `tests/**/*stage-${stageNum}*`,
  ],
};

/**
 * Load stage config and enrich with cross-repo path mappings.
 * @returns {{ stages: Object.<number, StageMapping>, maxStage: number }}
 */
export function loadStageMap() {
  // Dynamic require since stage-config is CJS — exported as { STAGE_CONFIG }
  const { STAGE_CONFIG } = require('../../../lib/proving-companion/stage-config.js');

  const stages = {};

  for (let i = 1; i <= MAX_PROVING_STAGE; i++) {
    const cfg = STAGE_CONFIG[i];
    if (!cfg) continue;

    const componentBase = cfg.componentFile?.replace('.tsx', '') || `Stage${i}`;

    stages[i] = {
      name: cfg.name,
      stageNumber: i,
      phase: cfg.phase,
      gateType: cfg.gateType,
      workType: cfg.workType,
      requiredArtifacts: cfg.requiredArtifacts || [],
      visionKeys: cfg.visionKeys || [],
      archPhases: cfg.archPhases || [],

      // EHG App repo paths
      app: {
        componentFile: cfg.componentFile,
        filePatterns: cfg.filePatterns || [],
      },

      // EHG_Engineer repo paths (derived from conventions)
      engineer: {
        serviceScripts: ENGINEER_PATTERNS.serviceScripts(i),
        dbPatterns: (cfg.requiredArtifacts || []).flatMap(
          art => ENGINEER_PATTERNS.dbPatterns(i, art)
        ),
        testPatterns: ENGINEER_PATTERNS.testPatterns(i, componentBase),
      },

      // Dimensions for assessment
      dimensions: {
        code: cfg.filePatterns || [],
        db: (cfg.requiredArtifacts || []).map(a => `tables: ${a}`),
        service: ENGINEER_PATTERNS.serviceScripts(i),
        tests: ENGINEER_PATTERNS.testPatterns(i, componentBase),
        artifacts: cfg.requiredArtifacts || [],
      },
    };
  }

  return { stages, maxStage: MAX_PROVING_STAGE };
}

/**
 * Get gate stages (for scoring weight assignment).
 */
export function getGateStages() {
  const { stages } = loadStageMap();
  return {
    kill: Object.values(stages).filter(s => s.gateType === 'kill').map(s => s.stageNumber),
    promotion: Object.values(stages).filter(s => s.gateType === 'promotion').map(s => s.stageNumber),
    regular: Object.values(stages).filter(s => !s.gateType).map(s => s.stageNumber),
  };
}
