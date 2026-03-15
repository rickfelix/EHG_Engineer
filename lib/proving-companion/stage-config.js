/**
 * Stage Config — maps stage numbers to file patterns and vision keys
 * for Plan Agent and Reality Agent consumption.
 */

// Stages 0-10: explicitly mapped from architecture plan
// Stages 11-25: seeded from arch docs with generic patterns
const STAGE_CONFIG = {
  0: {
    name: 'Ideation',
    filePatterns: ['src/pages/ventures/*', 'src/components/ventures/create*'],
    visionKeys: ['venture-creation', 'ideation'],
    archPhases: ['ideation']
  },
  1: {
    name: 'Problem Validation',
    filePatterns: ['src/components/ventures/problem*', 'src/components/stages/admin/Stage1*'],
    visionKeys: ['problem-validation'],
    archPhases: ['validation']
  },
  2: {
    name: 'Solution Hypothesis',
    filePatterns: ['src/components/ventures/solution*', 'src/components/stages/admin/Stage2*'],
    visionKeys: ['solution-hypothesis'],
    archPhases: ['validation']
  },
  3: {
    name: 'Market Analysis',
    filePatterns: ['src/components/ventures/market*', 'src/components/stages/admin/Stage3*'],
    visionKeys: ['market-analysis'],
    archPhases: ['analysis']
  },
  4: {
    name: 'Competitive Landscape',
    filePatterns: ['src/components/ventures/competitive*', 'src/components/stages/admin/Stage4*'],
    visionKeys: ['competitive-landscape'],
    archPhases: ['analysis']
  },
  5: {
    name: 'Value Proposition',
    filePatterns: ['src/components/ventures/value*', 'src/components/stages/admin/Stage5*'],
    visionKeys: ['value-proposition'],
    archPhases: ['design']
  },
  6: {
    name: 'Business Model',
    filePatterns: ['src/components/ventures/business*', 'src/components/stages/admin/Stage6*'],
    visionKeys: ['business-model'],
    archPhases: ['design']
  },
  7: {
    name: 'Revenue Model',
    filePatterns: ['src/components/ventures/revenue*', 'src/components/stages/admin/Stage7*'],
    visionKeys: ['revenue-model'],
    archPhases: ['design']
  },
  8: {
    name: 'MVP Definition',
    filePatterns: ['src/components/ventures/mvp*', 'src/components/stages/admin/Stage8*'],
    visionKeys: ['mvp-definition'],
    archPhases: ['build']
  },
  9: {
    name: 'Technical Architecture',
    filePatterns: ['src/components/ventures/tech*', 'src/components/stages/admin/Stage9*'],
    visionKeys: ['technical-architecture'],
    archPhases: ['build']
  },
  10: {
    name: 'Prototype',
    filePatterns: ['src/components/ventures/prototype*', 'src/components/stages/admin/Stage10*'],
    visionKeys: ['prototype'],
    archPhases: ['build']
  }
};

// Seed stages 11-25 with generic patterns
for (let i = 11; i <= 25; i++) {
  STAGE_CONFIG[i] = {
    name: `Stage ${i}`,
    filePatterns: [`src/components/stages/admin/Stage${i}*`],
    visionKeys: [],
    archPhases: ['execution']
  };
}

/**
 * Get config for a specific stage
 * @param {number} stageNumber
 * @returns {object} stage config
 */
export function getStageConfig(stageNumber) {
  return STAGE_CONFIG[stageNumber] || null;
}

/**
 * Get configs for a range of stages
 * @param {number} from
 * @param {number} to
 * @returns {object} map of stage number to config
 */
export function getStageRange(from, to) {
  const result = {};
  for (let i = from; i <= to; i++) {
    if (STAGE_CONFIG[i]) {
      result[i] = STAGE_CONFIG[i];
    }
  }
  return result;
}

/**
 * Get all gate stages (checkpoint stages)
 * @returns {number[]}
 */
export function getGateStages() {
  return [3, 5, 10, 22, 25];
}

export { STAGE_CONFIG };
